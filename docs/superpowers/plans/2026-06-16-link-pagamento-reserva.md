# Link de Pagamento da Reserva — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pousada gera um link de pagamento de uma reserva; o hóspede vê o resumo, aceita Termos+LGPD e paga via Mercado Pago Checkout Pro.

**Architecture:** Novo módulo `payments` na API espelhando o padrão público-com-token do `guest-links`. Novos models `PaymentLink` e `TenantSetting` (config por pousada). Página pública `/pagamento/[token]` no web. Pagamento único via MP `Preference` reusando o `mp_access_token` do `system_settings`. Webhook liquida em `Payment` e atualiza `Reservation.paymentStatus`.

**Tech Stack:** NestJS, Prisma, Zod, mercadopago SDK, Next.js 15, TanStack Query, Tailwind, date-fns

> **Verificação:** o projeto não tem testes unitários (só `pnpm typecheck`). Cada task é verificada por typecheck + teste manual no fim. Não criar infra de testes nova.
>
> **Migração:** modelos anteriores foram aplicados em prod via `prisma db push` (ver project_adelina memory). Estes novos models seguem o mesmo caminho: `pnpm db:push` em prod no deploy, NÃO `migrate deploy`.

---

## File Structure

```
packages/db/prisma/schema.prisma                              — MOD: enum PaymentLinkStatus, models PaymentLink + TenantSetting, type payment_link em MessageTemplateType, relações
apps/api/src/common/tenant-settings.service.ts                — NEW: leitura/escrita de config por pousada + textos-padrão
apps/api/src/modules/payments/payments.service.ts             — NEW: criar link, resumo público, checkout (MP Preference + consentimento), webhook
apps/api/src/modules/payments/payments.controller.ts          — NEW: 4 rotas (1 auth, 3 públicas)
apps/api/src/modules/payments/payments.module.ts              — NEW: módulo
apps/api/src/modules/settings/tenant-settings.controller.ts   — NEW: GET/PUT config da pousada (termos + toggle)
apps/api/src/app.module.ts                                    — MOD: importa PaymentsModule + SettingsModule
apps/web/src/app/pagamento/[token]/page.tsx                   — NEW: página pública de pagamento
apps/web/src/app/(dashboard)/reservations/page.tsx            — MOD: ação "Gerar link de pagamento"
apps/web/src/app/(dashboard)/settings/page.tsx                — MOD: seção "Pagamentos" (termos + toggle)
```

---

## Task 1: Schema — PaymentLink, TenantSetting, enum, relações

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Adicionar o enum `PaymentLinkStatus`**

Após o enum `PaymentStatus`, adicione:
```prisma
enum PaymentLinkStatus {
  pending
  paid
  expired
  cancelled
}
```

- [ ] **Step 2: Adicionar os models `PaymentLink` e `TenantSetting`**

> Nota: a mensagem pronta do link é gerada no `PaymentsService` com os dados da reserva (Task 3); não usamos `MessageTemplate` para isso, então NÃO altere o enum `MessageTemplateType`.

Após o model `Payment` (fim do bloco `}`), adicione:
```prisma
model PaymentLink {
  id              String            @id @default(uuid()) @db.Uuid
  tenantId        String            @map("tenant_id") @db.Uuid
  reservationId   String            @map("reservation_id") @db.Uuid
  token           String            @unique
  amount          Decimal           @db.Decimal(10, 2)
  description     String?
  status          PaymentLinkStatus @default(pending)
  mpPreferenceId  String?           @map("mp_preference_id")
  mpPaymentId     String?           @map("mp_payment_id")
  termsAcceptedAt DateTime?         @map("terms_accepted_at")
  lgpdAcceptedAt  DateTime?         @map("lgpd_accepted_at")
  acceptedIp      String?           @map("accepted_ip")
  termsSnapshot   String?           @db.Text @map("terms_snapshot")
  expiresAt       DateTime          @map("expires_at")
  paidAt          DateTime?         @map("paid_at")
  createdAt       DateTime          @default(now()) @map("created_at")
  updatedAt       DateTime          @updatedAt @map("updated_at")

  tenant      Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  reservation Reservation @relation(fields: [reservationId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([reservationId])
  @@map("payment_links")
}

model TenantSetting {
  id        String   @id @default(uuid()) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  key       String
  value     String   @db.Text
  updatedAt DateTime @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, key])
  @@map("tenant_settings")
}
```

- [ ] **Step 3: Adicionar as relações inversas**

No model `Reservation`, junto das outras relações (ex: após `reminders`), adicione:
```prisma
  paymentLinks      PaymentLink[]
```
No model `Tenant`, junto das relações, adicione:
```prisma
  paymentLinks   PaymentLink[]
  settings       TenantSetting[]
```

