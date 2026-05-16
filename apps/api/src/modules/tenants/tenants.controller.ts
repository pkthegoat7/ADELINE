import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthContext } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isSuperAdmin } from '../auth/auth.controller';

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
}
