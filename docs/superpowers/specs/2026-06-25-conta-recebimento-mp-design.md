# Conta de Recebimento por Pousada (Mercado Pago) — Design

**Data:** 2026-06-25
**Módulo:** payments / settings (multi-tenant)
**Status:** aprovado para implementação

## Objetivo

Hoje **todos** os links de pagamento de **todas** as pousadas usam um único token global
de Mercado Pago (`system_settings.mp_access_token`, configurado só pelo super-admin). Ou seja,
o dinheiro de qualquer pousada cai numa única conta (a do operador da plataforma).

Para o Adelina funcionar como **SaaS vendido a outras pousadas**, cada pousada precisa
**configurar a própria conta Mercado Pago** e receber o dinheiro dos seus links direto na
conta dela. Esta entrega adiciona essa configuração por pousada, **sem comissão** (a plataforma
cobra só a assinatura mensal, que continua no token global).

## Princípios e decisões

- **Opção A — token por pousada** (não Marketplace/OAuth): cada pousada cola o próprio
  *access token* de produção do MP. Sem split, sem comissão automática.
- **Assinatura do SaaS não muda:** `SubscriptionsService` continua lendo o token **global**
  (`system_settings.mp_access_token`), visível só pro super-admin. Esta feature mexe **apenas**
  no fluxo de **link de pagamento de reserva** (`PaymentsService`).
- **Sem migração de schema:** `tenant_settings` já é key-value por pousada (com RLS). Só
  adicionamos chaves novas ao allowlist.
- **Segurança do dinheiro — sem fallback:** se a pousada não configurou a conta dela, gerar
  link **falha com erro claro**. Nunca cai no token global (senão o dinheiro iria pro operador).
- **Baixa automática por pousada:** cada conta MP tem a própria assinatura secreta de webhook;
  o webhook resolve a pousada pela URL e valida com o secret dela (fail-closed em prod).
- **RBAC:** nova capacidade `payment:account` **só para owner** (dinheiro entrando). Espelhada
  API + web.
- **YAGNI:** sem OAuth, sem refresh token, sem comissão, sem múltiplas contas por pousada.

## 1. Dados — chaves novas em `tenant_settings`

Adicionar ao allowlist `TENANT_SETTING_KEYS` (`apps/api/src/common/tenant-settings.service.ts`):

- `payment_mp_access_token` — access token de produção do MP da pousada (`APP_USR-…`).
- `payment_mp_webhook_secret` — assinatura secreta do webhook do MP da pousada.

Sem default público (vazio = não configurado). Nenhuma tabela nova, nenhum `db push`, nenhum
SQL manual. A tabela já tem RLS `tenant_settings_tenant = app_current_tenant()`.

**Mascaramento (sensíveis):** definir `SENSITIVE_TENANT_KEYS = { payment_mp_access_token,
payment_mp_webhook_secret }`. Esses valores **nunca** voltam em texto puro para o web — o
controller que serve o web devolve mascarado (últimos 4 caracteres, ex.: `••••…a1b2`). O
`getAll()` interno do serviço continua devolvendo o valor **real** (consumido pelo
`PaymentsService`); o mascaramento acontece **só na borda do controller** que responde ao web.

**Salvar vazio = não sobrescrever:** ao receber valor vazio/só-máscara num PUT, manter o valor
atual (não apagar). Apagar exige ação explícita (campo com toggle "remover", ou valor sentinela).

## 2. Backend — para onde o dinheiro vai

`PaymentsService.mpClient()` → **`mpClient(tenantId: string)`**:

- Lê `payment_mp_access_token` da pousada via `TenantSettingsService` (valor real).
- Se vazio: lança `BadRequestException('Configure a conta de recebimento em Configurações →
  Pagamentos antes de gerar links de pagamento.')`.
- **Sem fallback** para `system_settings.mp_access_token` nem `process.env.MP_ACCESS_TOKEN`.

Todos os usos de `mpClient()` em `PaymentsService` passam a receber `tenantId`:
- `createLink` (já tem `tenantId`).
- `checkout` (público, por token) → resolve `tenantId` via `link.tenantId`.
- `handleWebhook` → resolve `tenantId` via query (ver §3).

`SubscriptionsService.mpClient()` **permanece inalterado** (token global).

## 3. Backend — baixa automática (webhook por pousada)

Problema: a URL do webhook é uma só, mas cada pagamento pertence a uma pousada diferente, com
token e secret diferentes. Resolução:

- Ao criar a `Preference` (em `checkout`, onde já temos `link.tenantId`), gravar o tenant na
  `notification_url`:
  `${PUBLIC_API_URL}/api/payments/pay/webhook?tenant=<tenantId>`
