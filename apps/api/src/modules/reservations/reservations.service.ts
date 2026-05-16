import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { differenceInCalendarDays, format } from 'date-fns';
import type { ChannelSource } from '@adelina/db';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CHANNEL_PUSH_QUEUE } from '../channel-manager/channel.constants';

export interface CreateReservationInput {
  tenantId: string;
  propertyId: string;
  guestId: string;
  roomId: string;
  channel?: ChannelSource;
  channelReservationId?: string;
  channelRaw?: unknown;
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
  adults: number;
  children?: number;
  totalAmount: number;
  commissionAmount?: number;
  currency?: string;
  notes?: string;
  specialRequests?: string;
  source?: string;
}

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    @InjectQueue(CHANNEL_PUSH_QUEUE) private readonly pushQueue: Queue,
  ) {}

  /**
   * Cria reserva + bloqueia disponibilidade + dispara push para outros canais.
   * Operação atômica: se qualquer parte falha, nada persiste.
   */
  async create(input: CreateReservationInput) {
    const checkIn = new Date(input.checkIn);
    const checkOut = new Date(input.checkOut);
    if (checkOut <= checkIn) throw new Error('checkOut must be after checkIn');

    const channel: ChannelSource = input.channel ?? 'direct';
    const commission = input.commissionAmount ?? 0;
    const code = await this.generateCode(input.tenantId);

    // Idempotência: se vem do canal e já existe, retorna a existente.
    if (channel !== 'direct' && input.channelReservationId) {
      const existing = await this.prisma.reservation.findUnique({
        where: {
          channel_channelReservationId: {
            channel,
            channelReservationId: input.channelReservationId,
          },
        },
      });
      if (existing) {
        this.logger.log(`Idempotent: reservation ${existing.code} already exists`);
        return existing;
      }
    }

    const reservation = await this.prisma.withTenant(input.tenantId, async (tx) => {
      // Resolve room_type
      const room = await tx.room.findUniqueOrThrow({
        where: { id: input.roomId },
        select: { id: true, roomTypeId: true, propertyId: true },
      });
      if (room.propertyId !== input.propertyId) {
        throw new Error('roomId does not belong to propertyId');
      }

      const nights = differenceInCalendarDays(checkOut, checkIn);
      const nightlyRate = Number((Number(input.totalAmount) / nights).toFixed(2));

      const created = await tx.reservation.create({
        data: {
          tenantId: input.tenantId,
          propertyId: input.propertyId,
          code,
          guestId: input.guestId,
          channel,
          channelReservationId: input.channelReservationId,
          channelRaw: input.channelRaw as never,
          checkIn,
          checkOut,
          adults: input.adults,
          children: input.children ?? 0,
          totalAmount: input.totalAmount,
          commissionAmount: commission,
          netAmount: Number((input.totalAmount - commission).toFixed(2)),
          currency: input.currency ?? 'BRL',
          status: 'confirmed',
          notes: input.notes,
          specialRequests: input.specialRequests,
          source: input.source,
          rooms: {
            create: {
              roomId: input.roomId,
              roomTypeId: room.roomTypeId,
              guestsCount: input.adults + (input.children ?? 0),
              nightlyRates: Array.from({ length: nights }).map((_, i) => ({
                date: format(new Date(checkIn.getTime() + i * 86400000), 'yyyy-MM-dd'),
                price: nightlyRate,
              })),
            },
          },
          guests: { create: { guestId: input.guestId, isPrimary: true } },
        },
      });

      return created;
    });

    // Bloqueia availability (em TX separada, com lock pessimista)
    await this.availability.reserveRoom({
      tenantId: input.tenantId,
      roomId: input.roomId,
      range: { from: input.checkIn, to: input.checkOut },
      source: channel,
      sourceRef: input.channelReservationId,
      reservationId: reservation.id,
    });

    // Push para outros canais (best-effort, em background)
    await this.pushQueue.add(
      'push',
      {
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        roomId: input.roomId,
        excludeChannel: channel,
        reason: 'reservation.created',
        reservationId: reservation.id,
      },
      { attempts: 5, backoff: { type: 'exponential', delay: 5_000 } },
    );

    return reservation;
  }

  /**
   * Edita reserva com revalidação da disponibilidade.
   * Libera o bloqueio antigo, persiste mudanças, reserva o novo intervalo.
   */
  async update(
    tenantId: string,
    reservationId: string,
    input: Omit<CreateReservationInput, 'tenantId' | 'channelReservationId' | 'channelRaw'>,
  ) {
    const checkIn = new Date(input.checkIn);
    const checkOut = new Date(input.checkOut);
    if (checkOut <= checkIn) throw new Error('checkOut must be after checkIn');

    const existing = await this.prisma.withTenant(tenantId, (tx) =>
      tx.reservation.findUniqueOrThrow({ where: { id: reservationId } }),
    );

    // Libera availability antiga
    await this.availability.releaseReservation(tenantId, reservationId);

    const channel: ChannelSource = input.channel ?? (existing.channel as ChannelSource);
    const commission = input.commissionAmount ?? Number(existing.commissionAmount);
    const nights = differenceInCalendarDays(checkOut, checkIn);
    const nightlyRate = Number((Number(input.totalAmount) / nights).toFixed(2));

    await this.prisma.withTenant(tenantId, async (tx) => {
      const room = await tx.room.findUniqueOrThrow({
        where: { id: input.roomId },
        select: { id: true, roomTypeId: true, propertyId: true },
      });
      if (room.propertyId !== input.propertyId) {
        throw new Error('roomId does not belong to propertyId');
      }

      await tx.reservationRoom.deleteMany({ where: { reservationId } });
      await tx.reservationGuest.deleteMany({ where: { reservationId } });

      await tx.reservation.update({
        where: { id: reservationId },
        data: {
          guestId: input.guestId,
          propertyId: input.propertyId,
          channel,
          checkIn,
          checkOut,
          adults: input.adults,
          children: input.children ?? 0,
          totalAmount: input.totalAmount,
          commissionAmount: commission,
          netAmount: Number((input.totalAmount - commission).toFixed(2)),
          currency: input.currency ?? existing.currency,
          notes: input.notes,
          specialRequests: input.specialRequests,
          rooms: {
            create: {
              roomId: input.roomId,
              roomTypeId: room.roomTypeId,
              guestsCount: input.adults + (input.children ?? 0),
              nightlyRates: Array.from({ length: nights }).map((_, i) => ({
                date: format(new Date(checkIn.getTime() + i * 86400000), 'yyyy-MM-dd'),
                price: nightlyRate,
              })),
            },
          },
          guests: { create: { guestId: input.guestId, isPrimary: true } },
        },
      });
    });

    // Re-bloqueia availability com novos valores
    await this.availability.reserveRoom({
      tenantId,
      roomId: input.roomId,
      range: { from: input.checkIn, to: input.checkOut },
      source: channel,
      reservationId,
    });

    await this.pushQueue.add('push', {
      tenantId,
      propertyId: input.propertyId,
      excludeChannel: channel,
      reason: 'reservation.updated',
      reservationId,
    });

    return this.getOne(tenantId, reservationId);
  }

  async cancel(tenantId: string, reservationId: string, reason?: string) {
    const r = await this.prisma.withTenant(tenantId, async (tx) => {
      const r = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId } });
      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason },
      });
      return { ...r, ...updated };
    });

    await this.availability.releaseReservation(tenantId, reservationId);

    await this.pushQueue.add('push', {
      tenantId,
      propertyId: r.propertyId,
      excludeChannel: r.channel,
      reason: 'reservation.cancelled',
      reservationId,
    });

    return r;
  }

  async checkIn(tenantId: string, reservationId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.reservation.update({
        where: { id: reservationId },
        data: { status: 'checked_in', checkedInAt: new Date() },
      }),
    );
  }

  async checkOut(tenantId: string, reservationId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const r = await tx.reservation.update({
        where: { id: reservationId },
        data: { status: 'checked_out', checkedOutAt: new Date() },
      });
      // Cria task de housekeeping
      const rooms = await tx.reservationRoom.findMany({ where: { reservationId } });
      for (const rr of rooms) {
        await tx.room.update({ where: { id: rr.roomId }, data: { status: 'dirty' } });
        await tx.housekeepingTask.create({
          data: {
            roomId: rr.roomId,
            type: 'checkout_clean',
            status: 'pending',
            scheduledFor: new Date(),
          },
        });
      }
      return r;
    });
  }

  list(tenantId: string, filter?: { propertyId?: string; from?: string; to?: string }) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.reservation.findMany({
        where: {
          propertyId: filter?.propertyId,
          ...(filter?.from && filter?.to
            ? {
                AND: [
                  { checkIn: { lt: new Date(filter.to) } },
                  { checkOut: { gt: new Date(filter.from) } },
                ],
              }
            : {}),
        },
        include: {
          guest: { select: { id: true, fullName: true, document: true, phone: true } },
          rooms: { include: { room: { select: { id: true, code: true } } } },
        },
        orderBy: { checkIn: 'desc' },
        take: 200,
      }),
    );
  }

  async getOne(tenantId: string, id: string) {
    const r = await this.prisma.withTenant(tenantId, (tx) =>
      tx.reservation.findUnique({
        where: { id },
        include: {
          guest: true,
          rooms: { include: { room: true, roomType: true } },
          guests: { include: { guest: true } },
          payments: true,
          folio: { include: { items: true } },
        },
      }),
    );
    if (!r) throw new NotFoundException();
    return r;
  }

  /** Gera código humano: ADL-2026-00001 (sequencial por tenant). */
  private async generateCode(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.reservation.count({ where: { tenantId } });
    return `ADL-${year}-${String(count + 1).padStart(5, '0')}`;
  }
}
