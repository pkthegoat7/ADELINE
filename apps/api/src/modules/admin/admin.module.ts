import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [WhatsappModule, SubscriptionsModule],
  controllers: [AdminController],
})
export class AdminModule {}
