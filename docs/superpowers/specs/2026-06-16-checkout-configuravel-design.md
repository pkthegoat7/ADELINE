# Checkout Configurável pelo Admin — Design

**Data:** 2026-06-16
**Status:** Aprovado pelo dono

## Objetivo

Permitir que o **super admin** configure o plano de assinatura (preço, texto e ciclo de cobrança) pela tela `/admin/configuracoes`, sem precisar mexer no código nem fazer deploy. Hoje esses valores estão chumbados no `subscriptions.service.ts`.

## Escopo

Configurável:
- **Preço mensal** (`mp_plan_amount`) — valor da cobrança, ex: `249.00`
- **Texto/descrição** (`mp_plan_reason`) — o que aparece no checkout do Mercado Pago
- **Ciclo de cobrança** (`mp_plan_frequency_months`) — `1` (mensal), `3` (trimestral) ou `12` (anual)

Fora de escopo (YAGNI, descartado pelo dono):
- Múltiplos planos / CRUD de planos
- Moeda configurável (sempre BRL)

## Decisão de armazenamento

Reusar o modelo existente `SystemSetting` (key-value), o mesmo padrão já em produção para `mp_access_token`. **Sem migration de modelo nova.**

Alternativa considerada e rejeitada: modelo estruturado `BillingPlan` — só compensaria com múltiplos planos, que está fora de escopo.

## Comportamento

Mudar a configuração afeta **apenas novos checkouts**. Assinantes ativos mantêm o valor/ciclo que contrataram, porque o preapproval já criado no Mercado Pago não é alterado. Isso evita mudança inesperada na fatura de quem já assina.

## Componentes

### 1. Backend — Admin (`apps/api/src/modules/admin/admin.controller.ts`)

- Estender `ALLOWED_SETTINGS` com: `mp_plan_amount`, `mp_plan_reason`, `mp_plan_frequency_months`.
- As novas chaves **não** entram em `MASKED_SETTINGS` (só o token é mascarado).
- Validação por chave no `PUT /admin/settings` (hoje é `z.string().min(1)` genérico). Nova validação:
  - `mp_access_token`: string não-vazia (mantém)
  - `mp_plan_amount`: string que parseia para número > 0 (ex: regex/`Number()` finito e positivo)
  - `mp_plan_reason`: string 1–255 chars
  - `mp_plan_frequency_months`: um de `'1' | '3' | '12'`

### 2. Backend — Service (`apps/api/src/modules/subscriptions/subscriptions.service.ts`)

Novo helper privado `getPlanConfig()`:

```
{ amount: number; reason: string; frequencyMonths: number }
```

Lê as 3 settings com fallback para os defaults atuais:
- `amount` → `249`
- `reason` → `'Adelina PMS — Assinatura Mensal'`
- `frequencyMonths` → `1`

Usos:
- `createPreapproval`: monta `auto_recurring` com `frequency = frequencyMonths`, `frequency_type = 'months'`, `transaction_amount = amount`, e `reason = reason`. `end_date` continua `addMonths(now, 120)`.
- `activate`: grava `planAmount = amount` e `currentPeriodEnd = addMonths(now, frequencyMonths)`.
- `handleWebhook`: renovação usa `currentPeriodEnd = addMonths(new Date(), frequencyMonths)`.

### 3. Frontend — `/admin/configuracoes` (`apps/web/src/app/(dashboard)/admin/configuracoes/page.tsx`)

Nova seção "Plano de assinatura" com 3 campos, salvos via o mesmo `PUT /admin/settings` (uma requisição por chave, igual ao token hoje):
- Valor (R$) — input numérico
- Descrição — input texto
- Ciclo — `<select>` com Mensal / Trimestral / Anual

Carrega os valores atuais via `GET /admin/settings`. Como as novas chaves não são mascaradas, o valor real aparece preenchido.

## Tratamento de erros

- Preço inválido (≤ 0 ou não-numérico) → `400` com mensagem clara em PT-BR.
- Ciclo fora dos 3 valores → `400`.
- Sem configuração salva → service usa os defaults (sistema continua funcionando como hoje).
- Acesso por não-super-admin → `403` (já coberto pelo `assertSuperAdmin`).

## Testes / Verificação

- Typecheck `@adelina/api` e `@adelina/web` limpos.
- Manual: salvar preço novo no admin → iniciar checkout → confirmar no Mercado Pago que o valor/descrição/ciclo refletem a config.
- Manual: validar rejeição de preço inválido e ciclo inválido.