- [ ] **Step 4: Gerar client e aplicar no banco (dev)**

```bash
cd /root/adelina/ADELINE
pnpm db:generate
pnpm db:push
```
Expected: client `@adelina/db` regenerado com os tipos `PaymentLink`, `TenantSetting`, `PaymentLinkStatus`; tabelas criadas.

- [ ] **Step 5: Commit**

```bash
cd /root/adelina/ADELINE
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): models PaymentLink + TenantSetting + enum PaymentLinkStatus"
```

---

## Task 2: TenantSettingsService + textos-padrão de termos

**Files:**
- Create: `apps/api/src/common/tenant-settings.service.ts`

- [ ] **Step 1: Criar o service**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

export const DEFAULT_TERMS_OF_SERVICE =
  'Ao prosseguir com o pagamento, você confirma a reserva e concorda com as ' +
  'políticas de hospedagem, check-in, check-out e cancelamento informadas pela ' +
  'pousada. O pagamento é processado de forma segura pelo Mercado Pago.';

export const DEFAULT_LGPD_CONSENT =
  'Autorizo o tratamento dos meus dados pessoais para fins de processamento do ' +
  'pagamento e gestão da minha reserva, conforme a Lei Geral de Proteção de Dados ' +
  '(LGPD, Lei nº 13.709/2018). Os dados não serão compartilhados para finalidades ' +
  'diversas sem o meu consentimento.';

export const TENANT_SETTING_KEYS = [
  'payment_terms_of_service',
  'payment_lgpd_consent',
  'payment_link_auto_whatsapp',
] as const;

export type TenantSettingKey = (typeof TENANT_SETTING_KEYS)[number];

@Injectable()
export class TenantSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Retorna todas as settings da pousada como mapa, com defaults aplicados. */
  async getAll(tenantId: string): Promise<Record<TenantSettingKey, string>> {
    const rows = await this.prisma.tenantSetting.findMany({ where: { tenantId } });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      payment_terms_of_service:
        map.get('payment_terms_of_service') || DEFAULT_TERMS_OF_SERVICE,
      payment_lgpd_consent: map.get('payment_lgpd_consent') || DEFAULT_LGPD_CONSENT,
      payment_link_auto_whatsapp: map.get('payment_link_auto_whatsapp') || 'false',
    };
  }

  async get(tenantId: string, key: TenantSettingKey): Promise<string> {
    const all = await this.getAll(tenantId);
    return all[key];
  }

  async set(tenantId: string, key: TenantSettingKey, value: string): Promise<void> {
    await this.prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, value },
      update: { value },
    });
  }
}
```

- [ ] **Step 2: Verificar typecheck**

```bash
cd /root/adelina/ADELINE && pnpm --filter @adelina/api exec tsc --noEmit 2>&1 | grep -E "tenant-settings" || echo "ok (sem erros no arquivo novo)"
```
Expected: nenhum erro em `tenant-settings.service.ts`.

- [ ] **Step 3: Commit**

```bash
cd /root/adelina/ADELINE
git add apps/api/src/common/tenant-settings.service.ts
git commit -m "feat(api): TenantSettingsService com textos-padrão de termos/LGPD"
```

---

## Task 3: PaymentsService — criar link, resumo, checkout, webhook

**Files:**
- Create: `apps/api/src/modules/payments/payments.service.ts`

- [ ] **Step 1: Criar o service**

```typescript
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MercadoPagoConfig, Payment as MpPayment, Preference } from 'mercadopago';
import { randomBytes } from 'crypto';
import { differenceInCalendarDays, format } from 'date-fns';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { publicWebUrl } from '../../common/public-url';
import { WhatsappService } from '../whatsapp/whatsapp.service';

