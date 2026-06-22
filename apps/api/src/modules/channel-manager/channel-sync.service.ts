import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { parseICal, type NormalizedEvent } from './ical-parser';
import type { ChannelSource } from '@adelina/db';

interface PullResult {
  itemsCount: number;
  conflicts: number;
  noop: boolean;
}

@Injectable()
export class ChannelSyncService {
  private readonly logger = new Logger(ChannelSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
  ) {}

  /**
   * INBOUND: puxa o iCal de um canal e aplica os eventos no nosso calendário.
   * Retorna métricas para o sync_log.
   */
  async pullIcal(connectionId: string): Promise<PullResult> {
    const start = Date.now();
    const conn = await this.prisma.withSystem((tx) =>
      tx.channelConnection.findUniqueOrThrow({
        where: { id: connectionId },
        include: { property: { select: { tenantId: true, id: true } }, roomMappings: true },
      }),
    );
    if (!conn.icalImportUrl) {
      throw new Error(`Connection ${connectionId} has no icalImportUrl`);
    }
    if (conn.roomMappings.length === 0) {
      this.logger.warn(`No room mappings for connection ${connectionId}`);
      return { itemsCount: 0, conflicts: 0, noop: true };
    }

    // 1. Fetch
    const res = await fetch(conn.icalImportUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching iCal`);
    const text = await res.text();

    // 2. Idempotência via hash
    const hash = createHash('sha256').update(text).digest('hex');
    if (conn.lastSyncHash === hash) {
      await this.logSync(conn.id, 'inbound', 'noop', { hash, itemsCount: 0, durationMs: Date.now() - start });
      return { itemsCount: 0, conflicts: 0, noop: true };
    }

    // 3. Parse
    const events = parseICal(text, conn.channel);
    this.logger.log(`Parsed ${events.length} events from ${conn.channel} for property ${conn.propertyId}`);

    // 4. Aplicação por mapping
    let conflicts = 0;
    let applied = 0;

    // Para iCal, tipicamente 1 feed = 1 quarto (Airbnb) ou 1 feed = todos (Booking).
    // Quando é 1:1 usamos o primeiro mapping; quando é N, o evento precisa ter UID
    // que mapeie pra um quarto — fora do escopo do MVP, fica em sync_log.conflict.
    const targetMapping = conn.roomMappings[0]!;

    for (const ev of events) {
      try {
        await this.applyInboundEvent({
          tenantId: conn.property.tenantId,
          channel: conn.channel,
          roomId: targetMapping.roomId,
          ev,
        });
        applied++;
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes('Overbooking')) {
          conflicts++;
          this.logger.warn(`Conflict on ${conn.channel} event ${ev.uid}: ${msg}`);
        } else {
          this.logger.error(`Error applying event ${ev.uid}: ${msg}`);
        }
      }
    }

    // 5. Detecta cancelamentos: eventos que existiam no último sync e não vieram agora.
    await this.detectCancellations(conn.id, conn.channel, events);

    // 6. Atualiza connection
    await this.prisma.withSystem((tx) =>
      tx.channelConnection.update({
        where: { id: conn.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncHash: hash,
          syncError: null,
          errorCount: 0,
        },
      }),
    );

    await this.logSync(conn.id, 'inbound', conflicts > 0 ? 'conflict' : 'success', {
      hash,
      itemsCount: applied,
      conflicts,
      durationMs: Date.now() - start,
    });

    return { itemsCount: applied, conflicts, noop: false };
  }

  /**
   * Aplica um evento parseado no calendário interno.
   * - 'reservation' → cria/garante reserva placeholder + bloqueia datas com source=channel.
   * - 'block' → bloqueio simples.
   */
  private async applyInboundEvent(opts: {
    tenantId: string;
    channel: ChannelSource;
    roomId: string;
    ev: NormalizedEvent;
  }) {
    const { tenantId, channel, roomId, ev } = opts;

    if (ev.kind === 'block') {
      await this.availability.blockRoom({
        tenantId,
        roomId,
        range: { from: ev.start, to: ev.end },
        note: `${channel}: ${ev.summary}`,
      });
      return;
    }

    if (ev.kind !== 'reservation') return;

    // Reserva placeholder (sem hóspede ainda — o canal só dá o bloqueio via iCal).
    // Quando o canal tiver API, enriquecemos com dados reais.
    const externalId = ev.externalReservationId ?? ev.uid;

    let reservation = await this.prisma.withSystem((tx) =>
      tx.reservation.findUnique({
        where: { channel_channelReservationId: { channel, channelReservationId: externalId } },
      }),
    );

    if (!reservation) {
      // Cria placeholder guest + reservation
      const room = await this.prisma.withSystem((tx) =>
        tx.room.findUniqueOrThrow({
          where: { id: roomId },
          include: { property: { select: { id: true, tenantId: true } }, roomType: true },
        }),
      );

      reservation = await this.prisma.withTenant(tenantId, async (tx) => {
        const guest = await tx.guest.create({
          data: {
            tenantId,
            fullName: `${channel.toUpperCase()} Guest (${externalId})`,
          },
        });
        const code = `EXT-${channel.slice(0, 3).toUpperCase()}-${externalId.slice(0, 10)}`;
        return tx.reservation.create({
          data: {
            tenantId,
            propertyId: room.property.id,
            code,
            guestId: guest.id,
            channel,
            channelReservationId: externalId,
            checkIn: new Date(ev.start),
            checkOut: new Date(ev.end),
            adults: 1,
            totalAmount: 0,
            netAmount: 0,
            status: 'confirmed',
            specialRequests: ev.summary,
            rooms: {
              create: {
                roomId,
                roomTypeId: room.roomTypeId,
                guestsCount: 1,
                nightlyRates: [],
              },
            },
          },
        });
      });
    }

    await this.availability.reserveRoom({
      tenantId,
      roomId,
      range: { from: ev.start, to: ev.end },
      source: channel,
      sourceRef: externalId,
      reservationId: reservation.id,
    });
  }

  private async detectCancellations(
    connectionId: string,
    channel: ChannelSource,
    currentEvents: NormalizedEvent[],
  ): Promise<void> {
    const currentExternalIds = new Set(
      currentEvents
        .filter((e) => e.kind === 'reservation')
        .map((e) => e.externalReservationId ?? e.uid),
    );

    // Reservas que tínhamos desse canal e que sumiram do feed
    const conn = await this.prisma.withSystem((tx) =>
      tx.channelConnection.findUniqueOrThrow({
        where: { id: connectionId },
        include: { property: true },
      }),
    );

    const stale = await this.prisma.withSystem((tx) =>
      tx.reservation.findMany({
        where: {
          propertyId: conn.propertyId,
          channel,
          status: { in: ['confirmed', 'pending'] },
          checkOut: { gte: new Date() },
        },
        select: { id: true, channelReservationId: true },
      }),
    );

    for (const r of stale) {
      if (r.channelReservationId && !currentExternalIds.has(r.channelReservationId)) {
        this.logger.log(`Detected cancellation on ${channel}: ${r.channelReservationId}`);
        await this.prisma.withSystem((tx) =>
          tx.reservation.update({
            where: { id: r.id },
            data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: 'channel-removed' },
          }),
        );
        await this.availability.releaseReservation(conn.property.tenantId, r.id);
      }
    }
  }

  private async logSync(
    connectionId: string,
    direction: 'inbound' | 'outbound',
    status: 'success' | 'noop' | 'conflict' | 'error',
    extra: { hash?: string; itemsCount?: number; conflicts?: number; durationMs?: number; error?: string },
  ) {
    await this.prisma.withSystem((tx) =>
      tx.syncLog.create({
        data: {
          connectionId,
          direction,
          status,
          payloadHash: extra.hash,
          itemsCount: extra.itemsCount ?? 0,
          conflicts: extra.conflicts ?? 0,
          error: extra.error,
          durationMs: extra.durationMs,
        },
      }),
    );
  }

  /**
   * RECONCILIAÇÃO NOTURNA: força um pull de todas as connections ativas
   * mesmo que o hash bata (ignora cache) — pega drift silencioso.
   */
  async reconcileAll(): Promise<void> {
    const conns = await this.prisma.withSystem((tx) =>
      tx.channelConnection.findMany({
        where: { status: 'active' },
        select: { id: true },
      }),
    );
    for (const c of conns) {
      try {
        // Limpa hash p/ forçar reprocessamento
        await this.prisma.withSystem((tx) =>
          tx.channelConnection.update({
            where: { id: c.id },
            data: { lastSyncHash: null },
          }),
        );
        await this.pullIcal(c.id);
      } catch (err) {
        this.logger.error(`Reconcile failed for ${c.id}: ${(err as Error).message}`);
      }
    }
  }
}
