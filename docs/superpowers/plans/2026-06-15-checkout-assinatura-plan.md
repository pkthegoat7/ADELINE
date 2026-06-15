# Checkout & Assinatura — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar assinatura recorrente via Mercado Pago Checkout Pro na landing page do Adelina PMS, com fluxo: pagar → cadastrar → acessar dashboard.

**Architecture:** Novo módulo `subscriptions` no backend (NestJS) com 4 endpoints. SDK `mercadopago` para criar preapproval e validar webhooks. Novo model `Subscription` no Prisma (1:1 com Tenant). Frontend: seção de preço na landing, página `/checkout/sucesso` com formulário de cadastro, paywall no dashboard layout.

**Tech Stack:** mercadopago SDK, NestJS, Prisma, Next.js 15, Tailwind, Zod

---

## File Structure

### New Files

```
packages/db/prisma/schema.prisma                          — ADD enum + model
apps/api/src/modules/subscriptions/subscriptions.module.ts — NestJS module
apps/api/src/modules/subscriptions/subscriptions.service.ts — MP integration + business logic
apps/api/src/modules/subscriptions/subscriptions.controller.ts — 4 endpoints
apps/web/src/app/checkout/sucesso/page.tsx                 — Post-payment signup form
apps/web/src/app/assinatura-necessaria/page.tsx            — Paywall page
```

### Modified Files

```
apps/api/src/app.module.ts                                 — Import SubscriptionsModule
apps/api/src/modules/auth/auth.guard.ts                    — Check subscription status
apps/api/package.json                                      — Add mercadopago dependency
apps/web/src/app/page.tsx                                  — Add pricing section + update CTA
stack.yml                                                  — Add MP_ACCESS_TOKEN env var
```

---

## Task 1: Prisma Schema — Subscription Model

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add SubscriptionStatus enum and Subscription model to schema.prisma**

Add after the existing `TenantStatus` enum:

```prisma
enum SubscriptionStatus {
  pending
  active
  past_due
  cancelled
}
```

Add after the `Tenant` model's closing brace:

```prisma
model Subscription {
  id                 String             @id @default(uuid()) @db.Uuid
  tenantId           String             @unique @map("tenant_id") @db.Uuid
  mpPreapprovalId    String             @unique @map("mp_preapproval_id")
  status             SubscriptionStatus @default(pending)
  planAmount         Decimal            @db.Decimal(10, 2) @map("plan_amount")
  currentPeriodStart DateTime           @map("current_period_start")
  currentPeriodEnd   DateTime           @map("current_period_end")
  mpPayerEmail       String             @map("mp_payer_email")
  createdAt          DateTime           @default(now()) @map("created_at")
  updatedAt          DateTime           @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("subscriptions")
}
```

Add the relation field inside the `Tenant` model (after the existing relations like `whatsappInstance`):

```prisma
  subscription Subscription?
```

- [ ] **Step 2: Generate Prisma client and create migration**

Run from monorepo root:

```bash
cd /root/adelina/ADELINE
pnpm db:generate
pnpm db:migrate
```

When prompted for migration name, enter: `add_subscription_model`

Expected: Migration created successfully, `@adelina/db` regenerated with `Subscription` type.

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat(db): add Subscription model and SubscriptionStatus enum"
```

---

## Task 2: Install mercadopago SDK

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install mercadopago in the API package**

```bash
cd /root/adelina/ADELINE
pnpm --filter @adelina/api add mercadopago
```

Expected: `mercadopago` added to `apps/api/package.json` dependencies.

- [ ] **Step 2: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add mercadopago SDK dependency"
```

---

## Task 3: Subscriptions Service

**Files:**
- Create: `apps/api/src/modules/subscriptions/subscriptions.service.ts`

- [ ] **Step 1: Create the subscriptions service**

