# Hardening de Isolamento Multi-tenant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o IDOR cross-tenant fazendo o RLS realmente enforçar (app conecta como role dedicado não-superuser) + filtros `tenantId` explícitos como 2ª camada, com testes de isolação verdes antes de qualquer deploy em produção.

**Architecture:** App passa a conectar como `adelina_app` (NOSUPERUSER NOBYPASSRLS) → policies RLS enforçam. GUC duplo: `withTenant` seta `app.current_tenant` (restringe ao tenant); novo `withSystem` seta `app.bypass_rls='on'` (libera para auth/admin/públicos/workers). Queries por `id` ganham filtro `tenantId` explícito. Tudo validado contra um Postgres descartável antes do prod.

**Tech Stack:** Postgres 17 (RLS), Prisma 5, NestJS, vitest 4, Docker.

**Spec:** `docs/superpowers/specs/2026-06-22-multitenant-rls-hardening-design.md`

⚠️ **Regra de ouro:** nenhuma alteração em produção até a suíte de integração (Tasks 3 e 6) estar 100% verde. A Task 10 (deploy) é executada pelo controlador/humano, não por subagente.

---

## File Structure

- **Create** `apps/api/test/integration/global-setup.ts` — sobe Postgres descartável, migra, cria `adelina_app`, seed 2 tenants.
- **Create** `apps/api/test/integration/helpers.ts` — clientes Prisma (owner e app-role), helpers de seed.
- **Create** `apps/api/vitest.integration.config.ts` — config separada (globalSetup, include `test/integration/**`).
- **Create** `apps/api/test/integration/rls-isolation.spec.ts` — prova de isolação.
- **Create** `apps/api/test/integration/system-flow.spec.ts` — prova que auth/admin/público funcionam via bypass.
- **Create** `packages/db/prisma/migrations/20260622000000_rls_app_role_enforce/migration.sql` — policies dual-GUC + órfãs + grants.
- **Modify** `apps/api/src/common/prisma/prisma.service.ts` — `withTenant` parametrizado + `withSystem`.
- **Modify** auth/admin/public/workers/services — embrulhar queries; filtros `tenantId`.
- **Modify** `apps/api/src/modules/payments/payments.service.ts` — webhook fail-closed.
- **Modify** `apps/api/package.json` — script `test:integration`.
- **Modify** `/root/adelina/stack.yml` — `DATABASE_URL` → `adelina_app` (Task 10).

---

## Task 1: PrismaService — `withTenant` parametrizado + `withSystem`

**Files:**
- Modify: `apps/api/src/common/prisma/prisma.service.ts`

- [ ] **Step 1: Substituir `withTenant` e adicionar `withSystem`**

Trocar o método `withTenant` atual:
```ts
  async withTenant<T>(tenantId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      // SET LOCAL é per-transaction
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);
      return fn(tx as unknown as PrismaClient);
    });
  }
```
por:
```ts
  /**
   * Executa o callback numa transação com RLS escopado ao tenant.
   * Usa set_config parametrizado (sem interpolação de string → sem SQLi) e
   * garante que o bypass de sistema esteja DESLIGADO.
   */
  async withTenant<T>(tenantId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'off', true)`;
      return fn(tx as unknown as PrismaClient);
    });
  }

  /**
   * Executa o callback numa transação que IGNORA o RLS de tenant (app.bypass_rls='on').
   * USO RESTRITO: apenas queries de sistema legítimas — autenticação (lookup por
   * email/id antes de haver tenant), super-admin cross-tenant, endpoints públicos
   * autenticados por token de 128 bits, e workers que varrem todos os tenants.
   * NUNCA usar em endpoint comum de pousada — isso reabriria o vazamento cross-tenant.
   */
  async withSystem<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
      return fn(tx as unknown as PrismaClient);
    });
  }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @adelina/api typecheck`
Expected: sem erros novos referentes a prisma.service.ts (os ~21 erros pré-existentes em dashboard.controller/reminder-scheduler são ruído conhecido — não conta).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/common/prisma/prisma.service.ts
git commit -m "feat(security): withTenant parametrizado (sem SQLi) + withSystem (bypass RLS controlado)"
```

---

## Task 2: Migration — policies dual-GUC + tabelas órfãs + grants

**Files:**
- Create: `packages/db/prisma/migrations/20260622000000_rls_app_role_enforce/migration.sql`

- [ ] **Step 1: Escrever a migration**

Criar o arquivo com EXATAMENTE este conteúdo. Ela é idempotente onde possível e assume que o role `adelina_app` já existe (criado no rollout, Task 10 / Step 1 do harness de teste).

