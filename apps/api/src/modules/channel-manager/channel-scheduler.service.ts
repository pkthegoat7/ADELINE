import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CHANNEL_PULL_QUEUE } from './channel.constants';
import { ChannelSyncService } from './channel-sync.service';

@Injectable()
export class ChannelSchedulerService {
  private readonly logger = new Logger(ChannelSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: ChannelSyncService,
    @InjectQueue(CHANNEL_PULL_QUEUE) private readonly pullQueue: Queue,
  ) {}

  /** A cada 5 minutos, enfileira um pull para cada connection ativa. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async schedulePulls() {
    const conns = await this.prisma.channelConnection.findMany({
      where: { status: 'active', icalImportUrl: { not: null } },
      select: { id: true },
    });
    this.logger.log(`Scheduling ${conns.length} iCal pulls`);
    for (const c of conns) {
      await this.pullQueue.add(
        'pull',
        { connectionId: c.id },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    }
  }

  /** Reconciliação noturna: força refresh ignorando hash. */
  @Cron('0 3 * * *', { timeZone: 'America/Sao_Paulo' })
  async nightlyReconciliation() {
    this.logger.log('Starting nightly reconciliation');
    await this.sync.reconcileAll();
  }
}