```typescript
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import { randomUUID } from 'crypto';
import { addMonths } from 'date-fns';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

function mpClient(): MercadoPagoConfig {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error('MP_ACCESS_TOKEN não configurado');
  return new MercadoPagoConfig({ accessToken: token });
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async createPreapproval(backUrl: string): Promise<{ initPoint: string }> {
    const preapproval = new PreApproval(mpClient());
    const now = new Date();

    const result = await preapproval.create({
      body: {
        reason: 'Adelina PMS — Assinatura Mensal',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 249,
          currency_id: 'BRL',
          start_date: now.toISOString(),
          end_date: addMonths(now, 120).toISOString(),
        },
        back_url: backUrl,
        status: 'pending',
      },
    });

    if (!result.init_point) {
      throw new BadRequestException('Mercado Pago não retornou URL de checkout');
    }

    return { initPoint: result.init_point };
  }

  async handleWebhook(type: string, dataId: string): Promise<void> {
    if (type !== 'subscription_preapproval') return;

    const preapproval = new PreApproval(mpClient());
    const mp = await preapproval.get({ id: dataId });
    if (!mp.id) return;

    const sub = await this.prisma.subscription.findUnique({
      where: { mpPreapprovalId: mp.id },
    });
    if (!sub) {
      this.logger.log(`Webhook para preapproval ${mp.id} sem subscription local — ignorando`);
      return;
    }

    const statusMap: Record<string, 'active' | 'past_due' | 'cancelled' | 'pending'> = {
      authorized: 'active',
      paused: 'past_due',
      cancelled: 'cancelled',
      pending: 'pending',
    };
    const newStatus = statusMap[mp.status ?? ''] ?? sub.status;

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: newStatus,
        ...(newStatus === 'cancelled'
          ? {}
          : {
              currentPeriodStart: new Date(),
              currentPeriodEnd: addMonths(new Date(), 1),
            }),
      },
    });

    if (newStatus === 'cancelled' || newStatus === 'past_due') {
      await this.prisma.tenant.update({
        where: { id: sub.tenantId },
        data: { status: newStatus === 'cancelled' ? 'suspended' : 'active' },
      });
    }

    this.logger.log(`Subscription ${sub.id} atualizada: ${sub.status} → ${newStatus}`);
  }

  async activate(input: {
    preapprovalId: string;
    name: string;
    email: string;
    password: string;
    propertyName: string;
  }): Promise<{ token: string }> {
    const preapproval = new PreApproval(mpClient());
    const mp = await preapproval.get({ id: input.preapprovalId });

    if (!mp.id || mp.status !== 'authorized') {
      throw new BadRequestException(
        'Assinatura não confirmada. Aguarde a aprovação do pagamento ou tente novamente.',
      );
    }

    const existingEmail = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
    });
    if (existingEmail) {
      throw new BadRequestException('Já existe um login com esse email.');
    }

    const existingSub = await this.prisma.subscription.findUnique({
      where: { mpPreapprovalId: mp.id },
    });
    if (existingSub) {
      throw new BadRequestException('Essa assinatura já foi ativada.');
    }

    const slug = input.propertyName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);

    const existingSlug = await this.prisma.tenant.findUnique({ where: { slug } });
    const finalSlug = existingSlug ? `${slug}-${Date.now().toString(36)}` : slug;

    const passwordHash = await this.auth.hashPassword(input.password);
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.propertyName,
          slug: finalSlug,
          plan: 'starter',
          status: 'active',
        },
      });

      await tx.property.create({
        data: {
          tenantId: tenant.id,
          name: input.propertyName,
          slug: 'principal',
          country: 'BR',
          timezone: 'America/Sao_Paulo',
          currency: 'BRL',
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: input.email.toLowerCase().trim(),
          fullName: input.name,
          role: 'owner',
          active: true,
          passwordHash,
        },
      });

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          mpPreapprovalId: mp.id!,
          status: 'active',
          planAmount: 249,
          currentPeriodStart: now,
          currentPeriodEnd: addMonths(now, 1),
          mpPayerEmail: mp.payer_email ?? input.email,
        },
      });

      return { tenant, user };
    });

    const token = await this.auth.signToken(result.user.id, result.user.email);
    return { token };
  }

  async getStatus(tenantId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      select: {
        status: true,
        currentPeriodEnd: true,
        planAmount: true,
      },
    });
    return sub;
  }
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd /root/adelina/ADELINE && pnpm --filter @adelina/api exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors related to `subscriptions.service.ts`. (Some pre-existing warnings may appear.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/subscriptions/subscriptions.service.ts
git commit -m "feat(api): add SubscriptionsService with MP preapproval integration"
```

---

## Task 4: Subscriptions Controller

**Files:**
- Create: `apps/api/src/modules/subscriptions/subscriptions.controller.ts`

- [ ] **Step 1: Create the subscriptions controller**

