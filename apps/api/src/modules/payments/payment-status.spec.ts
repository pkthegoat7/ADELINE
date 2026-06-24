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