const LINK_TTL_DAYS = 7;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: TenantSettingsService,
    private readonly whatsapp: WhatsappService,
  ) {}

  private async mpClient(): Promise<MercadoPagoConfig> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'mp_access_token' },
    });
    const token = setting?.value || process.env.MP_ACCESS_TOKEN;
    if (!token) {
      throw new BadRequestException(
        'Mercado Pago não configurado. Peça ao administrador para configurar o token.',
      );
    }
    return new MercadoPagoConfig({ accessToken: token });
  }

  /** Cria link de pagamento para uma reserva e (opcionalmente) envia por WhatsApp. */
  async createLink(
    tenantId: string,
    reservationId: string,
    input: { amount: number; description?: string; sendWhatsapp?: boolean },
  ): Promise<{ url: string; message: string; paymentLinkId: string; sentViaWhatsapp: boolean }> {
    const reservation = await this.prisma.withTenant(tenantId, (tx) =>
      tx.reservation.findUniqueOrThrow({
        where: { id: reservationId },
        include: { guest: true, property: true },
      }),
    );
    if (reservation.status === 'cancelled') {
      throw new BadRequestException('Não é possível gerar link para reserva cancelada.');
    }

    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000);

    const link = await this.prisma.withTenant(tenantId, (tx) =>
      tx.paymentLink.create({
        data: {
          tenantId,
          reservationId,
          token,
          amount: input.amount,
          description: input.description,
          expiresAt,
        },
      }),
    );

    const url = `${publicWebUrl()}/pagamento/${link.token}`;
    const message =
      `Olá, ${reservation.guest.fullName}! 👋\n\n` +
      `Segue o link para o pagamento da sua reserva na ${reservation.property.name} ` +
      `(check-in ${format(reservation.checkIn, 'dd/MM/yyyy')}, ` +
      `check-out ${format(reservation.checkOut, 'dd/MM/yyyy')}).\n\n` +
      `💳 Valor: R$ ${input.amount.toFixed(2)}\n` +
      `🔗 ${url}\n\n` +
      `O pagamento é processado com segurança pelo Mercado Pago.`;

    let sentViaWhatsapp = false;
    const autoSend =
      input.sendWhatsapp ??
      (await this.settings.get(tenantId, 'payment_link_auto_whatsapp')) === 'true';
    if (autoSend && reservation.guest.phone) {
      try {
        await this.whatsapp.sendText(tenantId, reservation.guest.phone, message);
        sentViaWhatsapp = true;
      } catch (err) {
        this.logger.warn(`Falha ao enviar link por WhatsApp: ${String(err)}`);
      }
    }

    return { url, message, paymentLinkId: link.id, sentViaWhatsapp };
  }

  /** Dados públicos do link (sem auth). */
  async getPublic(token: string) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { token },
      include: {
        reservation: {
          include: { guest: true, property: true, rooms: { include: { room: true } } },
        },
      },
    });
    if (!link) throw new NotFoundException('Link não encontrado.');

    const expired = link.status === 'pending' && link.expiresAt < new Date();
    const status = expired ? 'expired' : link.status;
    const terms = await this.settings.getAll(link.tenantId);
    const r = link.reservation;

    return {
      status,
      amount: Number(link.amount),
      description: link.description,
      property: r.property.name,
      guestName: r.guest.fullName,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      nights: differenceInCalendarDays(r.checkOut, r.checkIn),
      rooms: r.rooms.map((rr) => rr.room.name),
      termsOfService: terms.payment_terms_of_service,
      lgpdConsent: terms.payment_lgpd_consent,
    };
  }

  /** Registra consentimento e cria a Preference no MP; devolve o init_point. */
  async checkout(
    token: string,
    input: { acceptTerms: boolean; acceptLgpd: boolean; ip: string },
  ): Promise<{ initPoint: string }> {
    if (!input.acceptTerms || !input.acceptLgpd) {
      throw new BadRequestException('É necessário aceitar os termos para prosseguir.');
    }
    const link = await this.prisma.paymentLink.findUnique({
      where: { token },
      include: { reservation: { include: { property: true } } },
    });
    if (!link) throw new NotFoundException('Link não encontrado.');
    if (link.status === 'paid') throw new BadRequestException('Este link já foi pago.');
    if (link.status === 'cancelled') throw new BadRequestException('Este link foi cancelado.');
    if (link.expiresAt < new Date()) throw new BadRequestException('Este link expirou.');

    const terms = await this.settings.getAll(link.tenantId);
    const now = new Date();
    await this.prisma.paymentLink.update({
      where: { id: link.id },
      data: {
        termsAcceptedAt: now,
        lgpdAcceptedAt: now,
        acceptedIp: input.ip,
        termsSnapshot: `${terms.payment_terms_of_service}\n\n---\n\n${terms.payment_lgpd_consent}`,
      },
    });

    const preference = new Preference(await this.mpClient());
    const apiUrl = process.env.PUBLIC_API_URL ?? 'http://localhost:3333';
    const result = await preference.create({
      body: {
        items: [
          {
            id: link.id,
            title: link.description || `Reserva — ${link.reservation.property.name}`,
            quantity: 1,
            unit_price: Number(link.amount),
            currency_id: 'BRL',
          },
        ],
        external_reference: link.id,
        back_urls: { success: `${publicWebUrl()}/pagamento/${token}?status=sucesso` },
        auto_return: 'approved',
        notification_url: `${apiUrl}/api/payments/pay/webhook`,
      },
    });

    if (!result.init_point) {
      throw new BadRequestException('Mercado Pago não retornou URL de checkout.');
    }
    await this.prisma.paymentLink.update({
      where: { id: link.id },
      data: { mpPreferenceId: result.id },
    });
    return { initPoint: result.init_point };
  }

  /** Webhook do MP: liquida o pagamento. Idempotente por mpPaymentId. */
  async handleWebhook(type: string, dataId: string): Promise<void> {
    if (type !== 'payment' || !dataId) return;

    const mpPayment = new MpPayment(await this.mpClient());
    const pay = await mpPayment.get({ id: dataId });
    if (pay.status !== 'approved') return;

    const linkId = pay.external_reference;
    if (!linkId) return;

    const link = await this.prisma.paymentLink.findUnique({ where: { id: linkId } });
    if (!link) {
      this.logger.warn(`Webhook para link inexistente ${linkId} — ignorando.`);
      return;
    }
    if (link.mpPaymentId === String(pay.id)) return; // idempotência

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentLink.update({
        where: { id: link.id },
        data: { status: 'paid', paidAt: new Date(), mpPaymentId: String(pay.id) },
      });
      await tx.payment.create({
        data: {
          reservationId: link.reservationId,
          amount: link.amount,
          method: 'link',
          gateway: 'mercadopago',
          gatewayTransactionId: String(pay.id),
          status: 'paid',
          paidAt: new Date(),
        },
      });
      const reservation = await tx.reservation.findUniqueOrThrow({
        where: { id: link.reservationId },
        include: { payments: { where: { status: 'paid' } } },
      });
      const totalPaid = reservation.payments.reduce((s, p) => s + Number(p.amount), 0);
      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          paymentStatus: totalPaid >= Number(reservation.totalAmount) ? 'paid' : 'partial',
        },
      });
    });

    this.logger.log(`PaymentLink ${link.id} pago (mp ${pay.id}).`);
  }
}
```

- [ ] **Step 2: Verificar typecheck**

```bash
cd /root/adelina/ADELINE && pnpm --filter @adelina/api exec tsc --noEmit 2>&1 | grep -E "payments.service" || echo "ok (sem erros no arquivo novo)"
```
Expected: nenhum erro em `payments.service.ts`. (Se o SDK não exportar `Payment`, ver Step 3.)

- [ ] **Step 3: Confirmar import do SDK**

O SDK `mercadopago` exporta `Payment` e `Preference`. Se o typecheck acusar que `Payment` não existe no import, rode `cd /root/adelina/ADELINE && node -e "console.log(Object.keys(require('mercadopago')))"` e ajuste o nome importado conforme a saída (esperado: inclui `Payment`, `Preference`, `MercadoPagoConfig`).

- [ ] **Step 4: Commit**

```bash
cd /root/adelina/ADELINE
git add apps/api/src/modules/payments/payments.service.ts
git commit -m "feat(api): PaymentsService (criar link, checkout MP Preference, webhook)"
```

---

## Task 4: PaymentsController + PaymentsModule + wire

**Files:**
- Create: `apps/api/src/modules/payments/payments.controller.ts`
- Create: `apps/api/src/modules/payments/payments.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Criar o controller**