```sql
-- Hardening multi-tenant: bypass de sistema (GUC app.bypass_rls) + cobre tabelas órfãs + grants p/ adelina_app.
-- Aplicada via psql --single-transaction. NÃO usa db push.

-- 1) Helper de bypass de sistema.
CREATE OR REPLACE FUNCTION public.app_is_bypass() RETURNS boolean
  LANGUAGE sql STABLE SET search_path TO '' AS
$$ SELECT current_setting('app.bypass_rls', true) = 'on' $$;

-- 2) Bake bypass nas funções-helper (cobrem availability/housekeeping/maintenance/
--    channel_connections/room_types/rooms/folios/payments/reservation_guests/
--    reservation_rooms + os EXISTS que usam elas: channel_room_mappings/sync_logs/folio_items).
CREATE OR REPLACE FUNCTION public.app_room_in_tenant(p_room_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SET search_path TO '' AS
$$ SELECT public.app_is_bypass() OR EXISTS (
     SELECT 1 FROM public.rooms r JOIN public.properties p ON p.id = r.property_id
     WHERE r.id = p_room_id AND p.tenant_id = public.app_current_tenant()) $$;

CREATE OR REPLACE FUNCTION public.app_property_in_tenant(p_property_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SET search_path TO '' AS
$$ SELECT public.app_is_bypass() OR EXISTS (
     SELECT 1 FROM public.properties p
     WHERE p.id = p_property_id AND p.tenant_id = public.app_current_tenant()) $$;

CREATE OR REPLACE FUNCTION public.app_reservation_in_tenant(p_reservation_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SET search_path TO '' AS
$$ SELECT public.app_is_bypass() OR EXISTS (
     SELECT 1 FROM public.reservations r
     WHERE r.id = p_reservation_id AND r.tenant_id = public.app_current_tenant()) $$;

-- 3) Reescrever as policies que comparam tenant_id/id direto (não passam por helper).
ALTER POLICY expenses_tenant ON expenses USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY guests_tenant ON guests USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY guest_registration_links_tenant ON guest_registration_links USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY message_templates_tenant ON message_templates USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY owner_payouts_tenant ON owner_payouts USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY owners_tenant ON owners USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY payment_links_tenant ON payment_links USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY payout_entries_tenant ON payout_entries USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY pricing_rules_tenant ON pricing_rules USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY properties_tenant ON properties USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY reservation_reminders_tenant ON reservation_reminders USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY reservations_tenant ON reservations USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY tenant_settings_tenant ON tenant_settings USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY tenant_self ON tenants USING (app_is_bypass() OR id = app_current_tenant());

-- EXISTS que comparam tenant_id direto (não via helper):
ALTER POLICY rate_calendar_tenant ON rate_calendar USING (
  app_is_bypass() OR EXISTS (
    SELECT 1 FROM room_types rt JOIN properties p ON p.id = rt.property_id
    WHERE rt.id = rate_calendar.room_type_id AND p.tenant_id = app_current_tenant()));
ALTER POLICY password_reset_tokens_tenant ON password_reset_tokens USING (
  app_is_bypass() OR EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = password_reset_tokens.user_id AND u.tenant_id = app_current_tenant()));

-- 4) Cobrir tabelas órfãs (tinham tenant_id mas sem policy / sem RLS).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_tenant ON users;
CREATE POLICY users_tenant ON users USING (app_is_bypass() OR tenant_id = app_current_tenant());

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriptions_tenant ON subscriptions;
CREATE POLICY subscriptions_tenant ON subscriptions USING (app_is_bypass() OR tenant_id = app_current_tenant());

ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_instances_tenant ON whatsapp_instances;
CREATE POLICY whatsapp_instances_tenant ON whatsapp_instances USING (app_is_bypass() OR tenant_id = app_current_tenant());

-- 5) Grants para o role de app (não-dono precisa de privilégio explícito).
GRANT USAGE ON SCHEMA public TO adelina_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO adelina_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO adelina_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO adelina_app;
ALTER DEFAULT PRIVILEGES FOR ROLE adelina IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO adelina_app;
ALTER DEFAULT PRIVILEGES FOR ROLE adelina IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO adelina_app;
ALTER DEFAULT PRIVILEGES FOR ROLE adelina IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO adelina_app;
```

- [ ] **Step 2: Commit (a migration é validada na Task 3, não aplicada em prod aqui)**

```bash
git add packages/db/prisma/migrations/20260622000000_rls_app_role_enforce/migration.sql
git commit -m "feat(db): RLS bypass de sistema (GUC duplo) + cobre users/subscriptions/whatsapp_instances + grants adelina_app"
```

