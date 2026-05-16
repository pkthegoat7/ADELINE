import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { addDays, eachDayOfInterval, format, startOfDay } from 'date-fns';
import type { ChannelSource } from '@adelina/db';

export interface DateRange {
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD (exclusivo — checkout) */
  to: string;
}

export interface ConflictDetail {
  roomId: string;
  date: string;
  currentStatus: string;
  currentSource: string;
  currentReservationId: string | null;
}

/**
 * Serviço central de disponibilidade.
 * É o ÚNICO lugar do sistema autorizado a mudar `availability_calendar`.
 * Toda mutação roda em TX com lock pessimista nas linhas afetadas.
 */
@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Lista os dias entre [from, to). Inclui from, exclui to (lógica de hotelaria). */
  static expandDates(range: DateRange): Date[] {
    const from = startOfDay(new Date(range.from));
    const to = startOfDay(new Date(range.to));
    if (to <= from) throw new Error('to must be after from');
    // Para um check-out dia X, NÃO bloqueamos o dia X (cliente já saiu pela manhã).
    return eachDayOfInterval({ start: from, end: addDays(to, -1) });
  }

  /**
   * Reserva (block) um conjunto de noites para um quarto.
   * Falha se qualquer dia já estiver `reserved`/`blocked` por outra origem.
   *
   * Usa `SELECT ... FOR UPDATE` para evitar race entre dois canais concorrentes.
   */
  async reserveRoom(opts: {
    tenantId: string;
    roomId: string;
    range: DateRange;
    source: ChannelSource;
    sourceRef?: string;
    reservationId: string;
  }): Promise<void> {
    const dates = AvailabilityService.expandDates(opts.range);
    const dateStrs = dates.map((d) => format(d, 'yyyy-MM-dd'));

    await this.prisma.withTenant(opts.tenantId, async (tx) => {
      // Lock pessimista
      const existing = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          date: Date;
          status: string;
          source: string;
          reservation_id: string | null;
        }>
      >(
        `SELECT id, date, status, source, reservation_id
         FROM availability_calendar
         WHERE room_id = $1::uuid AND date = ANY($2::date[])
         FOR UPDATE`,
        opts.roomId,
        dateStrs,
      );

      const conflicts: ConflictDetail[] = existing
        .filter(
          (row) =>
            row.status !== 'available' &&
            row.reservation_id !== opts.reservationId &&
            row.source !== opts.source,
        )
        .map((row) => ({
          roomId: opts.roomId,
          date: format(row.date, 'yyyy-MM-dd'),
          currentStatus: row.status,
          currentSource: row.source,
          currentReservationId: row.reservation_id,
        }));

      if (conflicts.length > 0) {
        this.logger.warn(`Overbooking attempt blocked: ${JSON.stringify(conflicts)}`);
        throw new ConflictException({
          message: 'Overbooking conflict',
          conflicts,
        });
      }

      // UPSERT por (room_id, date)
      for (const date of dates) {
        await tx.availabilityCalendar.upsert({
          where: { roomId_date: { roomId: opts.roomId, date } },
          create: {
            roomId: opts.roomId,
            date,
            status: 'reserved',
            source: opts.source,
            sourceRef: opts.sourceRef,
            reservationId: opts.reservationId,
          },
          update: {
            status: 'reserved',
            source: opts.source,
            sourceRef: opts.sourceRef,
            reservationId: opts.reservationId,
          },
        });
      }
    });
  }

  /**
   * Libera as noites de uma reserva (cancelamento, no-show, mudança de quarto).
   */
  async releaseReservation(tenantId: string, reservationId: string): Promise<number> {
    const result = await this.prisma.withTenant(tenantId, (tx) =>
      tx.availabilityCalendar.updateMany({
        where: { reservationId },
        data: {
          status: 'available',
          reservationId: null,
          source: 'internal',
          sourceRef: null,
        },
      }),
    );
    return result.count;
  }

  /**
   * Bloqueio manual (manutenção, reserva fora do sistema, etc.).
   */
  async blockRoom(opts: {
    tenantId: string;
    roomId: string;
    range: DateRange;
    note?: string;
  }): Promise<void> {
    const dates = AvailabilityService.expandDates(opts.range);
    await this.prisma.withTenant(opts.tenantId, async (tx) => {
      for (const date of dates) {
        await tx.availabilityCalendar.upsert({
          where: { roomId_date: { roomId: opts.roomId, date } },
          create: {
            roomId: opts.roomId,
            date,
            status: 'blocked',
            source: 'internal',
            note: opts.note,
          },
          update: { status: 'blocked', source: 'internal', note: opts.note, reservationId: null },
        });
      }
    });
  }

  /**
   * Calendário operacional: quartos × dias com status atual.
   * Otimizado para a tela de timeline (uma query só).
   */
  async getCalendar(opts: {
    tenantId: string;
    propertyId: string;
    from: string;
    to: string;
  }) {
    return this.prisma.withTenant(opts.tenantId, async (tx) => {
      const rooms = await tx.room.findMany({
        where: { propertyId: opts.propertyId, active: true },
        include: { roomType: { select: { id: true, name: true, code: true } } },
        orderBy: [{ floor: 'asc' }, { code: 'asc' }],
      });

      const cells = await tx.availabilityCalendar.findMany({
        where: {
          roomId: { in: rooms.map((r) => r.id) },
          date: { gte: new Date(opts.from), lt: new Date(opts.to) },
        },
        include: {
          reservation: {
            select: {
              id: true,
              code: true,
              channel: true,
              status: true,
              checkIn: true,
              checkOut: true,
              guest: { select: { fullName: true } },
            },
          },
        },
      });

      return { rooms, cells };
    });
  }
}
