import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { createHmac } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  CurrentUser,
  TenantId,
  type AuthContext,
} from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CHANNEL_PULL_QUEUE } from './channel.constants';

const ConnectionSchema = z.object({
  propertyId: z.string().uuid(),
  channel: z.enum(['airbnb', 'booking', 'expedia', 'vrbo', 'despegar']),
  icalImportUrl: z.string().url().optional(),
  roomMappings: z
    .array(
      z.object({
        roomId: z.string().uuid(),
        externalRoomId: z.string(),
        externalRoomName: z.string().optional(),
      }),
    )
    .min(1),
});

function assertManager(user: AuthContext) {
  if (user.role !== 'owner' && user.role !== 'manager') {
    throw new ForbiddenException('Apenas proprietário ou gerente podem gerenciar canais.');
  }
}

@ApiTags('channel-manager')
@ApiBearerAuth()
@Controller('channels')
export class ChannelManagerController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CHANNEL_PULL_QUEUE) private readonly pullQueue: Queue,
  ) {}

  @Get()
  list(@TenantId() tenantId: string, @Query('propertyId') propertyId?: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.channelConnection.findMany({
        where: propertyId ? { propertyId } : undefined,
        include: {
          roomMappings: { include: { room: { select: { code: true } } } },
          _count: { select: { syncLogs: true } },
        },
      }),
    );
  }

  @Post()
  async create(
    @CurrentUser() user: AuthContext,
    @TenantId() tenantId: string,
    @Body() body: unknown,
  ) {
    assertManager(user);
    const data = ConnectionSchema.parse(body);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const conn = await tx.channelConnection.create({
        data: {
          propertyId: data.propertyId,
          channel: data.channel,
          icalImportUrl: data.icalImportUrl,
          icalExportToken: this.generateExportToken(data.propertyId),
          roomMappings: { create: data.roomMappings },
        },
        include: { roomMappings: true },
      });
      return conn;
    });
  }

  /** Dispara pull manual (botão "sincronizar agora"). */
  @Post(':id/sync')
  async syncNow(@TenantId() tenantId: string, @Param('id') id: string) {
    // Confere ownership via RLS
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.channelConnection.findUniqueOrThrow({ where: { id } }),
    );
    await this.pullQueue.add('pull', { connectionId: id }, { attempts: 1 });
    return { queued: true };
  }

  @Get(':id/logs')
  logs(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.syncLog.findMany({
        where: { connectionId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthContext,
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    assertManager(user);
    return this.prisma.withTenant(tenantId, async (tx) => {
      await tx.channelConnection.findUniqueOrThrow({ where: { id } });
      await tx.channelRoomMapping.deleteMany({ where: { connectionId: id } });
      await tx.syncLog.deleteMany({ where: { connectionId: id } });
      return tx.channelConnection.delete({ where: { id } });
    });
  }

  /** Retorna a URL pública do feed iCal de cada quarto da conexão. */
  @Get(':id/export-urls')
  async exportUrls(@TenantId() tenantId: string, @Param('id') id: string) {
    const conn = await this.prisma.withTenant(tenantId, (tx) =>
      tx.channelConnection.findUniqueOrThrow({
        where: { id },
        include: { roomMappings: { include: { room: true } } },
      }),
    );
    const base = process.env.API_BASE_URL ?? 'http://localhost:3333';
    const secret = process.env.ICAL_FEED_SECRET ?? '';
    return conn.roomMappings.map((m) => ({
      roomId: m.roomId,
      roomCode: m.room.code,
      url: `${base}/api/ical/${m.roomId}.ics?token=${this.tokenFor(m.roomId, secret)}`,
    }));
  }

  private tokenFor(roomId: string, secret: string): string {
    return createHmac('sha256', secret).update(roomId).digest('hex').slice(0, 32);
  }

  private generateExportToken(propertyId: string): string {
    const secret = process.env.ICAL_FEED_SECRET ?? '';
    return createHmac('sha256', secret).update(propertyId).digest('hex').slice(0, 16);
  }
}
