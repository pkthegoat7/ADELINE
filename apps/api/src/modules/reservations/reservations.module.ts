import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { AvailabilityModule } from '../availability/availability.module';
import { CHANNEL_PUSH_QUEUE } from '../channel-manager/channel.constants';

@Module({
  imports: [AvailabilityModule, BullModule.registerQueue({ name: CHANNEL_PUSH_QUEUE })],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
