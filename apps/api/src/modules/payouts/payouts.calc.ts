export type PayoutEntryType = 'credit' | 'debit';

export interface CalcReservation {
  code: string;
  guestName: string;
  checkOut: string; // ISO yyyy-mm-dd
  netAmount: number;
}

export interface CalcExpense {
  description: string;
  category: string;
  date: string; // ISO yyyy-mm-dd
  amount: number;
}

export interface CalcEntry {
  id: string;
  type: PayoutEntryType;
  description: string;
  amount: number;
}

export interface PayoutCalcInput {
  reservations: CalcReservation[];
  expenses: CalcExpense[];
  entries: CalcEntry[];
  commissionPercent: number; // ex.: 18.5
  monthlyFee: number;
}

export type PayoutLineKind = 'reservation' | 'commission' | 'monthly_fee' | 'expense' | 'adjustment';

export interface PayoutLine {
  kind: PayoutLineKind;
  date: string | null;
  description: string;
  credit: number;
  debit: number;
  entryId?: string; // preenchido só em kind==='adjustment'
}

export interface PayoutCalcResult {
  revenueAmount: number;
  commissionPercent: number;
  commissionFeeAmount: number;
  monthlyFeeAmount: number;
  expensesAmount: number;
  adjustmentsCredit: number;
  adjustmentsDebit: number;
  netPayoutAmount: number;
  reservationCount: number;
  breakdown: { lines: PayoutLine[] };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const sum = (arr: number[]) => arr.reduce((s, n) => s + n, 0);

export function computePayout(input: PayoutCalcInput): PayoutCalcResult {
  const revenueAmount = round2(sum(input.reservations.map((r) => r.netAmount)));
  const commissionFeeAmount = round2((revenueAmount * input.commissionPercent) / 100);
  const monthlyFeeAmount = round2(input.monthlyFee);
  const expensesAmount = round2(sum(input.expenses.map((e) => e.amount)));
  const adjustmentsCredit = round2(
    sum(input.entries.filter((e) => e.type === 'credit').map((e) => e.amount)),
  );
  const adjustmentsDebit = round2(
    sum(input.entries.filter((e) => e.type === 'debit').map((e) => e.amount)),
  );
  const netPayoutAmount = round2(
    revenueAmount - commissionFeeAmount - monthlyFeeAmount - expensesAmount + adjustmentsCredit - adjustmentsDebit,
  );

  const lines: PayoutLine[] = [];
  for (const r of input.reservations) {
    lines.push({ kind: 'reservation', date: r.checkOut, description: `Reserva ${r.code} — ${r.guestName}`, credit: round2(r.netAmount), debit: 0 });
  }
  if (commissionFeeAmount > 0) {
    lines.push({ kind: 'commission', date: null, description: `Comissão de administração (${input.commissionPercent}%)`, credit: 0, debit: commissionFeeAmount });
  }
  if (monthlyFeeAmount > 0) {
    lines.push({ kind: 'monthly_fee', date: null, description: 'Taxa fixa mensal', credit: 0, debit: monthlyFeeAmount });
  }
  for (const e of input.expenses) {
    lines.push({ kind: 'expense', date: e.date, description: e.description, credit: 0, debit: round2(e.amount) });
  }
  for (const e of input.entries) {
    lines.push({ kind: 'adjustment', date: null, description: e.description, credit: e.type === 'credit' ? round2(e.amount) : 0, debit: e.type === 'debit' ? round2(e.amount) : 0, entryId: e.id });
  }

  return {
    revenueAmount,
    commissionPercent: input.commissionPercent,
    commissionFeeAmount,
    monthlyFeeAmount,
    expensesAmount,
    adjustmentsCredit,
    adjustmentsDebit,
    netPayoutAmount,
    reservationCount: input.reservations.length,
    breakdown: { lines },
  };
}
