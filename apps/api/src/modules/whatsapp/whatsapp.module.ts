import { Module } from '@nestjs/common';
import { MessageTemplatesService } from './message-templates.service';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService, MessageTemplatesService, ReminderSchedulerService],
  exports: [WhatsappService, MessageTemplatesService],
})
export class WhatsappModule {}
