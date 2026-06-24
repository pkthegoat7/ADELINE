# Relatórios Financeiros + Notificação de Vencimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar Relatório de Recebimentos, de Pagamentos, de Caixa (regime de caixa) + notificação in-app de contas a pagar vencendo, com exportação CSV/PDF e lançamento manual de recebimento por reserva.

**Architecture:** Módulo NestJS novo `reports` cuja lógica de agregação são **funções puras** (`reports.calc.ts`, testadas com vitest) alimentadas por queries tenant-scoped (`withTenant`). CSV serializado por função pura (sem dependência). Lançamento manual de recebimento entra no módulo `payments` existente. Web: página `/financeiro/relatorios` com 3 abas + badge/card de vencimentos; PDF via `@media print` + `window.print()`.

**Tech Stack:** NestJS 10 + Fastify + Prisma 5, Zod nos controllers, vitest p/ funções puras; Next.js 15 (App Router) + TanStack Query + Tailwind no web. Espelho de RBAC em `apps/api/src/common/permissions.ts` + `apps/web/src/lib/permissions.ts`.

**Convenções herdadas (não reinventar):**
- Controllers usam `@RequireCapability('cap')` + `Schema.parse(body)` (Zod). Service usa `this.prisma.withTenant(tenantId, (tx) => ...)`.
- `Payment` **não tem `tenant_id`** — filtrar sempre via relação `reservation: { tenantId }`.
- `Expense.paidAt`/`date`/`dueDate` são `@db.Date`; `Payment.paidAt` e `OwnerPayout.paidAt` são `DateTime`. Converter p/ ISO `yyyy-mm-dd` com `.toISOString().slice(0, 10)` antes de passar p/ funções puras.
- Componente web `Select` usa `options:{value,label}[]` + `onChange:(v:string)=>void`; classe de input é `input-base`; `toast.success(msg, desc?)` do `sonner`. Chamadas `api(path)` usam o nome do `@Controller` (inglês), não a rota de página.
- Testes vitest rodam com `pnpm --filter @adelina/api test`.

---

## File Structure

**API (criar):**
- `apps/api/src/modules/reports/reports.calc.ts` — funções puras de agregação.
- `apps/api/src/modules/reports/reports.calc.spec.ts` — testes vitest.
- `apps/api/src/modules/reports/reports.csv.ts` — serialização CSV pura.
- `apps/api/src/modules/reports/reports.csv.spec.ts` — testes vitest.
- `apps/api/src/modules/reports/reports.service.ts` — carrega dados tenant-scoped, chama calc.
- `apps/api/src/modules/reports/reports.controller.ts` — endpoints + `?format=csv`.
- `apps/api/src/modules/reports/reports.module.ts`.

**API (modificar):**
- `apps/api/src/common/permissions.ts` — nova capability `payment:record`.
- `apps/api/src/app.module.ts` — registrar `ReportsModule`.
- `apps/api/src/modules/payments/payments.service.ts` — método `recordReceipt` + helper puro `computePaymentStatus`.
- `apps/api/src/modules/payments/payments.controller.ts` — endpoint `POST reservations/:id/receipts`.
- `apps/api/src/modules/payments/payment-status.ts` (criar) — helper puro + teste `payment-status.spec.ts`.

**Web (criar):**
- `apps/web/src/app/(dashboard)/financeiro/relatorios/page.tsx` — 3 abas + filtros + export.
- `apps/web/src/components/RecordReceiptModal.tsx` — modal de recebimento manual.
- `apps/web/src/components/PayablesDueCard.tsx` — card "Contas a vencer".

**Web (modificar):**
- `apps/web/src/lib/permissions.ts` — espelho de `payment:record`.
- `apps/web/src/app/(dashboard)/layout.tsx` — item de menu "Relatórios".
- Página de reservas (lista/drawer) — botão "Registrar recebimento" (gated `payment:record`).

---

## Task 1: RBAC — capability `payment:record`

**Files:**
- Modify: `apps/api/src/common/permissions.ts`
- Modify: `apps/web/src/lib/permissions.ts`

- [ ] **Step 1: Adicionar a capability na API**

Em `apps/api/src/common/permissions.ts`, no union `Capability` (após `'payment:link'`):

```ts
  | 'payment:link' // gerar link de pagamento
  | 'payment:record' // registrar recebimento manual (dinheiro/pix/cartão)
```

E em `CAPABILITY_ROLES` (após a linha `'payment:link'`):

```ts
  'payment:link': ['owner', 'manager', 'receptionist'],
  'payment:record': ['owner', 'manager', 'receptionist'],
```

- [ ] **Step 2: Espelhar no web**

Em `apps/web/src/lib/permissions.ts`, mesma adição no union `Capability` e em `CAPABILITY_ROLES`:

```ts
  | 'payment:link'
  | 'payment:record'
```

```ts
  'payment:link': ['owner', 'manager', 'receptionist'],
  'payment:record': ['owner', 'manager', 'receptionist'],
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @adelina/api typecheck && pnpm --filter @adelina/web typecheck`
Expected: sem erros novos (baseline de 21 erros pré-existentes em `dashboard.controller.ts`/`whatsapp`/`zod-filter`/`availability` é tolerado).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/common/permissions.ts apps/web/src/lib/permissions.ts
git commit -m "feat(rbac): capability payment:record p/ recebimento manual"
```

---

## Task 2: CSV — função pura `toCsv`

**Files:**
- Create: `apps/api/src/modules/reports/reports.csv.ts`
- Test: `apps/api/src/modules/reports/reports.csv.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/api/src/modules/reports/reports.csv.spec.ts
import { describe, expect, it } from 'vitest';
import { toCsv } from './reports.csv';

