# Design: Hardening de isolamento multi-tenant (RLS enforce + filtros de app)

**Data:** 2026-06-22
**Status:** Aprovado (aguardando revisão do spec)
**Severidade:** 🔴 Crítico (OWASP A01 — Broken Access Control)

## Contexto / problema

O Adelina é multi-tenant. A isolação foi desenhada via **RLS** (`app.current_tenant` GUC, setado por `prisma.withTenant`). Auditoria de 2026-06-22 descobriu que **o RLS está inerte em produção**:

- O app conecta como `postgresql://adelina@postgres/adelina` — o role **`adelina` é o dono de todas as tabelas**.
- As 29 policies têm `ENABLE ROW LEVEL SECURITY`, mas **nenhuma tem `FORCE`**. No Postgres, o **dono da tabela ignora RLS sem `FORCE`**.
- **Prova empírica (banco de prod):** com `SET app.current_tenant = '<tenant inexistente>'`, o role `adelina` enxergou **todas as properties e users dos 3 tenants**.

**Consequência:** ~35 queries em 7 serviços buscam por `id` sem filtrar `tenantId`, confiando no RLS. Como ele não enforça, um usuário autenticado da pousada A pode **ler/editar/deletar** registros (reservas, pagamentos, repasses, despesas) da pousada B via `GET/PATCH/DELETE /…/:id`. Única barreira: o `id` ser UUID — o que **não é** controle de acesso.

**Gaps adicionais:** `users` e `whatsapp_instances` têm RLS habilitado mas **sem policy**; `subscriptions` tem `tenant_id` mas **RLS desabilitado**. As três não têm isolação no nível do banco hoje.

## Objetivo

Isolação multi-tenant **defesa-em-profundidade**, em duas camadas independentes:
1. **Banco:** RLS realmente enforçado (FORCE) com um caminho de bypass controlado para queries de sistema.
2. **App:** filtros `tenantId` explícitos nas queries por `id` (segura mesmo se o RLS regredir).

Critério de sucesso: testes automatizados provam que `withTenant(A)` não acessa dados de B, `withSystem` acessa cross-tenant, IDOR via serviço dá NotFound, e login/admin/públicos seguem funcionando — **tudo verde antes do deploy**.

## Decisões (aprovadas)

- **Opção B:** o app conecta como um **role dedicado não-superuser** (`adelina_app`, `NOSUPERUSER NOBYPASSRLS`) + **GUC duplo** (`app.bypass_rls`). **Por quê não a Opção A (`FORCE` no `adelina`):** confirmado no banco que `adelina` é `rolsuper=t, rolbypassrls=t` (criado via `POSTGRES_USER=adelina`). **Superusers e roles `BYPASSRLS` ignoram o RLS mesmo com `FORCE`** — logo forçar o RLS no `adelina` não isola nada. Roles comuns (não-dono, não-super) obedecem RLS por padrão, sem precisar de `FORCE`. O `adelina` segue como role de admin (migrations/backups/`docker exec psql`); só a aplicação em runtime troca para `adelina_app`.
- **As duas camadas** (RLS enforce via role dedicado + filtros `tenantId` explícitos).

## Arquitetura

### 1. Banco — role dedicado + migration aditiva

Tudo aplicado em prod via `docker exec adelina_postgres psql -U adelina -d adelina --single-transaction` (padrão do projeto — **NUNCA `db push`**, que quer dropar tabelas por divergência de histórico).

**1a. Role dedicado (passo de ops manual — senha NÃO entra no git):**
```sql
CREATE ROLE adelina_app WITH LOGIN PASSWORD '<senha-forte-gerada>' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
```
A senha é gerada na hora (ex.: `openssl rand -base64 32`), guardada fora do git (ex.: `/root/adelina/.adelina_app_db_password`, chmod 600) e referenciada na `DATABASE_URL` do `stack.yml`.

**1b. Migration aditiva** (`packages/db/prisma/migrations/20260622000000_rls_app_role_enforce`) — versionada, idempotente, assume que o role `adelina_app` já existe:

1. **Helper de bypass:**
   ```sql
   CREATE OR REPLACE FUNCTION public.app_is_bypass() RETURNS boolean
     LANGUAGE sql STABLE SET search_path TO '' AS
   $$ SELECT current_setting('app.bypass_rls', true) = 'on' $$;
   ```
   (`app_current_tenant()` já retorna `NULL` quando o GUC está vazio — não muda.)

