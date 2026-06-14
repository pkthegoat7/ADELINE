import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { addDays, format, subDays } from 'date-fns';
import { PrismaService } from '../../common/prisma/prisma.service';
import { publicWebUrl } from '../../common/public-url';
import { MessageTemplatesService } from './message-templates.service';
import { WhatsappService } from './whatsapp.service';

/**
 * Lembretes automáticos por WhatsApp. Roda cross-tenant (worker):
 * tenantId sempre explícito, idempotência via reservation_reminders.
 * Tenants sem WhatsApp conectado são simplesmente pulados (sendText lança).
 *
 * O cron dispara de hora em hora; cada tipo de mensagem só é enviado quando
 * a hora atual (BRT) bate com a configurada pelo tenant (ou com o default).
 */
@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly templates: MessageTemplatesService,
  ) {}

  /** Roda a cada hora cheia em BRT. Cada job verifica o horário configurado. */
  @Cron('0 * * * *', { timeZone: 'America/Sao_Paulo' })
  async hourlyTick() {
    const hourBrt = this.currentHourBrt();
    await this.checkinTomorrow(hourBrt);
    await this.pendingRegistrationLinks(hourBrt);
    await this.postCheckoutThanks(hourBrt);
  }

  private currentHourBrt(): number {
    // toLocaleString com timezone retorna o número da hora BRT correto
    // mesmo se o processo rodar em UTC ou em outro fuso.
    const s = new Date().toLocaleString('en-US', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      hour12: false,
    });
    return Number(s) % 24;
  }

  private async checkinTomorrow(hourBrt: number) {
    const tomorrow = new Date(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
    const reservations = await this.prisma.reservation.findMany({
      where: {
        checkIn: tomorrow,
        status: { in: ['pending', 'confirmed'] },
        reminders: { none: { type: 'checkin_tomorrow' } },
      },
      include: { guest: true, property: true },
    });

    for (const r of reservations) {
      if (!r.guest.phone) continue;
      const tpl = await this.templates.resolve(r.tenantId, 'checkin_tomorrow');
      if (!tpl.enabled || tpl.hourBrt !== hourBrt) continue;
      const msg = await this.templates.render(r.tenantId, 'checkin_tomorrow', {
        primeiro_nome: r.guest.fullName.split(' ')[0],
        pousada: r.property.name,
        checkin: format(r.checkIn, 'dd/MM'),
        codigo_reserva: r.code,
      });
      if (!msg) continue;
      await this.send(r.tenantId, r.id, 'checkin_tomorrow', r.guest.phone, msg);
    }
  }

  private async postCheckoutThanks(hourBrt: number) {
    const yesterday = new Date(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
    const reservations = await this.prisma.reservation.findMany({
      where: {
        checkOut: yesterday,
        status: { notIn: ['cancelled', 'no_show'] },
        reminders: { none: { type: 'post_checkout' } },
      },
      include: { guest: true, property: true },
    });

    for (const r of reservations) {
      if (!r.guest.phone) continue;
      const tpl = await this.templates.resolve(r.tenantId, 'post_checkout');
      if (!tpl.enabled || tpl.hourBrt !== hourBrt) continue;
      const msg = await this.templates.render(r.tenantId, 'post_checkout', {
        primeiro_nome: r.guest.fullName.split(' ')[0],
        pousada: r.property.name,
      });
      if (!msg) continue;
      await this.send(r.tenantId, r.id, 'post_checkout', r.guest.phone, msg);
    }
  }

  /** Ficha enviada há mais de 24h e não preenchida: cobra uma única vez. */
  private async pendingRegistrationLinks(hourBrt: number) {
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

    for (const link of links) {
      const tpl = await this.templates.resolve(link.tenantId, 'pending_registration');
      if (!tpl.enabled || tpl.hourBrt !== hourBrt) continue;
      const url = `${publicWebUrl()}/cadastro/${link.token}`;
      const msg = await this.templates.render(link.tenantId, 'pending_registration', {
        pousada: link.tenant.name,
        link: url,
      });
      if (!msg) continue;
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
