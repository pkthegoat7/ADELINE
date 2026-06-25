import { describe, it, expect } from 'vitest';
import { maskSecret } from './tenant-settings.service';

describe('maskSecret', () => {
  it('vazio continua vazio', () => {
    expect(maskSecret('')).toBe('');
  });
  it('mascara mantendo só os últimos 4', () => {
    expect(maskSecret('APP_USR-1234567890abcd')).toBe('••••abcd');
  });
  it('valor curto (<=4) não vaza o conteúdo', () => {
    expect(maskSecret('ab')).toBe('••••');
  });
});
