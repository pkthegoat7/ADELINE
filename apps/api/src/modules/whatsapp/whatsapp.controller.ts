import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  CurrentUser,
  TenantId,
  type AuthContext,
} from '../../common/decorators/tenant.decorator';
import {
  MessageTemplatesService,
  TEMPLATE_TYPES,
  type TemplateType,
} from './message-templates.service';
import { WhatsappService } from './whatsapp.service';

const TestSchema = z.object({ phone: z.string().min(8) });

const TemplateTypeSchema = z.enum(TEMPLATE_TYPES as [TemplateType, ...TemplateType[]]);

const UpdateTemplateSchema = z.object({
  body: z.string().min(1).max(4000).optional(),
  enabled: z.boolean().optional(),
  hourBrt: z.number().int().min(0).max(23).nullable().optional(),
});

function assertManager(user: AuthContext) {
  if (user.role !== 'owner' && user.role !== 'manager') {
    throw new ForbiddenException('Apenas proprietário ou gerente podem gerenciar o WhatsApp.');
  }
}

@ApiTags('whatsapp')
@ApiBearerAuth()
@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly templates: MessageTemplatesService,
  ) {}

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

  /** Lista todas as mensagens configuráveis (com defaults + override do tenant). */
  @Get('templates')
  listTemplates(@TenantId() tenantId: string) {
    return this.templates.listAll(tenantId);
  }

  /** Atualiza texto/horário/on-off de uma mensagem. */
  @Put('templates/:type')
  async updateTemplate(
    @CurrentUser() user: AuthContext,
    @TenantId() tenantId: string,
    @Param('type') typeParam: string,
    @Body() body: unknown,
  ) {
    assertManager(user);
    const type = TemplateTypeSchema.parse(typeParam);
    const patch = UpdateTemplateSchema.parse(body);
    return this.templates.upsert(tenantId, type, patch);
  }

  /** Volta uma mensagem ao texto/horário padrão. */
  @Post('templates/:type/reset')
  async resetTemplate(
    @CurrentUser() user: AuthContext,
    @TenantId() tenantId: string,
    @Param('type') typeParam: string,
  ) {
    assertManager(user);
    const type = TemplateTypeSchema.parse(typeParam);
    return this.templates.reset(tenantId, type);
  }
}