---

## Task 3: Harness de integração + suíte de isolação (a rede de segurança)

**Files:**
- Create: `apps/api/test/integration/global-setup.ts`
- Create: `apps/api/test/integration/helpers.ts`
- Create: `apps/api/vitest.integration.config.ts`
- Create: `apps/api/test/integration/rls-isolation.spec.ts`
- Modify: `apps/api/package.json` (script `test:integration`)

- [ ] **Step 1: Script de teste no package.json**

Em `apps/api/package.json`, adicionar em `scripts`:
```json
"test:integration": "vitest run --config vitest.integration.config.ts"
```

- [ ] **Step 2: Config separada do vitest**

Criar `apps/api/vitest.integration.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/**/*.spec.ts'],
    environment: 'node',
    globalSetup: ['test/integration/global-setup.ts'],
    hookTimeout: 120_000,
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
```

- [ ] **Step 3: global-setup — Postgres descartável + role restrito + migrations + seed**

Criar `apps/api/test/integration/global-setup.ts`:
```ts
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const CONTAINER = 'adelina-rls-test-pg';
const PORT = 55432;
// Owner = 'adelina' (igual à prod), para a migration `ALTER DEFAULT PRIVILEGES FOR ROLE adelina` casar.
const OWNER = 'adelina';
const OWNER_PW = 'ownerpw';
const APP = 'adelina_app';
const APP_PW = 'apppw';
const DB = 'adelina_test';

function sh(cmd: string) { return execSync(cmd, { stdio: 'pipe' }).toString(); }
function psql(role: string, sql: string) {
  return sh(`docker exec ${CONTAINER} psql -U ${role} -d ${DB} -v ON_ERROR_STOP=1 -tA -c "${sql.replace(/"/g, '\\"')}"`);
}

export async function setup() {
  // 1) sobe postgres descartável (owner = superuser do container)
  try { sh(`docker rm -f ${CONTAINER}`); } catch {}
  sh(`docker run -d --name ${CONTAINER} -e POSTGRES_USER=${OWNER} -e POSTGRES_PASSWORD=${OWNER_PW} -e POSTGRES_DB=${DB} -p ${PORT}:5432 postgres:17-alpine`);
  // espera ficar pronto
  for (let i = 0; i < 60; i++) {
    try { sh(`docker exec ${CONTAINER} pg_isready -U ${OWNER} -d ${DB}`); break; } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }

  // 2) cria o role restrito ANTES das migrations (a migration faz GRANT a ele)
  psql(OWNER, `CREATE ROLE ${APP} WITH LOGIN PASSWORD '${APP_PW}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;`);

  // 3) aplica TODAS as migrations como owner
  const ownerUrl = `postgresql://${OWNER}:${OWNER_PW}@localhost:${PORT}/${DB}`;
  sh(`DATABASE_URL='${ownerUrl}' DIRECT_URL='${ownerUrl}' pnpm --filter @adelina/db exec prisma migrate deploy`);

  // 4) seed mínimo de 2 tenants (A e B), como owner (bypassa RLS por ser superuser)
  const tA = '11111111-1111-1111-1111-111111111111';
  const tB = '22222222-2222-2222-2222-222222222222';
  for (const [t, slug] of [[tA, 'a'], [tB, 'b']] as const) {
    psql(OWNER, `INSERT INTO tenants (id, name, slug, plan, status, created_at, updated_at) VALUES ('${t}', 'P ${slug}', '${slug}', 'trial', 'active', now(), now());`);
    psql(OWNER, `INSERT INTO properties (id, tenant_id, name, slug, country, timezone, currency, created_at, updated_at) VALUES (gen_random_uuid(), '${t}', 'Prop ${slug}', 'principal', 'BR', 'America/Sao_Paulo', 'BRL', now(), now());`);
    psql(OWNER, `INSERT INTO users (id, tenant_id, email, full_name, role, active, created_at, updated_at) VALUES (gen_random_uuid(), '${t}', 'owner-${slug}@x.com', 'Owner ${slug}', 'owner', true, now(), now());`);
    psql(OWNER, `INSERT INTO reservations (id, tenant_id, code, status, check_in, check_out, created_at, updated_at) VALUES (gen_random_uuid(), '${t}', 'ADL-${slug}-1', 'confirmed', CURRENT_DATE, CURRENT_DATE + 1, now(), now());`);
  }

  // expõe URLs e ids para os specs
  process.env.RLS_TEST_OWNER_URL = ownerUrl;
  process.env.RLS_TEST_APP_URL = `postgresql://${APP}:${APP_PW}@localhost:${PORT}/${DB}`;
  process.env.RLS_TEST_TENANT_A = tA;
  process.env.RLS_TEST_TENANT_B = tB;
}