describe('toCsv', () => {
  it('monta cabeçalho + linhas', () => {
    const csv = toCsv(['data', 'valor'], [['2026-06-01', 100], ['2026-06-02', 50]]);
    expect(csv).toBe('data,valor\n2026-06-01,100\n2026-06-02,50');
  });

  it('escapa vírgula, aspas e quebra de linha', () => {
    const csv = toCsv(['desc'], [['a,b'], ['diz "oi"'], ['linha\nquebra']]);
    expect(csv).toBe('desc\n"a,b"\n"diz ""oi"""\n"linha\nquebra"');
  });

  it('campos vazios/nulos viram string vazia', () => {
    const csv = toCsv(['a', 'b'], [[null as unknown as string, '']]);
    expect(csv).toBe('a,b\n,');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @adelina/api test reports.csv`
Expected: FAIL ("Cannot find module './reports.csv'").

- [ ] **Step 3: Implementar**

```ts
// apps/api/src/modules/reports/reports.csv.ts
/** Serializa uma tabela em CSV (RFC-4180-ish). Sem dependência externa. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  return lines.join('\n');
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @adelina/api test reports.csv`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reports/reports.csv.ts apps/api/src/modules/reports/reports.csv.spec.ts
git commit -m "feat(reports): serializador CSV puro"
```

---

## Task 3: Tipos + `aggregateReceipts`

**Files:**
- Create: `apps/api/src/modules/reports/reports.calc.ts`
- Test: `apps/api/src/modules/reports/reports.calc.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/api/src/modules/reports/reports.calc.spec.ts
import { describe, expect, it } from 'vitest';
import { aggregateReceipts, type ReceiptRow } from './reports.calc';

const r = (over: Partial<ReceiptRow>): ReceiptRow => ({
  id: 'x', paidAt: '2026-06-01', guestName: 'João', reservationCode: 'ADL-1',
  propertyName: 'Casa', method: 'pix', amount: 100, ...over,
});

describe('aggregateReceipts', () => {
  it('soma total, conta e quebra por método', () => {
    const out = aggregateReceipts([
      r({ method: 'pix', amount: 100 }),
      r({ method: 'pix', amount: 50 }),
      r({ method: 'cash', amount: 30 }),
    ]);
    expect(out.total).toBe(180);
    expect(out.count).toBe(3);
    expect(out.byMethod).toEqual([
      { method: 'pix', amount: 150, count: 2 },
      { method: 'cash', amount: 30, count: 1 },
    ]);
  });

  it('lista vazia → zeros', () => {
    const out = aggregateReceipts([]);
    expect(out).toEqual({ rows: [], byMethod: [], total: 0, count: 0 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @adelina/api test reports.calc`
Expected: FAIL ("Cannot find module './reports.calc'").

- [ ] **Step 3: Implementar (tipos + função)**

```ts
// apps/api/src/modules/reports/reports.calc.ts
export type ReceiptMethod =
  | 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'link' | 'channel_collected';

export interface ReceiptRow {
  id: string;
  paidAt: string; // ISO yyyy-mm-dd
  guestName: string;
  reservationCode: string;
  propertyName: string | null;
  method: ReceiptMethod;
  amount: number;
}
export interface MethodTotal { method: ReceiptMethod; amount: number; count: number; }
export interface ReceiptsReport {
  rows: ReceiptRow[];
  byMethod: MethodTotal[];
  total: number;
  count: number;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function aggregateReceipts(rows: ReceiptRow[]): ReceiptsReport {
  const byMethodMap = new Map<ReceiptMethod, MethodTotal>();
  let total = 0;
  for (const row of rows) {
    total += row.amount;
    const cur = byMethodMap.get(row.method) ?? { method: row.method, amount: 0, count: 0 };
    cur.amount = round2(cur.amount + row.amount);
    cur.count += 1;
    byMethodMap.set(row.method, cur);
  }
  const byMethod = [...byMethodMap.values()].sort((a, b) => b.amount - a.amount);
  return { rows, byMethod, total: round2(total), count: rows.length };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @adelina/api test reports.calc`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reports/reports.calc.ts apps/api/src/modules/reports/reports.calc.spec.ts
git commit -m "feat(reports): aggregateReceipts (entradas por método)"
```

---

## Task 4: `aggregatePayments`

**Files:**
- Modify: `apps/api/src/modules/reports/reports.calc.ts`
- Test: `apps/api/src/modules/reports/reports.calc.spec.ts`

- [ ] **Step 1: Adicionar o teste que falha**

Acrescentar ao `reports.calc.spec.ts`:

```ts
import { aggregatePayments, type PaymentOutRow } from './reports.calc';

const p = (over: Partial<PaymentOutRow>): PaymentOutRow => ({
  id: 'x', type: 'expense', paidAt: '2026-06-01', description: 'Luz',
  counterparty: 'CEMIG', category: 'utilities', propertyName: 'Casa', amount: 100, ...over,
});

describe('aggregatePayments', () => {
  it('soma total e quebra por tipo e por categoria (repasse vira categoria própria)', () => {
    const out = aggregatePayments([
      p({ type: 'expense', category: 'utilities', amount: 100 }),
      p({ type: 'expense', category: 'utilities', amount: 50 }),
      p({ type: 'expense', category: 'cleaning', amount: 20 }),
      p({ type: 'payout', category: null, counterparty: 'Dona Ana', description: 'Repasse', amount: 200 }),
    ]);
    expect(out.total).toBe(370);
    expect(out.count).toBe(4);
    expect(out.byType).toEqual([
      { key: 'expense', amount: 170, count: 3 },
      { key: 'payout', amount: 200, count: 1 },
    ]);
    expect(out.byCategory).toEqual([
      { key: 'repasse', amount: 200, count: 1 },
      { key: 'utilities', amount: 150, count: 2 },
      { key: 'cleaning', amount: 20, count: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @adelina/api test reports.calc`
Expected: FAIL ("aggregatePayments is not a function").

- [ ] **Step 3: Implementar**

Acrescentar ao `reports.calc.ts`:

```ts
export type PaymentOutType = 'expense' | 'payout';
export interface PaymentOutRow {
  id: string;
  type: PaymentOutType;
  paidAt: string; // ISO yyyy-mm-dd
  description: string;
  counterparty: string | null; // fornecedor (expense) ou proprietário (payout)
  category: string | null; // categoria (expense); null p/ payout
  propertyName: string | null;
  amount: number;
}
export interface KeyTotal { key: string; amount: number; count: number; }
export interface PaymentsReport {
  rows: PaymentOutRow[];
  byType: KeyTotal[];
  byCategory: KeyTotal[];
  total: number;
  count: number;
}

function tallyBy(rows: PaymentOutRow[], keyOf: (r: PaymentOutRow) => string): KeyTotal[] {
  const map = new Map<string, KeyTotal>();
  for (const row of rows) {
    const key = keyOf(row);
    const cur = map.get(key) ?? { key, amount: 0, count: 0 };
    cur.amount = round2(cur.amount + row.amount);
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function aggregatePayments(rows: PaymentOutRow[]): PaymentsReport {
  const total = round2(rows.reduce((s, r) => s + r.amount, 0));
  return {
    rows,
    byType: tallyBy(rows, (r) => r.type),
    byCategory: tallyBy(rows, (r) => (r.type === 'payout' ? 'repasse' : r.category ?? 'sem_categoria')),
    total,
    count: rows.length,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @adelina/api test reports.calc`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reports/reports.calc.ts apps/api/src/modules/reports/reports.calc.spec.ts
git commit -m "feat(reports): aggregatePayments (saídas por tipo/categoria)"
```

---

## Task 5: `buildCashflow`

**Files:**
- Modify: `apps/api/src/modules/reports/reports.calc.ts`
- Test: `apps/api/src/modules/reports/reports.calc.spec.ts`

- [ ] **Step 1: Adicionar o teste que falha**

```ts
import { buildCashflow } from './reports.calc';

describe('buildCashflow', () => {
  it('consolida entradas - saídas com quebra diária ordenada', () => {
    const receipts = [r({ paidAt: '2026-06-01', amount: 100 }), r({ paidAt: '2026-06-02', amount: 40 })];
    const payments = [p({ paidAt: '2026-06-01', amount: 30 }), p({ paidAt: '2026-06-03', amount: 10 })];
    const out = buildCashflow(receipts, payments);
    expect(out.totalIn).toBe(140);
    expect(out.totalOut).toBe(40);
    expect(out.net).toBe(100);
    expect(out.daily).toEqual([
      { date: '2026-06-01', inflow: 100, outflow: 30, net: 70 },
      { date: '2026-06-02', inflow: 40, outflow: 0, net: 40 },
      { date: '2026-06-03', inflow: 0, outflow: 10, net: -10 },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @adelina/api test reports.calc`
Expected: FAIL ("buildCashflow is not a function").

- [ ] **Step 3: Implementar**

```ts
export interface CashflowDay { date: string; inflow: number; outflow: number; net: number; }
export interface CashflowReport {
  totalIn: number;
  totalOut: number;
  net: number;
  daily: CashflowDay[];
}

export function buildCashflow(receipts: ReceiptRow[], payments: PaymentOutRow[]): CashflowReport {
  const days = new Map<string, CashflowDay>();
  const dayOf = (date: string): CashflowDay => {
    const cur = days.get(date) ?? { date, inflow: 0, outflow: 0, net: 0 };
    days.set(date, cur);
    return cur;
  };
  for (const r of receipts) dayOf(r.paidAt).inflow = round2(dayOf(r.paidAt).inflow + r.amount);
  for (const p of payments) dayOf(p.paidAt).outflow = round2(dayOf(p.paidAt).outflow + p.amount);
  const daily = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  let totalIn = 0;
  let totalOut = 0;
  for (const d of daily) {
    d.net = round2(d.inflow - d.outflow);
    totalIn += d.inflow;
    totalOut += d.outflow;
  }
  return { totalIn: round2(totalIn), totalOut: round2(totalOut), net: round2(totalIn - totalOut), daily };
}
```

> Nota: dias sem movimento não são preenchidos (gaps) — fora de escopo do v1.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @adelina/api test reports.calc`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reports/reports.calc.ts apps/api/src/modules/reports/reports.calc.spec.ts
git commit -m "feat(reports): buildCashflow (fluxo consolidado diário)"
```

---

## Task 6: `bucketPayablesDue`

**Files:**
- Modify: `apps/api/src/modules/reports/reports.calc.ts`
- Test: `apps/api/src/modules/reports/reports.calc.spec.ts`

- [ ] **Step 1: Adicionar o teste que falha**

```ts
import { bucketPayablesDue, type PayableRow } from './reports.calc';

const due = (over: Partial<PayableRow>): PayableRow => ({
  id: 'x', dueDate: '2026-06-10', description: 'Conta', supplier: null,
  category: 'utilities', propertyName: null, amount: 100, ...over,
});

describe('bucketPayablesDue', () => {
  it('separa vencidas / hoje / a vencer (≤ N dias) e descarta além de N', () => {
    const out = bucketPayablesDue(
      [
        due({ id: 'a', dueDate: '2026-06-08', amount: 10 }), // vencida
        due({ id: 'b', dueDate: '2026-06-10', amount: 20 }), // hoje
        due({ id: 'c', dueDate: '2026-06-15', amount: 30 }), // a vencer (dentro de 7)
        due({ id: 'd', dueDate: '2026-06-30', amount: 40 }), // fora da janela
      ],
      '2026-06-10',
      7,
    );
    expect(out.overdue.map((x) => x.id)).toEqual(['a']);
    expect(out.today.map((x) => x.id)).toEqual(['b']);
    expect(out.upcoming.map((x) => x.id)).toEqual(['c']);
    expect(out.counts).toEqual({ overdue: 1, today: 1, upcoming: 1 });
    expect(out.totals).toEqual({ overdue: 10, today: 20, upcoming: 30 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @adelina/api test reports.calc`
Expected: FAIL ("bucketPayablesDue is not a function").

- [ ] **Step 3: Implementar**

```ts
export interface PayableRow {
  id: string;
  dueDate: string; // ISO yyyy-mm-dd
  description: string;
  supplier: string | null;
  category: string;
  propertyName: string | null;
  amount: number;
}
export interface PayablesBuckets {
  overdue: PayableRow[];
  today: PayableRow[];
  upcoming: PayableRow[];
  counts: { overdue: number; today: number; upcoming: number };
  totals: { overdue: number; today: number; upcoming: number };
}

/** Adiciona `days` a uma data ISO yyyy-mm-dd (UTC, sem fuso). */
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function bucketPayablesDue(rows: PayableRow[], today: string, days: number): PayablesBuckets {
  const horizon = addDaysIso(today, days);
  const overdue: PayableRow[] = [];
  const todayList: PayableRow[] = [];
  const upcoming: PayableRow[] = [];
  for (const row of rows) {
    if (row.dueDate < today) overdue.push(row);
    else if (row.dueDate === today) todayList.push(row);
    else if (row.dueDate <= horizon) upcoming.push(row);
  }
  const byDate = (a: PayableRow, b: PayableRow) => a.dueDate.localeCompare(b.dueDate);
  const sum = (arr: PayableRow[]) => round2(arr.reduce((s, x) => s + x.amount, 0));
  overdue.sort(byDate);
  todayList.sort(byDate);
  upcoming.sort(byDate);
  return {
    overdue,
    today: todayList,
    upcoming,
    counts: { overdue: overdue.length, today: todayList.length, upcoming: upcoming.length },
    totals: { overdue: sum(overdue), today: sum(todayList), upcoming: sum(upcoming) },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @adelina/api test reports.calc`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reports/reports.calc.ts apps/api/src/modules/reports/reports.calc.spec.ts
git commit -m "feat(reports): bucketPayablesDue (vencidas/hoje/a vencer)"
```

---

## Task 7: `computePaymentStatus` (helper puro do recebimento manual)

**Files:**
- Create: `apps/api/src/modules/payments/payment-status.ts`
- Test: `apps/api/src/modules/payments/payment-status.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/api/src/modules/payments/payment-status.spec.ts
import { describe, expect, it } from 'vitest';
import { computePaymentStatus } from './payment-status';

describe('computePaymentStatus', () => {
  it('paid quando total pago >= total da reserva', () => {
    expect(computePaymentStatus(200, 200)).toBe('paid');
    expect(computePaymentStatus(250, 200)).toBe('paid');
  });
  it('partial quando pago > 0 e < total', () => {
    expect(computePaymentStatus(50, 200)).toBe('partial');
  });
  it('pending quando nada pago', () => {
    expect(computePaymentStatus(0, 200)).toBe('pending');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @adelina/api test payment-status`
Expected: FAIL ("Cannot find module './payment-status'").

- [ ] **Step 3: Implementar**

```ts
// apps/api/src/modules/payments/payment-status.ts
export type ReservationPaymentStatus = 'pending' | 'partial' | 'paid';

/** Deriva o status de pagamento da reserva a partir do total já pago. */
export function computePaymentStatus(totalPaid: number, totalAmount: number): ReservationPaymentStatus {
  if (totalPaid >= totalAmount) return 'paid';
  if (totalPaid > 0) return 'partial';
  return 'pending';
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @adelina/api test payment-status`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/payments/payment-status.ts apps/api/src/modules/payments/payment-status.spec.ts
git commit -m "feat(payments): helper puro computePaymentStatus"
```

---

## Task 8: Recebimento manual — service + endpoint

**Files:**
- Modify: `apps/api/src/modules/payments/payments.service.ts`
- Modify: `apps/api/src/modules/payments/payments.controller.ts`

- [ ] **Step 1: Adicionar `recordReceipt` ao service**

No topo de `payments.service.ts`, garantir os imports:

```ts
import { computePaymentStatus } from './payment-status';
import { PaymentMethod } from '@adelina/db';
```

Adicionar o método (segue o padrão tenant-scoped; `Payment` é filtrado via `reservation`):

```ts
  /** Registra um recebimento manual (dinheiro/pix/cartão) numa reserva e recalcula o status. */
  async recordReceipt(
    tenantId: string,
    reservationId: string,
    input: { amount: number; method: PaymentMethod; paidAt?: string; note?: string },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const reservation = await tx.reservation.findFirst({
        where: { id: reservationId, tenantId },
        select: { id: true, totalAmount: true },
      });
      if (!reservation) throw new NotFoundException('Reserva não encontrada.');

      await tx.payment.create({
        data: {
          reservationId,
          amount: input.amount,
          method: input.method,
          status: 'paid',
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
          metadata: input.note ? { note: input.note } : undefined,
        },
      });

      const paid = await tx.payment.findMany({
        where: { reservationId, status: 'paid' },
        select: { amount: true },
      });
      const totalPaid = paid.reduce((s, p) => s + Number(p.amount), 0);
      await tx.reservation.update({
        where: { id: reservationId },
        data: { paymentStatus: computePaymentStatus(totalPaid, Number(reservation.totalAmount)) },
      });
      return { ok: true, totalPaid };
    });
  }
```

Garantir que `NotFoundException` está importado de `@nestjs/common` no arquivo (adicionar se faltar).

- [ ] **Step 2: Adicionar o endpoint no controller**

Em `payments.controller.ts`, adicionar o schema Zod e a rota. Imports necessários no topo:

```ts
import { PaymentMethod } from '@adelina/db';
```

Schema (junto dos outros schemas do arquivo):

```ts
const RecordReceiptSchema = z.object({
  amount: z.number().positive('Valor deve ser maior que zero.'),
  method: z.nativeEnum(PaymentMethod),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Data inválida.').optional(),
  note: z.string().max(200).optional(),
});
```

Rota (no corpo do controller):

```ts
  @RequireCapability('payment:record')
  @Post('reservations/:id/receipts')
  recordReceipt(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.payments.recordReceipt(tenantId, id, RecordReceiptSchema.parse(body));
  }
```

Garantir imports de `Post`, `Param`, `Body` (de `@nestjs/common`), `TenantId`, `RequireCapability` e `z` — a maioria já existe no arquivo; adicionar os que faltarem.

- [ ] **Step 3: Typecheck + testes**

Run: `pnpm --filter @adelina/api typecheck && pnpm --filter @adelina/api test`
Expected: typecheck sem erros novos; testes verdes (incluindo payment-status + reports).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/payments/payments.service.ts apps/api/src/modules/payments/payments.controller.ts
git commit -m "feat(payments): endpoint de recebimento manual por reserva"
```

---

## Task 9: `reports` module — service, controller, registro

**Files:**
- Create: `apps/api/src/modules/reports/reports.service.ts`
- Create: `apps/api/src/modules/reports/reports.controller.ts`
- Create: `apps/api/src/modules/reports/reports.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Implementar o service (carrega dados tenant-scoped → funções puras)**

```ts
// apps/api/src/modules/reports/reports.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@adelina/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  aggregatePayments,
  aggregateReceipts,
  buildCashflow,
  bucketPayablesDue,
  type PaymentOutRow,
  type ReceiptMethod,
  type ReceiptRow,
  type PayableRow,
} from './reports.calc';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export interface PeriodFilters {
  from?: string;
  to?: string;
  propertyId?: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadReceiptRows(tenantId: string, f: PeriodFilters): Promise<ReceiptRow[]> {
    const where: Prisma.PaymentWhereInput = {
      status: { in: ['paid', 'partial'] },
      reservation: { tenantId, ...(f.propertyId ? { propertyId: f.propertyId } : {}) },
    };
    if (f.from || f.to) {
      where.paidAt = {};
      if (f.from) where.paidAt.gte = new Date(`${f.from}T00:00:00Z`);
      if (f.to) where.paidAt.lte = new Date(`${f.to}T23:59:59Z`);
    }
    const rows = await this.prisma.withTenant(tenantId, (tx) =>
      tx.payment.findMany({
        where,
        orderBy: { paidAt: 'desc' },
        include: {
          reservation: {
            select: { code: true, property: { select: { name: true } }, guest: { select: { fullName: true } } },
          },
        },
      }),
    );
    return rows.map((p) => ({
      id: p.id,
      paidAt: p.paidAt ? isoDay(p.paidAt) : isoDay(p.createdAt),
      guestName: p.reservation.guest?.fullName ?? '—',
      reservationCode: p.reservation.code,
      propertyName: p.reservation.property?.name ?? null,
      method: p.method as ReceiptMethod,
      amount: Number(p.amount),
    }));
  }

  private async loadPaymentRows(tenantId: string, f: PeriodFilters): Promise<PaymentOutRow[]> {
    const expWhere: Prisma.ExpenseWhereInput = { tenantId, status: 'paid' };
    if (f.propertyId) expWhere.propertyId = f.propertyId;
    if (f.from || f.to) {
      expWhere.paidAt = {};
      if (f.from) expWhere.paidAt.gte = new Date(f.from);
      if (f.to) expWhere.paidAt.lte = new Date(f.to);
    }
    const payWhere: Prisma.OwnerPayoutWhereInput = { tenantId };
    if (f.propertyId) payWhere.propertyId = f.propertyId;
    if (f.from || f.to) {
      payWhere.paidAt = {};
      if (f.from) payWhere.paidAt.gte = new Date(`${f.from}T00:00:00Z`);
      if (f.to) payWhere.paidAt.lte = new Date(`${f.to}T23:59:59Z`);
    }
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [expenses, payouts] = await Promise.all([
        tx.expense.findMany({ where: expWhere, include: { property: { select: { name: true } } } }),
        tx.ownerPayout.findMany({
          where: payWhere,
          include: { property: { select: { name: true } }, owner: { select: { name: true } } },
        }),
      ]);
      const fromExpenses: PaymentOutRow[] = expenses.map((e) => ({
        id: e.id,
        type: 'expense',
        paidAt: e.paidAt ? isoDay(e.paidAt) : isoDay(e.date),
        description: e.description,
        counterparty: e.supplier ?? null,
        category: e.category,
        propertyName: e.property?.name ?? null,
        amount: Number(e.amount),
      }));
      const fromPayouts: PaymentOutRow[] = payouts.map((o) => ({
        id: o.id,
        type: 'payout',
        paidAt: isoDay(o.paidAt),
        description: `Repasse ${isoDay(o.competence).slice(0, 7)}`,
        counterparty: o.owner?.name ?? null,
        category: null,
        propertyName: o.property?.name ?? null,
        amount: Number(o.netPayoutAmount),
      }));
      return [...fromExpenses, ...fromPayouts].sort((a, b) => b.paidAt.localeCompare(a.paidAt));
    });
  }

  async receipts(tenantId: string, f: PeriodFilters) {
    return aggregateReceipts(await this.loadReceiptRows(tenantId, f));
  }

  async payments(tenantId: string, f: PeriodFilters) {
    return aggregatePayments(await this.loadPaymentRows(tenantId, f));
  }

  async cashflow(tenantId: string, f: PeriodFilters) {
    const [receipts, payments] = await Promise.all([
      this.loadReceiptRows(tenantId, f),
      this.loadPaymentRows(tenantId, f),
    ]);
    return buildCashflow(receipts, payments);
  }

  async payablesDue(tenantId: string, days: number) {
    const rows = await this.prisma.withTenant(tenantId, (tx) =>
      tx.expense.findMany({
        where: { tenantId, status: 'pending', dueDate: { not: null } },
        include: { property: { select: { name: true } } },
      }),
    );
    const payables: PayableRow[] = rows.map((e) => ({
      id: e.id,
      dueDate: isoDay(e.dueDate as Date),
      description: e.description,
      supplier: e.supplier ?? null,
      category: e.category,
      propertyName: e.property?.name ?? null,
      amount: Number(e.amount),
    }));
    return bucketPayablesDue(payables, isoDay(new Date()), days);
  }
}
```

- [ ] **Step 2: Implementar o controller (com `?format=csv`)**

```ts
// apps/api/src/modules/reports/reports.controller.ts
import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequireCapability } from '../../common/require-capability.decorator';
import { ReportsService } from './reports.service';
import { toCsv } from './reports.csv';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Data inválida (use yyyy-mm-dd).');
const PeriodSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  propertyId: z.string().uuid().optional(),
  format: z.enum(['json', 'csv']).optional(),
});
const DueSchema = z.object({ days: z.coerce.number().int().min(1).max(90).optional() });

