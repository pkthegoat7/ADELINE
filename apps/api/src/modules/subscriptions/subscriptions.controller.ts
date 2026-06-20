import { Body, Controller, ForbiddenException, Get, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CurrentUser, type AuthContext } from '../../common/decorators/tenant.decorator';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/public.decorator';
import { SubscriptionsService } from './subscriptions.service';

const ActivateSchema = z.object({
  preapprovalId: z.string().min(1, 'ID da assinatura obrigatório'),
  name: z.string().min(1, 'Nome completo obrigatório'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  propertyName: z.string().min(1, 'Nome da pousada obrigatório'),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'É necessário aceitar os Termos de Uso e a Política de Privacidade.' }),
  }),
});

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Get('plan')
  async plan() {
    return this.subscriptions.getPublicPlan();
  }

  @Public()
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post('create-preapproval')
  async createPreapproval() {
    const backUrl = `${process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'}/checkout/sucesso`;
    return this.subscriptions.createPreapproval(backUrl);
  }

  @Public()
  @Post('webhook')
  async webhook(@Body() body: unknown) {
    const parsed = body as { type?: string; data?: { id?: string } };
    const type = parsed?.type ?? '';
    const dataId = parsed?.data?.id ?? '';
    if (type && dataId) {
      await this.subscriptions.handleWebhook(type, dataId);
    }
    return { ok: true };
  }

  @Public()
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post('activate')
  async activate(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const data = ActivateSchema.parse(body);
    const { token } = await this.subscriptions.activate({ ...data, consentIp: req.ip });
    res.header('Set-Cookie', this.auth.sessionCookie(token));
    return { ok: true, redirect: '/dashboard' };
  }

  @Get('status')
  async status(@CurrentUser() user: AuthContext) {
    const sub = await this.subscriptions.getStatus(user.tenantId);
    return sub ?? { status: null };
  }

  /** O dono cancela a própria assinatura: para de cobrar, mantém acesso até o fim do período pago. */
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post('cancel')
  async cancel(@CurrentUser() user: AuthContext) {
    if (user.role !== 'owner') {
      throw new ForbiddenException('Apenas o dono da pousada pode cancelar a assinatura.');
    }
    return this.subscriptions.cancelOwnSubscription(user.tenantId);
  }
}