export async function teardown() {
  try { sh(`docker rm -f ${CONTAINER}`); } catch {}
}
```
> Nota: se o seed precisar de colunas NOT NULL não cobertas acima (o schema evolui), ajuste os INSERTs até `prisma migrate deploy` + seed rodarem limpos. O objetivo é 2 tenants com ≥1 linha em `reservations`, `properties`, `users`.

- [ ] **Step 4: helpers — clientes Prisma owner e app-role**

Criar `apps/api/test/integration/helpers.ts`:
```ts
import { PrismaClient } from '@adelina/db';

export function appClient() {
  return new PrismaClient({ datasources: { db: { url: process.env.RLS_TEST_APP_URL } } });
}
export function ownerClient() {
  return new PrismaClient({ datasources: { db: { url: process.env.RLS_TEST_OWNER_URL } } });
}
export const TENANT_A = () => process.env.RLS_TEST_TENANT_A!;
export const TENANT_B = () => process.env.RLS_TEST_TENANT_B!;

// Mesma semântica do PrismaService.withTenant/withSystem, para testar o RLS direto.
export async function withTenant<T>(c: PrismaClient, tenantId: string, fn: (tx: PrismaClient) => Promise<T>) {
  return c.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'off', true)`;
    return fn(tx as unknown as PrismaClient);
  });
}
export async function withSystem<T>(c: PrismaClient, fn: (tx: PrismaClient) => Promise<T>) {
  return c.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    return fn(tx as unknown as PrismaClient);
  });
}
```

- [ ] **Step 5: Escrever a suíte de isolação (deve FALHAR antes da migration, PASSAR depois)**

Criar `apps/api/test/integration/rls-isolation.spec.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { appClient, ownerClient, withSystem, withTenant, TENANT_A, TENANT_B } from './helpers';

const app = appClient();
const owner = ownerClient();
afterAll(async () => { await app.$disconnect(); await owner.$disconnect(); });

describe('RLS isolation (conectado como adelina_app, não-superuser)', () => {
  it('withTenant(A) só enxerga reservas de A', async () => {
    const rows = await withTenant(app, TENANT_A(), (tx) => tx.reservation.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenantId === TENANT_A())).toBe(true);
  });

  it('withTenant(A) NÃO encontra reserva de B por id (IDOR bloqueado)', async () => {
    const bId = await withSystem(app, async (tx) =>
      (await tx.reservation.findFirstOrThrow({ where: { tenantId: TENANT_B() } })).id);
    const found = await withTenant(app, TENANT_A(), (tx) => tx.reservation.findFirst({ where: { id: bId } }));
    expect(found).toBeNull();
  });

  it('withTenant(A) NÃO deleta reserva de B', async () => {
    const bId = await withSystem(app, async (tx) =>
      (await tx.reservation.findFirstOrThrow({ where: { tenantId: TENANT_B() } })).id);
    const res = await withTenant(app, TENANT_A(), (tx) => tx.reservation.deleteMany({ where: { id: bId } }));
    expect(res.count).toBe(0);
    const still = await withSystem(app, (tx) => tx.reservation.findFirst({ where: { id: bId } }));
    expect(still).not.toBeNull();
  });

  it('withSystem enxerga os dois tenants', async () => {
    const rows = await withSystem(app, (tx) => tx.reservation.findMany());
    const tenants = new Set(rows.map((r) => r.tenantId));
    expect(tenants.has(TENANT_A())).toBe(true);
    expect(tenants.has(TENANT_B())).toBe(true);
  });

  it('sem GUC nenhum → 0 linhas (falha fechada)', async () => {
    const n = await app.reservation.count();
    expect(n).toBe(0);
  });

  it('withTenant(A) não consegue inserir linha com tenant de B (WITH CHECK)', async () => {
    await expect(
      withTenant(app, TENANT_A(), (tx) =>
        tx.reservation.create({
          data: { tenantId: TENANT_B(), code: 'X-1', status: 'confirmed', checkIn: new Date(), checkOut: new Date() } as never,
        }),
      ),
    ).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 6: Rodar — primeiro confirmando que SEM a migration falha, depois que COM ela passa**

Run (com a migration da Task 2 já no repo, ela é aplicada pelo `migrate deploy` do setup):
`pnpm --filter @adelina/api test:integration`
Expected: **6/6 PASS**. Se o `count()` sem GUC retornar >0, o role está bypassando RLS (revisar se conectou como `adelina_app`, não como owner).

- [ ] **Step 7: Commit**

```bash
git add apps/api/test/integration apps/api/vitest.integration.config.ts apps/api/package.json
git commit -m "test(security): harness de integração + suíte de isolação RLS (prova o IDOR fechado)"
```

---

## Task 4: Embrulhar queries de AUTH em `withSystem`

**Files:**
- Modify: `apps/api/src/modules/auth/auth.guard.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`

Contexto: sob o role restrito, qualquer `this.prisma.user/subscription/...` fora de GUC retorna 0 linhas. Auth roda antes de existir tenant → usar `withSystem`.

- [ ] **Step 1: auth.guard.ts — lookup de user e subscription**

No `canActivate`, os dois `this.prisma.user.findUnique(...)` e `this.prisma.subscription.findUnique(...)` passam a rodar dentro de um único `withSystem`:
```ts
    const { user, subscription } = await this.prisma.withSystem(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: sub },
        select: { id: true, tenantId: true, email: true, role: true, active: true, tenant: { select: { status: true } } },
      });
      let subscription = null;
      if (user) {
        subscription = await tx.subscription.findUnique({
          where: { tenantId: user.tenantId },
          select: { status: true, currentPeriodEnd: true },
        });
      }
      return { user, subscription };
    });
