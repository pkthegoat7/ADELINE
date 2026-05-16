import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CHANNEL_PUSH_QUEUE } from './channel.constants';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ChannelSource } from '@adelina/db';

interface PushJobData {
  tenantId: string;
  propertyId: string;
  roomId?: string;
  excludeChannel?: ChannelSource;
  reason: string;
  reservationId?: string;
}

/**
 * Outbound: notifica os outros canais sobre mudança no calendário.
 * Para iCal, é no-op (canais puxam nosso feed). Para APIs diretas (Booking
 * Connectivity, Channex, etc.), aqui entraria o POST/PUT.
 *
 * Por enquanto este processor apenas registra o evento — o feed iCal cuida
 * do resto via cache invalidation no CDN (max-age=300).
 */
@Processor(CHANNEL_PUSH_QUEUE, { concurrency: 3 })
export class ChannelPushProcessor extends WorkerHost {
  private readonly logger = new Logger(ChannelPushProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<PushJobData>): Promise<unknown> {
    const { tenantId, propertyId, excludeChannel, reason } = job.data;
    this.logger.log(`Push to other channels (excl. ${excludeChannel}) for ${propertyId}: ${reason}`);

    const conns = await this.prisma.channelConnection.findMany({
      where: {
        propertyId,
        status: 'active',
        NOT: excludeChannel ? { channel: excludeChannel } : undefined,
      },
    });

    for (const c of conns) {
      // TODO: integrar com APIs diretas. Por ora, o feed iCal já reflete o estado.
      this.logger.debug(`  → would push to ${c.channel} (${c.id})`);
      await this.prisma.syncLog.create({
        data: {
          connectionId: c.id,
          direction: 'outbound',
          status: 'success',
          itemsCount: 1,
        },
      });
    }

    return { tenantId, pushed: conns.length };
  }
}
