import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MercadoPagoConfig, PreApproval, PreApprovalPlan } from 'mercadopago';
import { addMonths } from 'date-fns';
import { PrismaService } from '../../common/prisma/prisma.service';
import { verifyMpSignature } from '../../common/mp-webhook';
import { AuthService } from '../auth/auth.service';
import { LEGAL_DOC_VERSION } from '../legal/legal.tokens';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  private async mpClient(): Promise<MercadoPagoConfig> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'mp_access_token' },
    });
    const token = setting?.value || process.env.MP_ACCESS_TOKEN;
    if (!token) {
      throw new BadRequestException(
        'Mercado Pago não configurado. Peça ao administrador para configurar o token nas configurações do sistema.',
      );
    }
    return new MercadoPagoConfig({ accessToken: token });
  }

  private async getPlanConfig(): Promise<{
    amount: number;
    reason: string;
    frequencyMonths: number;
  }> {
    const rows = await this.prisma.systemSetting.findMany({
      where: {
        key: { in: ['mp_plan_amount', 'mp_plan_reason'] },
      },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const amount = Number(map.get('mp_plan_amount'));

    return {
      amount: Number.isFinite(amount) && amount > 0 ? amount : 249,
      reason: map.get('mp_plan_reason') || 'Adelina PMS — Assinatura Mensal',
      // Plano único: mensal com cobrança recorrente (não configurável).
      frequencyMonths: 1,
    };
  }

  /** Dados públicos do plano para a landing page (NUNCA inclui token). */
  async getPublicPlan(): Promise<{
    amount: number;
    compareAmount: number | null;
    promoLabel: string | null;
    frequencyMonths: number;
  }> {
    const plan = await this.getPlanConfig();
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: ['mp_plan_compare_amount', 'mp_plan_promo_label'] } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const compareRaw = Number(map.get('mp_plan_compare_amount'));
    // Só é promoção se o preço "de" for válido e MAIOR que o preço atual.
    const compareAmount =
      Number.isFinite(compareRaw) && compareRaw > plan.amount ? compareRaw : null;
    const label = map.get('mp_plan_promo_label')?.trim();

    return {
      amount: plan.amount,
      compareAmount,
      promoLabel: compareAmount ? label || 'Oferta por tempo limitado' : null,
      frequencyMonths: plan.frequencyMonths,
    };
  }

  async createPreapproval(backUrl: string): Promise<{ initPoint: string }> {
    const plan = await this.getPlanConfig();

    // O MP exige o email do pagador para criar uma preapproval avulsa, e nesse
    // ponto o assinante ainda é anônimo (o cadastro só acontece em `activate`,
    // após o pagamento). Por isso usamos um PLANO de assinatura: o MP hospeda a
    // página de checkout e coleta o email/cartão do cliente. Reaproveitamos o
    // plano já criado enquanto a configuração (preço/ciclo/descrição) não muda —
    // se o admin alterar o plano, criamos um novo na próxima assinatura.
    const fingerprint = JSON.stringify({
      amount: plan.amount,
      reason: plan.reason,
      frequencyMonths: plan.frequencyMonths,
      backUrl,
    });

    const cached = await this.prisma.systemSetting.findMany({
      where: { key: { in: ['mp_plan_fingerprint', 'mp_plan_init_point'] } },
    });
    const cachedMap = new Map(cached.map((r) => [r.key, r.value]));
    const cachedInitPoint = cachedMap.get('mp_plan_init_point');
    if (cachedMap.get('mp_plan_fingerprint') === fingerprint && cachedInitPoint) {
      return { initPoint: cachedInitPoint };
    }

    const planClient = new PreApprovalPlan(await this.mpClient());

    let result;
    try {
      result = await planClient.create({
        body: {
          reason: plan.reason,
          auto_recurring: {
            frequency: plan.frequencyMonths,
            frequency_type: 'months',
            transaction_amount: plan.amount,
            currency_id: 'BRL',
          },
          back_url: backUrl,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Falha ao criar plano no Mercado Pago: ${message}`);
      throw new BadRequestException(
        'Não foi possível iniciar o checkout no Mercado Pago. Verifique o token configurado e tente novamente.',
      );
    }

    if (!result.init_point || !result.id) {
      throw new BadRequestException('Mercado Pago não retornou o link de checkout do plano.');
    }

    const planId = result.id;
    const initPoint = result.init_point;
    await this.prisma.$transaction([
      this.prisma.systemSetting.upsert({
        where: { key: 'mp_plan_id' },
        create: { key: 'mp_plan_id', value: planId },
        update: { value: planId },
      }),
      this.prisma.systemSetting.upsert({
        where: { key: 'mp_plan_init_point' },
        create: { key: 'mp_plan_init_point', value: initPoint },
        update: { value: initPoint },
      }),
      this.prisma.systemSetting.upsert({
        where: { key: 'mp_plan_fingerprint' },
        create: { key: 'mp_plan_fingerprint', value: fingerprint },
        update: { value: fingerprint },
      }),
    ]);

    return { initPoint };
  }

  /** Lê o secret de assinatura do webhook (mesmo do módulo de pagamentos). */
  private async webhookSecret(): Promise<string | null> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'mp_webhook_secret' },
    });
    return setting?.value || process.env.MP_WEBHOOK_SECRET || null;
  }

  /**
   * Valida a assinatura `x-signature` do Mercado Pago. Fail-closed em produção:
   * sem secret configurado, o webhook é rejeitado (igual ao módulo de pagamentos).
   * O handler ainda re-busca a preapproval no MP, então não há injeção de dados —
   * a validação evita disparos forjados de re-sync de status.
   */
  private async isSignatureValid(
    dataId: string,
    headers: { signature?: string; requestId?: string },
  ): Promise<boolean> {
    const secret = await this.webhookSecret();
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('mp_webhook_secret ausente em produção — webhook de assinatura rejeitado (fail-closed).');
        return false;
      }
      this.logger.warn('mp_webhook_secret não configurado (não-produção) — assinatura não verificada.');
      return true;
    }
    return verifyMpSignature(secret, dataId, headers);
  }

  async handleWebhook(
    type: string,
    dataId: string,
    headers: { signature?: string; requestId?: string } = {},
  ): Promise<void> {
    if (type !== 'subscription_preapproval') return;

    if (!(await this.isSignatureValid(dataId, headers))) {
      this.logger.warn(`Webhook de assinatura com assinatura inválida (data.id ${dataId}) — ignorado.`);
      return;
    }

    const preapproval = new PreApproval(await this.mpClient());
    const mp = await preapproval.get({ id: dataId });
    if (!mp.id) return;

    const sub = await this.prisma.withSystem((tx) =>
      tx.subscription.findUnique({
        where: { mpPreapprovalId: mp.id },
      }),
    );
    if (!sub) {
      this.logger.log(`Webhook para preapproval ${mp.id} sem subscription local — ignorando`);
      return;
    }

    const statusMap: Record<string, 'active' | 'past_due' | 'cancelled' | 'pending'> = {
      authorized: 'active',
      paused: 'past_due',
      cancelled: 'cancelled',
      pending: 'pending',
    };
    const newStatus = statusMap[mp.status ?? ''] ?? sub.status;

    const plan = await this.getPlanConfig();
    await this.prisma.withSystem((tx) =>
      tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: newStatus,
          ...(newStatus === 'cancelled'
            ? {}
            : {
                currentPeriodStart: new Date(),
                currentPeriodEnd: addMonths(new Date(), plan.frequencyMonths),
              }),
        },
      }),
    );

    // Cancelamento NÃO bloqueia na hora: o acesso vale até o fim do período já pago
    // (o job diário `suspendExpiredCancelled` suspende no vencimento). past_due mantém ativo.
    if (newStatus === 'past_due') {
      await this.prisma.withSystem((tx) =>
        tx.tenant.update({
          where: { id: sub.tenantId },
          data: { status: 'active' },
        }),
      );
    }

    this.logger.log(`Subscription ${sub.id} atualizada: ${sub.status} → ${newStatus}`);
  }

  async activate(input: {
    preapprovalId: string;
    name: string;
    email: string;
    password: string;
    propertyName: string;
    acceptedTerms: true;
    consentIp: string;
  }): Promise<{ token: string }> {
    const preapproval = new PreApproval(await this.mpClient());
    const mp = await preapproval.get({ id: input.preapprovalId });

    if (!mp.id || mp.status !== 'authorized') {
      throw new BadRequestException(
        'Assinatura não confirmada. Aguarde a aprovação do pagamento ou tente novamente.',
      );
    }

    const existingEmail = await this.prisma.withSystem((tx) =>
      tx.user.findUnique({
        where: { email: input.email.toLowerCase().trim() },
      }),
    );
    if (existingEmail) {
      throw new BadRequestException('Já existe um login com esse email.');
    }

    const existingSub = await this.prisma.withSystem((tx) =>
      tx.subscription.findUnique({
        where: { mpPreapprovalId: mp.id },
      }),
    );
    if (existingSub) {
      throw new BadRequestException('Essa assinatura já foi ativada.');
    }

    const slug = input.propertyName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);

    const existingSlug = await this.prisma.withSystem((tx) =>
      tx.tenant.findUnique({ where: { slug } }),
    );
    const finalSlug = existingSlug ? `${slug}-${Date.now().toString(36)}` : slug;

    const passwordHash = await this.auth.hashPassword(input.password);
    const plan = await this.getPlanConfig();
    const now = new Date();

    const result = await this.prisma.withSystem(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.propertyName,
          slug: finalSlug,
          plan: 'starter',
          status: 'active',
        },
      });

      await tx.property.create({
        data: {
          tenantId: tenant.id,
          name: input.propertyName,
          slug: 'principal',
          country: 'BR',
          timezone: 'America/Sao_Paulo',
          currency: 'BRL',
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: input.email.toLowerCase().trim(),
          fullName: input.name,
          role: 'owner',
          active: true,
          passwordHash,
          termsAcceptedAt: now,
          privacyAcceptedAt: now,
          consentIp: input.consentIp,
          consentDocVersion: LEGAL_DOC_VERSION,
        },
      });

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          mpPreapprovalId: mp.id!,
          status: 'active',
          planAmount: plan.amount,
          currentPeriodStart: now,
          currentPeriodEnd: addMonths(now, plan.frequencyMonths),
          mpPayerEmail: mp.payer_email ?? input.email,
        },
      });

      return { tenant, user };
    });

    const token = await this.auth.signToken(result.user.id, result.user.email);
    return { token };
  }

  /**
   * Cancela DEFINITIVAMENTE a cobrança recorrente da pousada no Mercado Pago e
   * marca a assinatura local como cancelada. Usado quando o admin bloqueia o acesso.
   * Sem assinatura ou já cancelada → no-op. Falha no MP propaga erro (o chamador
   * NÃO deve bloquear o acesso sem antes confirmar que a cobrança parou).
   */
  async cancelForTenant(tenantId: string): Promise<{ cancelled: boolean }> {
    const sub = await this.prisma.withSystem((tx) =>
      tx.subscription.findUnique({ where: { tenantId } }),
    );
    if (!sub) return { cancelled: false };
    if (sub.status === 'cancelled') return { cancelled: true };

    try {
      const preapproval = new PreApproval(await this.mpClient());
      await preapproval.update({ id: sub.mpPreapprovalId, body: { status: 'cancelled' } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Falha ao cancelar preapproval ${sub.mpPreapprovalId} no MP: ${message}`);
      throw new BadRequestException(
        'Não foi possível cancelar a cobrança no Mercado Pago. O acesso não foi bloqueado para não deixar o cliente sendo cobrado sem acesso. Tente novamente em instantes.',
      );
    }

    await this.prisma.withSystem((tx) =>
      tx.subscription.update({
        where: { id: sub.id },
        data: { status: 'cancelled' },
      }),
    );
    this.logger.log(`Assinatura ${sub.id} cancelada no MP por bloqueio manual do admin`);
    return { cancelled: true };
  }

  /**
   * O próprio dono cancela a assinatura nas configurações. Para de cobrar imediatamente,
   * mas mantém o acesso até o fim do período já pago (o job diário bloqueia no vencimento).
   */
  async cancelOwnSubscription(
    tenantId: string,
  ): Promise<{ ok: true; accessUntil: Date | null }> {
    const sub = await this.prisma.withTenant(tenantId, (tx) =>
      tx.subscription.findUnique({
        where: { tenantId },
        select: { status: true, currentPeriodEnd: true },
      }),
    );
    if (!sub) {
      throw new BadRequestException('Você não tem uma assinatura para cancelar.');
    }
    if (sub.status !== 'cancelled') {
      await this.cancelForTenant(tenantId);
    }
    return { ok: true, accessUntil: sub.currentPeriodEnd };
  }

  /** Diariamente às 04:00 BRT: bloqueia pousadas cuja assinatura foi cancelada e o período pago já venceu. */
  @Cron('0 4 * * *', { timeZone: 'America/Sao_Paulo' })
  async suspendExpiredCancelled(): Promise<void> {
    const now = new Date();
    const expired = await this.prisma.withSystem((tx) =>
      tx.subscription.findMany({
        where: {
          status: 'cancelled',
          currentPeriodEnd: { lt: now },
          tenant: { status: 'active' },
        },
        select: { tenantId: true },
      }),
    );
    if (expired.length === 0) return;
    await this.prisma.withSystem((tx) =>
      tx.tenant.updateMany({
        where: { id: { in: expired.map((s) => s.tenantId) } },
        data: { status: 'suspended' },
      }),
    );
    this.logger.log(
      `Bloqueadas ${expired.length} pousada(s) com assinatura cancelada e período vencido`,
    );
  }

  async getStatus(tenantId: string) {
    const sub = await this.prisma.withTenant(tenantId, (tx) =>
      tx.subscription.findUnique({
        where: { tenantId },
        select: {
          status: true,
          currentPeriodEnd: true,
          planAmount: true,
        },
      }),
    );
    return sub;
  }
}
