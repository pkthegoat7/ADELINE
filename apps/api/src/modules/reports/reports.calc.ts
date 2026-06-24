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

function tallyBy(rows: PaymentOutRow[], keyOf: (r: PaymentOutRow) => string, sortBy: 'amount' | 'count' = 'amount'): KeyTotal[] {
  const map = new Map<string, KeyTotal>();
  for (const row of rows) {
    const key = keyOf(row);
    const cur = map.get(key) ?? { key, amount: 0, count: 0 };
    cur.amount = round2(cur.amount + row.amount);
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => sortBy === 'count' ? b.count - a.count : b.amount - a.amount);
}

export function aggregatePayments(rows: PaymentOutRow[]): PaymentsReport {
  const total = round2(rows.reduce((s, r) => s + r.amount, 0));
  return {
    rows,
    byType: tallyBy(rows, (r) => r.type, 'count'),
    byCategory: tallyBy(rows, (r) => (r.type === 'payout' ? 'repasse' : r.category ?? 'sem_categoria')),
    total,
    count: rows.length,
  };
}

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
