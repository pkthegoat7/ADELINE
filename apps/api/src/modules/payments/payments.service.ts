import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MercadoPagoConfig, Payment as MpPayment, Preference } from 'mercadopago';
import { PaymentMethod } from '@adelina/db';
import { randomBytes } from 'crypto';
import { differenceInCalendarDays, format } from 'date-fns';
import { PrismaService } from '../../common/prisma/prisma.service';
import { computePaymentStatus } from './payment-status';
import { verifyMpSignature } from '../../common/mp-webhook';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { publicWebUrl } from '../../common/public-url';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { assertMpToken, paymentWebhookUrl } from './payments.account';

const LINK_TTL_DAYS = 7;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: TenantSettingsService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /** Client MP usando o access token DA POUSADA (sem fallback global). */
  private async mpClient(tenantId: string): Promise<MercadoPagoConfig> {
    const token = assertMpToken(
      await this.settings.get(tenantId, 'payment_mp_access_token'),
    );
    return new MercadoPagoConfig({ accessToken: token });
  }

  /** Cria link de pagamento para uma reserva e (opcionalmente) envia por WhatsApp. */
  async createLink(
    tenantId: string,
    reservationId: string,
    input: { amount: number; description?: string; sendWhatsapp?: boolean },
  ): Promise<{ url: string; message: string; paymentLinkId: string; sentViaWhatsapp: boolean }> {
    // Escopo de tenant EXPLÍCITO (defesa em profundidade): não dependemos do RLS
    // para isolar — filtramos por tenantId no WHERE. Assim, mesmo que o role do
    // banco ignore RLS, um tenant nunca gera link pra reserva de outro.
    const reservation = await this.prisma.withTenant(tenantId, (tx) =>
      tx.reservation.findFirstOrThrow({
        where: { id: reservationId, tenantId },
        include: { guest: true, property: true },
      }),
    );
    if (reservation.status === 'cancelled') {
      throw new BadRequestException('Não é possível gerar link para reserva cancelada.');
    }

    // Garante que a pousada já configurou a conta de recebimento — falha cedo,
    // antes de gerar/enviar um link que não daria pra pagar.
    await this.mpClient(tenantId);

    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000);

    const link = await this.prisma.withTenant(tenantId, (tx) =>
      tx.paymentLink.create({
        data: {
          tenantId,
          reservationId,
          token,
          amount: input.amount,
          description: input.description,
          expiresAt,
        },
      }),
    );

    const url = `${publicWebUrl()}/pagamento/${link.token}`;
    const message =
      `Olá, ${reservation.guest.fullName}! 👋\n\n` +
      `Segue o link para o pagamento da sua reserva na ${reservation.property.name} ` +
      `(check-in ${format(reservation.checkIn, 'dd/MM/yyyy')}, ` +
      `check-out ${format(reservation.checkOut, 'dd/MM/yyyy')}).\n\n` +
      `💳 Valor: R$ ${input.amount.toFixed(2)}\n` +
      `🔗 ${url}\n\n` +
      `O pagamento é processado com segurança pelo Mercado Pago.`;

    let sentViaWhatsapp = false;
    const autoSend =
      input.sendWhatsapp ??
      (await this.settings.get(tenantId, 'payment_link_auto_whatsapp')) === 'true';
    if (autoSend && reservation.guest.phone) {
      try {
        await this.whatsapp.sendText(tenantId, reservation.guest.phone, message);
        sentViaWhatsapp = true;
      } catch (err) {
        this.logger.warn(`Falha ao enviar link por WhatsApp: ${String(err)}`);
      }
    }

    return { url, message, paymentLinkId: link.id, sentViaWhatsapp };
  }

  /** Dados públicos do link (sem auth). */
  async getPublic(token: string) {
    const link = await this.prisma.withSystem((tx) =>
      tx.paymentLink.findUnique({
        where: { token },
        include: {
          reservation: {
            include: {
              guest: true,
              property: true,
              rooms: { include: { room: { include: { roomType: true } } } },
            },
          },
        },
      }),
    );
    if (!link) throw new NotFoundException('Link não encontrado.');

    const expired = link.status === 'pending' && link.expiresAt < new Date();
    const status = expired ? 'expired' : link.status;
    const terms = await this.settings.getAll(link.tenantId);
    const r = link.reservation;

    return {
      status,
      amount: Number(link.amount),
      description: link.description,
      property: r.property.name,
      guestName: r.guest.fullName,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      nights: differenceInCalendarDays(r.checkOut, r.checkIn),
      rooms: r.rooms.map((rr) => `${rr.room.roomType.name} (${rr.room.code})`),
      termsOfService: terms.payment_terms_of_service,
      lgpdConsent: terms.payment_lgpd_consent,
    };
  }

  /** Registra consentimento e cria a Preference no MP; devolve o init_point. */
  async checkout(
    token: string,
    input: { acceptTerms: boolean; acceptLgpd: boolean; ip: string },
  ): Promise<{ initPoint: string }> {
    if (!input.acceptTerms || !input.acceptLgpd) {
      throw new BadRequestException('É necessário aceitar os termos para prosseguir.');
    }
    const link = await this.prisma.withSystem((tx) =>
      tx.paymentLink.findUnique({
        where: { token },
        include: { reservation: { include: { property: true } } },
      }),
    );
    if (!link) throw new NotFoundException('Link não encontrado.');
    if (link.status === 'paid') throw new BadRequestException('Este link já foi pago.');
    if (link.status === 'cancelled') throw new BadRequestException('Este link foi cancelado.');
    if (link.expiresAt < new Date()) throw new BadRequestException('Este link expirou.');

    const terms = await this.settings.getAll(link.tenantId);
    const now = new Date();
    await this.prisma.withSystem((tx) =>
      tx.paymentLink.update({
        where: { id: link.id },
        data: {
          termsAcceptedAt: now,
          lgpdAcceptedAt: now,
          acceptedIp: input.ip,
          termsSnapshot: `${terms.payment_terms_of_service}\n\n---\n\n${terms.payment_lgpd_consent}`,
        },
      }),
    );

    const preference = new Preference(await this.mpClient(link.tenantId));
    const apiUrl = process.env.PUBLIC_API_URL ?? 'http://localhost:3333';
    const result = await preference.create({
      body: {
        items: [
          {
            id: link.id,
            title: link.description || `Reserva — ${link.reservation.property.name}`,
            quantity: 1,
            unit_price: Number(link.amount),
            currency_id: 'BRL',
          },
        ],
        external_reference: link.id,
        back_urls: { success: `${publicWebUrl()}/pagamento/${token}?status=sucesso` },
        auto_return: 'approved',
        notification_url: paymentWebhookUrl(apiUrl, link.tenantId),
      },
    });

    if (!result.init_point) {
      throw new BadRequestException('Mercado Pago não retornou URL de checkout.');
    }
    await this.prisma.withSystem((tx) =>
      tx.paymentLink.update({
        where: { id: link.id },
        data: { mpPreferenceId: result.id },
      }),
    );
    return { initPoint: result.init_point };
  }

  /** Secret de assinatura do webhook DA POUSADA (sem fallback global). */
  private async webhookSecret(tenantId: string): Promise<string | null> {
    const value = await this.settings.get(tenantId, 'payment_mp_webhook_secret');
    return value || null;
  }

  /**
   * Valida a assinatura `x-signature` do Mercado Pago (HMAC-SHA256).
   * Manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
   * EM PRODUÇÃO é fail-closed: sem o secret da pousada, retorna false (rejeita).
   * Fora de produção, sem secret, retorna true (validação opt-in) p/ facilitar
   * testes — o handler ainda re-busca o pagamento no MP, então não há injeção.
   */
  private async isSignatureValid(
    dataId: string,
    headers: { signature?: string; requestId?: string },
    tenantId: string,
  ): Promise<boolean> {
    const secret = await this.webhookSecret(tenantId);
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('mp_webhook_secret ausente em produção — webhook rejeitado (fail-closed).');
        return false;
      }
      this.logger.warn('mp_webhook_secret não configurado (não-produção) — assinatura não verificada.');
      return true;
    }
    return verifyMpSignature(secret, dataId, headers);
  }

  /** Webhook do MP: liquida o pagamento. Idempotente por mpPaymentId. */
  async handleWebhook(
    type: string,
    dataId: string,
    headers: { signature?: string; requestId?: string } = {},
    tenantId?: string,
  ): Promise<void> {
    if (type !== 'payment' || !dataId || !tenantId) return;

    if (!(await this.isSignatureValid(dataId, headers, tenantId))) {
      this.logger.warn(`Webhook com assinatura inválida (data.id ${dataId}) — ignorado.`);
      return;
    }

    // Token pode ter sido removido depois do link criado: degrada em no-op
    // (responde 200 ao MP) em vez de estourar 400 e disparar retries.
    let mpPayment: MpPayment;
    try {
      mpPayment = new MpPayment(await this.mpClient(tenantId));
    } catch {
      this.logger.warn(
        `Webhook: conta de recebimento da pousada ${tenantId} não configurada — ignorado.`,
      );
      return;
    }
    const pay = await mpPayment.get({ id: dataId });
    if (pay.status !== 'approved') return;

    const linkId = pay.external_reference;
    if (!linkId) return;

    const link = await this.prisma.withSystem((tx) =>
      tx.paymentLink.findUnique({ where: { id: linkId } }),
    );
    if (!link) {
      this.logger.warn(`Webhook para link inexistente ${linkId} — ignorando.`);
      return;
    }
    if (link.mpPaymentId === String(pay.id)) return; // idempotência

    await this.prisma.withSystem(async (tx) => {
      await tx.paymentLink.update({
        where: { id: link.id },
        data: { status: 'paid', paidAt: new Date(), mpPaymentId: String(pay.id) },
      });
      await tx.payment.create({
        data: {
          reservationId: link.reservationId,
          amount: link.amount,
          method: 'link',
          gateway: 'mercadopago',
          gatewayTransactionId: String(pay.id),
          status: 'paid',
          paidAt: new Date(),
        },
      });
      const reservation = await tx.reservation.findUniqueOrThrow({
        where: { id: link.reservationId },
        include: { payments: { where: { status: 'paid' } } },
      });
      const totalPaid = reservation.payments.reduce((s, p) => s + Number(p.amount), 0);
      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          paymentStatus: totalPaid >= Number(reservation.totalAmount) ? 'paid' : 'partial',
        },
      });
    });

    this.logger.log(`PaymentLink ${link.id} pago (mp ${pay.id}).`);
  }

  /** Registra um recebimento manual (dinheiro/pix/cartão) numa reserva e recalcula o status. */
  async recordReceipt(
    tenantId: string,
    reservationId: string,
    input: { amount: number; method: PaymentMethod; paidAt?: string; note?: string },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const reservation = await tx.reservation.findFirst({
        where: { id: reservationId, tenantId },
        select: { id: true, totalAmount: true },
      });
      if (!reservation) throw new NotFoundException('Reserva não encontrada.');

      await tx.payment.create({
        data: {
          reservationId,
          amount: input.amount,
          method: input.method,
          status: 'paid',
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
          metadata: input.note ? { note: input.note } : undefined,
        },
      });

      const paid = await tx.payment.findMany({
        where: { reservationId, status: 'paid' },
        select: { amount: true },
      });
      const totalPaid = paid.reduce((s, p) => s + Number(p.amount), 0);
      await tx.reservation.update({
        where: { id: reservationId },
        data: { paymentStatus: computePaymentStatus(totalPaid, Number(reservation.totalAmount)) },
      });
      return { ok: true, totalPaid };
    });
  }
}
