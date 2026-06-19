import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequireCapability } from '../../common/require-capability.decorator';
import { PayoutsService } from './payouts.service';

const competence = z.string().regex(/^\d{4}-\d{2}$/, 'Competência inválida (YYYY-MM).');

const PaySchema = z.object({
  paidAt: z.string().optional(),
  paymentMethod: z.string().max(120).nullish(),
  receiptUrl: z.string().url('URL inválida.').max(500).nullish(),
});

const EntrySchema = z.object({
  type: z.enum(['credit', 'debit']),
  description: z.string().min(1, 'Descrição obrigatória.').max(200),
  amount: z.number().positive('Valor deve ser maior que zero.'),
});

@ApiTags('payouts')
@ApiBearerAuth()
@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @RequireCapability('payout:read')
  @Get()
  list(@TenantId() tenantId: string, @Query('competence') comp: string) {
    return this.payouts.list(tenantId, competence.parse(comp));
  }

  // Rota fixa antes da paramétrica (entries/:id não colide com :propertyId por ser DELETE).
  @RequireCapability('payout:manage')
  @Delete('entries/:id')
  removeEntry(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.payouts.removeEntry(tenantId, id);
  }

  @RequireCapability('payout:read')
  @Get(':propertyId/:competence')
  detail(
    @TenantId() tenantId: string,
    @Param('propertyId') propertyId: string,
    @Param('competence') comp: string,
  ) {
    return this.payouts.compute(tenantId, propertyId, competence.parse(comp));
  }

  @RequireCapability('payout:manage')
  @Post(':propertyId/:competence/entries')
  addEntry(
    @TenantId() tenantId: string,
    @Param('propertyId') propertyId: string,
    @Param('competence') comp: string,
    @Body() body: unknown,
  ) {
    return this.payouts.addEntry(tenantId, propertyId, competence.parse(comp), EntrySchema.parse(body));
  }

  @RequireCapability('payout:manage')
  @Post(':propertyId/:competence/pay')
  pay(
    @TenantId() tenantId: string,
    @Param('propertyId') propertyId: string,
    @Param('competence') comp: string,
    @Body() body: unknown,
  ) {
    return this.payouts.pay(tenantId, propertyId, competence.parse(comp), PaySchema.parse(body));
  }

  @RequireCapability('payout:manage')
  @Post(':propertyId/:competence/reopen')
  reopen(
    @TenantId() tenantId: string,
    @Param('propertyId') propertyId: string,
    @Param('competence') comp: string,
  ) {
    return this.payouts.reopen(tenantId, propertyId, competence.parse(comp));
  }
}
