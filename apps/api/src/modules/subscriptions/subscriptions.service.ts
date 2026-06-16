import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import { addMonths } from 'date-fns';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

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
        key: { in: ['mp_plan_amount', 'mp_plan_reason', 'mp_plan_frequency_months'] },
      },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const amount = Number(map.get('mp_plan_amount'));
    const frequencyMonths = Number(map.get('mp_plan_frequency_months'));

    return {
      amount: Number.isFinite(amount) && amount > 0 ? amount : 249,
      reason: map.get('mp_plan_reason') || 'Adelina PMS — Assinatura Mensal',
      frequencyMonths: [1, 3, 12].includes(frequencyMonths) ? frequencyMonths : 1,
    };
  }

  async createPreapproval(backUrl: string): Promise<{ initPoint: string }> {
    const preapproval = new PreApproval(await this.mpClient());
    const plan = await this.getPlanConfig();
    const now = new Date();

    const result = await preapproval.create({
      body: {
        reason: plan.reason,
        auto_recurring: {
          frequency: plan.frequencyMonths,
          frequency_type: 'months',
          transaction_amount: plan.amount,
          currency_id: 'BRL',
          start_date: now.toISOString(),
          end_date: addMonths(now, 120).toISOString(),
        },
        back_url: backUrl,
        status: 'pending',
      },
    });

    if (!result.init_point) {
      throw new BadRequestException('Mercado Pago não retornou URL de checkout');
    }

    return { initPoint: result.init_point };
  }

  async handleWebhook(type: string, dataId: string): Promise<void> {
    if (type !== 'subscription_preapproval') return;

    const preapproval = new PreApproval(await this.mpClient());
    const mp = await preapproval.get({ id: dataId });
    if (!mp.id) return;

    const sub = await this.prisma.subscription.findUnique({
      where: { mpPreapprovalId: mp.id },
    });
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
    await this.prisma.subscription.update({
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
    });

    if (newStatus === 'cancelled' || newStatus === 'past_due') {
      await this.prisma.tenant.update({
        where: { id: sub.tenantId },
        data: { status: newStatus === 'cancelled' ? 'suspended' : 'active' },
      });
    }

    this.logger.log(`Subscription ${sub.id} atualizada: ${sub.status} → ${newStatus}`);
  }

  async activate(input: {
    preapprovalId: string;
    name: string;
    email: string;
    password: string;
    propertyName: string;
  }): Promise<{ token: string }> {
    const preapproval = new PreApproval(await this.mpClient());
    const mp = await preapproval.get({ id: input.preapprovalId });

    if (!mp.id || mp.status !== 'authorized') {
      throw new BadRequestException(
        'Assinatura não confirmada. Aguarde a aprovação do pagamento ou tente novamente.',
      );
    }

    const existingEmail = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
    });
    if (existingEmail) {
      throw new BadRequestException('Já existe um login com esse email.');
    }

    const existingSub = await this.prisma.subscription.findUnique({
      where: { mpPreapprovalId: mp.id },
    });
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

    const existingSlug = await this.prisma.tenant.findUnique({ where: { slug } });
    const finalSlug = existingSlug ? `${slug}-${Date.now().toString(36)}` : slug;

    const passwordHash = await this.auth.hashPassword(input.password);
    const plan = await this.getPlanConfig();
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
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

  async getStatus(tenantId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      select: {
        status: true,
        currentPeriodEnd: true,
        planAmount: true,
      },
    });
    return sub;
  }
}
