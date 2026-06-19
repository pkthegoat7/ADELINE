# Repasse a Proprietários (Sub-projeto B do Módulo Financeiro) — Design

**Data:** 2026-06-19
**Status:** Aprovado para planejamento
**Contexto:** Segundo sub-projeto do módulo financeiro do Adelina, após **A — Despesas**
(shipped 2026-06-18). Este doc cobre o que a decomposição original chamou de **B —
Proprietários & Comissão** somado ao **cálculo do extrato de repasse**, num único módulo
coeso: não há repasse sem cadastro de proprietário nem sem os termos de comissão da
administração. O **fechamento mensal / DRE** continua como sub-projeto separado.

## Objetivo

Permitir que a pousada (administradora) cadastre os **proprietários** dos imóveis que
administra, defina os **termos de comissão de administração** por imóvel, e gere o
**extrato de repasse mensal** ao dono: receita das reservas − taxa de administração −
despesas do imóvel, por competência, com controle de pagamento (marcar pago + comprovante).

## Modelo de negócio (recap)

Misto: algumas pousadas são donas das próprias unidades, outras administram imóveis de
terceiros. O proprietário é **opcional por imóvel** (`Property.ownerId` nulo = imóvel
próprio da administradora, não gera repasse). Granularidade travada no brainstorming:
**1 proprietário por `Property` inteira** (não por quarto/unidade).

## Decisões de escopo (travadas no brainstorming)

| Tema | Decisão |
|------|---------|
| Granularidade | **1 dono por `Property`** (`Owner` 1:N `Property`). Sem dono por quarto/RoomType na v1. |
| Proprietário | Entidade de **contato**, NÃO usuário do sistema (não loga). Guarda dados de pagamento (Pix/banco). |
| Taxa de administração | **% sobre a receita + valor fixo mensal**, ambos configuráveis **por imóvel** (cada contrato difere). |
| Base de receita | **Líquido (`netAmount`)** — já descontada a comissão do canal (Airbnb/Booking). A taxa de adm incide sobre o líquido. |
| Competência | **Data de check-out** define o mês da reserva. Reserva inteira num único mês. Sem pro-rata na v1. |
| Status de reserva contado | `confirmed`, `checked_in`, `checked_out`. Exclui `pending`, `cancelled`, `no_show`. |
| Despesas deduzidas | **Todas** as despesas do imóvel com `date` no mês (status `pending` **e** `paid`) — mesmo regime de competência da receita. Despesas gerais do tenant (`propertyId` nulo) **não** entram. |
| Ciclo de vida | **Cálculo ao vivo** enquanto o mês está aberto; ao **marcar pago**, congela um **snapshot** dos valores. Sem etapa de "fechar" separada. |
| Snapshot vs recálculo | Repasse pago lê do snapshot congelado; ignora edições posteriores de reserva/despesa. |
| Repasse ≠ Despesa | Marcar repasse pago **NÃO** cria um `Expense` (evita dedução recursiva no mês seguinte). É ledger próprio. |
| Lançamentos avulsos (Stays) | Extrato aceita **linhas manuais de crédito/débito** por imóvel+competência (ex.: crédito de reembolso, débito de adiantamento), além das reservas/despesas automáticas. Editáveis só com o mês aberto; congelam no snapshot ao pagar. |
| Apresentação (Stays) | Extrato em **formato de razão**: lançamentos de crédito e débito com saldo corrente, terminando no repasse líquido — não só um resumo. |
| Visualização | Dado financeiro sensível: ler e escrever restrito a **owner + manager** (igual despesas). |

## Fora de escopo (YAGNI / sub-projetos seguintes)

- Dono por quarto/unidade (rateio intra-pousada).
- Pro-rata de receita por noites entre meses.
- Regime de caixa (competência por data de pagamento).
- Portal/login do proprietário para ver o próprio extrato (módulo à parte, fica para depois).
- Exportar extrato em PDF (provável próximo passo; o `breakdown` em JSON já viabiliza).
- Envio automático do extrato por e-mail/WhatsApp.
- Upload/storage de comprovante (apenas campo URL, igual despesas).
- DRE / fechamento mensal consolidado (sub-projeto seguinte).

