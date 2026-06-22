import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@adelina/db';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateOwnerInput {
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  pixKey?: string | null;
  bankInfo?: string | null;
  notes?: string | null;
}
export type UpdateOwnerInput = Partial<CreateOwnerInput> & { active?: boolean };

@Injectable()
export class OwnersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.owner.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
        include: { _count: { select: { properties: true } } },
      }),
    );
  }

  async findOne(tenantId: string, id: string) {
    const owner = await this.prisma.withTenant(tenantId, (tx) =>
      tx.owner.findFirst({
        where: { id, tenantId },
        include: { properties: { select: { id: true, name: true } } },
      }),
    );
    if (!owner) throw new NotFoundException('Proprietário não encontrado.');
    return owner;
  }

  async create(tenantId: string, input: CreateOwnerInput) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.owner.create({
        data: {
          tenantId,
          name: input.name,
          document: input.document ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          pixKey: input.pixKey ?? null,
          bankInfo: input.bankInfo ?? null,
          notes: input.notes ?? null,
        },
      }),
    );
  }

  async update(tenantId: string, id: string, input: UpdateOwnerInput) {
    await this.findOne(tenantId, id);
    const data: Prisma.OwnerUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.document !== undefined) data.document = input.document ?? null;
    if (input.email !== undefined) data.email = input.email ?? null;
    if (input.phone !== undefined) data.phone = input.phone ?? null;
    if (input.pixKey !== undefined) data.pixKey = input.pixKey ?? null;
    if (input.bankInfo !== undefined) data.bankInfo = input.bankInfo ?? null;
    if (input.notes !== undefined) data.notes = input.notes ?? null;
    if (input.active !== undefined) data.active = input.active;
    return this.prisma.withTenant(tenantId, async (tx) => {
      // 2ª camada: garante pertencimento ao tenant mesmo que findOne acima seja em TX separada
      const guard = await tx.owner.findFirst({ where: { id, tenantId } });
      if (!guard) throw new NotFoundException('Proprietário não encontrado.');
      return tx.owner.update({ where: { id }, data });
    });
  }

  async remove(tenantId: string, id: string) {
    const owner = await this.findOne(tenantId, id);
    if (owner.properties.length > 0) {
      throw new BadRequestException(
        'Desvincule os imóveis deste proprietário antes de excluí-lo.',
      );
    }
    await this.prisma.withTenant(tenantId, (tx) => tx.owner.deleteMany({ where: { id, tenantId } }));
    return { ok: true };
  }
}
