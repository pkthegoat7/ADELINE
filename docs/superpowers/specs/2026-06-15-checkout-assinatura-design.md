# Checkout & Assinatura — Adelina PMS

> Spec de design para sistema de checkout/assinatura na landing page.
> Aprovada em 2026-06-15.

## Contexto

Adelina PMS é um SaaS de gestão para pousadas/hotéis. Atualmente a landing page não tem sistema de pagamento — apenas botões de "Entrar". Este spec define a implementação de assinatura recorrente via Mercado Pago para monetizar o produto.

## Decisões

| Decisão | Escolha |
|---------|---------|
| Gateway de pagamento | Mercado Pago |
| Modelo de plano | Plano único — R$ 249/mês |
| Meio de pagamento | Cartão de crédito (somente) |
| Fluxo de checkout | Checkout Pro (redirect para MP) com Preapproval |
| Fluxo de onboarding | Pagamento primeiro → cadastro depois |
| Posicionamento na landing | Seção de preço entre "Como funciona" e CTA + CTA final atualizado |

## 1. Fluxo do Usuário

```
Landing Page
  → Clica "Assinar agora"
  → POST /api/subscriptions/create-preapproval
  → Redireciona para Mercado Pago (Checkout Pro / Preapproval)
  → Usuário paga com cartão
  → MP redireciona para /checkout/sucesso?preapproval_id=xxx
  → Tela de cadastro (nome, email, senha, nome da pousada)
  → POST /api/subscriptions/activate (cria tenant + user + vincula subscription)
  → Redireciona para /dashboard
```

### Fluxos de falha

- **Pagamento recusado**: MP exibe erro e permite nova tentativa no ambiente deles.
- **Usuário cancela**: MP redireciona para landing page (back_url).
- **Webhook de falha futura**: backend marca subscription como `past_due`, paywall no dashboard.
- **Usuário acessa /checkout/sucesso sem preapproval_id válido**: redireciona para landing.

## 2. Modelo de Dados

### Novo enum: `SubscriptionStatus`

```
pending    — preapproval criada, aguardando pagamento
active     — pagamento confirmado, acesso liberado
past_due   — cobrança falhou, em período de tolerância
cancelled  — assinatura cancelada
```

### Novo model: `Subscription`

```prisma
model Subscription {
  id                  String   @id @default(uuid()) @db.Uuid
  tenantId            String   @unique @db.Uuid @map("tenant_id")
  tenant              Tenant   @relation(fields: [tenantId], references: [id])
  mpPreapprovalId     String   @unique @map("mp_preapproval_id")
  status              SubscriptionStatus @default(pending)
  planAmount          Decimal  @db.Decimal(10, 2) @map("plan_amount")
  currentPeriodStart  DateTime @map("current_period_start")
  currentPeriodEnd    DateTime @map("current_period_end")
  mpPayerEmail        String   @map("mp_payer_email")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  @@map("subscriptions")
}
```

Relação 1:1 com `Tenant`. Tenant sem subscription = sem acesso (exceto super admin).

## 3. Endpoints da API

### POST `/api/subscriptions/create-preapproval`

- **Auth**: `@Public()` (nenhuma — usuário ainda não tem conta)
- **Body**: nenhum
- **Ação**: Cria preapproval no Mercado Pago via API com:
  - `reason`: "Adelina PMS — Assinatura Mensal"
  - `auto_recurring.frequency`: 1
  - `auto_recurring.frequency_type`: "months"
  - `auto_recurring.transaction_amount`: 249.00
  - `auto_recurring.currency_id`: "BRL"
  - `back_url`: `{PUBLIC_WEB_URL}/checkout/sucesso`
- **Retorna**: `{ init_point: "https://www.mercadopago.com.br/..." }`
- Frontend redireciona para `init_point`.

### POST `/api/subscriptions/webhook`

- **Auth**: `@Public()` com validação de signature do MP
- **Headers**: `x-signature`, `x-request-id`
- **Ação**:
  1. Valida assinatura do webhook
  2. Busca preapproval atualizada via GET na API do MP
  3. Atualiza `Subscription.status` conforme `preapproval.status`:
     - `authorized` → `active`
     - `paused` → `past_due`
     - `cancelled` → `cancelled`
     - `pending` → `pending`
  4. Atualiza `currentPeriodStart`/`currentPeriodEnd`
- **Retorna**: 200 OK

