# Relatórios Financeiros + Notificação de Vencimento — Design

**Data:** 2026-06-25
**Módulo:** financeiro (sub-projeto C, após Despesas e Repasse a Proprietários)
**Status:** aprovado para implementação

## Objetivo

Entregar quatro funções do financeiro:

1. **Relatório de Recebimentos** — entradas realizadas (caixa).
2. **Relatório de Pagamentos** — saídas realizadas (caixa).
3. **Relatório de Caixa** — fluxo consolidado (entradas − saídas) do período.
4. **Notificação de Vencimento** — contas a pagar (despesas) vencendo/vencidas, in-app.

## Princípios e decisões

- **Regime de caixa (só realizado):** todos os relatórios consideram apenas o que efetivamente entrou/saiu, por `paidAt`. Nada de previsto/competência nestes relatórios.
- **RBAC:** reusa `expense:read` (owner + manager) para os três relatórios e para a notificação de vencimento. Sem nova capacidade de leitura. Espelhado API + web.
- **Sem migração de schema:** tudo lê de tabelas existentes. O lançamento manual de recebimento grava em `Payment` (campo `reservationId` já obrigatório). A notificação de vencimento é **computada ao vivo** de `Expense`.
- **Exportação:** CSV servido pelo próprio endpoint (`?format=csv`, zero dependência) + PDF via impressão nativa do browser (`@media print` + `window.print()`, sem lib nova).
- **YAGNI:** sem cron, sem tabela de notificação, sem saldo inicial de caixa no v1.

## A) Relatório de Recebimentos

**Fonte:** `Payment` com `status ∈ {paid, partial}` e `paidAt` dentro do período, join com `reservation` → `guest`/`property`.

**Pré-requisito — lançamento manual de recebimento:** hoje `Payment` só é criado quando um link MP é pago (`payments.service.ts`, method `link`). Recebimentos em dinheiro/Pix/cartão na recepção não existem em lugar nenhum. Adicionar:

- **Endpoint:** `POST /api/payments/reservations/:id/receipts` — cria `Payment` (`amount`, `method ∈ {cash, pix, credit_card, debit_card, bank_transfer}`, `status = paid`, `paidAt`, `metadata` opcional com nota). Valida Zod. Tenant-scoped via `withTenant`.
- **RBAC:** nova capacidade `payment:record` (owner + manager + receptionist — front-desk recebe pagamento). Espelhada nos 2 lados.
- **UI:** ação "Registrar recebimento" no drawer/ações da reserva → modal com valor, método, data, observação. Atualiza `reservation.paymentStatus` (paid/partial) reutilizando a lógica já existente do webhook de link.

**Filtros do relatório:** período (`paidAt`), propriedade, método, status.
**Colunas:** data, hóspede, reserva (código), propriedade, método, valor.
**Totais:** subtotal por método + total geral.

## B) Relatório de Pagamentos

**Fonte unificada (saídas realizadas):**

- `Expense` com `status = paid` e `paidAt` no período → tipo "despesa".
- `OwnerPayout` com `paidAt` no período → tipo "repasse".

**Filtros:** período, propriedade, tipo (despesa/repasse), categoria (quando despesa).
**Colunas:** data, tipo, descrição, fornecedor/proprietário, categoria, propriedade, valor.
**Totais:** subtotal por categoria/tipo + total geral.

> Nota: repasse pago **não** vira `Expense` (regra já vigente, evita dedução recursiva), por isso é somado separadamente aqui sem dupla contagem.

## C) Relatório de Caixa

Consolida A e B no mesmo período:

- **Total de entradas** (recebimentos realizados), **total de saídas** (pagamentos realizados), **resultado do período** (entradas − saídas).
- **Quebra diária** (timeline `{ dia, entradas, saidas, saldoDia }`) para um gráfico de fluxo simples e para o CSV.
- **Sem saldo inicial / conta-caixa** no v1 (não há modelo de conta). É o fluxo líquido do período. Saldo inicial configurável fica como evolução futura.

