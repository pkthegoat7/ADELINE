import { Body, Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  CurrentUser,
  TenantId,
  type AuthContext,
} from '../../common/decorators/tenant.decorator';
import { WhatsappService } from './whatsapp.service';

const TestSchema = z.object({ phone: z.string().min(8) });

function assertManager(user: AuthContext) {
  if (user.role !== 'owner' && user.role !== 'manager') {
    throw new ForbiddenException('Apenas proprietário ou gerente podem gerenciar o WhatsApp.');
  }
}

@ApiTags('whatsapp')
@ApiBearerAuth()
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get()
  status(@TenantId() tenantId: string) {
    return this.whatsapp.status(tenantId);
  }

  @Post('connect')
  connect(@CurrentUser() user: AuthContext, @TenantId() tenantId: string) {
    assertManager(user);
    return this.whatsapp.connect(tenantId);
  }

  @Post('disconnect')
  disconnect(@CurrentUser() user: AuthContext, @TenantId() tenantId: string) {
    assertManager(user);
    return this.whatsapp.disconnect(tenantId);
  }

  @Post('restart')
  restart(@CurrentUser() user: AuthContext, @TenantId() tenantId: string) {
    assertManager(user);
    return this.whatsapp.restart(tenantId);
  }

  @Post('test')
  async test(
    @CurrentUser() user: AuthContext,
    @TenantId() tenantId: string,
    @Body() body: unknown,
  ) {
    assertManager(user);
    const { phone } = TestSchema.parse(body);
    return this.whatsapp.sendText(
      tenantId,
      phone,
      'Mensagem de teste do Adelina PMS ✅ — seu WhatsApp está conectado.',
    );
  }
}