function sendCsv(res: FastifyReply, filename: string, csv: string) {
  res.header('Content-Type', 'text/csv; charset=utf-8');
  res.header('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RequireCapability('expense:read')
  @Get('receipts')
  async receipts(@TenantId() tenantId: string, @Query() query: unknown, @Res({ passthrough: true }) res: FastifyReply) {
    const { format, ...f } = PeriodSchema.parse(query);
    const data = await this.reports.receipts(tenantId, f);
    if (format !== 'csv') return data;
    const csv = toCsv(
      ['Data', 'Hóspede', 'Reserva', 'Propriedade', 'Método', 'Valor'],
      data.rows.map((r) => [r.paidAt, r.guestName, r.reservationCode, r.propertyName, r.method, r.amount]),
    );
    return sendCsv(res, 'recebimentos.csv', csv);
  }

  @RequireCapability('expense:read')
  @Get('payments')
  async payments(@TenantId() tenantId: string, @Query() query: unknown, @Res({ passthrough: true }) res: FastifyReply) {
    const { format, ...f } = PeriodSchema.parse(query);
    const data = await this.reports.payments(tenantId, f);
    if (format !== 'csv') return data;
    const csv = toCsv(
      ['Data', 'Tipo', 'Descrição', 'Fornecedor/Proprietário', 'Categoria', 'Propriedade', 'Valor'],
      data.rows.map((r) => [r.paidAt, r.type, r.description, r.counterparty, r.category, r.propertyName, r.amount]),
    );
    return sendCsv(res, 'pagamentos.csv', csv);
  }

  @RequireCapability('expense:read')
  @Get('cashflow')
  async cashflow(@TenantId() tenantId: string, @Query() query: unknown, @Res({ passthrough: true }) res: FastifyReply) {
    const { format, ...f } = PeriodSchema.parse(query);
    const data = await this.reports.cashflow(tenantId, f);
    if (format !== 'csv') return data;
    const csv = toCsv(
      ['Data', 'Entradas', 'Saídas', 'Saldo'],
      data.daily.map((d) => [d.date, d.inflow, d.outflow, d.net]),
    );
    return sendCsv(res, 'caixa.csv', csv);
  }

  @RequireCapability('expense:read')
  @Get('payables-due')
  payablesDue(@TenantId() tenantId: string, @Query() query: unknown) {
    const { days } = DueSchema.parse(query);
    return this.reports.payablesDue(tenantId, days ?? 7);
  }
}
```

- [ ] **Step 3: Module + registro no AppModule**

```ts
// apps/api/src/modules/reports/reports.module.ts
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
```

Em `apps/api/src/app.module.ts`: importar `ReportsModule` e adicioná-lo ao array `imports` (junto dos outros módulos de feature, ex.: após `ExpensesModule`).

- [ ] **Step 4: Typecheck + build de fumaça**

Run: `pnpm --filter @adelina/api typecheck`
Expected: sem erros novos. (Se `@Res` passthrough reclamar de tipo, confirmar import `type { FastifyReply } from 'fastify'`.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reports apps/api/src/app.module.ts
git commit -m "feat(reports): módulo com endpoints receipts/payments/cashflow/payables-due + CSV"
```

---

## Task 10: Web — página `/financeiro/relatorios` (3 abas + export)

**Files:**
- Create: `apps/web/src/app/(dashboard)/financeiro/relatorios/page.tsx`

**Referência de estilo:** copie o layout (cards de totais, tabela, filtros) de `apps/web/src/app/(dashboard)/financeiro/despesas/page.tsx`. Use `api()` de `@/lib/api`, `useQuery` do TanStack, componente `Select` (`options`/`onChange:(v)=>void`), classe `input-base`, `toast` do `sonner`, `useCan` de `@/lib/use-permissions`.

- [ ] **Step 1: Esqueleto da página com 3 abas e filtros**

Criar `page.tsx` como client component (`'use client'`) com:
- Estado de filtros: `from`, `to` (default: 1º dia do mês atual → hoje), `propertyId`, e `tab: 'receipts' | 'payments' | 'cashflow'`.
- `useQuery` por aba chamando `api(\`/reports/${tab}?from=${from}&to=${to}${propertyId ? \`&propertyId=${propertyId}\` : ''}\`)`.
- Lista de propriedades via `useQuery(['properties'], () => api('/properties'))` p/ o filtro.

```tsx
'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Select } from '@/components/ui/Select';

type Tab = 'receipts' | 'payments' | 'cashflow';
const firstOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function RelatoriosPage() {
  const [tab, setTab] = useState<Tab>('receipts');
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [propertyId, setPropertyId] = useState('');

  const qs = useMemo(() => {
    const p = new URLSearchParams({ from, to });
    if (propertyId) p.set('propertyId', propertyId);
    return p.toString();
  }, [from, to, propertyId]);

  const { data, isLoading } = useQuery({
    queryKey: ['report', tab, qs],
    queryFn: () => api(`/reports/${tab}?${qs}`),
  });
  const { data: properties } = useQuery({ queryKey: ['properties'], queryFn: () => api('/properties') });

  const downloadCsv = async () => {
    const res = await api(`/reports/${tab}?${qs}&format=csv`, { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${tab}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 print:space-y-3">
      {/* cabeçalho + abas + filtros + botões export (ver passos seguintes) */}
    </div>
  );
}
```

> **Atenção `api()` com CSV:** o helper `@/lib/api` hoje faz `res.json()`. Adicionar suporte a `{ raw: true }` que retorna o `Response` cru (ver Step 4). Se preferir não tocar no helper, fazer o `fetch` direto com `NEXT_PUBLIC_API_URL` + header `Authorization` no `downloadCsv`.

- [ ] **Step 2: Abas, filtros e botões de export (JSX)**

Dentro do `return`, acima da tabela:

```tsx
<div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
  <div className="flex gap-2">
    {(['receipts', 'payments', 'cashflow'] as Tab[]).map((t) => (
      <button key={t} onClick={() => setTab(t)}
        className={`px-3 py-1.5 rounded-lg text-sm ${tab === t ? 'bg-brand-600 text-white' : 'bg-surface-2 text-ink-soft'}`}>
        {t === 'receipts' ? 'Recebimentos' : t === 'payments' ? 'Pagamentos' : 'Caixa'}
      </button>
    ))}
  </div>
  <div className="flex flex-wrap items-end gap-2">
    <label className="text-sm">De<input type="date" className="input-base block" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
    <label className="text-sm">Até<input type="date" className="input-base block" value={to} onChange={(e) => setTo(e.target.value)} /></label>
    <div className="w-48">
      <Select value={propertyId} onChange={setPropertyId}
        options={[{ value: '', label: 'Todas as propriedades' }, ...((properties ?? []).map((p: any) => ({ value: p.id, label: p.name })))]} />
    </div>
    <button onClick={downloadCsv} className="btn-secondary">Exportar CSV</button>
    <button onClick={() => window.print()} className="btn-secondary">PDF / Imprimir</button>
  </div>
</div>
```

Adicionar cabeçalho de impressão (aparece só no print):

```tsx
<div className="hidden print:block">
  <h1 className="text-lg font-bold">Relatório — {tab === 'receipts' ? 'Recebimentos' : tab === 'payments' ? 'Pagamentos' : 'Caixa'}</h1>
  <p className="text-sm">Período: {from} a {to}</p>
</div>
```

- [ ] **Step 3: Render por aba (cards de totais + tabela)**

```tsx
{isLoading ? <p className="text-ink-muted">Carregando…</p> : tab === 'receipts' ? (
  <ReceiptsView data={data} />
) : tab === 'payments' ? (
  <PaymentsView data={data} />
) : (
  <CashflowView data={data} />
)}
```

Implementar os 3 sub-componentes no mesmo arquivo. Exemplos (seguir visual dos cards de `despesas/page.tsx`):

```tsx
function ReceiptsView({ data }: { data: any }) {
  if (!data) return null;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card title="Total recebido" value={brl(data.total)} />
        <Card title="Lançamentos" value={String(data.count)} />
        {data.byMethod.map((m: any) => <Card key={m.method} title={methodLabel(m.method)} value={brl(m.amount)} />)}
      </div>
      <Table head={['Data', 'Hóspede', 'Reserva', 'Propriedade', 'Método', 'Valor']}
        rows={data.rows.map((r: any) => [r.paidAt, r.guestName, r.reservationCode, r.propertyName ?? '—', methodLabel(r.method), brl(r.amount)])} />
    </>
  );
}

function PaymentsView({ data }: { data: any }) {
  if (!data) return null;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card title="Total pago" value={brl(data.total)} />
        {data.byCategory.map((c: any) => <Card key={c.key} title={c.key} value={brl(c.amount)} />)}
      </div>
      <Table head={['Data', 'Tipo', 'Descrição', 'Fornecedor/Prop.', 'Categoria', 'Propriedade', 'Valor']}
        rows={data.rows.map((r: any) => [r.paidAt, r.type === 'payout' ? 'Repasse' : 'Despesa', r.description, r.counterparty ?? '—', r.category ?? '—', r.propertyName ?? '—', brl(r.amount)])} />
    </>
  );
}

function CashflowView({ data }: { data: any }) {
  if (!data) return null;
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Card title="Entradas" value={brl(data.totalIn)} />
        <Card title="Saídas" value={brl(data.totalOut)} />
        <Card title="Resultado" value={brl(data.net)} />
      </div>
      <Table head={['Dia', 'Entradas', 'Saídas', 'Saldo']}
        rows={data.daily.map((d: any) => [d.date, brl(d.inflow), brl(d.outflow), brl(d.net)])} />
    </>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return <div className="rounded-xl border border-line bg-surface p-4"><p className="text-xs text-ink-muted">{title}</p><p className="text-lg font-semibold text-ink">{value}</p></div>;
}
function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-ink-muted"><tr>{head.map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={head.length} className="px-3 py-6 text-center text-ink-muted">Sem dados no período.</td></tr> :
          rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
const METHOD_LABELS: Record<string, string> = { cash: 'Dinheiro', pix: 'Pix', credit_card: 'Cartão crédito', debit_card: 'Cartão débito', bank_transfer: 'Transferência', link: 'Link MP', channel_collected: 'Cobrado pelo canal' };
function methodLabel(m: string) { return METHOD_LABELS[m] ?? m; }
```

- [ ] **Step 4: Suporte a download cru no helper `api()`**

Em `apps/web/src/lib/api.ts`, permitir `{ raw: true }` que retorna o `Response` sem `.json()`. Localizar a assinatura atual de `api` e adicionar a opção; ex.:

```ts
export async function api(path: string, opts: RequestInit & { raw?: boolean } = {}) {
  const { raw, ...init } = opts;
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeader(), ...(init.headers ?? {}) },
  });
  if (!res.ok) throw await toApiError(res);
  if (raw) return res;
  return res.status === 204 ? null : res.json();
}
```

> Ajustar ao formato real do helper (preservar `authHeader`/tratamento de erro existentes). Só adicionar o ramo `raw`.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @adelina/web typecheck`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(dashboard)/financeiro/relatorios/page.tsx" apps/web/src/lib/api.ts
git commit -m "feat(web): página de relatórios financeiros (recebimentos/pagamentos/caixa) + CSV/print"
```

---

## Task 11: Web — menu "Relatórios" + card de vencimentos

**Files:**
- Modify: `apps/web/src/app/(dashboard)/layout.tsx`
- Create: `apps/web/src/components/PayablesDueCard.tsx`

- [ ] **Step 1: Item de menu "Relatórios"**

Em `layout.tsx`, importar um ícone (`FileBarChart` de `lucide-react`) e adicionar ao bloco `extraNav` (logo após Financeiro), continuando gated owner/manager como os demais:

```tsx
{ href: '/financeiro/relatorios', label: 'Relatórios', icon: FileBarChart, hint: 'Caixa' },
```

- [ ] **Step 2: Componente do card de vencimentos**

```tsx
// apps/web/src/components/PayablesDueCard.tsx
'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function PayablesDueCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['payables-due'], queryFn: () => api('/reports/payables-due?days=7') });
  const pay = useMutation({
    mutationFn: (id: string) => api(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payables-due'] }); toast.success('Despesa marcada como paga.'); },
    onError: () => toast.error('Não foi possível marcar como paga.'),
  });

  if (!data) return null;
  const items = [...data.overdue, ...data.today, ...data.upcoming];
  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-ink">Contas a vencer</h3>
        <span className="text-xs text-ink-muted">
          {data.counts.overdue > 0 && <span className="text-red-600">{data.counts.overdue} vencida(s) · </span>}
          {data.counts.today} hoje · {data.counts.upcoming} em 7 dias
        </span>
      </div>
      <ul className="divide-y divide-line">
        {items.map((e: any) => {
          const overdue = e.dueDate < new Date().toISOString().slice(0, 10);
          return (
            <li key={e.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="text-ink">{e.description}</p>
                <p className={`text-xs ${overdue ? 'text-red-600' : 'text-ink-muted'}`}>vence {e.dueDate} · {brl(e.amount)}</p>
              </div>
              <button onClick={() => pay.mutate(e.id)} disabled={pay.isPending} className="btn-secondary text-xs">Marcar pago</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Mostrar o card no painel**

Em `apps/web/src/app/(dashboard)/painel/page.tsx` (ou equivalente do "Visão geral"), importar e renderizar `<PayablesDueCard />` numa coluna lateral/seção, **gated** por `useCan('expense:read')`:

```tsx
{can('expense:read') && <PayablesDueCard />}
```

(usar o hook `useCan`/`can` já existente em `@/lib/use-permissions`).

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @adelina/web typecheck`
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(dashboard)/layout.tsx" apps/web/src/components/PayablesDueCard.tsx "apps/web/src/app/(dashboard)/painel/page.tsx"
git commit -m "feat(web): menu Relatórios + card de contas a vencer no painel"
```

---

## Task 12: Web — modal "Registrar recebimento" na reserva

**Files:**
- Create: `apps/web/src/components/RecordReceiptModal.tsx`
- Modify: página/drawer de reservas (onde está a ação "Link de pagamento")

- [ ] **Step 1: Componente do modal**

```tsx
// apps/web/src/components/RecordReceiptModal.tsx
'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Select } from '@/components/ui/Select';

const METHODS = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'credit_card', label: 'Cartão crédito' },
  { value: 'debit_card', label: 'Cartão débito' },
  { value: 'bank_transfer', label: 'Transferência' },
];

