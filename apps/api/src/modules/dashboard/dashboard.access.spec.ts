import { describe, it, expect } from 'vitest';
import { redactFinancials } from './dashboard.access';

const base = {
  occupancy: { occupied: 2, total: 4, percent: 50 },
  todayCheckIns: [],
  todayCheckOuts: [],
  upcomingArrivals: [],
  monthRevenue: { value: 12345, reservationCount: 7 },
  adr: 250.5,
  revPar: 120.25,
  occupancySeries: [{ date: '2026-06-01', occupied: 1, total: 4, percent: 25 }],
  channels: [],
};

describe('redactFinancials', () => {
  it('mantém tudo quando o usuário pode ver financeiro', () => {
    expect(redactFinancials(base, true)).toEqual(base);
  });

  it('remove receita/ADR/RevPAR quando não pode ver financeiro', () => {
    const out = redactFinancials(base, false);
    expect(out.monthRevenue).toBeNull();
    expect(out.adr).toBeNull();
    expect(out.revPar).toBeNull();
  });

  it('preserva campos não-financeiros quando redige', () => {
    const out = redactFinancials(base, false);
    expect(out.occupancy).toEqual(base.occupancy);
    expect(out.occupancySeries).toEqual(base.occupancySeries);
    expect(out.channels).toEqual(base.channels);
  });
});
