import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { addDays, format, subDays } from 'date-fns';
import { PrismaService } from '../../common/prisma/prisma.service';
import { publicWebUrl } from '../../common/public-url';
import { WhatsappService } from './whatsapp.service';

/**
 * Lembretes automáticos por WhatsApp. Roda cross-tenant (worker):
 * tenantId sempre explícito, idempotência via reservation_reminders.
 * Tenants sem WhatsApp conectado são simplesmente pulados (sendText lança).
 */
@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /** 10:00 BRT — check-in amanhã + cobrança de ficha pendente. */
  @Cron('0 10 * * *', { timeZone: 'America/Sao_Paulo' })
  async morningReminders() {
    await this.checkinTomorrow();
    await this.pendingRegistrationLinks();
  }

  /** 11:00 BRT — agradecimento pós-checkout (saída ontem). */
  @Cron('0 11 * * *', { timeZone: 'America/Sao_Paulo' })
  async postCheckoutThanks() {
    const yesterday = new Date(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
    const reservations = await this.prisma.reservation.findMany({
      where: {
        checkOut: yesterday,
        status: { notIn: ['cancelled', 'no_show'] },
        reminders: { none: { type: 'post_checkout' } },
      },
      include: { guest: true, property: true },
    });
    this.logger.log(`post_checkout: ${reservations.length} reserva(s) elegíveis`);

    for (const r of reservations) {
      if (!r.guest.phone) continue;
      const firstName = r.guest.fullName.split(' ')[0];
      const msg =
        `Olá, ${firstName}! Aqui é da ${r.property.name} 🏡\n\n` +
        `Esperamos que sua estadia tenha sido ótima! Obrigado pela visita 💛\n` +
        `Se puder, deixe uma avaliação — ajuda muito a nossa pousada. Até a próxima!`;
      await this.send(r.tenantId, r.id, 'post_checkout', r.guest.phone, msg);
    }
  }

  private async checkinTomorrow() {
    const tomorrow = new Date(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
    const reservations = await this.prisma.reservation.findMany({
      where: {
        checkIn: tomorrow,
        status: { in: ['pending', 'confirmed'] },
        reminders: { none: { type: 'checkin_tomorrow' } },
      },
      include: { guest: true, property: true },
    });
    this.logger.log(`checkin_tomorrow: ${reservations.length} reserva(s) elegíveis`);

    for (const r of reservations) {
      if (!r.guest.phone) continue;
      const firstName = r.guest.fullName.split(' ')[0];
      const msg =
        `Olá, ${firstName}! 👋 Aqui é da ${r.property.name}.\n\n` +
        `Lembrete: seu check-in é amanhã, ${format(r.checkIn, 'dd/MM')}, a partir das 14h.\n` +
        `Reserva ${r.code}. Qualquer dúvida é só responder por aqui. Até amanhã! 🏡`;
      await this.send(r.tenantId, r.id, 'checkin_tomorrow', r.guest.phone, msg);
    }
  }

  /** Ficha enviada há mais de 24h e não preenchida: cobra uma única vez. */
  private async pendingRegistrationLinks() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const links = await this.prisma.guestRegistrationLink.findMany({
      where: {
        status: 'pending',
        reminderSentAt: null,
        createdAt: { lt: cutoff },
        expiresAt: { gt: new Date() },
      },
      include: { tenant: true },
    });
    this.logger.log(`ficha pendente: ${links.length} link(s) elegíveis`);

    for (const link of links) {
      const url = `${publicWebUrl()}/cadastro/${link.token}`;
      const msg =
        `Olá! Aqui é da ${link.tenant.name} 👋\n\n` +
        `Ainda não recebemos sua ficha de cadastro. Leva menos de 2 minutos:\n${url}`;
      try {
        await this.whatsapp.sendText(link.tenantId, link.phone, msg);
        await this.prisma.guestRegistrationLink.update({
          where: { id: link.id },
          data: { reminderSentAt: new Date() },
        });
      } catch (err) {
        this.logger.warn(`ficha pendente ${link.id}: ${(err as Error).message}`);
      }
    }
  }

  private async send(
    tenantId: string,
    reservationId: string,
    type: 'checkin_tomorrow' | 'post_checkout',
    phone: string,
    msg: string,
  ) {
    try {
      await this.whatsapp.sendText(tenantId, phone, msg);
      await this.prisma.reservationReminder.create({
        data: { tenantId, reservationId, type },
      });
    } catch (err) {
      // WhatsApp desconectado ou número inválido: tenta de novo no próximo ciclo
      this.logger.warn(`${type} ${reservationId}: ${(err as Error).message}`);
    }
  }
}