2. **Reescrever cada policy existente** para incluir o bypass, via `ALTER POLICY … USING (app_is_bypass() OR <qual original>)`. Como `WITH CHECK` é `NULL` (assume o `USING`), reescrever o `USING` cobre SELECT/UPDATE/DELETE/INSERT. Lista das 29 policies (estilos): diretas `tenant_id = app_current_tenant()` (expenses, guests, guest_registration_links, message_templates, owner_payouts, owners, payment_links, payout_entries, pricing_rules, properties, reservation_reminders, reservations, tenant_settings), `tenants` (`id = app_current_tenant()`), e via helper/EXISTS (availability_calendar, housekeeping_tasks, maintenance_tickets, channel_connections, room_types, rooms, folios, payments, reservation_guests, reservation_rooms, channel_room_mappings, folio_items, rate_calendar, sync_logs, password_reset_tokens).

3. **Cobrir as tabelas órfãs** (`users`, `subscriptions`, `whatsapp_instances`): `ENABLE ROW LEVEL SECURITY` onde faltar + `CREATE POLICY x_tenant ON … USING (app_is_bypass() OR tenant_id = app_current_tenant())`.

4. **Grants para `adelina_app`** (não-dono precisa de privilégios explícitos):
   ```sql
   GRANT USAGE ON SCHEMA public TO adelina_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO adelina_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO adelina_app;
   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO adelina_app;
   -- tabelas/sequences futuras (migrations rodam como adelina):
   ALTER DEFAULT PRIVILEGES FOR ROLE adelina TO adelina_app … (SELECT/INSERT/UPDATE/DELETE em TABLES, USAGE/SELECT em SEQUENCES, EXECUTE em FUNCTIONS);
   ```

> **Não usa `FORCE`** — role não-dono já obedece RLS. `adelina_app` não tem `BYPASSRLS`, então só passa pelas linhas do tenant (ou tudo, quando `app.bypass_rls='on'`). Falha é **fechada**: query sem GUC retorna 0 linhas / viola WITH CHECK — nunca vaza. Por isso os testes pré-deploy são obrigatórios.

**1c. `stack.yml`** (`/root/adelina/stack.yml`): trocar `DATABASE_URL` do serviço `api` (e `worker`, se houver) de `adelina:…` para `adelina_app:<senha>@postgres:5432/adelina`. O `POSTGRES_USER=adelina` do serviço `postgres` **não muda** (migrations/admin seguem como `adelina`). `DIRECT_URL` (se usado por migrations) **permanece** como `adelina`.

### 2. App — `PrismaService` (`apps/api/src/common/prisma/prisma.service.ts`)

