import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseCategory, ExpenseStatus, Prisma } from '@adelina/db';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateExpenseInput {
  propertyId?: string | null;
  category: ExpenseCategory;
  description: string;
  supplier?: string | null;
  amount: number;
  date?: string; // ISO date (yyyy-mm-dd); default hoje
  status?: ExpenseStatus;
  dueDate?: string | null;
  paidAt?: string | null;
  receiptUrl?: string | null;
}

export type UpdateExpenseInput = Partial<CreateExpenseInput>;

export interface ListExpenseFilters {
  propertyId?: string;
  category?: ExpenseCategory;
  status?: ExpenseStatus;
  from?: string; // filtra por `date` >= from
  to?: string; // filtra por `date` <= to
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Garante que a propriedade (se informada) pertence ao tenant. */
  private async assertProperty(tenantId: string, propertyId?: string | null): Promise<void> {
    if (!propertyId) return;
    const found = await this.prisma.withTenant(tenantId, (tx) =>
      tx.property.findFirst({ where: { id: propertyId, tenantId }, select: { id: true } }),
    );
    if (!found) throw new BadRequestException('Propriedade inválida para este tenant.');
  }

  private buildWhere(tenantId: string, f: ListExpenseFilters): Prisma.ExpenseWhereInput {
    const where: Prisma.ExpenseWhereInput = { tenantId };
    if (f.propertyId) where.propertyId = f.propertyId;
    if (f.category) where.category = f.category;
    if (f.status) where.status = f.status;
    if (f.from || f.to) {
      where.date = {};
      if (f.from) where.date.gte = new Date(f.from);
      if (f.to) where.date.lte = new Date(f.to);
    }
    return where;
  }

  async create(tenantId: string, input: CreateExpenseInput) {
    await this.assertProperty(tenantId, input.propertyId);
    const status = input.status ?? 'pending';
    const paidAt =
      status === 'paid' ? new Date(input.paidAt ?? new Date()) : input.paidAt ? new Date(input.paidAt) : null;
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.expense.create({
        data: {
          tenantId,
          propertyId: input.propertyId ?? null,
          category: input.category,
          description: input.description,
          supplier: input.supplier ?? null,
          amount: input.amount,
          date: input.date ? new Date(input.date) : new Date(),
          status,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          paidAt,
          receiptUrl: input.receiptUrl ?? null,
        },
      }),
    );
  }

  async findAll(tenantId: string, filters: ListExpenseFilters) {
    const where = this.buildWhere(tenantId, filters);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.expense.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: { property: { select: { id: true, name: true } } },
      }),
    );
  }

  async findOne(tenantId: string, id: string) {
    const expense = await this.prisma.withTenant(tenantId, (tx) =>
      tx.expense.findFirst({
        where: { id, tenantId },
        include: { property: { select: { id: true, name: true } } },
      }),
    );
    if (!expense) throw new NotFoundException('Despesa não encontrada.');
    return expense;
  }

  async update(tenantId: string, id: string, input: UpdateExpenseInput) {
    await this.findOne(tenantId, id); // valida existência + tenant
    if (input.propertyId !== undefined) await this.assertProperty(tenantId, input.propertyId);

    const data: Prisma.ExpenseUpdateInput = {};
    if (input.category !== undefined) data.category = input.category;
    if (input.description !== undefined) data.description = input.description;
    if (input.supplier !== undefined) data.supplier = input.supplier ?? null;
    if (input.amount !== undefined) data.amount = input.amount;
    if (input.date !== undefined) data.date = new Date(input.date as string);
    if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    if (input.receiptUrl !== undefined) data.receiptUrl = input.receiptUrl ?? null;
    if (input.propertyId !== undefined) {
      data.property = input.propertyId
        ? { connect: { id: input.propertyId } }
        : { disconnect: true };
    }
    if (input.status !== undefined) {
      data.status = input.status;
      // Ao marcar como pago sem paidAt, assume hoje; ao voltar p/ pending, limpa paidAt.
      if (input.status === 'paid') {
        data.paidAt = new Date(input.paidAt ?? new Date());
      } else {
        data.paidAt = null;
      }
    } else if (input.paidAt !== undefined) {
      data.paidAt = input.paidAt ? new Date(input.paidAt) : null;
    }

    return this.prisma.withTenant(tenantId, async (tx) => {
      // 2ª camada: garante pertencimento ao tenant mesmo que findOne acima seja em TX separada
      const guard = await tx.expense.findFirst({ where: { id, tenantId } });
      if (!guard) throw new NotFoundException('Despesa não encontrada.');
      return tx.expense.update({ where: { id }, data });
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.withTenant(tenantId, (tx) => tx.expense.deleteMany({ where: { id, tenantId } }));
    return { ok: true };
  }

  /** Totais do período: total, pago, a pagar e quebra por categoria. */
  async summary(tenantId: string, filters: ListExpenseFilters) {
    const where = this.buildWhere(tenantId, filters);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [all, paid, byCategory] = await Promise.all([
        tx.expense.aggregate({ where, _sum: { amount: true } }),
        tx.expense.aggregate({ where: { ...where, status: 'paid' }, _sum: { amount: true } }),
        tx.expense.groupBy({ by: ['category'], where, _sum: { amount: true } }),
      ]);
      const total = Number(all._sum.amount ?? 0);
      const paidTotal = Number(paid._sum.amount ?? 0);
      return {
        total,
        paid: paidTotal,
        pending: Number((total - paidTotal).toFixed(2)),
        byCategory: byCategory
          .map((c) => ({ category: c.category, amount: Number(c._sum.amount ?? 0) }))
          .sort((a, b) => b.amount - a.amount),
      };
    });
  }
}
