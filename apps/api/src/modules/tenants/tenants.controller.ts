import { BadRequestException, Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, type AuthContext } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isSuperAdmin } from '../auth/auth.controller';

const AppearanceSchema = z.object({
  brand: z.enum(['terracota', 'ocean', 'emerald', 'violet', 'rose', 'slate']),
  density: z.enum(['compact', 'normal', 'comfortable']),
  radius: z.enum(['sharp', 'default', 'soft']),
  theme: z.enum(['light', 'dark', 'system']).optional(),
});

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('me')
export class TenantsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(@CurrentUser() user: AuthContext) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: user.tenantId } });
    return { user: { ...user, isSuperAdmin: isSuperAdmin(user.email) }, tenant };
  }

  @Patch('appearance')
  async updateAppearance(@CurrentUser() user: AuthContext, @Body() body: unknown) {
    const parsed = AppearanceSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const tenant = await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: { appearance: parsed.data },
    });
    return { appearance: tenant.appearance };
  }
}
