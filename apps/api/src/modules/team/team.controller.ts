import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  CurrentUser,
  TenantId,
  type AuthContext,
} from '../../common/decorators/tenant.decorator';
import { RequireCapability } from '../../common/require-capability.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

const ROLES = ['owner', 'manager', 'receptionist', 'housekeeper', 'readonly'] as const;
type Role = (typeof ROLES)[number];

const CreateSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  fullName: z.string().min(1, 'Nome obrigatório'),
  role: z.enum(ROLES).default('receptionist'),
});

const UpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  // Redefinição de senha pelo dono/gerente
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').optional(),
});

/** Papéis que cada papel pode atribuir/gerenciar. */
function canManageRole(actor: string, target: Role): boolean {
  if (actor === 'owner') return true;
  if (actor === 'manager') return !['owner', 'manager'].includes(target);
  return false;
}

@ApiTags('team')
@ApiBearerAuth()
@Controller('team')
export class TeamController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthContext, @TenantId() tenantId: string) {
    this.assertManager(user);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findMany({
        where: { tenantId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          active: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  /** Cria login de funcionário (Supabase Auth + users com papel). */
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post()
  @RequireCapability('team:manage')
  async create(
    @CurrentUser() user: AuthContext,
    @TenantId() tenantId: string,
    @Body() body: unknown,
  ) {
    this.assertManager(user);
    const data = CreateSchema.parse(body);
    if (!canManageRole(user.role, data.role)) {
      throw new ForbiddenException(`Seu papel não permite criar usuários "${data.role}".`);
    }

    const existing = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findUnique({ where: { email: data.email } }),
    );
    if (existing) throw new BadRequestException('Já existe um login com esse email.');

    return this.auth.createLocalUser({ tenantId, ...data });
  }

  /** Edita papel/nome ou ativa/desativa um membro. */
  @Patch(':id')
  @RequireCapability('team:manage')
  async update(
    @CurrentUser() user: AuthContext,
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.assertManager(user);
    const data = UpdateSchema.parse(body);

    const target = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findFirst({ where: { id, tenantId } }),
    );
    if (!target) throw new NotFoundException('Usuário não encontrado.');

    if (target.id === user.userId && (data.role || data.active === false)) {
      throw new BadRequestException('Você não pode alterar seu próprio papel ou se desativar.');
    }
    if (!canManageRole(user.role, target.role as Role)) {
      throw new ForbiddenException('Seu papel não permite gerenciar esse usuário.');
    }
    if (data.role && !canManageRole(user.role, data.role)) {
      throw new ForbiddenException(`Seu papel não permite atribuir "${data.role}".`);
    }

    const { password, ...rest } = data;
    const passwordHash = password ? await this.auth.hashPassword(password) : undefined;
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.user.update({
        where: { id },
        data: {
          ...rest,
          ...(passwordHash ? { passwordHash } : {}),
        },
        select: { id: true, email: true, fullName: true, role: true, active: true },
      }),
    );
  }

  /** Hard delete: remove o usuário definitivamente. Revoga o acesso na hora. */
  @Delete(':id')
  @RequireCapability('team:manage')
  async remove(
    @CurrentUser() user: AuthContext,
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    this.assertManager(user);

    const target = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findFirst({ where: { id, tenantId } }),
    );
    if (!target) throw new NotFoundException('Usuário não encontrado.');
    if (target.id === user.userId) {
      throw new BadRequestException('Você não pode excluir a si mesmo.');
    }
    if (target.role === 'owner') {
      throw new BadRequestException('O proprietário não pode ser excluído.');
    }
    if (!canManageRole(user.role, target.role as Role)) {
      throw new ForbiddenException('Seu papel não permite gerenciar esse usuário.');
    }

    await this.prisma.withTenant(tenantId, (tx) => tx.user.delete({ where: { id } }));
    return { ok: true };
  }

  private assertManager(user: AuthContext) {
    if (user.role !== 'owner' && user.role !== 'manager') {
      throw new ForbiddenException('Apenas proprietário ou gerente acessam a equipe.');
    }
  }

}
