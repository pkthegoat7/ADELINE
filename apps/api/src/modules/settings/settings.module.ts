import { Module } from '@nestjs/common';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { TenantSettingsController } from './tenant-settings.controller';

@Module({
  controllers: [TenantSettingsController],
  providers: [TenantSettingsService],
})
export class SettingsModule {}