```
Ajustar o restante do método para usar essas variáveis (mover o cálculo de `isSuperAdmin` e o check de `subscription?.status === 'cancelled'` para depois, sem nova query).

- [ ] **Step 2: auth.service.ts — todos os lookups**

Embrulhar em `withSystem` os métodos que tocam o banco: `login` (findUnique user by email), `forgotPassword` (findUnique user + whatsappInstance + passwordResetToken.create + render template), `resetPassword` (findUnique token + $transaction update), `changePassword` (findUniqueOrThrow + update), `createLocalUser` (create user). Padrão:
```ts
  async login(email: string, password: string) {
    return this.prisma.withSystem(async (tx) => {
      const user = await tx.user.findUnique({ where: { email: email.toLowerCase().trim() }, include: { tenant: { select: { status: true } } } });
      // ... resto idêntico, usando `tx` no lugar de `this.prisma`, e await tx... nos updates ...
    });
  }
```
Nos métodos com `this.prisma.$transaction([...])` (resetPassword), trocar por operações sequenciais dentro do `withSystem` (já é uma transação): `await tx.user.update(...); await tx.passwordResetToken.update(...);`.

- [ ] **Step 3: auth.controller.ts — signupTenant**

O `signup-tenant` faz `findUnique` (tenant/email) + `$transaction` cross-tenant (cria tenant/property/user). Embrulhar tudo em `withSystem`:
```ts
    const result = await this.prisma.withSystem((tx) => tx.$transaction(async (txx) => { /* ... */ }));
```
Como já há um `$transaction` aninhado, simplificar: mover a lógica para dentro de um único `withSystem(async (tx) => { ... })` usando `tx` direto (withSystem já abre transação). Os `findUnique` de checagem (`tenant.findUnique`, `user.findUnique`) também via `tx`.

- [ ] **Step 4: Typecheck + integração ainda verde**

Run: `pnpm --filter @adelina/api typecheck && pnpm --filter @adelina/api test:integration`
Expected: typecheck sem erros novos; isolação 6/6.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth
git commit -m "fix(security): auth roda via withSystem (compatível com RLS enforçado)"
```

---

## Task 5: Embrulhar ADMIN, PÚBLICOS-por-token e WORKERS

**Files:**
- Modify: `apps/api/src/modules/admin/admin.controller.ts`
- Modify: `apps/api/src/modules/guest-links/guest-links.controller.ts`
- Modify: `apps/api/src/modules/payments/payments.service.ts` (paths públicos: getByToken/checkout/handleWebhook)
- Modify: `apps/api/src/modules/legal/*` (se tocar o banco)
- Modify: workers do channel-manager e `whatsapp/reminder-scheduler.service.ts`

- [ ] **Step 1: Mapear todos os acessos diretos ao banco fora de withTenant/withSystem**

