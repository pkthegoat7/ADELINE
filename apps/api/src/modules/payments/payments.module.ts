import { Module } from '@nestjs/common';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [WhatsappModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, TenantSettingsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