- O handler do webhook (`PaymentsController.webhook` → `PaymentsService.handleWebhook`):
  1. Lê `?tenant=` da query (valida formato UUID; ausente/ inválido → ignora, responde `{ok:true}`).
  2. Carrega o **secret da pousada** (`payment_mp_webhook_secret`); valida `x-signature` com
     `verifyMpSignature` (função pura já existente). **Fail-closed em prod** se o secret estiver
     ausente (mesma política de hoje).
  3. Carrega o **token da pousada** e busca o pagamento no MP (`mpPayment.get`).
  4. Liquida como hoje (status `approved`, `external_reference` → `link.id`, idempotente por
     `mpPaymentId`, atualiza `Payment` + `Reservation.paymentStatus`).

Forjar é inviável: validação de assinatura + re-consulta no MP com o token da própria pousada.
O `?tenant=` apenas seleciona qual credencial usar; não autoriza nada por si só.

**Compat com links antigos:** links já criados sem `?tenant=` na `notification_url` continuam
existindo. O handler, sem `?tenant=`, não consegue resolver credencial → ignora (não dá baixa
automática). Aceitável: esses são links do modelo antigo (token global); na prática, baixa
manual via "registrar recebimento" cobre o caso. Documentar como limitação conhecida.

## 4. Segurança / RBAC

- Nova capacidade **`payment:account`** → **só `owner`** em `CAPABILITY_ROLES`
  (`apps/api/src/common/permissions.ts`) e no espelho web (`apps/web/src/lib/permissions.ts`).
- Endpoint de leitura/escrita das 2 chaves sensíveis decorado com
  `@RequireCapability('payment:account')`.
- Valores mascarados na resposta ao web (§1). Token forte do MP é segredo — nunca logar o valor.

## 5. Frontend — seção em Configurações → Pagamentos (só owner)

Em `apps/web/src/app/(dashboard)/configuracoes/page.tsx`, seção **"Conta de recebimento
(Mercado Pago)"**, renderizada só quando `useCan('payment:account')` (some pro gerente):

- **2 campos** (Access Token, Assinatura secreta), exibidos mascarados; salvar vazio mantém o
  atual.
- **URL do webhook** pronta pra copiar (botão "copiar"):
  `${PUBLIC_API_URL}/api/payments/pay/webhook?tenant=<tenantId do usuário logado>`.
- **Indicador de status:** "✓ Conta configurada" quando ambos preenchidos; senão
  "⚠ Conta ainda não configurada — links de pagamento ficam indisponíveis".
- **Guia numerado** (bloco recolhível, linguagem pra leigo), com tokens visuais do app:
  1. Crie/entre na sua conta **Mercado Pago** (link).
  2. **Access Token:** painel MP → *Seu negócio → Configurações → Credenciais de produção* →
     copie o **Access Token** (`APP_USR-…`) → cole no 1º campo.
  3. **Webhook:** painel MP → *Suas integrações → Webhooks* → cole a **URL do webhook** (acima),
     marque o evento **"Pagamentos"**, salve → copie a **Assinatura secreta** → cole no 2º campo.
  4. **Salve.** Pronto — os links das suas reservas caem na sua conta e dão baixa automática.
  + link pra ajuda oficial do MP (caso a tela do MP mude).
- Ao gerar link sem conta configurada, o erro do backend aparece como **toast** (`@/lib/toast`).

## Componentes / interfaces (isolamento)

- `TenantSettingsService`: ganha as 2 chaves no allowlist + `SENSITIVE_TENANT_KEYS`. Mantém
  `getAll`/`get` retornando valor real (uso interno). Sem mascaramento aqui.
- `tenant-settings.controller` (ou o controller que serve a tela de Configurações): aplica
  mascaramento das chaves sensíveis no GET e a regra "vazio = não sobrescreve" no PUT; gate
  `payment:account` nas 2 chaves.
- `PaymentsService.mpClient(tenantId)`: única porta de entrada do token de pagamento de reserva.
- `handleWebhook(type, dataId, headers, tenantId)`: resolução de credencial isolada por tenant.

## Testes

- **`mpClient(tenantId)`**: sem token configurado → lança `BadRequestException`; com token →
  cria client (mock do `TenantSettingsService`).
- **Webhook por tenant**: dado `?tenant`, usa secret/token corretos; sem `?tenant` → ignora;
  assinatura inválida → ignora; fail-closed em prod sem secret. Reusar/estender testes de
  `mp-webhook` (função pura já testada).
- **Mascaramento**: GET devolve valor mascarado; PUT com vazio preserva o valor anterior.
- (Sem teste novo de UI; smoke manual da seção de Configurações.)

## Fora de escopo (YAGNI)

- Marketplace / OAuth / split / comissão automática.
- Múltiplas contas MP por pousada; outros gateways; Pix "cru" sem gateway.
- Migrar links antigos (modelo de token global) para o novo modelo.
