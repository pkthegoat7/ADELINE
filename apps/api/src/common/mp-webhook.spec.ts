import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyMpSignature } from './mp-webhook';

const SECRET = 'test-webhook-secret-0123456789abcdef';

function signFor(dataId: string, ts: string, requestId?: string, secret = SECRET): string {
  const manifest =
    `id:${dataId.toLowerCase()};` +
    (requestId ? `request-id:${requestId};` : '') +
    `ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('verifyMpSignature', () => {
  it('aceita assinatura válida (com request-id)', () => {
    const sig = signFor('PAY123', '1700000000', 'req-1');
    expect(verifyMpSignature(SECRET, 'PAY123', { signature: sig, requestId: 'req-1' })).toBe(true);
  });

  it('aceita assinatura válida (sem request-id)', () => {
    const sig = signFor('pay-abc', '1700000000');
    expect(verifyMpSignature(SECRET, 'pay-abc', { signature: sig })).toBe(true);
  });

  it('normaliza data.id para minúsculo no manifest', () => {
    const sig = signFor('payxyz', '1700000000');
    // dataId vem com maiúsculas; a verificação deve bater por causa do toLowerCase
    expect(verifyMpSignature(SECRET, 'PayXYZ', { signature: sig })).toBe(true);
  });

  it('rejeita quando o secret está errado', () => {
    const sig = signFor('PAY123', '1700000000', 'req-1', 'outro-secret');
    expect(verifyMpSignature(SECRET, 'PAY123', { signature: sig, requestId: 'req-1' })).toBe(false);
  });

  it('rejeita quando o ts é adulterado (manifest diferente)', () => {
    const sig = signFor('PAY123', '1700000000');
    const tampered = sig.replace('ts=1700000000', 'ts=1700000999');
    expect(verifyMpSignature(SECRET, 'PAY123', { signature: tampered })).toBe(false);
  });

  it('rejeita assinatura ausente', () => {
    expect(verifyMpSignature(SECRET, 'PAY123', {})).toBe(false);
  });

  it('rejeita header malformado (sem v1)', () => {
    expect(verifyMpSignature(SECRET, 'PAY123', { signature: 'ts=1700000000' })).toBe(false);
  });

  it('rejeita quando o secret está vazio', () => {
    const sig = signFor('PAY123', '1700000000');
    expect(verifyMpSignature('', 'PAY123', { signature: sig })).toBe(false);
  });
});
