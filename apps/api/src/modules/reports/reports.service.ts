import { Injectable } from '@nestjs/common';
import { Prisma } from '@adelina/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  aggregatePayments,
  aggregateReceipts,
  buildCashflow,
  bucketPayablesDue,
  type PaymentOutRow,
  type ReceiptMethod,
  type ReceiptRow,
  type PayableRow,
} from './reports.calc';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export interface PeriodFilters {
  from?: string;
  to?: string;
  propertyId?: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadReceiptRows(tenantId: string, f: PeriodFilters): Promise<ReceiptRow[]> {
    const where: Prisma.PaymentWhereInput = {
      status: { in: ['paid', 'partial'] },
      reservation: { tenantId, ...(f.propertyId ? { propertyId: f.propertyId } : {}) },
    };
    if (f.from || f.to) {
      where.paidAt = {};
      if (f.from) where.paidAt.gte = new Date(`${f.from}T00:00:00Z`);
      if (f.to) where.paidAt.lte = new Date(`${f.to}T23:59:59Z`);
    }
    const rows = await this.prisma.withTenant(tenantId, (tx) =>
      tx.payment.findMany({
        where,
        orderBy: { paidAt: 'desc' },
        include: {
          reservation: {
            select: { code: true, property: { select: { name: true } }, guest: { select: { fullName: true } } },
          },
        },
      }),
    );
    return rows.map((p) => ({
      id: p.id,
      paidAt: p.paidAt ? isoDay(p.paidAt) : isoDay(p.createdAt),
      guestName: p.reservation.guest?.fullName ?? '—',
      reservationCode: p.reservation.code,
      propertyName: p.reservation.property?.name ?? null,
      method: p.method as ReceiptMethod,
      amount: Number(p.amount),
    }));
  }

  private async loadPaymentRows(tenantId: string, f: PeriodFilters): Promise<PaymentOutRow[]> {
    const expWhere: Prisma.ExpenseWhereInput = { tenantId, status: 'paid' };
    if (f.propertyId) expWhere.propertyId = f.propertyId;
    if (f.from || f.to) {
      expWhere.paidAt = {};
      if (f.from) expWhere.paidAt.gte = new Date(f.from);
      if (f.to) expWhere.paidAt.lte = new Date(f.to);
    }
    const payWhere: Prisma.OwnerPayoutWhereInput = { tenantId };
    if (f.propertyId) payWhere.propertyId = f.propertyId;
    if (f.from || f.to) {
      payWhere.paidAt = {};
      if (f.from) payWhere.paidAt.gte = new Date(`${f.from}T00:00:00Z`);
      if (f.to) payWhere.paidAt.lte = new Date(`${f.to}T23:59:59Z`);
    }
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [expenses, payouts] = await Promise.all([
        tx.expense.findMany({ where: expWhere, include: { property: { select: { name: true } } } }),
        tx.ownerPayout.findMany({
          where: payWhere,
          include: { property: { select: { name: true } }, owner: { select: { name: true } } },
        }),
      ]);
      const fromExpenses: PaymentOutRow[] = expenses.map((e) => ({
        id: e.id,
        type: 'expense',
        paidAt: e.paidAt ? isoDay(e.paidAt) : isoDay(e.date),
        description: e.description,
        counterparty: e.supplier ?? null,
        category: e.category,
        propertyName: e.property?.name ?? null,
        amount: Number(e.amount),
      }));
      const fromPayouts: PaymentOutRow[] = payouts.map((o) => ({
        id: o.id,
        type: 'payout',
        paidAt: isoDay(o.paidAt),
        description: `Repasse ${isoDay(o.competence).slice(0, 7)}`,
        counterparty: o.owner?.name ?? null,
        category: null,
        propertyName: o.property?.name ?? null,
        amount: Number(o.netPayoutAmount),
      }));
      return [...fromExpenses, ...fromPayouts].sort((a, b) => b.paidAt.localeCompare(a.paidAt));
    });
  }

  async receipts(tenantId: string, f: PeriodFilters) {
    return aggregateReceipts(await this.loadReceiptRows(tenantId, f));
  }

  async payments(tenantId: string, f: PeriodFilters) {
    return aggregatePayments(await this.loadPaymentRows(tenantId, f));
  }

  async cashflow(tenantId: string, f: PeriodFilters) {
    const [receipts, payments] = await Promise.all([
      this.loadReceiptRows(tenantId, f),
      this.loadPaymentRows(tenantId, f),
    ]);
    return buildCashflow(receipts, payments);
  }

  async payablesDue(tenantId: string, days: number) {
    const rows = await this.prisma.withTenant(tenantId, (tx) =>
      tx.expense.findMany({
        where: { tenantId, status: 'pending', dueDate: { not: null } },
        include: { property: { select: { name: true } } },
      }),
    );
    const payables: PayableRow[] = rows.map((e) => ({
      id: e.id,
      dueDate: isoDay(e.dueDate as Date),
      description: e.description,
      supplier: e.supplier ?? null,
      category: e.category,
      propertyName: e.property?.name ?? null,
      amount: Number(e.amount),
    }));
    return bucketPayablesDue(payables, isoDay(new Date()), days);
  }
}
