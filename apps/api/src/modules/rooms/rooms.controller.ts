import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequireCapability } from '../../common/require-capability.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

const CreateRoomTypeSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  capacity: z.number().int().positive().default(2),
  beds: z.number().int().positive().default(1),
  basePrice: z.number().positive(),
  description: z.string().optional(),
});

const UpdateRoomTypeSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  capacity: z.number().int().positive().optional(),
  beds: z.number().int().positive().optional(),
  basePrice: z.number().positive().optional(),
  description: z.string().optional(),
  active: z.boolean().optional(),
});

const CreateRoomSchema = z.object({
  propertyId: z.string().uuid(),
  roomTypeId: z.string().uuid(),
  code: z.string().min(1),
  floor: z.number().int().optional(),
});

const UpdateRoomSchema = z.object({
  roomTypeId: z.string().uuid().optional(),
  code: z.string().min(1).optional(),
  floor: z.number().int().nullable().optional(),
  active: z.boolean().optional(),
});

@ApiTags('rooms')
@ApiBearerAuth()
@Controller()
export class RoomsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('room-types')
  listTypes(@TenantId() tenantId: string, @Query('propertyId') propertyId?: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.roomType.findMany({
        where: propertyId ? { propertyId } : undefined,
        orderBy: { name: 'asc' },
      }),
    );
  }

  @Post('room-types')
  @RequireCapability('room:manage')
  createType(@TenantId() tenantId: string, @Body() body: unknown) {
    const data = CreateRoomTypeSchema.parse(body);
    return this.prisma.withTenant(tenantId, (tx) => tx.roomType.create({ data }));
  }

  @Put('room-types/:id')
  @RequireCapability('room:manage')
  updateType(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: unknown) {
    const data = UpdateRoomTypeSchema.parse(body);
    return this.prisma.withTenant(tenantId, (tx) => tx.roomType.update({ where: { id }, data }));
  }

  /** Soft delete do tipo: bloqueia se houver quartos ativos vinculados. */
  @Delete('room-types/:id')
  @RequireCapability('room:manage')
  async deactivateType(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const rooms = await tx.room.count({ where: { roomTypeId: id, active: true } });
      if (rooms > 0) {
        throw new BadRequestException(
          `Tipo possui ${rooms} quarto(s) ativo(s). Desative os quartos ou troque o tipo deles antes.`,
        );
      }
      return tx.roomType.update({ where: { id }, data: { active: false } });
    });
  }

  @Get('rooms')
  listRooms(@TenantId() tenantId: string, @Query('propertyId') propertyId?: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.room.findMany({
        where: propertyId ? { propertyId } : undefined,
        include: { roomType: true },
        orderBy: [{ floor: 'asc' }, { code: 'asc' }],
      }),
    );
  }

  @Post('rooms')
  @RequireCapability('room:manage')
  createRoom(@TenantId() tenantId: string, @Body() body: unknown) {
    const data = CreateRoomSchema.parse(body);
    return this.prisma.withTenant(tenantId, (tx) => tx.room.create({ data, include: { roomType: true } }));
  }

  @Put('rooms/:id')
  @RequireCapability('room:manage')
  updateRoom(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: unknown) {
    const data = UpdateRoomSchema.parse(body);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.room.update({ where: { id }, data, include: { roomType: true } }),
    );
  }

  @Put('rooms/:id/status')
  @RequireCapability('room:status')
  updateStatus(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: { status: 'clean' | 'dirty' | 'inspected' | 'maintenance' | 'out_of_order' },
  ) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.room.update({ where: { id }, data: { status: body.status } }),
    );
  }

  /** Soft delete: marca quarto como inativo. Bloqueia se houver reserva ativa. */
  @Delete('rooms/:id')
  @RequireCapability('room:manage')
  async deactivateRoom(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const activeReservations = await tx.reservationRoom.count({
        where: {
          roomId: id,
          reservation: {
            status: { in: ['pending', 'confirmed', 'checked_in'] },
            checkOut: { gt: today },
          },
        },
      });
      if (activeReservations > 0) {
        throw new BadRequestException(
          `Quarto possui ${activeReservations} reserva(s) ativa(s) ou futura(s). Cancele-as antes de desativar.`,
        );
      }
      return tx.room.update({ where: { id }, data: { active: false }, include: { roomType: true } });
    });
  }

  /**
   * Hard delete: remove o quarto definitivamente. Só permitido se o quarto
   * já estiver desativado e não houver vínculos de reserva (histórico).
   * Apaga o calendar de disponibilidade vinculado.
   */
  @Delete('rooms/:id/permanent')
  @RequireCapability('room:manage')
  async deleteRoomPermanent(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const room = await tx.room.findUnique({ where: { id } });
      if (!room) {
        throw new BadRequestException('Quarto não encontrado.');
      }
      if (room.active) {
        throw new BadRequestException(
          'Quarto ainda está ativo. Desative-o antes de excluir definitivamente.',
        );
      }
      const reservationsCount = await tx.reservationRoom.count({ where: { roomId: id } });
      if (reservationsCount > 0) {
        throw new BadRequestException(
          `Quarto tem ${reservationsCount} reserva(s) no histórico. Não dá pra excluir sem perder esse registro — mantenha-o desativado.`,
        );
      }
      // Limpa disponibilidade e remove o quarto.
      await tx.availabilityCalendar.deleteMany({ where: { roomId: id } });
      await tx.room.delete({ where: { id } });
      return { ok: true };
    });
  }
}
