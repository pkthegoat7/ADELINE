import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PaymentMethod } from '@adelina/db';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequireCapability } from '../../common/require-capability.decorator';
import { Public } from '../auth/public.decorator';
import { PaymentsService } from './payments.service';

const CreateLinkSchema = z.object({
  amount: z.number().positive('Valor deve ser maior que zero.'),
  description: z.string().max(120).optional(),
  sendWhatsapp: z.boolean().optional(),
});

const CheckoutSchema = z.object({
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Aceite os termos.' }) }),
  acceptLgpd: z.literal(true, { errorMap: () => ({ message: 'Aceite o termo de LGPD.' }) }),
});

const RecordReceiptSchema = z.object({
  amount: z.number().positive('Valor deve ser maior que zero.'),
  method: z.nativeEnum(PaymentMethod),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Data inválida.').optional(),
  note: z.string().max(200).optional(),
});

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @ApiBearerAuth()
  @RequireCapability('payment:link')
  @Throttle({ strict: { limit: 20, ttl: 60_000 } })
  @Post('reservations/:id/links')
  async createLink(
    @TenantId() tenantId: string,
    @Param('id') reservationId: string,
    @Body() body: unknown,
  ) {
    const data = CreateLinkSchema.parse(body);
    return this.payments.createLink(tenantId, reservationId, data);
  }

  @ApiBearerAuth()
  @RequireCapability('payment:record')
  @Post('reservations/:id/receipts')
  async recordReceipt(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.payments.recordReceipt(tenantId, id, RecordReceiptSchema.parse(body));
  }

  @Public()
  @Get('pay/:token')
  async getPublic(@Param('token') token: string) {
    return this.payments.getPublic(token);
  }

  @Public()
  @Throttle({ strict: { limit: 10, ttl: 60_000 } })
  @Post('pay/:token/checkout')
  async checkout(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    const data = CheckoutSchema.parse(body);
    return this.payments.checkout(token, { ...data, ip: req.ip });
  }

  @Public()
  @Post('pay/webhook')
  async webhook(@Body() body: unknown, @Req() req: FastifyRequest) {
    const parsed = body as { type?: string; data?: { id?: string } };
    const query = req.query as { type?: string; 'data.id'?: string };
    const type = parsed?.type ?? query?.type;
    const dataId = parsed?.data?.id ?? query?.['data.id'];
    if (type && dataId) {
      await this.payments.handleWebhook(type, String(dataId), {
        signature: req.headers['x-signature'] as string | undefined,
        requestId: req.headers['x-request-id'] as string | undefined,
      });
    }
    return { ok: true };
  }
}
