import { Module } from '@nestjs/common';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService, ReminderSchedulerService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
