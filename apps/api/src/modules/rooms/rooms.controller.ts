import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
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
  createType(@TenantId() tenantId: string, @Body() body: unknown) {
    const data = CreateRoomTypeSchema.parse(body);
    return this.prisma.withTenant(tenantId, (tx) => tx.roomType.create({ data }));
  }

  @Put('room-types/:id')
  updateType(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: unknown) {
    const data = UpdateRoomTypeSchema.parse(body);
    return this.prisma.withTenant(tenantId, (tx) => tx.roomType.update({ where: { id }, data }));
  }

  /** Soft delete do tipo: bloqueia se houver quartos ativos vinculados. */
  @Delete('room-types/:id')
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
  createRoom(@TenantId() tenantId: string, @Body() body: unknown) {
    const data = CreateRoomSchema.parse(body);
    return this.prisma.withTenant(tenantId, (tx) => tx.room.create({ data, include: { roomType: true } }));
  }

  @Put('rooms/:id')
  updateRoom(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: unknown) {
    const data = UpdateRoomSchema.parse(body);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.room.update({ where: { id }, data, include: { roomType: true } }),
    );
  }

  @Put('rooms/:id/status')
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
}
