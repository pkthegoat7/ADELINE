import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ChannelManagerController } from './channel-manager.controller';
import { IcalFeedController } from './ical-feed.controller';
import { ChannelSyncService } from './channel-sync.service';
import { ChannelSchedulerService } from './channel-scheduler.service';
import { ChannelPullProcessor } from './channel-pull.processor';
import { ChannelPushProcessor } from './channel-push.processor';
import { AvailabilityModule } from '../availability/availability.module';
import { CHANNEL_PULL_QUEUE, CHANNEL_PUSH_QUEUE } from './channel.constants';

@Module({
  imports: [
    AvailabilityModule,
    BullModule.registerQueue({ name: CHANNEL_PULL_QUEUE }, { name: CHANNEL_PUSH_QUEUE }),
  ],
  controllers: [ChannelManagerController, IcalFeedController],
  providers: [
    ChannelSyncService,
    ChannelSchedulerService,
    ChannelPullProcessor,
    ChannelPushProcessor,
  ],
  exports: [ChannelSyncService],
})
export class ChannelManagerModule {}
