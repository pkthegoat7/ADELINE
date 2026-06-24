import { describe, expect, it } from 'vitest';
import { aggregateReceipts, aggregatePayments, buildCashflow, bucketPayablesDue, type ReceiptRow, type PaymentOutRow, type PayableRow } from './reports.calc';

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

const p = (over: Partial<PaymentOutRow>): PaymentOutRow => ({
  id: 'x', type: 'expense', paidAt: '2026-06-01', description: 'Luz',
  counterparty: 'CEMIG', category: 'utilities', propertyName: 'Casa', amount: 100, ...over,
});

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
