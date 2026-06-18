import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequireCapability } from '../../common/require-capability.decorator';
import { ReservationsService } from './reservations.service';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD');

const CreateSchema = z
  .object({
    propertyId: z.string().uuid(),
    guestId: z.string().uuid(),
    roomId: z.string().uuid(),
    channel: z
      .enum(['internal', 'direct', 'airbnb', 'booking', 'expedia', 'vrbo', 'despegar', 'walk_in'])
      .default('direct'),
    channelReservationId: z.string().optional(),
    checkIn: dateString,
    checkOut: dateString,
    adults: z.number().int().positive().default(1),
    children: z.number().int().nonnegative().default(0),
    totalAmount: z.number().positive(),
    commissionAmount: z.number().nonnegative().optional(),
    notes: z.string().optional(),
    specialRequests: z.string().optional(),
    source: z.string().optional(),
  })
  .refine((d) => d.checkOut > d.checkIn, {
    message: 'A data de check-out precisa ser depois do check-in.',
    path: ['checkOut'],
  });

@ApiTags('reservations')
@ApiBearerAuth()
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly service: ReservationsService) {}

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query('propertyId') propertyId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.list(tenantId, { propertyId, from, to });
  }

  @Get(':id')
  getOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.getOne(tenantId, id);
  }

  @Post()
  @RequireCapability('reservation:write')
  create(@TenantId() tenantId: string, @Body() body: unknown) {
    const data = CreateSchema.parse(body);
    return this.service.create({ tenantId, ...data });
  }

  @Put(':id')
  @RequireCapability('reservation:write')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: unknown) {
    const data = CreateSchema.parse(body);
    return this.service.update(tenantId, id, data);
  }

  @Post(':id/cancel')
  @RequireCapability('reservation:cancel')
  cancel(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.service.cancel(tenantId, id, body.reason);
  }

  @Post(':id/check-in')
  @RequireCapability('reservation:checkin')
  checkIn(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.checkIn(tenantId, id);
  }

  @Post(':id/check-out')
  @RequireCapability('reservation:checkin')
  checkOut(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.checkOut(tenantId, id);
  }

  /** Exclusão definitiva (some do histórico). Libera o calendário antes. */
  @Delete(':id')
  @RequireCapability('reservation:delete')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.remove(tenantId, id);
  }
}