Run:
```bash
cd apps/api && grep -rnE "this\.prisma\.(user|tenant|subscription|reservation|guest|property|room|payment|paymentLink|expense|owner|ownerPayout|payoutEntry|whatsappInstance|guestRegistrationLink|messageTemplate|channelConnection|systemSetting|tenantSetting)\b" src/modules src/common | grep -vE "withTenant|withSystem" | grep -vE "modules/auth/" 
```
Para CADA hit, classificar e embrulhar:
- **admin.controller** (super-admin, cross-tenant) → `withSystem`.
- **guest-links.controller** (público por token; lookup do link por token, e operações no registro do hóspede daquele link) → `withSystem` no bloco que resolve o token; ao gravar dados do hóspede, manter dentro do mesmo `withSystem`.
- **payments.service** `getByToken`/`checkout`/`handleWebhook` (públicos por token / chamados pelo MP) → `withSystem` (o `paymentLink.findUnique` por id/token e a liquidação).
- **legal** → se ler `systemSetting`, `withSystem` (config global, não-tenant).
- **workers** (channel scheduler/pull/push/reconcile, reminder-scheduler) → se a unidade já recebe `tenantId`, usar `withTenant(tenantId)`; se varre todos os tenants (ex.: scheduler que itera instâncias), `withSystem` para listar + `withTenant(tenantId)` por item processado.

- [ ] **Step 2: Aplicar os embrulhos**

Para cada arquivo, transformar `this.prisma.X...` em `this.prisma.withSystem((tx) => tx.X...)` ou `this.prisma.withTenant(tenantId, (tx) => tx.X...)` conforme a classificação. Manter a lógica idêntica; só trocar o cliente por `tx`.

- [ ] **Step 3: Verificar que NÃO sobrou acesso direto perigoso**

Run o mesmo grep do Step 1.
Expected: os únicos hits restantes são dentro de `withSystem`/`withTenant` (a linha do `tx.` aparece, mas o `this.prisma.` cru não deve mais existir fora dos wrappers e do construtor).

- [ ] **Step 4: Typecheck + integração verde**

Run: `pnpm --filter @adelina/api typecheck && pnpm --filter @adelina/api test:integration`
Expected: ok.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules
git commit -m "fix(security): admin/públicos-por-token/workers via withSystem|withTenant (compatível com RLS)"
```

---

## Task 6: Suíte de fluxo de sistema (auth/admin/público funcionam)

**Files:**
- Create: `apps/api/test/integration/system-flow.spec.ts`

- [ ] **Step 1: Escrever os testes de fluxo de sistema**

Criar `apps/api/test/integration/system-flow.spec.ts` — valida que as operações de sistema (via withSystem) seguem funcionando sob o role restrito:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { appClient, withSystem } from './helpers';

const app = appClient();
afterAll(async () => { await app.$disconnect(); });

describe('fluxos de sistema sob RLS enforçado', () => {
  it('lookup de user por email (login) funciona via withSystem', async () => {
    const u = await withSystem(app, (tx) => tx.user.findUnique({ where: { email: 'owner-a@x.com' } }));
    expect(u?.email).toBe('owner-a@x.com');
  });

  it('listagem cross-tenant (admin) funciona via withSystem', async () => {
    const users = await withSystem(app, (tx) => tx.user.findMany());
    expect(users.length).toBeGreaterThanOrEqual(2);
  });

  it('sem withSystem, lookup por email retorna null (RLS nega)', async () => {
    const u = await app.user.findUnique({ where: { email: 'owner-a@x.com' } });
    expect(u).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar**

Run: `pnpm --filter @adelina/api test:integration`
Expected: isolação (6) + fluxo de sistema (3) = todos PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/integration/system-flow.spec.ts
git commit -m "test(security): fluxos de sistema (login/admin) verdes sob RLS enforçado"
```

---

## Task 7: 2ª camada — filtros `tenantId` explícitos nas queries por id

**Files:**
- Modify: `apps/api/src/modules/reservations/reservations.service.ts`
- Modify: `apps/api/src/modules/payments/payments.service.ts`
- Modify: `apps/api/src/modules/payouts/payouts.service.ts`
- Modify: `apps/api/src/modules/expenses/expenses.service.ts`
- Modify: `apps/api/src/modules/owners/owners.service.ts`
- Modify: `apps/api/src/modules/channel-manager/channel-sync.service.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.service.ts`

Defesa-em-profundidade: mesmo com o RLS já fechando, adicionar filtro explícito por tenant nas queries por `id` dentro de `withTenant`. Vale para tabelas com coluna `tenant_id` própria (reservations, expenses, owners, owner_payouts, payout_entries, payment_links). Para tabelas-filhas sem `tenant_id` (folios, payments, reservation_rooms…), o RLS já cobre via FK do pai — **não inventar coluna**; deixar como está (o RLS é a defesa lá).

- [ ] **Step 1: Localizar os sites por arquivo**

