import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CurrentUser, type AuthContext } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isSuperAdmin } from '../auth/auth.controller';
import { WhatsappService } from '../whatsapp/whatsapp.service';

const StatusSchema = z.object({ status: z.enum(['active', 'suspended']) });

/** Gestão de pousadas (tenants) — exclusivo de super admins. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  @Get('tenants')
  async listTenants(@CurrentUser() user: AuthContext) {
    this.assertSuperAdmin(user);
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        users: { where: { role: 'owner' }, select: { email: true, fullName: true }, take: 1 },
        _count: { select: { users: true, properties: true, guests: true, reservations: true } },
      },
    });
    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan,
      status: t.status,
      createdAt: t.createdAt,
      owner: t.users[0] ?? null,
      counts: t._count,
    }));
  }

  /** Suspende (bloqueia logins) ou reativa uma pousada. */
  @Patch('tenants/:id')
  async updateTenant(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.assertSuperAdmin(user);
    const { status } = StatusSchema.parse(body);
    if (id === user.tenantId && status === 'suspended') {
      throw new BadRequestException('Você não pode suspender a sua própria pousada.');
    }
    return this.prisma.tenant.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, status: true },
    });
  }

  /** Exclusão definitiva: apaga tudo da pousada (cascade) + logins do Auth + instância WhatsApp. */
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Delete('tenants/:id')
  async deleteTenant(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    this.assertSuperAdmin(user);
    if (id === user.tenantId) {
      throw new BadRequestException('Você não pode excluir a sua própria pousada.');
    }
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id },
      include: { users: { select: { id: true } } },
    });

    // Best-effort: desconecta e remove a instância WhatsApp na Evolution
    await this.whatsapp.deleteInstance(id).catch(() => undefined);

    // Cascade no banco apaga properties/quartos/reservas/hóspedes/users/etc
    await this.prisma.tenant.delete({ where: { id } });

    // users do tenant caem junto pelo cascade do banco

    return { ok: true, name: tenant.name };
  }

  // ─── System Settings (Mercado Pago, etc.) ──────────────────

  private static ALLOWED_SETTINGS = [
    'mp_access_token',
    'mp_plan_amount',
    'mp_plan_reason',
    'mp_plan_frequency_months',
    'mp_plan_compare_amount',
    'mp_plan_promo_label',
  ] as const;
  private static MASKED_SETTINGS = new Set(['mp_access_token']);
  // Configs que o super-admin pode remover (limpar). As demais só são sobrescritas.
  private static DELETABLE_SETTINGS = new Set([
    'mp_access_token',
    'mp_plan_compare_amount',
    'mp_plan_promo_label',
  ]);
  // Plano MP cacheado — vive na conta do token atual. Ao trocar/remover o token
  // (conta MP possivelmente diferente), esse cache TEM que ser invalidado.
  private static CACHED_PLAN_KEYS = ['mp_plan_id', 'mp_plan_init_point', 'mp_plan_fingerprint'];

  @Get('settings')
  async getSettings(@CurrentUser() user: AuthContext) {
    this.assertSuperAdmin(user);
    const rows = await this.prisma.systemSetting.findMany();
    return rows.map((r) => ({
      key: r.key,
      value: AdminController.MASKED_SETTINGS.has(r.key)
        ? r.value.slice(0, 8) + '••••••••'
        : r.value,
      updatedAt: r.updatedAt,
    }));
  }

  @Put('settings')
  async upsertSetting(@CurrentUser() user: AuthContext, @Body() body: unknown) {
    this.assertSuperAdmin(user);
    const schema = z.object({
      key: z.enum(AdminController.ALLOWED_SETTINGS),
      value: z.string().min(1, 'Valor obrigatório'),
    });
    const { key, value } = schema.parse(body);

    if (key === 'mp_plan_amount' || key === 'mp_plan_compare_amount') {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        throw new BadRequestException('Preço deve ser um número maior que zero.');
      }
    }
    if (key === 'mp_plan_frequency_months' && !['1', '3', '12'].includes(value)) {
      throw new BadRequestException('Ciclo inválido. Use 1, 3 ou 12 meses.');
    }
    if (key === 'mp_plan_reason' && value.length > 255) {
      throw new BadRequestException('Descrição muito longa (máx. 255 caracteres).');
    }
    if (key === 'mp_plan_promo_label' && value.length > 40) {
      throw new BadRequestException('Selo da promoção muito longo (máx. 40 caracteres).');
    }

    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });

    // Trocar o token pode significar uma conta MP diferente: invalida o plano
    // cacheado para que um novo seja criado na conta certa no próximo checkout.
    if (key === 'mp_access_token') {
      await this.prisma.systemSetting.deleteMany({
        where: { key: { in: AdminController.CACHED_PLAN_KEYS } },
      });
    }

    return { ok: true, key };
  }

  @Delete('settings/:key')
  async deleteSetting(@CurrentUser() user: AuthContext, @Param('key') key: string) {
    this.assertSuperAdmin(user);
    if (!AdminController.DELETABLE_SETTINGS.has(key)) {
      throw new BadRequestException('Essa configuração não pode ser removida.');
    }
    // Remover o token também limpa o plano MP cacheado (vinculado à conta antiga).
    const keys =
      key === 'mp_access_token' ? [key, ...AdminController.CACHED_PLAN_KEYS] : [key];
    await this.prisma.systemSetting.deleteMany({ where: { key: { in: keys } } });
    return { ok: true, key };
  }

  // ─── Helpers ──────────────────────────────────────────────

  private assertSuperAdmin(user: AuthContext) {
    if (!isSuperAdmin(user.email)) {
      throw new ForbiddenException('Apenas super admins podem gerenciar pousadas.');
    }
  }
}
