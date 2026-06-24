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