Run:
```bash
cd apps/api && for f in reservations/reservations payments/payments payouts/payouts expenses/expenses owners/owners; do echo "== $f =="; grep -nE "find(Unique|First|UniqueOrThrow)\(\{ ?where: ?\{ id|update\(\{ ?where: ?\{ id|delete\(\{ ?where: ?\{ id" src/modules/$f.service.ts; done
```

- [ ] **Step 2: Aplicar o padrão (tabelas com `tenant_id` próprio)**

Para cada query por `id` numa tabela com `tenant_id`, dentro de um `withTenant(tenantId, ...)` (o `tenantId` está em escopo):
- `tx.reservation.findUnique({ where: { id } })` / `findUniqueOrThrow` → `tx.reservation.findFirst({ where: { id, tenantId } })` (e se era `OrThrow`, manter o throw: `const r = await tx.reservation.findFirst({where:{id, tenantId}}); if (!r) throw new NotFoundException('Reserva não encontrada');`).
- `tx.reservation.update({ where: { id }, data })` → primeiro garantir posse com o `findFirst({id, tenantId})` acima; manter o `update({where:{id}})` logo após (id já validado) **ou** usar `updateMany({ where: { id, tenantId }, data })` quando não precisa do retorno do registro.
- `tx.reservation.delete({ where: { id } })` → `tx.reservation.deleteMany({ where: { id, tenantId } })`.

Exemplo concreto (reservations.service.ts, método de cancelar, hoje):
```ts
const existing = await this.prisma.withTenant(tenantId, (tx) =>
  tx.reservation.findUniqueOrThrow({ where: { id: reservationId } }));
```
vira:
```ts
const existing = await this.prisma.withTenant(tenantId, async (tx) => {
  const r = await tx.reservation.findFirst({ where: { id: reservationId, tenantId } });
  if (!r) throw new NotFoundException('Reserva não encontrada');
  return r;
});
```
Importar `NotFoundException` de `@nestjs/common` onde faltar.

Aplicar o mesmo nas tabelas com `tenant_id`: `expense` (expenses.service), `owner`/`ownerPayout`/`payoutEntry` (owners/payouts.service), `paymentLink` (payments.service — quando dentro de fluxo autenticado/tenant; o webhook público continua via withSystem).

- [ ] **Step 3: Typecheck + integração + adicionar 1 teste de IDOR via serviço**

Acrescentar ao `rls-isolation.spec.ts` um teste que, mesmo com bypass off, o filtro explícito segura (redundante com o RLS, mas prova a 2ª camada): `withTenant(A)` em `expense.findFirst({where:{id: <expense de B>, tenantId: A}})` → null.
Run: `pnpm --filter @adelina/api typecheck && pnpm --filter @adelina/api test:integration`
Expected: tudo verde.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules
git commit -m "fix(security): filtro tenantId explícito nas queries por id (2ª camada de isolamento)"
```

---

## Task 8: Webhook de pagamento fail-closed em produção

**Files:**
- Modify: `apps/api/src/modules/payments/payments.service.ts`

- [ ] **Step 1: Tornar fail-closed em produção**

Em `isSignatureValid`, trocar o bloco:
```ts
    const secret = await this.webhookSecret();
    if (!secret) {
      this.logger.warn('mp_webhook_secret não configurado — assinatura do webhook não verificada.');
      return true;
    }
```
por:
```ts
    const secret = await this.webhookSecret();
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('mp_webhook_secret ausente em produção — webhook rejeitado (fail-closed).');
        return false;
      }
      this.logger.warn('mp_webhook_secret não configurado (não-produção) — assinatura não verificada.');
      return true;
    }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @adelina/api typecheck`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/payments/payments.service.ts
git commit -m "fix(security): webhook MP fail-closed em produção quando sem secret"
```

---

## Task 9: Gate pré-deploy — suíte completa verde

- [ ] **Step 1: Rodar tudo**

Run:
```bash
pnpm --filter @adelina/api test            # unit (legal.tokens, payouts.calc)
pnpm --filter @adelina/api test:integration # isolação + fluxo de sistema
pnpm --filter @adelina/api typecheck        # (ignorar os ~21 erros pré-existentes conhecidos)
```
Expected: unit PASS, integração PASS (todas), typecheck sem erros NOVOS.

- [ ] **Step 2: Push da branch (sem deploy ainda)**

```bash
git push -u origin fix/multitenant-rls-hardening
```

---

## Task 10: Rollout em produção (CONTROLADOR/HUMANO — não subagente)

⚠️ Executar só com Tasks 1–9 verdes. Cada passo verificado antes do próximo.

