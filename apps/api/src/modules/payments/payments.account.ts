import { BadRequestException } from '@nestjs/common';

const NOT_CONFIGURED =
  'Conta de recebimento não configurada. Configure em Configurações → Pagamentos ' +
  'antes de gerar links de pagamento.';

/** Garante que a pousada configurou o access token do MP; devolve-o trimado. */
export function assertMpToken(token: string | null | undefined): string {
  const t = (token ?? '').trim();
  if (!t) throw new BadRequestException(NOT_CONFIGURED);
  return t;
}

/** URL pública do webhook de pagamento, com o tenant embutido na query. */
export function paymentWebhookUrl(apiUrl: string, tenantId: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/api/payments/pay/webhook?tenant=${tenantId}`;
}
