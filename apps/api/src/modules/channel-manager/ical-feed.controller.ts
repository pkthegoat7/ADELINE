import { Controller, Get, Header, Param, Query, NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { addMonths } from 'date-fns';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildICal, compactAvailabilityIntoEvents } from './ical-builder';

/**
 * Feed público (sem auth) que canais externos consomem.
 * Token assinado HMAC evita acesso não autorizado.
 */
@Controller('ical')
export class IcalFeedController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get(':roomId.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  async feed(@Param('roomId') roomId: string, @Query('token') token: string) {
    if (!token || !this.verifyToken(roomId, token)) {
      throw new NotFoundException();
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { property: true, roomType: true },
    });
    if (!room) throw new NotFoundException();

    const rows = await this.prisma.availabilityCalendar.findMany({
      where: {
        roomId,
        date: { gte: new Date(), lt: addMonths(new Date(), 24) },
      },
      orderBy: { date: 'asc' },
    });

    const events = compactAvailabilityIntoEvents(
      rows.map((r) => ({
        date: r.date,
        status: r.status,
        reservationId: r.reservationId,
        sourceRef: r.sourceRef,
      })),
    );

    return buildICal({
      name: `${room.property.name} — ${room.code}`,
      events,
    });
  }

  private verifyToken(roomId: string, token: string): boolean {
    const secret = process.env.ICAL_FEED_SECRET ?? '';
    if (!secret) return false;
    const expected = createHmac('sha256', secret).update(roomId).digest('hex').slice(0, 32);
    return expected === token;
  }
}
