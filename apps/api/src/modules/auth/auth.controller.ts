import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { CurrentUser, type AuthContext } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

function getSuperAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdmin(email: string): boolean {
  return getSuperAdminEmails().includes(email.toLowerCase());
}

const LoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
});

const ForgotSchema = z.object({ email: z.string().email('Email inválido') });

const ResetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
});

const SignupSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  fullName: z.string().min(1, 'Nome completo obrigatório'),
  tenantName: z.string().min(1, 'Nome da pousada obrigatório'),
  tenantSlug: z
    .string()
    .min(3, 'Identificador deve ter no mínimo 3 caracteres')
    .regex(/^[a-z0-9-]+$/, 'Identificador só pode ter letras minúsculas, números e hífens'),
  propertyName: z.string().min(1, 'Nome do estabelecimento obrigatório'),
});

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: FastifyReply) {
    const { email, password } = LoginSchema.parse(body);
    const result = await this.auth.login(email, password);
    res.header('Set-Cookie', this.auth.sessionCookie(result.token));
    return result;
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: FastifyReply) {
    res.header('Set-Cookie', this.auth.sessionCookie(null));
    return { ok: true };
  }

  /** Envia link de redefinição pro WhatsApp conectado da pousada. */
  @Public()
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() body: unknown) {
    const { email } = ForgotSchema.parse(body);
    await this.auth.forgotPassword(email);
    return { ok: true };
  }

  @Public()
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  async resetPassword(@Body() body: unknown) {
    const { token, password } = ResetSchema.parse(body);
    await this.auth.resetPassword(token, password);
    return { ok: true };
  }

  /** Usuário logado troca a própria senha. */
  @Patch('password')
  async changePassword(@CurrentUser() user: AuthContext, @Body() body: unknown) {
    const { currentPassword, newPassword } = ChangePasswordSchema.parse(body);
    await this.auth.changePassword(user.userId, currentPassword, newPassword);
    return { ok: true };
  }

  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post('signup-tenant')
  async signupTenant(@CurrentUser() user: AuthContext, @Body() body: unknown) {
    if (!isSuperAdmin(user.email)) {
      throw new ForbiddenException('Apenas super admins podem cadastrar novas pousadas');
    }
    const data = SignupSchema.parse(body);
    const slug = data.tenantSlug.toLowerCase();

    const passwordHash = await this.auth.hashPassword(data.password);

    // Tenant creation is a super-admin system operation — bypass RLS for all lookups and writes.
    const result = await this.prisma.withSystem(async (tx) => {
      const existingTenant = await tx.tenant.findUnique({ where: { slug } });
      if (existingTenant) throw new BadRequestException(`Slug "${slug}" já está em uso`);
      const existingEmail = await tx.user.findUnique({ where: { email: data.email } });
      if (existingEmail) throw new BadRequestException('Já existe um login com esse email.');

      const tenant = await tx.tenant.create({
        data: { name: data.tenantName, slug, plan: 'trial', status: 'active' },
      });
      const property = await tx.property.create({
        data: {
          tenantId: tenant.id,
          name: data.propertyName,
          slug: 'principal',
          country: 'BR',
          timezone: 'America/Sao_Paulo',
          currency: 'BRL',
        },
      });
      const owner = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: data.email.toLowerCase().trim(),
          fullName: data.fullName,
          role: 'owner',
          active: true,
          passwordHash,
        },
      });
      return { tenant, property, user: owner };
    });

    return {
      ok: true,
      tenantId: result.tenant.id,
      propertyId: result.property.id,
      userId: result.user.id,
    };
  }
}
