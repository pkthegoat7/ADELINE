import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  /** Busca global: reservas (por código/hóspede), hóspedes, quartos. */
  @Get()
  async search(@TenantId() tenantId: string, @Query('q') q?: string) {
    if (!q || q.trim().length < 1) {
      return { reservations: [], guests: [], rooms: [] };
    }
    const term = q.trim();

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [reservations, guests, rooms] = await Promise.all([
        tx.reservation.findMany({
          where: {
            OR: [
              { code: { contains: term, mode: 'insensitive' } },
              { guest: { fullName: { contains: term, mode: 'insensitive' } } },
              { guest: { document: { contains: term } } },
            ],
          },
          include: {
            guest: { select: { id: true, fullName: true } },
            rooms: { include: { room: { select: { code: true } } } },
          },
          orderBy: { checkIn: 'desc' },
          take: 8,
        }),
        tx.guest.findMany({
          where: {
            OR: [
              { fullName: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
              { phone: { contains: term } },
              { document: { contains: term } },
            ],
          },
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            document: true,
          },
          take: 8,
          orderBy: { fullName: 'asc' },
        }),
        tx.room.findMany({
          where: {
            active: true,
            OR: [
              { code: { contains: term, mode: 'insensitive' } },
              { roomType: { name: { contains: term, mode: 'insensitive' } } },
            ],
          },
          select: {
            id: true,
            code: true,
            floor: true,
            status: true,
            roomType: { select: { name: true, capacity: true } },
          },
          take: 8,
          orderBy: { code: 'asc' },
        }),
      ]);

      return {
        reservations: reservations.map((r) => ({
          id: r.id,
          code: r.code,
          status: r.status,
          channel: r.channel,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          guestName: r.guest.fullName,
          rooms: r.rooms.map((rr) => rr.room.code),
        })),
        guests,
        rooms,
      };
    });
  }
}
