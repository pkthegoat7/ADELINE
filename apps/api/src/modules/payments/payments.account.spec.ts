import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { assertMpToken, paymentWebhookUrl } from './payments.account';

describe('assertMpToken', () => {
  it('lança BadRequest quando vazio/ausente', () => {
    expect(() => assertMpToken('')).toThrow(BadRequestException);
    expect(() => assertMpToken('   ')).toThrow(BadRequestException);
    expect(() => assertMpToken(undefined)).toThrow(BadRequestException);
    expect(() => assertMpToken(null)).toThrow(BadRequestException);
  });
  it('devolve o token trimado quando presente', () => {
    expect(assertMpToken('  APP_USR-abc  ')).toBe('APP_USR-abc');
  });
});

describe('paymentWebhookUrl', () => {
  it('monta a URL com o tenant na query', () => {
    expect(paymentWebhookUrl('https://api.x.com', 'tnt-1')).toBe(
      'https://api.x.com/api/payments/pay/webhook?tenant=tnt-1',
    );
  });
  it('remove barra final do apiUrl', () => {
    expect(paymentWebhookUrl('https://api.x.com/', 'tnt-1')).toBe(
      'https://api.x.com/api/payments/pay/webhook?tenant=tnt-1',
    );
  });
});