```typescript
import { Body, Controller, Get, Post, Res } from '@nestjs/common';
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
});

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly auth: AuthService,
  ) {}

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
  async activate(@Body() body: unknown, @Res({ passthrough: true }) res: FastifyReply) {
    const data = ActivateSchema.parse(body);
    const { token } = await this.subscriptions.activate(data);
    res.header('Set-Cookie', this.auth.sessionCookie(token));
    return { ok: true, redirect: '/dashboard' };
  }

  @Get('status')
  async status(@CurrentUser() user: AuthContext) {
    const sub = await this.subscriptions.getStatus(user.tenantId);
    return sub ?? { status: null };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/subscriptions/subscriptions.controller.ts
git commit -m "feat(api): add SubscriptionsController with 4 endpoints"
```

---

## Task 5: Subscriptions Module + Wire to AppModule

**Files:**
- Create: `apps/api/src/modules/subscriptions/subscriptions.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the subscriptions module**

```typescript
import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
```

- [ ] **Step 2: Import SubscriptionsModule in AppModule**

In `apps/api/src/app.module.ts`, add the import at the top:

```typescript
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
```

Add `SubscriptionsModule` to the `imports` array, after `AdminModule`:

```typescript
    AdminModule,
    SubscriptionsModule,
```

- [ ] **Step 3: Verify compilation**

```bash
cd /root/adelina/ADELINE && pnpm --filter @adelina/api exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/subscriptions/subscriptions.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): wire SubscriptionsModule into AppModule"
```

---

## Task 6: Auth Guard — Subscription Check

**Files:**
- Modify: `apps/api/src/modules/auth/auth.guard.ts`

- [ ] **Step 1: Add subscription status check to AuthGuard**

In `auth.guard.ts`, after the existing user resolution (line ~56 where it checks `user.tenant.status`), add a subscription check. The guard already rejects suspended tenants. We need to also reject tenants with cancelled subscriptions, while allowing super admins through.

Find the line:
```typescript
    if (user.tenant.status !== 'active') {
      throw new UnauthorizedException('Pousada suspensa. Entre em contato com o suporte.');
    }
