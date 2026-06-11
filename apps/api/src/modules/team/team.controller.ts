import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  CurrentUser,
  TenantId,
  type AuthContext,
} from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthContext, @TenantId() tenantId: string) {
    this.assertManager(user);
    return this.prisma.user.findMany({
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
    });
  }

  /** Cria login de funcionário (Supabase Auth + users com papel). */
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post()
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

    const supabase = this.supabaseAdmin();
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error || !created.user) {
      const msg = error?.message ?? 'Falha ao criar login';
      throw new BadRequestException(
        /already|registered|exists/i.test(msg) ? 'Já existe um login com esse email.' : msg,
      );
    }

    try {
      return await this.prisma.user.create({
        data: {
          id: created.user.id,
          tenantId,
          email: data.email,
          fullName: data.fullName,
          role: data.role,
          active: true,
        },
        select: { id: true, email: true, fullName: true, role: true, active: true },
      });
    } catch (err) {
      // Não deixa login órfão no Auth se o insert falhar
      await supabase.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      throw new BadRequestException(`Falha ao salvar usuário: ${(err as Error).message}`);
    }
  }

  /** Edita papel/nome ou ativa/desativa um membro. */
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthContext,
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.assertManager(user);
    const data = UpdateSchema.parse(body);

    const target = await this.prisma.user.findFirst({ where: { id, tenantId } });
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

    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, fullName: true, role: true, active: true },
    });
  }

  private assertManager(user: AuthContext) {
    if (user.role !== 'owner' && user.role !== 'manager') {
      throw new ForbiddenException('Apenas proprietário ou gerente acessam a equipe.');
    }
  }

  private supabaseAdmin() {
    return createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
}
