import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ChannelSyncService } from './channel-sync.service';
import { CHANNEL_PULL_QUEUE } from './channel.constants';

interface PullJobData {
  connectionId: string;
}

@Processor(CHANNEL_PULL_QUEUE, { concurrency: 5 })
export class ChannelPullProcessor extends WorkerHost {
  private readonly logger = new Logger(ChannelPullProcessor.name);

  constructor(private readonly sync: ChannelSyncService) {
    super();
  }

  async process(job: Job<PullJobData>): Promise<unknown> {
    this.logger.log(`Pull ${job.data.connectionId} attempt ${job.attemptsMade + 1}`);
    return this.sync.pullIcal(job.data.connectionId);
  }
}
