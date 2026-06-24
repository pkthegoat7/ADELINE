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
