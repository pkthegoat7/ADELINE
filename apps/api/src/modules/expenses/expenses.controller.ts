import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ExpenseCategory, ExpenseStatus } from '@adelina/db';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequireCapability } from '../../common/require-capability.decorator';
import { ExpensesService } from './expenses.service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Data inválida (use yyyy-mm-dd).');

const CreateSchema = z.object({
  propertyId: z.string().uuid().nullish(),
  category: z.nativeEnum(ExpenseCategory),
  description: z.string().min(1, 'Descrição obrigatória.').max(200),
  supplier: z.string().max(120).nullish(),
  amount: z.number().positive('Valor deve ser maior que zero.'),
  date: isoDate.optional(),
  status: z.nativeEnum(ExpenseStatus).optional(),
  dueDate: isoDate.nullish(),
  paidAt: isoDate.nullish(),
  receiptUrl: z.string().url('URL inválida.').max(500).nullish(),
});

const UpdateSchema = CreateSchema.partial();

const ListSchema = z.object({
  propertyId: z.string().uuid().optional(),
  category: z.nativeEnum(ExpenseCategory).optional(),
  status: z.nativeEnum(ExpenseStatus).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

@ApiTags('expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @RequireCapability('expense:manage')
  @Post()
  create(@TenantId() tenantId: string, @Body() body: unknown) {
    return this.expenses.create(tenantId, CreateSchema.parse(body));
  }

  @RequireCapability('expense:read')
  @Get()
  findAll(@TenantId() tenantId: string, @Query() query: unknown) {
    return this.expenses.findAll(tenantId, ListSchema.parse(query));
  }

  @RequireCapability('expense:read')
  @Get('summary')
  summary(@TenantId() tenantId: string, @Query() query: unknown) {
    return this.expenses.summary(tenantId, ListSchema.parse(query));
  }

  @RequireCapability('expense:read')
  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.expenses.findOne(tenantId, id);
  }

  @RequireCapability('expense:manage')
  @Patch(':id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.expenses.update(tenantId, id, UpdateSchema.parse(body));
  }

  @RequireCapability('expense:manage')
  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.expenses.remove(tenantId, id);
  }
}
