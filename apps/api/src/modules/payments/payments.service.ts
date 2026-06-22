import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MercadoPagoConfig, Payment as MpPayment, Preference } from 'mercadopago';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { differenceInCalendarDays, format } from 'date-fns';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { publicWebUrl } from '../../common/public-url';
import { WhatsappService } from '../whatsapp/whatsapp.service';

const LINK_TTL_DAYS = 7;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: TenantSettingsService,
    private readonly whatsapp: WhatsappService,
  ) {}

  private async mpClient(): Promise<MercadoPagoConfig> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'mp_access_token' },
    });
    const token = setting?.value || process.env.MP_ACCESS_TOKEN;
    if (!token) {
      throw new BadRequestException(
        'Mercado Pago não configurado. Peça ao administrador para configurar o token.',
      );
    }
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

    const preference = new Preference(await this.mpClient());
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
        notification_url: `${apiUrl}/api/payments/pay/webhook`,
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

  /** Lê o secret de assinatura do webhook (configurável por painel; env de fallback). */
  private async webhookSecret(): Promise<string | null> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'mp_webhook_secret' },
    });
    return setting?.value || process.env.MP_WEBHOOK_SECRET || null;
  }

  /**
   * Valida a assinatura `x-signature` do Mercado Pago (HMAC-SHA256).
   * Manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
   * Retorna true se o secret não estiver configurado (validação opt-in) — o
   * handler ainda re-busca o pagamento no MP, então não há injeção de dados.
   */
  private async isSignatureValid(
    dataId: string,
    headers: { signature?: string; requestId?: string },
  ): Promise<boolean> {
    const secret = await this.webhookSecret();
    if (!secret) {
      this.logger.warn('mp_webhook_secret não configurado — assinatura do webhook não verificada.');
      return true;
    }
    if (!headers.signature) return false;
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

  /** Webhook do MP: liquida o pagamento. Idempotente por mpPaymentId. */
  async handleWebhook(
    type: string,
    dataId: string,
    headers: { signature?: string; requestId?: string } = {},
  ): Promise<void> {
    if (type !== 'payment' || !dataId) return;

    if (!(await this.isSignatureValid(dataId, headers))) {
      this.logger.warn(`Webhook com assinatura inválida (data.id ${dataId}) — ignorado.`);
      return;
    }

    const mpPayment = new MpPayment(await this.mpClient());
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
}
