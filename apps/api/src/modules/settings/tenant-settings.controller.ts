import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequireCapability } from '../../common/require-capability.decorator';
import {
  TenantSettingsService,
  maskSecret,
} from '../../common/tenant-settings.service';

// Chaves editáveis pelo PUT genérico (NÃO inclui os segredos de MP).
const EDITABLE_KEYS = [
  'payment_terms_of_service',
  'payment_lgpd_consent',
  'payment_link_auto_whatsapp',
] as const;

const UpsertSchema = z.object({
  key: z.enum(EDITABLE_KEYS),
  value: z.string().max(5000),
});

// Conta de recebimento: campos opcionais; vazio/ausente = não sobrescreve.
const PaymentAccountSchema = z.object({
  accessToken: z.string().max(500).optional(),
  webhookSecret: z.string().max(500).optional(),
});

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class TenantSettingsController {
  constructor(private readonly settings: TenantSettingsService) {}

  @Get()
  async getAll(@TenantId() tenantId: string) {
    const all = await this.settings.getAll(tenantId);
    // Segredos voltam mascarados — nunca em texto puro pro web.
    return {
      ...all,
      payment_mp_access_token: maskSecret(all.payment_mp_access_token),
      payment_mp_webhook_secret: maskSecret(all.payment_mp_webhook_secret),
    };
  }

  @Put()
  @RequireCapability('settings:manage')
  async upsert(@TenantId() tenantId: string, @Body() body: unknown) {
    const { key, value } = UpsertSchema.parse(body);
    await this.settings.set(tenantId, key, value);
    return { ok: true, key };
  }

  // Conta de recebimento MP da pousada — só owner (dinheiro entrando).
  @Put('payment-account')
  @RequireCapability('payment:account')
  async setPaymentAccount(@TenantId() tenantId: string, @Body() body: unknown) {
    const { accessToken, webhookSecret } = PaymentAccountSchema.parse(body);
    if (accessToken && accessToken.trim()) {
      await this.settings.set(tenantId, 'payment_mp_access_token', accessToken.trim());
    }
    if (webhookSecret && webhookSecret.trim()) {
      await this.settings.set(tenantId, 'payment_mp_webhook_secret', webhookSecret.trim());
    }
    return { ok: true };
  }
}
