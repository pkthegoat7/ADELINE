import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { GuestLinksController } from './guest-links.controller';

@Module({
  imports: [WhatsappModule],
  controllers: [GuestLinksController],
})
export class GuestLinksModule {}
