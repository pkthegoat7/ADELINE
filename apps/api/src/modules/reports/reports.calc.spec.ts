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