- **`withTenant` endurecido:** trocar `$executeRawUnsafe(\`SET LOCAL … '${tenantId}'\`)` (SQLi latente) por `set_config` parametrizado e zerar o bypass:
  ```ts
  await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'off', true)`;
  ```
- **Novo `withSystem<T>(fn)`:** transação que faz `SELECT set_config('app.bypass_rls', 'on', true)` e roda `fn(tx)`. Uso **restrito e auditável** (auth, admin, públicos-por-token, workers que iteram tenants). Documentado com comentário de aviso.

### 3. App — embrulhar queries que hoje rodam sem GUC

Sob FORCE, toda query precisa de `withTenant` (tenant conhecido) ou `withSystem` (sistema). Categorias e tratamento:

- **Auth** (`auth.guard.ts` lookup de user/subscription; `auth.service.ts` login/forgot/reset/changePassword/createLocalUser; `auth.controller.ts` signup-tenant) → `withSystem` (pré-tenant ou cross-tenant por natureza).
- **Públicos por token** (`guest-links`, `payments` `/pay/:token` + webhook, `legal`) → `withSystem` no lookup/liquidação (o token de 128 bits é o controle de acesso).
- **Admin super-admin** (`admin.controller.ts`) → `withSystem`.
- **Team** (`team.controller.ts`, já filtra `tenantId`) → `withTenant(tenantId)`.
- **Workers** (`channel-manager` scheduler/processors/reconcile; `reminder-scheduler`) → `withTenant(tenantId)` por tenant; `withSystem` só onde varrem todos os tenants de propósito.
- **`this.prisma.X` soltos** em services (ex.: `reservations.service.ts:369` `count({where:{tenantId}})`) → embrulhar conforme o caso.

Auditoria: `grep -rn "this.prisma.<model>." ` cobrindo todos os módulos; cada hit fora de `withTenant`/`withSystem` é avaliado.

### 4. App — filtros `tenantId` explícitos (2ª camada)

Nas ~35 queries por `id` dentro de `withTenant`: adicionar `tenantId` ao `where`. Padrões:
- `findUnique({where:{id}})` / `findUniqueOrThrow` → `findFirst({where:{id, tenantId}})` (+ `if (!row) throw NotFound`).
- `update({where:{id}})` → fetch `findFirst({id, tenantId})` antes (já comum no código) **e/ou** `updateMany({where:{id, tenantId}})`.
- `delete({where:{id}})` → `deleteMany({where:{id, tenantId}})` (retorna count 0 se não for do tenant).
- Para tabelas-filhas sem `tenant_id` próprio (folios/payments/reservation_rooms…), filtrar pela FK do pai já escopado (ex.: `reservationId` de uma reserva confirmada do tenant) — manter o padrão existente, sem inventar coluna.

Módulos afetados (contagem aproximada): reservations 12, payments 7, channel-manager 6, payouts 5, expenses 3, owners 2, whatsapp 1.

### 5. App — webhook fail-closed em produção (`payments.service.ts`)

`isSignatureValid`: quando `NODE_ENV === 'production'` e não há `mp_webhook_secret`/`MP_WEBHOOK_SECRET`, **retornar `false`** (hoje retorna `true`). Fora de produção mantém o comportamento opt-in. O re-fetch no MP continua.

## Testes (obrigatórios antes do deploy)

Primeiro framework de teste de integração do repo de API (já há `vitest` para unidades puras — `payouts.calc`, `legal.tokens`).

- **DB descartável:** subir Postgres em container numa porta de teste (imagem `postgres:17-alpine`, igual à prod), aplicar **todas** as migrations (incluindo a nova) como o owner, **criar o role restrito `adelina_app`** (não-super, não-bypassrls) + grants, semear **2 tenants** (A e B) com property+user+reserva+despesa cada. **Os testes de isolação conectam como `adelina_app`** (conectar como o owner/superuser daria falso-positivo, pois superuser ignora RLS).
- **Suíte de isolação** (`apps/api/test/rls-isolation.spec.ts`), conectando como o app:
  1. `withTenant(A)` → `reservation.findMany()` retorna só as de A; `findFirst({id: <id de B>})` → `null`.
  2. `withTenant(A)` tentando `deleteMany({where:{id:<id de B>}})` → count 0 (não deleta B).
  3. `withSystem` → enxerga A e B.
  4. Sem GUC (query crua) → 0 linhas (FORCE nega).
  5. `withTenant(A)` insert com `tenantId:B` → falha WITH CHECK.
- **Suíte de fluxo de sistema** (`auth-system.spec.ts`): login (lookup por email) funciona; lookup público por token funciona; listagem admin cross-tenant funciona — todos via `withSystem`.
- Rodar `pnpm --filter @adelina/api test` → tudo verde **é pré-condição do deploy**.

## Rollout (ordem importa)

1. **Criar o role** `adelina_app` no prod (senha gerada, guardada em `/root/adelina/.adelina_app_db_password` chmod 600).
2. **Aplicar a migration** no prod via `psql -U adelina --single-transaction` (transacional → ou aplica tudo, ou nada): policies dual-GUC + tabelas órfãs + grants.
3. **Atualizar `stack.yml`** (`DATABASE_URL` → `adelina_app`) e **deployar** (`bash /root/adelina/deploy.sh`; verificar image ID conforme o gotcha de Swarm `:latest`). A troca de role só "vale" quando o container novo sobe com a nova `DATABASE_URL`.
4. **Smoke test prod:** login OK; um tenant vê só o próprio dado; tentativa cross-tenant por id → NotFound; webhook de pagamento OK; um endpoint de cada categoria (auth/tenant/admin/público) responde.
5. **Rollback:** reverter a `DATABASE_URL` do `stack.yml` para `adelina` + redeploy restaura o comportamento anterior na hora (sem precisar reverter a migration; as policies com bypass são compatíveis com o `adelina` superuser, que simplesmente as ignora). Guardar o SQL de reversão das policies junto, por garantia.

## Fora de escopo

- Role de banco dedicado (não-dono) — Opção B, fica como hardening futuro opcional.
- Reescrever a auditoria/2FA do painel (outro projeto).
- Mudar o esquema de IDs (UUID continua).

## Riscos

- **Esquecer de embrulhar uma query** → quebra fechada (sem dado/erro), não vazamento; pego pelos testes e pelo smoke.
- **Prod quase vazia hoje** (0 reservas, 3 tenants de teste, 5 users) → janela ideal, baixo impacto de regressão.