```typescript
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
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

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @ApiBearerAuth()
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
  async webhook(@Body() body: unknown) {
    const parsed = body as { type?: string; data?: { id?: string } };
    if (parsed?.type && parsed?.data?.id) {
      await this.payments.handleWebhook(parsed.type, parsed.data.id);
    }
    return { ok: true };
  }
}
```

- [ ] **Step 2: Criar o module**

```typescript
import { Module } from '@nestjs/common';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [WhatsappModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, TenantSettingsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
```
> Se `WhatsappModule` não exportar `WhatsappService`, abra `apps/api/src/modules/whatsapp/whatsapp.module.ts` e confirme que `WhatsappService` está em `exports`. Se não estiver, adicione-o.

- [ ] **Step 3: Importar no AppModule**

Em `apps/api/src/app.module.ts`, adicione o import no topo:
```typescript
import { PaymentsModule } from './modules/payments/payments.module';
```
E adicione `PaymentsModule` ao array `imports`, após `SubscriptionsModule`:
```typescript
    SubscriptionsModule,
    PaymentsModule,
```

- [ ] **Step 4: Verificar typecheck + boot**

```bash
cd /root/adelina/ADELINE && pnpm --filter @adelina/api exec tsc --noEmit 2>&1 | grep -E "payments|app.module" || echo "ok"
```
Expected: nenhum erro nos arquivos do módulo.

- [ ] **Step 5: Commit**

```bash
cd /root/adelina/ADELINE
git add apps/api/src/modules/payments/ apps/api/src/app.module.ts
git commit -m "feat(api): PaymentsController + PaymentsModule + wire no AppModule"
```

---

## Task 5: TenantSettings controller (config da pousada)