## D) Notificação de Vencimento (contas a pagar)

**Computada ao vivo** (sem cron, sem persistência) de `Expense` com `status = pending` e `dueDate` não nulo:

- Baldes: **vencidas** (`dueDate < hoje`), **vence hoje** (`dueDate = hoje`), **a vencer** (`hoje < dueDate ≤ hoje + N`), com `N` configurável (default 7 dias).
- **Endpoint:** `GET /api/reports/payables-due?days=N` → `{ overdue[], today[], upcoming[], counts, totals }`.
- **UI:** badge com contagem (vencidas + hoje) no item de menu **Financeiro** + card "Contas a vencer" (lista com ação rápida "marcar pago", reusando o endpoint de despesas). Pode aparecer também como card no dashboard.

## Arquitetura

### API — módulo novo `reports`

```
apps/api/src/modules/reports/
  reports.module.ts
  reports.controller.ts        # Zod nos query params; @RequireCapability('expense:read')
  reports.service.ts           # orquestra withTenant + chama funções puras
  reports.calc.ts              # FUNÇÕES PURAS de agregação (testáveis)
  reports.calc.spec.ts         # vitest
  reports.csv.ts               # serialização CSV (pura, sem dependência)
```

- **Endpoints:**
  - `GET /api/reports/receipts?from&to&propertyId&method&status&format`
  - `GET /api/reports/payments?from&to&propertyId&type&category&format`
  - `GET /api/reports/cashflow?from&to&propertyId&format`
  - `GET /api/reports/payables-due?days`
- `format=csv` → `Content-Type: text/csv`, mesmo dado/filtros do JSON (fonte única).
- Lançamento manual de recebimento vive no **módulo `payments`** existente (não no `reports`): `POST /api/payments/reservations/:id/receipts`.
- **Funções puras** em `reports.calc.ts`: recebem linhas já carregadas (tenant-scoped) e devolvem agregações/totais. Sem acesso a Prisma → testáveis com vitest (padrão do repo, igual `payouts.calc.ts`).

### Web — `/financeiro/relatorios`

- Página com 3 abas: **Recebimentos**, **Pagamentos**, **Caixa**. Filtros no topo (período, propriedade, etc.), tabela + cards de totais (padrão visual de `/financeiro/despesas`).
- **Exportar CSV:** baixa de `?format=csv` com os filtros atuais.
- **PDF/Imprimir:** view com `@media print` (esconde chrome do app, mostra cabeçalho com nome da pousada + período) e `window.print()`. Sem lib.
- **Vencimentos:** badge no menu Financeiro (`useCan('expense:read')`) + card "Contas a vencer".
- Novo item de menu **Relatórios** (ícone `FileText` ou `BarChart3`) dentro de Financeiro, gated `expense:read`.
- Modal "Registrar recebimento" na lista/drawer de reservas, gated `payment:record`.

### RBAC (atualizar os 2 espelhos: `apps/api/src/common/permissions.ts` + `apps/web/src/lib/permissions.ts`)

- `expense:read` → já existe (owner, manager): usado pelos relatórios + vencimentos.
- `payment:record` → **nova** (owner, manager, receptionist): criar recebimento manual.

## Testes

- `reports.calc.spec.ts` (vitest): agregação de recebimentos por método, pagamentos por categoria/tipo (sem dupla contagem despesa×repasse), fluxo de caixa (entradas−saídas, quebra diária), baldes de vencimento (vencida/hoje/a vencer com `N`).
- `reports.csv.ts`: serialização com escape de vírgula/aspas/quebra de linha.

## Fora de escopo (v1)

- Saldo inicial / modelo de conta-caixa.
- Notificação por WhatsApp/e-mail (decisão: só in-app).
- Recebimento avulso sem reserva.
- DRE por competência (sub-projeto futuro do financeiro).