export function RecordReceiptModal({ reservationId, onClose }: { reservationId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('pix');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: () => api(`/payments/reservations/${reservationId}/receipts`, {
      method: 'POST',
      body: JSON.stringify({ amount: Number(amount), method, paidAt, note: note || undefined }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Recebimento registrado.');
      onClose();
    },
    onError: () => toast.error('Não foi possível registrar o recebimento.'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-surface p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-ink">Registrar recebimento</h3>
        <label className="block text-sm">Valor (R$)
          <input type="number" min="0" step="0.01" className="input-base block w-full" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="block text-sm">Método<Select value={method} onChange={setMethod} options={METHODS} /></label>
        <label className="block text-sm">Data<input type="date" className="input-base block w-full" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></label>
        <label className="block text-sm">Observação<input className="input-base block w-full" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={() => save.mutate()} disabled={!amount || save.isPending} className="btn-primary">Salvar</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Gatilho na lista/drawer de reservas**

Onde existe hoje a ação "Link de pagamento" (ícone `CreditCard`, gated `payment:link`), adicionar um botão "Registrar recebimento" gated `payment:record` que abre `<RecordReceiptModal reservationId={...} />`. Controlar visibilidade com `useCan('payment:record')` e um estado local `receiptFor: string | null`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @adelina/web typecheck`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/RecordReceiptModal.tsx <arquivo-da-lista-de-reservas>
git commit -m "feat(web): modal de recebimento manual na reserva"
```

---

## Task 13: Deploy + verificação

**Files:** nenhum (deploy)

- [ ] **Step 1: Suite de testes completa**

Run: `pnpm --filter @adelina/api test`
Expected: PASS — incl. `reports.calc` (5), `reports.csv` (3), `payment-status` (3) + baseline existente verde.

- [ ] **Step 2: Build + deploy**

Liberar disco e buildar (a VPS vive ~90%): `docker builder prune -af`. Buildar **api** e **web** (ambos mudaram), `docker stack deploy`, e **forçar rollout** (`docker service update --force --image adelina-{api,web}:latest adelina_{api,web}`) — o `:latest` não dá rollout sozinho no Swarm. Reaproveitar `/root/adelina/deploy.sh` (que já faz git pull + build + force-update).

- [ ] **Step 3: Verificar rollout (IDs batendo)**

Para api e web: `docker inspect <container> --format '{{.Image}}'` deve bater com `docker image inspect adelina-{api,web}:latest --format '{{.Id}}'`. Não confiar em "replicas 1/1".

- [ ] **Step 4: Smoke test em produção**

- `GET https://api.adelina.verdant.com.br/api/reports/payables-due` autenticado → 200 com baldes.
- Abrir `https://adelina.verdant.com.br/financeiro/relatorios` → 3 abas carregam; CSV baixa; "PDF/Imprimir" abre diálogo de impressão.
- Registrar um recebimento manual numa reserva de teste → aparece no Relatório de Recebimentos e o `paymentStatus` da reserva muda.

- [ ] **Step 5: Atualizar memória do projeto**

Anexar em `/root/.claude/projects/-root/memory/project_adelina.md` o sub-projeto de relatórios financeiros como shipped (igual aos outros sub-projetos), com os endpoints, a capability `payment:record` e a decisão de regime de caixa.

---

## Self-Review (cobertura do spec)

- **A) Recebimentos** → Tasks 3 (calc), 9 (service/endpoint), 10 (web), 7+8+12 (lançamento manual, pré-requisito). ✅
- **B) Pagamentos** → Tasks 4 (calc), 9, 10. ✅
- **C) Caixa** → Tasks 5 (calc), 9, 10. ✅
- **D) Notificação de vencimento** → Tasks 6 (calc), 9 (endpoint), 11 (card+badge). ✅
- **CSV** → Task 2 + controller (Task 9). **PDF/impressão** → Task 10. ✅
- **RBAC** (`expense:read` reuso + `payment:record` nova, 2 espelhos) → Tasks 1, 8, 9, 11, 12. ✅
- **Sem migração de schema** → nenhuma task toca `schema.prisma`. ✅
- **Funções puras + vitest** → Tasks 2–7. ✅