**Files:**
- Create: `apps/api/src/modules/settings/tenant-settings.controller.ts`
- Create: `apps/api/src/modules/settings/settings.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Criar o controller**

```typescript
import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
import {
  TENANT_SETTING_KEYS,
  TenantSettingsService,
} from '../../common/tenant-settings.service';

const UpsertSchema = z.object({
  key: z.enum(TENANT_SETTING_KEYS),
  value: z.string().max(5000),
});

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class TenantSettingsController {
  constructor(private readonly settings: TenantSettingsService) {}

  @Get()
  async getAll(@TenantId() tenantId: string) {
    return this.settings.getAll(tenantId);
  }

  @Put()
  async upsert(@TenantId() tenantId: string, @Body() body: unknown) {
    const { key, value } = UpsertSchema.parse(body);
    await this.settings.set(tenantId, key, value);
    return { ok: true, key };
  }
}
```

- [ ] **Step 2: Criar o module**

```typescript
import { Module } from '@nestjs/common';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { TenantSettingsController } from './tenant-settings.controller';

@Module({
  controllers: [TenantSettingsController],
  providers: [TenantSettingsService],
})
export class SettingsModule {}
```

- [ ] **Step 3: Importar no AppModule**

Em `apps/api/src/app.module.ts`, adicione no topo:
```typescript
import { SettingsModule } from './modules/settings/settings.module';
```
E no array `imports`, após `PaymentsModule`:
```typescript
    PaymentsModule,
    SettingsModule,
```

- [ ] **Step 4: Verificar typecheck**

```bash
cd /root/adelina/ADELINE && pnpm --filter @adelina/api exec tsc --noEmit 2>&1 | grep -E "settings" || echo "ok"
```

- [ ] **Step 5: Commit**

```bash
cd /root/adelina/ADELINE
git add apps/api/src/modules/settings/ apps/api/src/app.module.ts
git commit -m "feat(api): endpoints de configuração por pousada (termos/LGPD/toggle)"
```

---

## Task 6: Página pública `/pagamento/[token]`

**Files:**
- Create: `apps/web/src/app/pagamento/[token]/page.tsx`

> Esta rota deve ser pública. O middleware (`apps/web/src/middleware.ts`) bloqueia rotas fora da whitelist; confirme que `/pagamento` está liberado. Se não estiver, adicione `pathname.startsWith('/pagamento')` à condição `isPublicForm` (mesmo padrão de `/cadastro` e `/checkout`). Faça isso como primeiro passo se necessário.

- [ ] **Step 1: (se necessário) Liberar `/pagamento` no middleware**

Abra `apps/web/src/middleware.ts`. Se a whitelist não incluir `/pagamento`, adicione na condição `isPublicForm`:
```typescript
    pathname.startsWith('/pagamento') ||
```

- [ ] **Step 2: Criar a página**

```tsx
'use client';

import { use, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AdelinaMark } from '@/components/brand/Logo';
import { CalendarRange, BedDouble, CheckCircle, Loader2, ShieldCheck } from 'lucide-react';

