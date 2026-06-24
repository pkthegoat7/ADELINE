import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequireCapability } from '../../common/require-capability.decorator';
import { ReportsService } from './reports.service';
import { toCsv } from './reports.csv';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Data inválida (use yyyy-mm-dd).');
const PeriodSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  propertyId: z.string().uuid().optional(),
  format: z.enum(['json', 'csv']).optional(),
});
const DueSchema = z.object({ days: z.coerce.number().int().min(1).max(90).optional() });

function sendCsv(res: FastifyReply, filename: string, csv: string) {
  res.header('Content-Type', 'text/csv; charset=utf-8');
  res.header('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RequireCapability('expense:read')
  @Get('receipts')
  async receipts(@TenantId() tenantId: string, @Query() query: unknown, @Res({ passthrough: true }) res: FastifyReply) {
    const { format, ...f } = PeriodSchema.parse(query);
    const data = await this.reports.receipts(tenantId, f);
    if (format !== 'csv') return data;
    const csv = toCsv(
      ['Data', 'Hóspede', 'Reserva', 'Propriedade', 'Método', 'Valor'],
      data.rows.map((r) => [r.paidAt, r.guestName, r.reservationCode, r.propertyName, r.method, r.amount]),
    );
    return sendCsv(res, 'recebimentos.csv', csv);
  }

  @RequireCapability('expense:read')
  @Get('payments')
  async payments(@TenantId() tenantId: string, @Query() query: unknown, @Res({ passthrough: true }) res: FastifyReply) {
    const { format, ...f } = PeriodSchema.parse(query);
    const data = await this.reports.payments(tenantId, f);
    if (format !== 'csv') return data;
    const csv = toCsv(
      ['Data', 'Tipo', 'Descrição', 'Fornecedor/Proprietário', 'Categoria', 'Propriedade', 'Valor'],
      data.rows.map((r) => [r.paidAt, r.type, r.description, r.counterparty, r.category, r.propertyName, r.amount]),
    );
    return sendCsv(res, 'pagamentos.csv', csv);
  }

  @RequireCapability('expense:read')
  @Get('cashflow')
  async cashflow(@TenantId() tenantId: string, @Query() query: unknown, @Res({ passthrough: true }) res: FastifyReply) {
    const { format, ...f } = PeriodSchema.parse(query);
    const data = await this.reports.cashflow(tenantId, f);
    if (format !== 'csv') return data;
    const csv = toCsv(
      ['Data', 'Entradas', 'Saídas', 'Saldo'],
      data.daily.map((d) => [d.date, d.inflow, d.outflow, d.net]),
    );
    return sendCsv(res, 'caixa.csv', csv);
  }

  @RequireCapability('expense:read')
  @Get('payables-due')
  payablesDue(@TenantId() tenantId: string, @Query() query: unknown) {
    const { days } = DueSchema.parse(query);
    return this.reports.payablesDue(tenantId, days ?? 7);
  }
}