### POST `/api/subscriptions/activate`

- **Auth**: `@Public()` (usuário está se cadastrando)
- **Body**: `{ preapprovalId, name, email, password, propertyName }`
- **Ação**:
  1. Busca preapproval no MP → confirma status `authorized`
  2. Verifica que email não existe no sistema
  3. Em transação:
     - Cria `Tenant`
     - Cria `User` (role: owner) com senha hash
     - Cria `Property` com nome fornecido
     - Cria `Subscription` vinculada ao tenant com status `active`
  4. Gera JWT e seta cookie de sessão
- **Retorna**: `{ redirect: "/dashboard" }`

### GET `/api/subscriptions/status`

- **Auth**: JWT (autenticado)
- **Ação**: Retorna status da subscription do tenant do usuário logado
- **Retorna**: `{ status, currentPeriodEnd, planAmount }`

## 4. Alterações na Landing Page

### Nova seção "Preço" (entre "Como funciona" e CTA final)

- Âncora `#preco` adicionada à navbar
- Card central com design consistente (`surface-card`, `glow-border`):
  - Título: "Adelina PMS"
  - Preço: "R$ 249" + "/mês"
  - Lista de incluso com check icons:
    - Calendário unificado
    - Canais bidirecionais (Airbnb + Booking)
    - Anti-overbooking automático
    - Gestão de hóspedes
    - Equipe ilimitada
    - Suporte por WhatsApp
  - Botão "Assinar agora" (chama create-preapproval e redireciona)

### CTA final atualizado

- Título: "Pronto para assumir o controle?"
- Botão muda de "Entrar no sistema" → "Assinar agora"
- Ação: mesmo fluxo de redirect para MP

### Navbar

- Adiciona item "Preço" apontando para `#preco`

## 5. Página `/checkout/sucesso`

Rota pública: `/checkout/sucesso`

- Lê `preapproval_id` da query string
- Valida existência via API do MP (SSR ou client-side)
- Se inválido → redireciona para `/`
- Se válido → exibe:
  - Ícone de sucesso + "Pagamento confirmado!"
  - Formulário: nome completo, email, senha, confirmar senha, nome da pousada
  - Validação com Zod (consistente com padrões do projeto)
  - Submit → POST `/api/subscriptions/activate`
  - Loading state durante criação
  - Sucesso → redirect para `/dashboard`
  - Erro (email já existe, preapproval inválida) → mensagem de erro

## 6. Paywall no Dashboard

Guard no layout do dashboard `(dashboard)/layout.tsx`:

1. Após autenticação, busca `subscription.status` do tenant
2. Regras:
   - `active` → acesso normal
   - `past_due` → banner amarelo de aviso ("Sua cobrança falhou, atualize seu cartão") + acesso liberado por 7 dias de tolerância
   - `cancelled` / `pending` / sem subscription → redireciona para `/assinatura-necessaria`
3. Super admins (`SUPER_ADMIN_EMAILS`) bypassam o paywall

### Página `/assinatura-necessaria`

- Mensagem: "Sua assinatura está inativa"
- Botão: "Reativar assinatura" → cria nova preapproval e redireciona pro MP
- Link: "Sair" → logout

## 7. Segurança

- **Webhook signature**: validar `x-signature` header com `HMAC-SHA256` usando secret do MP
- **Preapproval nunca confiada pelo redirect**: sempre confirmada via GET na API do MP antes de criar tenant
- **Dados de cartão**: nunca tocam nosso servidor (Checkout Pro do MP)
- **Rate limiting**: endpoint `create-preapproval` com throttle para evitar abuso
- **Email uniqueness**: verificado antes de criar user no `/activate`
- **Transação atômica**: criação de tenant + user + property + subscription em uma única transação Prisma

## 8. Variáveis de Ambiente (novas)

```env
MP_ACCESS_TOKEN=            # Access token do Mercado Pago (produção)
MP_WEBHOOK_SECRET=          # Secret para validar webhooks
```

## 9. Dependências (novas)

```
mercadopago  — SDK oficial do Mercado Pago para Node.js
```

## 10. Fora de escopo (MVP)

- Troca de plano / upgrade / downgrade (plano único)
- Pix e boleto (somente cartão)
- Cupons de desconto
- Trial gratuito
- Nota fiscal automática
- Painel admin de gestão de assinaturas (usa dashboard do MP)
- Cancelamento self-service (feito via MP ou contato)