- [ ] **Step 1: Criar o role `adelina_app` no prod (senha fora do git)**

```bash
PW=$(openssl rand -base64 32 | tr -d '/+=' | head -c 40)
echo -n "$PW" > /root/adelina/.adelina_app_db_password && chmod 600 /root/adelina/.adelina_app_db_password
PGC=$(docker ps --format '{{.Names}}' | grep adelina_postgres | head -1)
docker exec "$PGC" psql -U adelina -d adelina -v ON_ERROR_STOP=1 -c "CREATE ROLE adelina_app WITH LOGIN PASSWORD '$PW' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;"
```

- [ ] **Step 2: Aplicar a migration no prod (transacional)**

```bash
PGC=$(docker ps --format '{{.Names}}' | grep adelina_postgres | head -1)
docker exec -i "$PGC" psql -U adelina -d adelina -v ON_ERROR_STOP=1 --single-transaction \
  < packages/db/prisma/migrations/20260622000000_rls_app_role_enforce/migration.sql
```
Verificar: `docker exec "$PGC" psql -U adelina -d adelina -tA -c "select count(*) from pg_policies where policyname like '%_tenant' or policyname='tenant_self';"` (espera ≥ 32).

- [ ] **Step 3: Smoke do role restrito direto no banco (cinto antes do deploy)**

```bash
PGC=$(docker ps --format '{{.Names}}' | grep adelina_postgres | head -1)
docker exec "$PGC" env PGPASSWORD="$(cat /root/adelina/.adelina_app_db_password)" psql -U adelina_app -h 127.0.0.1 -d adelina -tA -c \
  "set app.current_tenant='00000000-0000-0000-0000-000000000000'; select 'props_visiveis='||count(*) from properties;"
```
Expected: `props_visiveis=0` (RLS enforçando para o role restrito). Se >0, PARAR e investigar (não deployar).

- [ ] **Step 4: Atualizar `stack.yml` e deployar**

Editar `/root/adelina/stack.yml`: na env do serviço `api` (e `worker` se existir), trocar `DATABASE_URL=postgresql://adelina:<old>@postgres:5432/adelina?schema=public` por `postgresql://adelina_app:<PW>@postgres:5432/adelina?schema=public`. Manter `POSTGRES_USER=adelina` e `DIRECT_URL` (se houver) como `adelina`.
Depois:
```bash
bash /root/adelina/deploy.sh
```
Verificar o image ID do container rodando vs o recém-buildado (gotcha Swarm `:latest` da memória) e que o `api` subiu sem erro de conexão (`docker service logs adelina_api --tail 50`).

- [ ] **Step 5: Smoke test em produção**

- Login no painel funciona (auth via withSystem OK).
- Um tenant lista só as próprias reservas/despesas.
- `GET /api/reservations/<id de outro tenant>` (ou outro recurso) → 404 (IDOR fechado).
- Página/admin do super-admin lista tenants.
- Endpoint público (link de pagamento por token) abre.
- Webhook de pagamento responde (se houver secret configurado).

- [ ] **Step 6: Rollback (se algo quebrar)**

Reverter a `DATABASE_URL` do `stack.yml` para `adelina` + `bash /root/adelina/deploy.sh`. O `adelina` (superuser) ignora as policies, restaurando o comportamento anterior na hora. As policies novas são inertes para ele, então não precisa reverter a migration.

---

## Self-review (cobertura do spec)

- Spec §1a (role) → Task 10/Step 1. §1b (migration: helper bypass, helpers, policies, órfãs, grants) → Task 2. §1c (stack.yml) → Task 10/Step 4.
- Spec §2 (withTenant param + withSystem) → Task 1. §3 (embrulhar auth/admin/públicos/workers) → Tasks 4–5. §4 (filtros tenantId) → Task 7. §5 (webhook fail-closed) → Task 8.
- Spec "Testes" (DB descartável conectando como role restrito, isolação + fluxo de sistema) → Tasks 3 e 6, gate na Task 9. §Rollout → Task 10.
- Tipos consistentes: `withTenant(tenantId, fn)` e `withSystem(fn)` usados igual no PrismaService (Task 1) e nos helpers de teste (Task 3); `app_is_bypass()`/`app.bypass_rls` consistentes entre migration (Task 2) e wrappers.
- Ordem segura: RLS+role primeiro fechariam o app se as queries de sistema não fossem embrulhadas — por isso Tasks 4–6 acompanham, e o deploy (Task 10) só após verde. Em produção a troca de role só "vale" no Step 4 (deploy), depois da migration (Step 2) e do role (Step 1).