interface PublicLink {
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  amount: number;
  description: string | null;
  property: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: string[];
  termsOfService: string;
  lgpdConsent: string;
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function PagamentoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptLgpd, setAcceptLgpd] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pay', token],
    queryFn: () => api<PublicLink>(`/payments/pay/${token}`),
  });

  const checkout = useMutation({
    mutationFn: () =>
      api<{ initPoint: string }>(`/payments/pay/${token}/checkout`, {
        method: 'POST',
        body: JSON.stringify({ acceptTerms, acceptLgpd }),
      }),
    onSuccess: ({ initPoint }) => {
      window.location.href = initPoint;
    },
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-surface">
        <Loader2 className="w-6 h-6 animate-spin text-ink-muted" />
      </main>
    );
  }

  if (!data || data.status !== 'pending') {
    const msg =
      data?.status === 'paid'
        ? 'Este pagamento já foi concluído. Obrigado!'
        : data?.status === 'expired'
          ? 'Este link de pagamento expirou. Solicite um novo à pousada.'
          : data?.status === 'cancelled'
            ? 'Este link de pagamento foi cancelado.'
            : 'Link de pagamento não encontrado.';
    return (
      <main className="min-h-screen flex items-center justify-center bg-surface px-4">
        <div className="text-center max-w-sm">
          <AdelinaMark className="w-12 h-12 rounded-xl shadow-lg mx-auto mb-4" />
          <p className="text-ink-soft">{msg}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface px-4 py-10">
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-6">
          <AdelinaMark className="w-12 h-12 rounded-xl shadow-lg mx-auto mb-3" />
          <h1 className="font-display text-2xl font-bold text-ink">{data.property}</h1>
          <p className="text-ink-soft text-sm mt-1">Pagamento da reserva</p>
        </div>

        <div className="surface-card p-6 space-y-4">
          <div>
            <span className="text-xs text-ink-muted">Hóspede</span>
            <p className="text-ink font-medium">{data.guestName}</p>
          </div>

          <div className="flex items-start gap-2 text-sm">
            <CalendarRange className="w-4 h-4 text-brand-500 mt-0.5" />
            <span className="text-ink">
              {fmt(data.checkIn)} → {fmt(data.checkOut)}{' '}
              <span className="text-ink-muted">({data.nights} noite{data.nights > 1 ? 's' : ''})</span>
            </span>
          </div>

          {data.rooms.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <BedDouble className="w-4 h-4 text-brand-500 mt-0.5" />
              <span className="text-ink">{data.rooms.join(', ')}</span>
            </div>
          )}

          {data.description && (
            <p className="text-sm text-ink-soft border-t border-line pt-3">{data.description}</p>
          )}

          <div className="border-t border-line pt-4 flex items-baseline justify-between">
            <span className="text-ink-soft text-sm">Total a pagar</span>
            <span className="font-display text-3xl font-bold text-ink">
              R$ {data.amount.toFixed(2).replace('.', ',')}
            </span>
          </div>
        </div>

        <div className="surface-card p-5 mt-4 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-1 h-4 w-4 accent-brand-500"
            />
            <span className="text-ink-soft">
              Li e aceito os <strong className="text-ink">Termos de Uso e Serviço</strong>.
              <span className="block text-xs text-ink-muted mt-1">{data.termsOfService}</span>
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={acceptLgpd}
              onChange={(e) => setAcceptLgpd(e.target.checked)}
              className="mt-1 h-4 w-4 accent-brand-500"
            />
            <span className="text-ink-soft">
              Concordo com o tratamento dos meus dados conforme a <strong className="text-ink">LGPD</strong>.
              <span className="block text-xs text-ink-muted mt-1">{data.lgpdConsent}</span>
            </span>
          </label>
        </div>

        {error && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}

        <button
          onClick={() => {
            setError('');
            checkout.mutate();
          }}
          disabled={!acceptTerms || !acceptLgpd || checkout.isPending}
          className="btn-primary w-full px-7 py-3 text-sm mt-4 disabled:opacity-50"
        >
          {checkout.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Redirecionando…
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" /> Pagar agora
            </>
          )}
        </button>

        <p className="flex items-center justify-center gap-1.5 text-xs text-ink-muted mt-4">
          <ShieldCheck className="w-3.5 h-3.5" /> Pagamento seguro via Mercado Pago
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verificar typecheck**

```bash
cd /root/adelina/ADELINE && pnpm --filter @adelina/web exec tsc --noEmit 2>&1 | grep -E "pagamento" || echo "ok"
```
> Se `use(params)` acusar erro de tipo, confirme a versão do React; em Next 15 + React 19 o padrão é `params: Promise<...>` com `use()`. Se o projeto ainda usar params síncronos em outras páginas, siga o padrão das páginas vizinhas (`apps/web/src/app/cadastro/[token]/page.tsx`).

- [ ] **Step 4: Commit**

```bash
cd /root/adelina/ADELINE
git add "apps/web/src/app/pagamento/[token]/page.tsx" apps/web/src/middleware.ts
git commit -m "feat(web): página pública de pagamento da reserva com aceite de termos/LGPD"
```

---

## Task 7: Dashboard — ação "Gerar link de pagamento" na reserva

**Files:**
- Modify: `apps/web/src/app/(dashboard)/reservations/page.tsx`

> Antes de editar, leia o arquivo inteiro para seguir os padrões locais (como ele lista reservas, abre modais, usa `api`, `toast`, `useMutation`). O snippet abaixo é um componente isolado `PaymentLinkModal` que recebe `reservationId`, `reservationTotal` e `onClose`; integre-o seguindo a forma como os outros modais/ações dessa página são acionados (botão por linha de reserva).

- [ ] **Step 1: Ler o arquivo e identificar onde ficam as ações por reserva**

```bash
cd /root/adelina/ADELINE && sed -n '1,40p' "apps/web/src/app/(dashboard)/reservations/page.tsx"
```
Identifique: imports (`api`, `toast`, ícones lucide), como os modais existentes são abertos (estado tipo `const [modalReserva, setModalReserva] = useState<...>()`), e onde renderizar um botão de ação por reserva.

- [ ] **Step 2: Adicionar o componente `PaymentLinkModal` (no mesmo arquivo, ao final)**

