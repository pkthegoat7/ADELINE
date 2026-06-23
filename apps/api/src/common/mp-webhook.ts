import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifica o HMAC-SHA256 do header `x-signature` do Mercado Pago.
 * Manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
 * Função PURA (sem I/O) para ser testável e compartilhada entre os webhooks
 * de pagamento (Preference) e de assinatura (PreApproval).
 *
 * Retorna `false` se a assinatura estiver ausente/malformada ou não bater.
 * O chamador decide a política de "secret ausente" (fail-closed em produção).
 */
export function verifyMpSignature(
  secret: string,
  dataId: string,
  headers: { signature?: string; requestId?: string },
): boolean {
  if (!secret || !headers.signature) return false;
  const parts = Object.fromEntries(
    headers.signature.split(',').map((p) => p.split('=').map((s) => s.trim())),
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;
  const manifest =
    `id:${dataId.toLowerCase()};` +
    (headers.requestId ? `request-id:${headers.requestId};` : '') +
    `ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  try {
    return (
      expected.length === v1.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(v1))
    );
  } catch {
    return false;
  }
}
