import { describe, it, expect } from 'vitest';
import { can } from './permissions';

describe('payment:account capability', () => {
  it('owner pode configurar a conta de recebimento', () => {
    expect(can('owner', 'payment:account')).toBe(true);
  });
  it('manager NÃO pode (é dinheiro entrando)', () => {
    expect(can('manager', 'payment:account')).toBe(false);
  });
  it('demais papéis não podem', () => {
    expect(can('receptionist', 'payment:account')).toBe(false);
    expect(can('readonly', 'payment:account')).toBe(false);
    expect(can(undefined, 'payment:account')).toBe(false);
  });
});