```tsx
function PaymentLinkModal({
  reservationId,
  reservationTotal,
  onClose,
}: {
  reservationId: string;
  reservationTotal: number;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(String(reservationTotal));
  const [description, setDescription] = useState('');
  const [sendWhatsapp, setSendWhatsapp] = useState(true);
  const [result, setResult] = useState<{ url: string; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const gen = useMutation({
    mutationFn: () =>
      api<{ url: string; message: string; sentViaWhatsapp: boolean }>(
        `/payments/reservations/${reservationId}/links`,
        {
          method: 'POST',
          body: JSON.stringify({
            amount: Number(amount),
            description: description.trim() || undefined,
            sendWhatsapp,
          }),
        },
      ),
    onSuccess: (r) => {
      setResult({ url: r.url, message: r.message });
      toast.success(r.sentViaWhatsapp ? 'Link gerado e enviado por WhatsApp' : 'Link gerado');
    },
    onError: (err: Error) => toast.error('Erro ao gerar link', err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="surface-card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-bold text-ink mb-4">Gerar link de pagamento</h3>

        {!result ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Valor (R$)</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-base w-full"
              />
              <p className="text-xs text-ink-muted mt-1">
                Total da reserva: R$ {reservationTotal.toFixed(2)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Descrição (opcional)</label>
              <input
                type="text"
                maxLength={120}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Sinal 30%"
                className="input-base w-full"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={sendWhatsapp}
                onChange={(e) => setSendWhatsapp(e.target.checked)}
                className="h-4 w-4 accent-brand-500"
              />
              Enviar por WhatsApp automaticamente
            </label>
            <div className="flex gap-2 pt-2">
              <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm flex-1">
                Cancelar
              </button>
              <button
                onClick={() => gen.mutate()}
                disabled={!(Number(amount) > 0) || gen.isPending}
                className="btn-primary px-4 py-2 text-sm flex-1 disabled:opacity-50"
              >
                {gen.isPending ? 'Gerando…' : 'Gerar link'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Link</label>
              <input readOnly value={result.url} className="input-base w-full text-xs" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Mensagem pronta</label>
              <textarea
                readOnly
                value={result.message}
                rows={6}
                className="input-base w-full text-xs"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(result.message);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="btn-primary px-4 py-2 text-sm flex-1"
              >
                {copied ? 'Copiado!' : 'Copiar mensagem'}
              </button>
              <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm flex-1">
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Garantir os imports e acionar o modal**

Confirme que o arquivo importa `useState`, `useMutation`, `api`, `toast`. Adicione um estado `const [payModal, setPayModal] = useState<{ id: string; total: number } | null>(null);` no componente principal, um botão "Link de pagamento" na ação de cada reserva que faz `setPayModal({ id: reserva.id, total: Number(reserva.totalAmount) })`, e renderize ao final do JSX:
```tsx
{payModal && (
  <PaymentLinkModal
    reservationId={payModal.id}
    reservationTotal={payModal.total}
    onClose={() => setPayModal(null)}
  />
)}
```

- [ ] **Step 4: Verificar typecheck**

```bash
cd /root/adelina/ADELINE && pnpm --filter @adelina/web exec tsc --noEmit 2>&1 | grep -E "reservations" || echo "ok"
```

- [ ] **Step 5: Commit**

```bash
cd /root/adelina/ADELINE
git add "apps/web/src/app/(dashboard)/reservations/page.tsx"
git commit -m "feat(web): ação de gerar link de pagamento na reserva (com mensagem pronta)"
```

---

## Task 8: Configurações da pousada — seção "Pagamentos"

**Files:**
- Modify: `apps/web/src/app/(dashboard)/settings/page.tsx`

> Leia o arquivo primeiro para seguir os padrões (como ele lê/salva config, usa `useQuery`/`useMutation`, `toast`). Adicione uma seção que lê `GET /settings` e salva via `PUT /settings` (uma chave por vez).

- [ ] **Step 1: Ler o arquivo**

```bash
cd /root/adelina/ADELINE && sed -n '1,50p' "apps/web/src/app/(dashboard)/settings/page.tsx"
```

- [ ] **Step 2: Adicionar a seção `PagamentosSettings` (componente isolado, ao final do arquivo)**

```tsx
function PagamentosSettings() {
  const qc = useQueryClient();
  const [terms, setTerms] = useState('');
  const [lgpd, setLgpd] = useState('');
  const [autoWa, setAutoWa] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () =>
      api<{
        payment_terms_of_service: string;
        payment_lgpd_consent: string;
        payment_link_auto_whatsapp: string;
      }>('/settings'),
  });

  if (data && !loaded) {
    setTerms(data.payment_terms_of_service);
    setLgpd(data.payment_lgpd_consent);
    setAutoWa(data.payment_link_auto_whatsapp === 'true');
    setLoaded(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({ key: 'payment_terms_of_service', value: terms }),
      });
      await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({ key: 'payment_lgpd_consent', value: lgpd }),
      });
      await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({ key: 'payment_link_auto_whatsapp', value: String(autoWa) }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-settings'] });
      toast.success('Configurações de pagamento salvas');
    },
    onError: (err: Error) => toast.error('Erro ao salvar', err.message),
  });

  if (isLoading) return <div className="text-sm text-ink-muted">Carregando…</div>;

  return (
    <div className="surface-card p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-ink">Pagamentos</h3>
        <p className="text-xs text-ink-muted">Termos exibidos ao hóspede no link de pagamento</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-ink mb-1">Termos de Uso e Serviço</label>
        <textarea
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          rows={4}
          maxLength={5000}
          className="input-base w-full text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-ink mb-1">Termo de LGPD</label>
        <textarea
          value={lgpd}
          onChange={(e) => setLgpd(e.target.value)}
          rows={4}
          maxLength={5000}
          className="input-base w-full text-sm"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
        <input
          type="checkbox"
          checked={autoWa}
          onChange={(e) => setAutoWa(e.target.checked)}
          className="h-4 w-4 accent-brand-500"
        />
        Enviar link por WhatsApp automaticamente por padrão
      </label>

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
      >
        {save.isPending ? 'Salvando…' : 'Salvar'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Renderizar a seção + garantir imports**

Confirme imports de `useState`, `useQuery`, `useMutation`, `useQueryClient`, `api`, `toast`. Renderize `<PagamentosSettings />` junto das outras seções da página.

- [ ] **Step 4: Verificar typecheck**

```bash
cd /root/adelina/ADELINE && pnpm --filter @adelina/web exec tsc --noEmit 2>&1 | grep -E "settings" || echo "ok"
```

- [ ] **Step 5: Commit**

```bash
cd /root/adelina/ADELINE
git add "apps/web/src/app/(dashboard)/settings/page.tsx"
git commit -m "feat(web): seção de configuração de termos/LGPD e envio de pagamento"
```

---

## Task 9: Verificação final + Deploy

- [ ] **Step 1: Typecheck completo**

```bash
cd /root/adelina/ADELINE
pnpm --filter @adelina/api exec tsc --noEmit 2>&1 | grep -E "error TS" | grep -E "payments|settings|tenant-settings" || echo "API: sem erros nos arquivos novos"
pnpm --filter @adelina/web exec tsc --noEmit 2>&1 | grep -E "error TS" || echo "WEB: sem erros"
```
Expected: nenhum erro nos arquivos da feature.

- [ ] **Step 2: Aplicar schema em produção**

O `deploy.sh` builda e faz rollout, mas NÃO aplica schema. Antes/depois do deploy, aplicar o schema no Postgres de produção (containerizado). Conferir com o dono o comando exato; o padrão do projeto é `prisma db push` apontando para a `DATABASE_URL` de prod (ver project_adelina memory sobre divergência de histórico de migração).

- [ ] **Step 3: Deploy**

```bash
bash /root/adelina/deploy.sh
```
Expected: termina com `✓ deploy concluído`. Confirmar rollout (imagem nova) conforme gotcha do Swarm `:latest`.

- [ ] **Step 4: Configurar webhook no Mercado Pago**

No painel do MP (Suas integrações → Webhooks), cadastrar a URL `https://api.adelina.verdant.com.br/api/payments/pay/webhook` para o evento de pagamentos. (O `notification_url` na Preference já cobre por-cobrança, mas o webhook global garante.)

- [ ] **Step 5: Teste manual (sandbox)**

1. Como dono, abrir uma reserva → "Gerar link de pagamento" → valor + descrição → gerar.
2. Conferir mensagem pronta copiável (e WhatsApp se toggle on).
3. Abrir o link `/pagamento/:token` → ver resumo (hóspede, datas, noites, quarto, valor).
4. Tentar pagar sem marcar os dois aceites → botão desabilitado / 400.
5. Marcar os dois → pagar no checkout sandbox do MP.
6. Confirmar: `PaymentLink.status=paid`, `Payment` criado (method `link`), `Reservation.paymentStatus` atualizado.
7. Em Configurações → Pagamentos, editar os textos e confirmar que aparecem na página pública.

- [ ] **Step 6: Atualizar memória do projeto**

Atualizar `project_adelina.md`: registrar a feature de link de pagamento da reserva (módulo `payments`, models `PaymentLink`/`TenantSetting`, página pública `/pagamento/:token`, MP Checkout Pro, webhook em `/api/payments/pay/webhook`, consentimento LGPD gravado).
