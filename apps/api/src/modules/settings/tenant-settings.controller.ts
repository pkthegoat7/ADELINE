import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequireCapability } from '../../common/require-capability.decorator';
import {
  TENANT_SETTING_KEYS,
  TenantSettingsService,
} from '../../common/tenant-settings.service';

const UpsertSchema = z.object({
  key: z.enum(TENANT_SETTING_KEYS),
  value: z.string().max(5000),
});

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class TenantSettingsController {
  constructor(private readonly settings: TenantSettingsService) {}

  @Get()
  async getAll(@TenantId() tenantId: string) {
    return this.settings.getAll(tenantId);
  }

  @Put()
  @RequireCapability('settings:manage')
  async upsert(@TenantId() tenantId: string, @Body() body: unknown) {
    const { key, value } = UpsertSchema.parse(body);
    await this.settings.set(tenantId, key, value);
    return { ok: true, key };
  }
}