## Modelo de dados

Padrão RLS por tenant idêntico às demais tabelas do prod (`ENABLE ROW LEVEL SECURITY` +
`CREATE POLICY x_tenant USING (tenant_id = app_current_tenant())`).

### `Owner` (nova tabela `owners`)

```
id          uuid  PK
tenantId    uuid  FK Tenant (onDelete Cascade)
name        text
document    text?           -- CPF ou CNPJ
email       text?
phone       text?
pixKey      text?           -- chave Pix para o repasse
bankInfo    text?           -- dados bancários em texto livre
notes       text?
active      bool  default true
createdAt / updatedAt
RLS: owners_tenant = app_current_tenant()
índices: (tenantId)
```

### `Property` (+3 campos)

```
ownerId               uuid?         FK Owner (onDelete SetNull)  -- nulo = imóvel próprio
mgmtCommissionPercent Decimal(5,2)  @default 0   -- % taxa de administração
mgmtMonthlyFee        Decimal(10,2) @default 0   -- taxa fixa mensal
```

### `OwnerPayout` (nova tabela `owner_payouts`)

Uma linha existe **somente quando o repasse foi pago** (snapshot congelado). Mês em aberto
não tem linha — é calculado ao vivo.

```
id                uuid  PK
tenantId          uuid  FK Tenant (onDelete Cascade)
propertyId        uuid  FK Property (onDelete Cascade)
ownerId           uuid? FK Owner (onDelete SetNull)   -- snapshot do dono no pagamento
competence        date                                -- 1º dia do mês (ex 2026-06-01)
revenueAmount     Decimal(10,2)   -- Σ netAmount das reservas
commissionPercent Decimal(5,2)    -- % aplicado (snapshot do contrato)
commissionFeeAmount Decimal(10,2) -- round(receita × %/100, 2)
monthlyFeeAmount  Decimal(10,2)   -- taxa fixa (snapshot)
expensesAmount    Decimal(10,2)   -- Σ despesas do imóvel no mês
netPayoutAmount   Decimal(10,2)   -- receita − taxaAdm − despesas
reservationCount  int
breakdown         json            -- snapshot das reservas + despesas incluídas (extrato histórico)
paidAt            timestamptz
paymentMethod     text?           -- texto livre (Pix, transferência, ...)
receiptUrl        text?
createdAt         timestamptz
@@unique([propertyId, competence])
RLS: owner_payouts_tenant = app_current_tenant()
índices: (tenantId), (propertyId), (competence)
```

### `PayoutEntry` (nova tabela `payout_entries`) — lançamentos avulsos (estilo Stays)

Linhas manuais de crédito/débito adicionadas ao extrato de um imóvel num mês, além das
reservas/despesas automáticas. Existem com o mês **aberto**; ao pagar, são lidas e
congeladas no `breakdown` do `OwnerPayout`. Não podem ser editadas com o mês pago (reabrir antes).

```
id          uuid  PK
tenantId    uuid  FK Tenant (onDelete Cascade)
propertyId  uuid  FK Property (onDelete Cascade)
competence  date                    -- 1º dia do mês a que pertence
type        enum payout_entry_type (credit | debit)
description text
amount      Decimal(10,2)           -- sempre positivo; o sinal vem de `type`
createdAt   timestamptz
RLS: payout_entries_tenant = app_current_tenant()
índices: (tenantId), (propertyId, competence)
```

## Motor de cálculo

`PayoutsService.compute(tenantId, propertyId, competence)` (tenant-scoped via `withTenant`):

