import { describe, it, expect } from 'vitest';
import { computePayout } from './payouts.calc';

const base = { reservations: [], expenses: [], entries: [], commissionPercent: 0, monthlyFee: 0 };

describe('computePayout', () => {
  it('soma receita líquida das reservas', () => {
    const r = computePayout({
      ...base,
      reservations: [
        { code: 'A1', guestName: 'Ana', checkOut: '2026-06-10', netAmount: 300 },
        { code: 'A2', guestName: 'Bia', checkOut: '2026-06-20', netAmount: 200.5 },
      ],
    });
    expect(r.revenueAmount).toBe(500.5);
    expect(r.reservationCount).toBe(2);
    expect(r.netPayoutAmount).toBe(500.5);
  });

  it('aplica comissão percentual sobre o líquido, arredondada a 2 casas', () => {
    const r = computePayout({
      ...base,
      reservations: [{ code: 'A1', guestName: 'Ana', checkOut: '2026-06-10', netAmount: 1000 }],
      commissionPercent: 18.5,
    });
    expect(r.commissionFeeAmount).toBe(185);
    expect(r.netPayoutAmount).toBe(815);
  });

  it('soma a taxa fixa mensal aos débitos', () => {
    const r = computePayout({
      ...base,
      reservations: [{ code: 'A1', guestName: 'Ana', checkOut: '2026-06-10', netAmount: 1000 }],
      commissionPercent: 10,
      monthlyFee: 150,
    });
    expect(r.monthlyFeeAmount).toBe(150);
    expect(r.netPayoutAmount).toBe(1000 - 100 - 150);
  });

  it('deduz despesas do período', () => {
    const r = computePayout({
      ...base,
      reservations: [{ code: 'A1', guestName: 'Ana', checkOut: '2026-06-10', netAmount: 1000 }],
      expenses: [
        { description: 'Luz', category: 'utilities_power', date: '2026-06-05', amount: 120 },
        { description: 'Água', category: 'utilities_water', date: '2026-06-06', amount: 80 },
      ],
    });
    expect(r.expensesAmount).toBe(200);
    expect(r.netPayoutAmount).toBe(800);
  });

  it('crédito soma e débito subtrai nos lançamentos avulsos', () => {
    const r = computePayout({
      ...base,
      reservations: [{ code: 'A1', guestName: 'Ana', checkOut: '2026-06-10', netAmount: 1000 }],
      entries: [
        { id: 'e1', type: 'credit', description: 'Reembolso', amount: 50 },
        { id: 'e2', type: 'debit', description: 'Adiantamento', amount: 200 },
      ],
    });
    expect(r.adjustmentsCredit).toBe(50);
    expect(r.adjustmentsDebit).toBe(200);
    expect(r.netPayoutAmount).toBe(1000 + 50 - 200);
  });

  it('permite repasse negativo quando débitos superam créditos', () => {
    const r = computePayout({
      ...base,
      reservations: [{ code: 'A1', guestName: 'Ana', checkOut: '2026-06-10', netAmount: 100 }],
      expenses: [{ description: 'Reforma', category: 'maintenance', date: '2026-06-05', amount: 500 }],
    });
    expect(r.netPayoutAmount).toBe(-400);
  });

  it('monta o breakdown como razão de crédito/débito', () => {
    const r = computePayout({
      ...base,
      reservations: [{ code: 'A1', guestName: 'Ana', checkOut: '2026-06-10', netAmount: 1000 }],
      commissionPercent: 10,
      monthlyFee: 50,
      expenses: [{ description: 'Luz', category: 'utilities_power', date: '2026-06-05', amount: 120 }],
      entries: [{ id: 'e1', type: 'credit', description: 'Reembolso', amount: 30 }],
    });
    const kinds = r.breakdown.lines.map((l) => l.kind);
    expect(kinds).toEqual(['reservation', 'commission', 'monthly_fee', 'expense', 'adjustment']);
    const totalCredit = r.breakdown.lines.reduce((s, l) => s + l.credit, 0);
    const totalDebit = r.breakdown.lines.reduce((s, l) => s + l.debit, 0);
    expect(Number((totalCredit - totalDebit).toFixed(2))).toBe(r.netPayoutAmount);
    const adj = r.breakdown.lines.find((l) => l.kind === 'adjustment');
    expect(adj?.entryId).toBe('e1');
  });
});
