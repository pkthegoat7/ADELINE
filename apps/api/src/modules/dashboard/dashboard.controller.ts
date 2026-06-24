import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  addDays,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  subDays,
} from 'date-fns';
import { TenantId, CurrentUser, type AuthContext } from '../../common/decorators/tenant.decorator';
import { can } from '../../common/permissions';
import { redactFinancials } from './dashboard.access';
import { PrismaService } from '../../common/prisma/prisma.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@SkipThrottle()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  /** Check-ins e check-outs de um dia específico (default: hoje). */
  @Get('day')
  async day(
    @TenantId() tenantId: string,
    @Query('date') dateParam?: string,
    @Query('propertyId') propertyId?: string,
  ) {
    const target = dateParam ? new Date(dateParam + 'T00:00:00') : new Date();
    const dayStart = startOfDay(target);
    const dayEnd = endOfDay(target);
    const where = propertyId ? { propertyId } : {};
    const activeStatuses = ['pending', 'confirmed', 'checked_in'];

    return this.prisma.withTenant(tenantId, async (tx) => {
      const checkIns = await tx.reservation.findMany({
        where: {
          ...where,
          status: { in: activeStatuses },
          checkIn: { gte: dayStart, lte: dayEnd },
        },
        include: {
          guest: { select: { id: true, fullName: true, phone: true, document: true } },
          rooms: { include: { room: { select: { id: true, code: true } } } },
        },
        orderBy: { checkIn: 'asc' },
      });

      const checkOuts = await tx.reservation.findMany({
        where: {
          ...where,
          status: { in: [...activeStatuses, 'checked_out'] },
          checkOut: { gte: dayStart, lte: dayEnd },
        },
        include: {
          guest: { select: { id: true, fullName: true, phone: true, document: true } },
          rooms: { include: { room: { select: { id: true, code: true } } } },
        },
        orderBy: { checkOut: 'asc' },
      });

      return {
        date: dayStart.toISOString().split('T')[0],
        checkIns: checkIns.map(serializeReservation),
        checkOuts: checkOuts.map(serializeReservation),
      };
    });
  }

  @Get('summary')
  async summary(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthContext,
    @Query('propertyId') propertyId?: string,
  ) {
    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    const weekAhead = endOfDay(addDays(today, 7));

    const summary = await this.prisma.withTenant(tenantId, async (tx) => {
      const where = propertyId ? { propertyId } : {};

      // Quartos ativos
      const totalRooms = await tx.room.count({
        where: { ...where, active: true },
      });

      // Reservas ocupando hoje (check-in <= hoje < check-out, e em status que bloqueia)
      const activeStatuses = ['confirmed', 'checked_in'];
      const occupiedToday = await tx.reservation.count({
        where: {
          ...where,
          status: { in: activeStatuses },
          checkIn: { lte: todayEnd },
          checkOut: { gt: todayStart },
        },
      });

      // Chegadas hoje
      const todayCheckIns = await tx.reservation.findMany({
        where: {
          ...where,
          status: { in: activeStatuses },
          checkIn: { gte: todayStart, lte: todayEnd },
        },
        include: {
          guest: { select: { fullName: true } },
          rooms: { include: { room: { select: { code: true } } } },
        },
        orderBy: { checkIn: 'asc' },
        take: 20,
      });

      // Saídas hoje
      const todayCheckOuts = await tx.reservation.findMany({
        where: {
          ...where,
          status: { in: [...activeStatuses, 'checked_out'] },
          checkOut: { gte: todayStart, lte: todayEnd },
        },
        include: {
          guest: { select: { fullName: true } },
          rooms: { include: { room: { select: { code: true } } } },
        },
        orderBy: { checkOut: 'asc' },
        take: 20,
      });

      // Próximas chegadas (amanhã até 7 dias)
      const upcomingArrivals = await tx.reservation.findMany({
        where: {
          ...where,
          status: { in: activeStatuses },
          checkIn: { gt: todayEnd, lte: weekAhead },
        },
        include: {
          guest: { select: { fullName: true } },
          rooms: { include: { room: { select: { code: true } } } },
        },
        orderBy: { checkIn: 'asc' },
        take: 20,
      });

      // Receita do mês (reservas não canceladas com check-in no mês)
      const monthReservations = await tx.reservation.findMany({
        where: {
          ...where,
          status: { not: 'cancelled' },
          checkIn: { gte: monthStart, lte: monthEnd },
        },
        select: { totalAmount: true },
      });
      const monthRevenue = monthReservations.reduce(
        (sum, r) => sum + Number(r.totalAmount),
        0,
      );

      // ADR / RevPAR — sobre reservas do mês com noites
      const adrAgg = await tx.reservation.findMany({
        where: {
          ...where,
          status: { not: 'cancelled' },
          checkIn: { gte: monthStart, lte: monthEnd },
        },
        select: {
          totalAmount: true,
          checkIn: true,
          checkOut: true,
          rooms: { select: { id: true } },
        },
      });
      let roomNights = 0;
      let roomRevenue = 0;
      for (const r of adrAgg) {
        const nights = Math.max(
          1,
          Math.round((+r.checkOut - +r.checkIn) / 86_400_000),
        );
        const units = Math.max(1, r.rooms.length);
        roomNights += nights * units;
        roomRevenue += Number(r.totalAmount);
      }
      const daysInMonth = Math.max(
        1,
        Math.round((+monthEnd - +monthStart) / 86_400_000) + 1,
      );
      const availableRoomNights = totalRooms * daysInMonth;
      const adr = roomNights > 0 ? roomRevenue / roomNights : 0;
      const revPar = availableRoomNights > 0 ? roomRevenue / availableRoomNights : 0;

      // Série de ocupação dos últimos 30 dias (para sparkline)
      const seriesStart = startOfDay(subDays(today, 29));
      const seriesEnd = endOfDay(today);
      const seriesReservations = await tx.reservation.findMany({
        where: {
          ...where,
          status: { in: [...activeStatuses, 'checked_out'] },
          checkIn: { lte: seriesEnd },
          checkOut: { gt: seriesStart },
        },
        select: { checkIn: true, checkOut: true, rooms: { select: { id: true } } },
      });
      const occupancySeries = eachDayOfInterval({ start: seriesStart, end: today }).map(
        (d) => {
          const dayStart = startOfDay(d);
          const dayEnd = endOfDay(d);
          let occupied = 0;
          for (const r of seriesReservations) {
            if (r.checkIn <= dayEnd && r.checkOut > dayStart) {
              occupied += Math.max(1, r.rooms.length);
            }
          }
          return {
            date: dayStart.toISOString().split('T')[0],
            occupied,
            total: totalRooms,
            percent: totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0,
          };
        },
      );

      // Canais
      const channels = await tx.channelConnection.findMany({
        where: propertyId ? { propertyId } : undefined,
        select: {
          id: true,
          channel: true,
          status: true,
          lastSyncAt: true,
          errorCount: true,
          syncError: true,
        },
      });

      return {
        occupancy: {
          occupied: occupiedToday,
          total: totalRooms,
          percent: totalRooms > 0 ? Math.round((occupiedToday / totalRooms) * 100) : 0,
        },
        todayCheckIns: todayCheckIns.map(serializeReservation),
        todayCheckOuts: todayCheckOuts.map(serializeReservation),
        upcomingArrivals: upcomingArrivals.map(serializeReservation),
        monthRevenue: {
          value: monthRevenue,
          reservationCount: monthReservations.length,
        },
        adr,
        revPar,
        occupancySeries,
        channels,
      };
    });

    return redactFinancials(summary, can(user.role, 'expense:read'));
  }
}

type ReservationWithRelations = {
  id: string;
  code: string;
  channel: string;
  status: string;
  checkIn: Date;
  checkOut: Date;
  totalAmount: { toString(): string } | string | number;
  guest: { id?: string; fullName: string; phone?: string | null; document?: string | null };
  rooms: Array<{ room: { id?: string; code: string } }>;
};

function serializeReservation(r: ReservationWithRelations) {
  const nights = Math.max(
    1,
    Math.round(
      (new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 86_400_000,
    ),
  );
  return {
    id: r.id,
    code: r.code,
    channel: r.channel,
    status: r.status,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    nights,
    guestId: r.guest.id,
    guestName: r.guest.fullName,
    guestPhone: r.guest.phone ?? null,
    guestDocument: r.guest.document ?? null,
    rooms: r.rooms.map((rr) => rr.room.code),
    totalAmount: r.totalAmount.toString(),
  };
}
