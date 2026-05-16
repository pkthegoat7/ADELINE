import { BadRequestException, Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { CurrentUser, type AuthContext } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

function getSuperAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdmin(email: string): boolean {
  return getSuperAdminEmails().includes(email.toLowerCase());
}

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
  constructor(private readonly prisma: PrismaService) {}

  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post('signup-tenant')
  async signupTenant(@CurrentUser() user: AuthContext, @Body() body: unknown) {
    if (!isSuperAdmin(user.email)) {
      throw new ForbiddenException('Apenas super admins podem cadastrar novas pousadas');
    }
    const data = SignupSchema.parse(body);

    // 1) Cria usuário no Supabase Auth com email já confirmado
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: created, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });

    if (authError || !created.user) {
      throw new BadRequestException(authError?.message ?? 'Falha ao criar usuário');
    }

    const authUserId = created.user.id;

    // 2) Cria Tenant + Property + User em transação (service_role bypassa RLS)
    try {
      const slug = data.tenantSlug.toLowerCase();
      const result = await this.prisma.$transaction(async (tx) => {
        const existingTenant = await tx.tenant.findUnique({ where: { slug } });
        if (existingTenant) {
          throw new BadRequestException(`Slug "${slug}" já está em uso`);
        }

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

        const user = await tx.user.create({
          data: {
            id: authUserId,
            tenantId: tenant.id,
            email: data.email,
            fullName: data.fullName,
            role: 'owner',
            active: true,
          },
        });

        return { tenant, property, user };
      });

      return {
        ok: true,
        tenantId: result.tenant.id,
        propertyId: result.property.id,
        userId: result.user.id,
      };
    } catch (err) {
      // Rollback: se DB falhou, deleta o user do auth pra não deixar órfão
      await supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Falha no cadastro: ${(err as Error).message}`);
    }
  }
}
