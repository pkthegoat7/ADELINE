import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequireCapability } from '../../common/require-capability.decorator';
import { AvailabilityService } from './availability.service';

const BlockSchema = z.object({
  roomId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  note: z.string().optional(),
});

@ApiTags('availability')
@ApiBearerAuth()
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  /**
   * GET /api/availability/calendar?propertyId=...&from=2026-05-14&to=2026-06-14
   * Retorna grade de quartos × dias para a tela de timeline.
   */
  @Get('calendar')
  calendar(
    @TenantId() tenantId: string,
    @Query('propertyId') propertyId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.availability.getCalendar({ tenantId, propertyId, from, to });
  }

  @Post('block')
  @RequireCapability('calendar:block')
  block(@TenantId() tenantId: string, @Body() body: unknown) {
    const data = BlockSchema.parse(body);
    return this.availability.blockRoom({ tenantId, ...data });
  }
}