```
[first, last] = primeiro e último dia do mês de `competence` (date-fns)

reservas = Reservation WHERE propertyId = X
                         AND checkOut BETWEEN first AND last
                         AND status IN (confirmed, checked_in, checked_out)
receita  = Σ Number(r.netAmount)

property = Property X  (lê mgmtCommissionPercent, mgmtMonthlyFee, ownerId)
commissionFee = round(receita × mgmtCommissionPercent / 100, 2)
monthlyFee    = mgmtMonthlyFee

despesas = Expense WHERE propertyId = X AND date BETWEEN first AND last
expensesTotal = Σ Number(e.amount)

entries = PayoutEntry WHERE propertyId = X AND competence = first
adjCredits = Σ amount (type=credit)
adjDebits  = Σ amount (type=debit)

netPayout = receita − commissionFee − monthlyFee − expensesTotal + adjCredits − adjDebits
```

Visto como **razão** (Stays): repasse = Σ créditos − Σ débitos, onde
créditos = receita líquida + lançamentos de crédito; débitos = comissão + taxa fixa +
despesas + lançamentos de débito.

Retorna `{ status: 'open' | 'paid', revenueAmount, commissionPercent, commissionFeeAmount,
monthlyFeeAmount, expensesAmount, adjustmentsCredit, adjustmentsDebit, netPayoutAmount,
reservationCount, breakdown }`.

- **Mês já pago** (existe linha em `owner_payouts` para `(propertyId, competence)`): devolve o
  snapshot congelado, `status: 'paid'`, ignorando recálculo. Edições posteriores de
  reserva/despesa não afetam um repasse pago.
- **Mês aberto:** calcula ao vivo, `status: 'open'`.
- `breakdown` = **razão ordenado** de lançamentos para o extrato:
  `{ lines: [{ kind, date?, description, credit, debit }], ... }` onde `kind ∈
  { reservation, commission, monthly_fee, expense, adjustment }`. Reservas e lançamentos de
  crédito entram em `credit`; comissão, taxa fixa, despesas e lançamentos de débito entram em
  `debit`. A UI calcula o saldo corrente; a última linha é o repasse líquido.
- **Decimal**: somar com `Number(...)`; arredondar a 2 casas; nunca float acumulado sem round.
- Imóvel sem `ownerId` não aparece na tela de repasses (não há a quem repassar).

## API — módulo `payouts`

Validação Zod nos controllers, queries via `withTenant`, padrão idêntico ao módulo `expenses`.

**Proprietários (CRUD):**
- `GET    /api/owners`                 → lista (com contagem de imóveis vinculados) — `owner:read`
- `GET    /api/owners/:id`             → detalhe — `owner:read`
- `POST   /api/owners`                 → cria — `owner:manage`
- `PATCH  /api/owners/:id`             → edita — `owner:manage`
- `DELETE /api/owners/:id`             → soft delete (`active=false`); bloqueia se houver imóvel vinculado ativo — `owner:manage`

**Termos do contrato (reusa módulo `properties`):**
- `PATCH /api/properties/:id` ganha `ownerId`, `mgmtCommissionPercent`, `mgmtMonthlyFee` — `property:manage`

**Repasses:**
- `GET  /api/payouts?competence=YYYY-MM`             → tabela por imóvel administrado (vivo/congelado) — `payout:read`
- `GET  /api/payouts/:propertyId/:competence`        → extrato com `breakdown` — `payout:read`
- `POST /api/payouts/:propertyId/:competence/pay`    → congela snapshot + grava linha paga; body `{ paidAt, paymentMethod?, receiptUrl? }` — `payout:manage`
- `POST /api/payouts/:propertyId/:competence/reopen` → apaga a linha paga (corrigir erro) — `payout:manage`

**Lançamentos avulsos** (só com o mês aberto — rejeita 409 se já pago):
- `POST   /api/payouts/:propertyId/:competence/entries` → cria; body `{ type, description, amount }` — `payout:manage`
- `DELETE /api/payouts/entries/:id`                      → remove — `payout:manage`

`competence` na URL/query no formato `YYYY-MM`; normalizado para o 1º dia do mês.

## RBAC

Novas capacidades nos **dois espelhos** (`apps/api/src/common/permissions.ts` +
`apps/web/src/lib/permissions.ts`):

| Capacidade | Papéis |
|------------|--------|
| `owner:read`    | owner, manager |
| `owner:manage`  | owner, manager |
| `payout:read`   | owner, manager |
| `payout:manage` | owner, manager |