```

After it, add:

```typescript
    // Super admins bypass subscription check
    const superEmails = (process.env.SUPER_ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const isSuperAdmin = superEmails.includes(user.email.toLowerCase());

    if (!isSuperAdmin) {
      const subscription = await this.prisma.subscription.findUnique({
        where: { tenantId: user.tenantId },
        select: { status: true, currentPeriodEnd: true },
      });
      // Tenants without subscription that were created before the subscription system
      // are allowed through (grandfathered). Only block if subscription exists and is cancelled.
      if (subscription?.status === 'cancelled') {
        throw new UnauthorizedException('Assinatura cancelada. Renove para continuar usando o sistema.');
      }
    }
```

- [ ] **Step 2: Verify compilation**

```bash
cd /root/adelina/ADELINE && pnpm --filter @adelina/api exec tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/auth/auth.guard.ts
git commit -m "feat(api): add subscription status check to AuthGuard"
```

---

## Task 7: Landing Page — Pricing Section + Updated CTA

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Add pricing section and update the landing page**

In `apps/web/src/app/page.tsx`, make the following changes:

1. Add `'use client'` directive at the very top (needed for the onClick handler that calls the API).

2. Add imports — replace the existing import block:

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AdelinaMark } from '@/components/brand/Logo';
import { api } from '@/lib/api';
import {
  ArrowRight,
  BedDouble,
  CalendarRange,
  Check,
  ClipboardCheck,
  Plug,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';
```

3. Add the subscribe handler function inside the `Home` component, before the return:

```typescript
export default function Home() {
  const [loading, setLoading] = useState(false);

  async function handleSubscribe() {
    if (loading) return;
    setLoading(true);
    try {
      const { initPoint } = await api<{ initPoint: string }>('/subscriptions/create-preapproval', {
        method: 'POST',
      });
      window.location.href = initPoint;
    } catch {
      alert('Erro ao iniciar checkout. Tente novamente.');
      setLoading(false);
    }
  }

  return (
    // ... rest of JSX
```

4. Add "Preço" link to the navbar. Find the `hidden sm:flex` div with nav links and add:

```tsx
            <a href="#preco" className="hover:text-ink">Preço</a>
```

5. Add the Pricing section. Insert between the `como-funciona` section closing `</section>` and the CTA final `<section>`:

```tsx
      {/* ───────────────────────── Preço ───────────────────────── */}
      <section id="preco" className="relative max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <div className="eyebrow flex items-center justify-center gap-2 mb-3">
            <span className="ornament">◆</span>
            <span>Preço</span>
            <span className="ornament">◆</span>
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">
            Plano único, sem surpresas
          </h2>
          <p className="text-ink-soft mt-3 max-w-lg mx-auto">
            Tudo incluso num só valor. Sem limites de quartos, sem taxa por reserva.
          </p>
        </div>

        <div className="max-w-md mx-auto">
          <div className="surface-card glow-border p-8 text-center">
            <div className="font-display font-bold text-lg text-ink mb-1">Adelina PMS</div>
            <div className="flex items-baseline justify-center gap-1 mb-6">
              <span className="font-display text-5xl font-bold text-ink">R$ 249</span>
              <span className="text-ink-muted text-sm">/mês</span>
            </div>

            <ul className="space-y-3 text-left text-sm text-ink mb-8">
              {[
                'Calendário unificado',
                'Canais bidirecionais (Airbnb + Booking)',
                'Anti-overbooking automático',
                'Gestão de hóspedes',
                'Equipe ilimitada',
                'Suporte por WhatsApp',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="btn-primary w-full px-7 py-3 text-sm group disabled:opacity-60"
            >
              {loading ? 'Redirecionando…' : 'Assinar agora'}
              {!loading && (
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              )}
            </button>
          </div>
        </div>
      </section>
```

6. Update the CTA final section. Replace the existing CTA `<Link>` button:

```tsx
              <button
                onClick={handleSubscribe}
                disabled={loading}
                className="inline-flex items-center gap-2 px-7 py-3 rounded-lg bg-white text-brand-800 text-sm font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-60"
              >
                {loading ? 'Redirecionando…' : 'Assinar agora'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
```

7. Close the component with the extra closing brace for `useState`:

Make sure the component ends with `}` properly (the `return` statement is inside `Home` which now has `useState`).

- [ ] **Step 2: Verify typecheck**

```bash
cd /root/adelina/ADELINE && pnpm --filter @adelina/web exec tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): add pricing section and subscribe CTA to landing page"
```

---

## Task 8: Checkout Success Page

**Files:**
- Create: `apps/web/src/app/checkout/sucesso/page.tsx`

- [ ] **Step 1: Create the post-payment signup page**

```tsx
'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AdelinaMark } from '@/components/brand/Logo';
import { api } from '@/lib/api';
import { CheckCircle, ArrowRight, Loader2 } from 'lucide-react';
import { z } from 'zod';

const FormSchema = z.object({
  name: z.string().min(1, 'Nome completo obrigatório'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  confirmPassword: z.string(),
  propertyName: z.string().min(1, 'Nome da pousada obrigatório'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Senhas não coincidem',
  path: ['confirmPassword'],
});

export default function CheckoutSucesso() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const preapprovalId = searchParams.get('preapproval_id');

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    propertyName: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');

  if (!preapprovalId) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-surface px-4">
        <div className="text-center">
          <p className="text-ink-soft mb-4">Link inválido. Nenhuma assinatura encontrada.</p>
          <a href="/" className="btn-primary px-6 py-2.5 text-sm">
            Voltar para o início
          </a>
        </div>
      </main>
    );
  }

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
    setGlobalError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setGlobalError('');

    const result = FormSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0]?.toString();
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      await api('/subscriptions/activate', {
        method: 'POST',
        body: JSON.stringify({
          preapprovalId,
          name: form.name,
          email: form.email,
          password: form.password,
          propertyName: form.propertyName,
        }),
      });
      router.push('/dashboard');
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Erro ao ativar conta. Tente novamente.');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <AdelinaMark className="w-12 h-12 rounded-xl shadow-lg" />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-sm font-medium mb-3">
            <CheckCircle className="w-4 h-4" />
            Pagamento confirmado
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">Crie sua conta</h1>
          <p className="text-ink-soft text-sm mt-1">
            Preencha os dados abaixo para acessar o sistema.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="surface-card p-6 space-y-4">
          {globalError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
              {globalError}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-ink mb-1">
              Nome completo
            </label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="input-base w-full"
              placeholder="Seu nome"
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              className="input-base w-full"
              placeholder="seu@email.com"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => updateField('password', e.target.value)}
              className="input-base w-full"
              placeholder="Mínimo 8 caracteres"
            />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink mb-1">
              Confirmar senha
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={(e) => updateField('confirmPassword', e.target.value)}
              className="input-base w-full"
              placeholder="Repita a senha"
            />
            {errors.confirmPassword && (
              <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>
            )}
          </div>

          <div>
            <label htmlFor="propertyName" className="block text-sm font-medium text-ink mb-1">
              Nome da pousada
            </label>
            <input
              id="propertyName"
              type="text"
              value={form.propertyName}
              onChange={(e) => updateField('propertyName', e.target.value)}
              className="input-base w-full"
              placeholder="Ex: Pousada Sol Nascente"
            />
            {errors.propertyName && (
              <p className="text-red-500 text-xs mt-1">{errors.propertyName}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full px-7 py-3 text-sm group disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Criando sua conta…
              </>
            ) : (
              <>
                Acessar o sistema
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd /root/adelina/ADELINE && pnpm --filter @adelina/web exec tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/checkout/sucesso/page.tsx
git commit -m "feat(web): add post-payment signup page at /checkout/sucesso"
```

---

## Task 9: Paywall Page

**Files:**
- Create: `apps/web/src/app/assinatura-necessaria/page.tsx`

- [ ] **Step 1: Create the subscription-required page**

```tsx
'use client';

import { useState } from 'react';
import { AdelinaMark } from '@/components/brand/Logo';
import { api } from '@/lib/api';
import { ArrowRight, CreditCard, LogOut } from 'lucide-react';

export default function AssinaturaNecessaria() {
  const [loading, setLoading] = useState(false);

  async function handleResubscribe() {
    if (loading) return;
    setLoading(true);
    try {
      const { initPoint } = await api<{ initPoint: string }>('/subscriptions/create-preapproval', {
        method: 'POST',
      });
      window.location.href = initPoint;
    } catch {
      alert('Erro ao iniciar checkout. Tente novamente.');
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    window.location.href = '/';
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-6">
          <AdelinaMark className="w-12 h-12 rounded-xl shadow-lg" />
        </div>

        <h1 className="font-display text-2xl font-bold text-ink mb-2">
          Assinatura inativa
        </h1>
        <p className="text-ink-soft text-sm mb-8">
          Sua assinatura foi cancelada ou expirou. Renove para continuar usando o Adelina PMS.
        </p>

        <div className="space-y-3">
          <button
            onClick={handleResubscribe}
            disabled={loading}
            className="btn-primary w-full px-7 py-3 text-sm group disabled:opacity-60"
          >
            {loading ? (
              'Redirecionando…'
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                Reativar assinatura
              </>
            )}
          </button>

          <button
            onClick={handleLogout}
            className="btn-ghost w-full px-7 py-3 text-sm text-ink-muted hover:text-ink"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/assinatura-necessaria/page.tsx
git commit -m "feat(web): add paywall page at /assinatura-necessaria"
```

---

## Task 10: Environment Variables + Stack Config

**Files:**
- Modify: `/root/adelina/stack.yml`

- [ ] **Step 1: Add MP environment variables to the API service in stack.yml**

In `stack.yml`, inside the `api` service `environment` list, add after `GUEST_DOCS_DIR`:

```yaml
      - MP_ACCESS_TOKEN=${MP_ACCESS_TOKEN}
      - MP_WEBHOOK_SECRET=${MP_WEBHOOK_SECRET:-}
```

- [ ] **Step 2: Create .env.example entries**

If a `.env` or `.env.example` file exists at the monorepo root, add:

```env
# Mercado Pago
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=
```

If no `.env.example` exists, skip this step.

- [ ] **Step 3: Commit**

```bash
git add stack.yml
git commit -m "feat(infra): add Mercado Pago env vars to stack config"
```

---

## Task 11: Security Review + Final Verification

- [ ] **Step 1: Verify all files compile**

```bash
cd /root/adelina/ADELINE
pnpm --filter @adelina/api exec tsc --noEmit --pretty 2>&1 | tail -5
pnpm --filter @adelina/web exec tsc --noEmit --pretty 2>&1 | tail -5
```

Expected: No errors from the new files.

- [ ] **Step 2: Security checklist**

Manually verify:
- [ ] Webhook endpoint is `@Public()` — no auth needed (MP calls it)
- [ ] `activate` endpoint validates preapproval status via MP API before creating tenant (never trusts redirect query param alone)
- [ ] Email uniqueness checked before user creation
- [ ] Password hashed with bcrypt (via `auth.hashPassword`)
- [ ] All mutations in `activate` are wrapped in `$transaction`
- [ ] Rate limiting on `create-preapproval` and `activate` (strict: 5/min)
- [ ] Card data never touches our server (Checkout Pro handles it)
- [ ] Super admins bypass subscription check in AuthGuard
- [ ] Cancelled subscriptions block dashboard access

- [ ] **Step 3: Final commit with all uncommitted changes (if any)**

```bash
git status
# If any remaining changes:
git add -A && git commit -m "chore: final cleanup for subscription feature"
```
