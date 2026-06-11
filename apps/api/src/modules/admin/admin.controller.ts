import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
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

  private assertSuperAdmin(user: AuthContext) {
    if (!isSuperAdmin(user.email)) {
      throw new ForbiddenException('Apenas super admins podem gerenciar pousadas.');
    }
  }
}