receptionist / housekeeper / readonly: sem acesso (não veem o menu Financeiro).
super-admin não tem bypass dentro da pousada (respeita o papel), igual ao resto.

Endpoints anotados com `@RequireCapability('...')`; UI espelha escondendo botões/menus via `useCan()`.

## UI (Next.js, sob o menu "Financeiro")

Submenu Financeiro ganha **Repasses** e **Proprietários** (gated owner/manager).

**`/financeiro/repasses`:**
- Seletor de competência (mês/ano).
- Tabela: Imóvel · Proprietário · Receita líquida · Taxa adm (%+fixo) · Despesas · **Repasse líquido** · Status (`Em aberto` / `Pago em dd/mm`).
- Só lista imóveis com `ownerId`.
- Ação "Ver extrato" → modal com o extrato em **formato de razão**: lançamentos de
  crédito (reservas, créditos manuais) e débito (comissão, taxa fixa, despesas, débitos
  manuais) com saldo corrente e o repasse líquido ao final. Botões:
  - **Adicionar lançamento** (crédito/débito + descrição + valor) — só com o mês aberto.
  - **Marcar pago** (data do pagamento + método + URL de comprovante opcional) — em mês aberto.
  - **Reabrir** — em mês pago (reativa a edição de lançamentos).

**`/financeiro/proprietarios`:**
- Lista de proprietários (nome, documento, contato, nº de imóveis, dados de pagamento).
- Modal criar/editar proprietário.
- Seção de vínculo: atribuir proprietário a imóvel(is) com `mgmtCommissionPercent` e `mgmtMonthlyFee` (via `PATCH /api/properties/:id`).

Padrões de UI já estabelecidos: componente `Select` usa `options:{value,label}[]` +
`onChange:(v)=>void` (não `<select>` nativo); classe de input `input-base`;
`toast.success(msg, desc?)` / `toast.error(msg, desc?)` do `sonner` (2º arg = string).

## Banco de dados (aplicação em prod)

- ⚠️ **NUNCA `prisma db push` neste prod** (quer dropar tabelas por divergência de histórico).
- Schema novo aplicado via **SQL aditivo manual** dentro de transação
  (`docker exec adelina_postgres psql ... --single-transaction`): `CREATE TYPE payout_entry_type`,
  `CREATE TABLE owners`, `CREATE TABLE owner_payouts`, `CREATE TABLE payout_entries`,
  `ALTER TABLE properties ADD COLUMN ...` (3 colunas),
  `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` nas três novas tabelas.
- Migration file aditivo criado em
  `packages/db/prisma/migrations/20260619000000_owner_payouts/migration.sql` para manter histórico.
- Postgres prod = serviço `postgres` na rede `adelina_internal` (sem porta publicada). `psql`
  existe no container `adelina_postgres`, não no `adelina_api`.

## Testes

**TDD** no `PayoutsService.compute` (núcleo de valor):
- Soma de receita líquida só das reservas do mês (fronteira por `checkOut`).
- Filtro de status (exclui pending/cancelled/no_show).
- Taxa de adm = % sobre líquido + fixo, arredondada a 2 casas.
- Dedução de todas as despesas do imóvel no mês (pending + paid).
- Lançamentos avulsos: crédito soma, débito subtrai no repasse e no breakdown.
- Repasse líquido = créditos − débitos (inclui caso negativo: despesas+débitos > receita+créditos).
- Snapshot congelado: após pago, recálculo devolve o valor pago mesmo com reserva/despesa/lançamento editado.
- Imóvel sem dono não é incluído.

## Resumo da fórmula

```
receita   = Σ netAmount (reservas confirmadas+ do imóvel, checkOut no mês)
taxaAdm   = round(receita × mgmtCommissionPercent/100, 2) + mgmtMonthlyFee
despesas  = Σ amount (despesas do imóvel, date no mês, qualquer status)
ajustes   = Σ crédito − Σ débito (lançamentos avulsos do mês)
repasse   = receita − taxaAdm − despesas + ajustes
```
