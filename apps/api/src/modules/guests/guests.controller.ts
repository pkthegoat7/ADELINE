import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  CurrentUser,
  TenantId,
  type AuthContext,
} from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

const GuestSchema = z.object({
  fullName: z.string().min(1),
  documentType: z.enum(['cpf', 'rg', 'passport', 'cnh', 'other']).default('cpf'),
  document: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  birthDate: z.string().optional(), // ISO date
  nationality: z.string().optional(),
});

@ApiTags('guests')
@ApiBearerAuth()
@Controller('guests')
export class GuestsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@TenantId() tenantId: string, @Query('q') q?: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.guest.findMany({
        where: q
          ? {
              OR: [
                { fullName: { contains: q, mode: 'insensitive' } },
                { document: { contains: q } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
              ],
            }
          : undefined,
        take: 50,
        orderBy: { fullName: 'asc' },
      }),
    );
  }

  @Get(':id')
  getOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.guest.findUniqueOrThrow({
        where: { id },
        include: { reservations: { orderBy: { checkIn: 'desc' } } },
      }),
    );
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() body: unknown) {
    const data = GuestSchema.parse(body);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.guest.create({
        data: {
          ...data,
          tenantId,
          birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        },
      }),
    );
  }

  @Put(':id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: unknown) {
    const data = GuestSchema.partial().parse(body);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.guest.update({
        where: { id },
        data: {
          ...data,
          birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        },
      }),
    );
  }

  /** Exclusão definitiva. Bloqueia se o hóspede tiver reservas (FK Restrict no schema). */
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthContext,
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    if (user.role !== 'owner' && user.role !== 'manager') {
      throw new ForbiddenException('Apenas proprietário ou gerente podem excluir hóspedes.');
    }

    const reservationsCount = await this.prisma.withTenant(tenantId, (tx) =>
      tx.reservation.count({ where: { guestId: id } }),
    );
    if (reservationsCount > 0) {
      throw new BadRequestException(
        `Não é possível excluir: este hóspede tem ${reservationsCount} reserva${
          reservationsCount === 1 ? '' : 's'
        } no histórico. Exclua as reservas primeiro ou mantenha o cadastro.`,
      );
    }

    await this.prisma.withTenant(tenantId, (tx) => tx.guest.delete({ where: { id } }));
    return { ok: true };
  }
}
