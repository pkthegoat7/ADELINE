import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PayoutEntryType } from '@adelina/db';
import { startOfMonth, endOfMonth, parse } from 'date-fns';
import { PrismaService } from '../../common/prisma/prisma.service';
import { computePayout, PayoutCalcResult } from './payouts.calc';

/** 'YYYY-MM' -> Date do 1º dia do mês. Lança se inválido. */
function competenceToDate(competence: string): Date {
  if (!/^\d{4}-\d{2}$/.test(competence)) {
    throw new BadRequestException('Competência inválida (use YYYY-MM).');
  }
  const d = parse(competence + '-01', 'yyyy-MM-dd', new Date());
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Competência inválida.');
  return startOfMonth(d);
}

export interface PayoutView extends PayoutCalcResult {
  propertyId: string;
  propertyName: string;
  ownerId: string | null;
  ownerName: string | null;
  competence: string; // YYYY-MM
  status: 'open' | 'paid';
  paidAt: string | null;
  paymentMethod: string | null;
  receiptUrl: string | null;
}

@Injectable()
export class PayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  private frozenToView(p: any, propertyName: string, ownerName: string | null): PayoutView {
    return {
      propertyId: p.propertyId,
      propertyName,
      ownerId: p.ownerId,
      ownerName,
      competence: p.competence.toISOString().slice(0, 7),
      status: 'paid',
      paidAt: p.paidAt.toISOString(),
      paymentMethod: p.paymentMethod,
      receiptUrl: p.receiptUrl,
      revenueAmount: Number(p.revenueAmount),
      commissionPercent: Number(p.commissionPercent),
      commissionFeeAmount: Number(p.commissionFeeAmount),
      monthlyFeeAmount: Number(p.monthlyFeeAmount),
      expensesAmount: Number(p.expensesAmount),
      adjustmentsCredit: 0,
      adjustmentsDebit: 0,
      netPayoutAmount: Number(p.netPayoutAmount),
      reservationCount: p.reservationCount,
      breakdown: p.breakdown,
    };
  }

  /** Calcula ao vivo OU devolve o snapshot congelado se já pago. */
  async compute(tenantId: string, propertyId: string, competence: string): Promise<PayoutView> {
    const first = competenceToDate(competence);
    const last = endOfMonth(first);

    return this.prisma.withTenant(tenantId, async (tx) => {
      const property = await tx.property.findFirst({
        where: { id: propertyId, tenantId },
        include: { owner: { select: { id: true, name: true } } },
      });
      if (!property) throw new NotFoundException('Imóvel não encontrado.');

      const frozen = await tx.ownerPayout.findUnique({
        where: { propertyId_competence: { propertyId, competence: first } },
      });
      if (frozen) {
        return this.frozenToView(frozen, property.name, property.owner?.name ?? null);
      }

      const [reservations, expenses, entries] = await Promise.all([
        tx.reservation.findMany({
          where: {
            propertyId,
            checkOut: { gte: first, lte: last },
            status: { in: ['confirmed', 'checked_in', 'checked_out'] },
          },
          include: { guest: { select: { fullName: true } } },
          orderBy: { checkOut: 'asc' },
        }),
        tx.expense.findMany({
          where: { propertyId, date: { gte: first, lte: last } },
          orderBy: { date: 'asc' },
        }),
        tx.payoutEntry.findMany({
          where: { propertyId, competence: first },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

      const calc = computePayout({
        reservations: reservations.map((r) => ({
          code: r.code,
          guestName: r.guest?.fullName ?? 'Hóspede',
          checkOut: r.checkOut.toISOString().slice(0, 10),
          netAmount: Number(r.netAmount),
        })),
        expenses: expenses.map((e) => ({
          description: e.description,
          category: e.category,
          date: e.date.toISOString().slice(0, 10),
          amount: Number(e.amount),
        })),
        entries: entries.map((e) => ({
          id: e.id,
          type: e.type as 'credit' | 'debit',
          description: e.description,
          amount: Number(e.amount),
        })),
        commissionPercent: Number(property.mgmtCommissionPercent),
        monthlyFee: Number(property.mgmtMonthlyFee),
      });

      return {
        propertyId,
        propertyName: property.name,
        ownerId: property.owner?.id ?? null,
        ownerName: property.owner?.name ?? null,
        competence,
        status: 'open' as const,
        paidAt: null,
        paymentMethod: null,
        receiptUrl: null,
        ...calc,
      };
    });
  }

  /** Lista repasses de todos os imóveis COM proprietário, na competência. */
  async list(tenantId: string, competence: string): Promise<PayoutView[]> {
    const properties = await this.prisma.withTenant(tenantId, (tx) =>
      tx.property.findMany({
        where: { tenantId, ownerId: { not: null } },
        select: { id: true },
        orderBy: { name: 'asc' },
      }),
    );
    return Promise.all(properties.map((p) => this.compute(tenantId, p.id, competence)));
  }

  /** Lançamento avulso — só com o mês aberto. */
  async addEntry(
    tenantId: string,
    propertyId: string,
    competence: string,
    input: { type: PayoutEntryType; description: string; amount: number },
  ) {
    const first = competenceToDate(competence);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const property = await tx.property.findFirst({ where: { id: propertyId, tenantId }, select: { id: true } });
      if (!property) throw new NotFoundException('Imóvel não encontrado.');
      const frozen = await tx.ownerPayout.findUnique({
        where: { propertyId_competence: { propertyId, competence: first } },
        select: { id: true },
      });
      if (frozen) throw new ConflictException('Repasse já pago. Reabra para editar lançamentos.');
      return tx.payoutEntry.create({
        data: { tenantId, propertyId, competence: first, type: input.type, description: input.description, amount: input.amount },
      });
    });
  }

  async removeEntry(tenantId: string, entryId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const entry = await tx.payoutEntry.findFirst({ where: { id: entryId, tenantId } });
      if (!entry) throw new NotFoundException('Lançamento não encontrado.');
      const frozen = await tx.ownerPayout.findUnique({
        where: { propertyId_competence: { propertyId: entry.propertyId, competence: entry.competence } },
        select: { id: true },
      });
      if (frozen) throw new ConflictException('Repasse já pago. Reabra para editar lançamentos.');
      await tx.payoutEntry.delete({ where: { id: entryId } });
      return { ok: true };
    });
  }

  /** Congela o snapshot e marca pago. */
  async pay(
    tenantId: string,
    propertyId: string,
    competence: string,
    input: { paidAt?: string; paymentMethod?: string | null; receiptUrl?: string | null },
  ) {
    const first = competenceToDate(competence);
    const view = await this.compute(tenantId, propertyId, competence);
    if (view.status === 'paid') throw new ConflictException('Repasse já está pago.');

    return this.prisma.withTenant(tenantId, (tx) =>
      tx.ownerPayout.create({
        data: {
          tenantId,
          propertyId,
          ownerId: view.ownerId,
          competence: first,
          revenueAmount: view.revenueAmount,
          commissionPercent: view.commissionPercent,
          commissionFeeAmount: view.commissionFeeAmount,
          monthlyFeeAmount: view.monthlyFeeAmount,
          expensesAmount: view.expensesAmount,
          netPayoutAmount: view.netPayoutAmount,
          reservationCount: view.reservationCount,
          breakdown: view.breakdown as object,
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
          paymentMethod: input.paymentMethod ?? null,
          receiptUrl: input.receiptUrl ?? null,
        },
      }),
    );
  }

  /** Apaga a linha congelada (reabre o mês). */
  async reopen(tenantId: string, propertyId: string, competence: string) {
    const first = competenceToDate(competence);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const frozen = await tx.ownerPayout.findUnique({
        where: { propertyId_competence: { propertyId, competence: first } },
        select: { id: true, tenantId: true },
      });
      if (!frozen || frozen.tenantId !== tenantId) throw new NotFoundException('Repasse pago não encontrado.');
      await tx.ownerPayout.delete({ where: { id: frozen.id } });
      return { ok: true };
    });
  }
}
