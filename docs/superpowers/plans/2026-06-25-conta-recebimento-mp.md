# Conta de Recebimento por Pousada (Mercado Pago) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que cada pousada configure a própria conta Mercado Pago, de modo que o dinheiro dos links de pagamento de reserva caia na conta dela (sem comissão), com baixa automática por pousada.

**Architecture:** Token + webhook-secret por pousada armazenados em `tenant_settings` (key-value já com RLS). `PaymentsService` resolve as credenciais por `tenantId`; o webhook descobre a pousada por `?tenant=` na URL. Assinatura do SaaS continua no token global (super-admin). Mascaramento dos segredos na borda do controller; configuração só pelo `owner`.

**Tech Stack:** NestJS + Fastify + Prisma (API), Next.js 15 + React Query (web), Mercado Pago SDK, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-25-conta-recebimento-mp-design.md`

**Comandos úteis:**
- Testes API: `pnpm --filter @adelina/api test`
- Typecheck web: `pnpm --filter './apps/web' exec tsc --noEmit -p tsconfig.json`

---

## File Structure

**API (modificar):**
- `apps/api/src/common/permissions.ts` — nova capacidade `payment:account`.
- `apps/api/src/common/tenant-settings.service.ts` — 2 chaves novas, defaults, `maskSecret`, `SENSITIVE_TENANT_KEYS`.
- `apps/api/src/modules/settings/tenant-settings.controller.ts` — mascarar GET, restringir PUT genérico, novo PUT `payment-account`.
- `apps/api/src/modules/payments/payments.service.ts` — `mpClient(tenantId)`, `webhookSecret(tenantId)`, guard no `createLink`, `checkout` com tenant+notification_url, `handleWebhook(tenantId)`.
- `apps/api/src/modules/payments/payments.controller.ts` — webhook lê `?tenant`.

**API (criar):**
- `apps/api/src/modules/payments/payments.account.ts` — helpers puros (`assertMpToken`, `paymentWebhookUrl`).
- `apps/api/src/common/permissions.spec.ts` — teste da capacidade.
- `apps/api/src/common/tenant-settings.mask.spec.ts` — teste do `maskSecret`.
- `apps/api/src/modules/payments/payments.account.spec.ts` — testes dos helpers puros.

**Web (modificar):**
- `apps/web/src/lib/permissions.ts` — espelho da capacidade.
- `apps/web/src/app/(dashboard)/configuracoes/page.tsx` — corrige GET, adiciona seção `PaymentAccountSettings` com guia.

---

## Task 1: Capacidade `payment:account` (API + espelho web)

**Files:**
- Modify: `apps/api/src/common/permissions.ts`
- Modify: `apps/web/src/lib/permissions.ts`
- Test: `apps/api/src/common/permissions.spec.ts` (create)

- [ ] **Step 1: Escrever o teste que falha**

Create `apps/api/src/common/permissions.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { can } from './permissions';

describe('payment:account capability', () => {
  it('owner pode configurar a conta de recebimento', () => {
    expect(can('owner', 'payment:account')).toBe(true);
  });
  it('manager NÃO pode (é dinheiro entrando)', () => {
    expect(can('manager', 'payment:account')).toBe(false);
  });
  it('demais papéis não podem', () => {
    expect(can('receptionist', 'payment:account')).toBe(false);
    expect(can('readonly', 'payment:account')).toBe(false);
    expect(can(undefined, 'payment:account')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @adelina/api test -- permissions.spec`
Expected: FAIL — TypeScript/erro de tipo `'payment:account'` não existe em `Capability`.

- [ ] **Step 3: Adicionar a capacidade na API**

Em `apps/api/src/common/permissions.ts`, no type `Capability` (após a linha `'payment:record'`):

```ts
  | 'payment:record' // registrar recebimento manual (dinheiro/pix/cartão)
  | 'payment:account' // configurar a conta MP de recebimento da pousada (owner)
```

E em `CAPABILITY_ROLES` (após a entrada `'payment:record'`):

```ts
  'payment:record': ['owner', 'manager', 'receptionist'],
  'payment:account': ['owner'],
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @adelina/api test -- permissions.spec`
Expected: PASS (4 asserts).

- [ ] **Step 5: Espelhar no web**

Em `apps/web/src/lib/permissions.ts`, adicionar ao type `Capability` (após `'payment:record'`):

```ts
  | 'payment:record'
  | 'payment:account'
```

E em `CAPABILITY_ROLES` (após `'payment:record'`):

```ts
  'payment:record': ['owner', 'manager', 'receptionist'],
  'payment:account': ['owner'],
```

- [ ] **Step 6: Typecheck do web**

Run: `pnpm --filter './apps/web' exec tsc --noEmit -p tsconfig.json`
Expected: sem erros novos (baseline pré-existente pode aparecer).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common/permissions.ts apps/api/src/common/permissions.spec.ts apps/web/src/lib/permissions.ts
git commit -m "feat(rbac): capacidade payment:account (owner) p/ conta de recebimento"
```

---

## Task 2: Chaves de tenant settings + máscara de segredo

**Files:**
- Modify: `apps/api/src/common/tenant-settings.service.ts`
- Test: `apps/api/src/common/tenant-settings.mask.spec.ts` (create)

- [ ] **Step 1: Escrever o teste que falha**

Create `apps/api/src/common/tenant-settings.mask.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { maskSecret } from './tenant-settings.service';

describe('maskSecret', () => {
  it('vazio continua vazio', () => {
    expect(maskSecret('')).toBe('');
  });
  it('mascara mantendo só os últimos 4', () => {
    expect(maskSecret('APP_USR-1234567890abcd')).toBe('••••abcd');
  });
  it('valor curto (<=4) não vaza o conteúdo', () => {
    expect(maskSecret('ab')).toBe('••••');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @adelina/api test -- tenant-settings.mask`
Expected: FAIL — `maskSecret` não exportado.

- [ ] **Step 3: Implementar chaves, defaults e máscara**

Em `apps/api/src/common/tenant-settings.service.ts`:

(a) Adicionar as 2 chaves ao array `TENANT_SETTING_KEYS`:

```ts
export const TENANT_SETTING_KEYS = [
  'payment_terms_of_service',
  'payment_lgpd_consent',
  'payment_link_auto_whatsapp',
  'payment_mp_access_token',
  'payment_mp_webhook_secret',
] as const;
```

(b) Após a definição de `TenantSettingKey`, adicionar o set de chaves sensíveis e o helper de máscara:

```ts
export type TenantSettingKey = (typeof TENANT_SETTING_KEYS)[number];

/** Chaves cujo valor é segredo e NÃO pode voltar em texto puro pro web. */
export const SENSITIVE_TENANT_KEYS = [
  'payment_mp_access_token',
  'payment_mp_webhook_secret',
] as const satisfies readonly TenantSettingKey[];

/** Mascara um segredo deixando só os últimos 4 caracteres. '' continua ''. */
export function maskSecret(value: string): string {
  if (!value) return '';
  return `••••${value.slice(-4)}`;
}
```

(c) No `getAll`, acrescentar os defaults vazios das 2 chaves novas no objeto de retorno:

```ts
    return {
      payment_terms_of_service:
        map.get('payment_terms_of_service') || DEFAULT_TERMS_OF_SERVICE,
      payment_lgpd_consent: map.get('payment_lgpd_consent') || DEFAULT_LGPD_CONSENT,
      payment_link_auto_whatsapp: map.get('payment_link_auto_whatsapp') || 'false',
      payment_mp_access_token: map.get('payment_mp_access_token') || '',
      payment_mp_webhook_secret: map.get('payment_mp_webhook_secret') || '',
    };
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @adelina/api test -- tenant-settings.mask`
Expected: PASS (3 asserts).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/tenant-settings.service.ts apps/api/src/common/tenant-settings.mask.spec.ts
git commit -m "feat(settings): chaves payment_mp_* por pousada + maskSecret"
```

---

## Task 3: Controller de settings — mascarar GET, restringir PUT, endpoint da conta

**Files:**
- Modify: `apps/api/src/modules/settings/tenant-settings.controller.ts`

Sem teste automatizado novo (é fino e depende de DI/HTTP); validação por typecheck + smoke manual na Task 8. A regra de máscara já é coberta pelo teste puro da Task 2.

- [ ] **Step 1: Reescrever o controller**

Substituir todo o conteúdo de `apps/api/src/modules/settings/tenant-settings.controller.ts` por:

```ts
import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequireCapability } from '../../common/require-capability.decorator';
import {
  TenantSettingsService,
  maskSecret,
} from '../../common/tenant-settings.service';

// Chaves editáveis pelo PUT genérico (NÃO inclui os segredos de MP).
const EDITABLE_KEYS = [
  'payment_terms_of_service',
  'payment_lgpd_consent',
  'payment_link_auto_whatsapp',
] as const;

const UpsertSchema = z.object({
  key: z.enum(EDITABLE_KEYS),
  value: z.string().max(5000),
});

// Conta de recebimento: campos opcionais; vazio/ausente = não sobrescreve.
const PaymentAccountSchema = z.object({
  accessToken: z.string().max(500).optional(),
  webhookSecret: z.string().max(500).optional(),
});

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class TenantSettingsController {
  constructor(private readonly settings: TenantSettingsService) {}

  @Get()
  async getAll(@TenantId() tenantId: string) {
    const all = await this.settings.getAll(tenantId);
    // Segredos voltam mascarados — nunca em texto puro pro web.
    return {
      ...all,
      payment_mp_access_token: maskSecret(all.payment_mp_access_token),
      payment_mp_webhook_secret: maskSecret(all.payment_mp_webhook_secret),
    };
  }

  @Put()
  @RequireCapability('settings:manage')
  async upsert(@TenantId() tenantId: string, @Body() body: unknown) {
    const { key, value } = UpsertSchema.parse(body);
    await this.settings.set(tenantId, key, value);
    return { ok: true, key };
  }

  // Conta de recebimento MP da pousada — só owner (dinheiro entrando).
  @Put('payment-account')
  @RequireCapability('payment:account')
  async setPaymentAccount(@TenantId() tenantId: string, @Body() body: unknown) {
    const { accessToken, webhookSecret } = PaymentAccountSchema.parse(body);
    if (accessToken && accessToken.trim()) {
      await this.settings.set(tenantId, 'payment_mp_access_token', accessToken.trim());
    }
    if (webhookSecret && webhookSecret.trim()) {
      await this.settings.set(tenantId, 'payment_mp_webhook_secret', webhookSecret.trim());
    }
    return { ok: true };
  }
}
```

- [ ] **Step 2: Typecheck da API**

Run: `pnpm --filter @adelina/api exec tsc --noEmit -p tsconfig.json`
Expected: sem erros novos (baseline de ~21 erros pré-existentes em dashboard/whatsapp/zod-filter/availability pode aparecer; nenhum em `tenant-settings.controller.ts`).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/settings/tenant-settings.controller.ts
git commit -m "feat(settings): mascara segredos no GET, PUT genérico só p/ chaves não-sensíveis, PUT payment-account (owner)"
```

---

## Task 4: Helpers puros de pagamento (token + URL do webhook)

**Files:**
- Create: `apps/api/src/modules/payments/payments.account.ts`
- Test: `apps/api/src/modules/payments/payments.account.spec.ts`

- [ ] **Step 1: Escrever os testes que falham**

Create `apps/api/src/modules/payments/payments.account.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { assertMpToken, paymentWebhookUrl } from './payments.account';

describe('assertMpToken', () => {
  it('lança BadRequest quando vazio/ausente', () => {
    expect(() => assertMpToken('')).toThrow(BadRequestException);
    expect(() => assertMpToken('   ')).toThrow(BadRequestException);
    expect(() => assertMpToken(undefined)).toThrow(BadRequestException);
    expect(() => assertMpToken(null)).toThrow(BadRequestException);
  });
  it('devolve o token trimado quando presente', () => {
    expect(assertMpToken('  APP_USR-abc  ')).toBe('APP_USR-abc');
  });
});

describe('paymentWebhookUrl', () => {
  it('monta a URL com o tenant na query', () => {
    expect(paymentWebhookUrl('https://api.x.com', 'tnt-1')).toBe(
      'https://api.x.com/api/payments/pay/webhook?tenant=tnt-1',
    );
  });
  it('remove barra final do apiUrl', () => {
    expect(paymentWebhookUrl('https://api.x.com/', 'tnt-1')).toBe(
      'https://api.x.com/api/payments/pay/webhook?tenant=tnt-1',
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @adelina/api test -- payments.account`
Expected: FAIL — módulo `./payments.account` não existe.

- [ ] **Step 3: Implementar os helpers**

Create `apps/api/src/modules/payments/payments.account.ts`:

```ts
import { BadRequestException } from '@nestjs/common';

const NOT_CONFIGURED =
  'Conta de recebimento não configurada. Configure em Configurações → Pagamentos ' +
  'antes de gerar links de pagamento.';

/** Garante que a pousada configurou o access token do MP; devolve-o trimado. */
export function assertMpToken(token: string | null | undefined): string {
  const t = (token ?? '').trim();
  if (!t) throw new BadRequestException(NOT_CONFIGURED);
  return t;
}

/** URL pública do webhook de pagamento, com o tenant embutido na query. */
export function paymentWebhookUrl(apiUrl: string, tenantId: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/api/payments/pay/webhook?tenant=${tenantId}`;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter @adelina/api test -- payments.account`
Expected: PASS (4 asserts).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/payments/payments.account.ts apps/api/src/modules/payments/payments.account.spec.ts
git commit -m "feat(payments): helpers puros assertMpToken + paymentWebhookUrl"
```

---

## Task 5: `PaymentsService` — credenciais por pousada

**Files:**
- Modify: `apps/api/src/modules/payments/payments.service.ts`

- [ ] **Step 1: `mpClient` por tenant + import dos helpers**

Em `apps/api/src/modules/payments/payments.service.ts`, adicionar ao topo (junto aos imports existentes):

```ts
import { assertMpToken, paymentWebhookUrl } from './payments.account';
```

Substituir o método `mpClient` atual por:

```ts
  /** Client MP usando o access token DA POUSADA (sem fallback global). */
  private async mpClient(tenantId: string): Promise<MercadoPagoConfig> {
    const token = assertMpToken(
      await this.settings.get(tenantId, 'payment_mp_access_token'),
    );
    return new MercadoPagoConfig({ accessToken: token });
  }
```

- [ ] **Step 2: `createLink` valida a conta antes de gerar**

Em `createLink`, logo após buscar a `reservation` e ANTES de criar o `paymentLink` (depois do bloco que lança erro p/ reserva cancelada), inserir:

```ts
    // Garante que a pousada já configurou a conta de recebimento — falha cedo,
    // antes de gerar/enviar um link que não daria pra pagar.
    await this.mpClient(tenantId);
```

- [ ] **Step 3: `checkout` usa o tenant do link + grava tenant na notification_url**

No método `checkout`, trocar a criação da `Preference` e a `notification_url`. Substituir:

```ts
    const preference = new Preference(await this.mpClient());
    const apiUrl = process.env.PUBLIC_API_URL ?? 'http://localhost:3333';
```

por:

```ts
    const preference = new Preference(await this.mpClient(link.tenantId));
    const apiUrl = process.env.PUBLIC_API_URL ?? 'http://localhost:3333';
```

E na chamada `preference.create({ body: { ... } })`, trocar a linha do `notification_url`:

```ts
        notification_url: paymentWebhookUrl(apiUrl, link.tenantId),
```

- [ ] **Step 4: `webhookSecret` e `isSignatureValid` por tenant**

Substituir o método `webhookSecret` atual por (lê o secret DA POUSADA, sem fallback global):

```ts
  /** Secret de assinatura do webhook DA POUSADA (sem fallback global). */
  private async webhookSecret(tenantId: string): Promise<string | null> {
    const value = await this.settings.get(tenantId, 'payment_mp_webhook_secret');
    return value || null;
  }
```

Substituir a assinatura e a 1ª linha de `isSignatureValid` para receber `tenantId`:

```ts
  private async isSignatureValid(
    dataId: string,
    headers: { signature?: string; requestId?: string },
    tenantId: string,
  ): Promise<boolean> {
    const secret = await this.webhookSecret(tenantId);
```

(o restante do corpo de `isSignatureValid` — fail-closed em prod, `verifyMpSignature` — fica igual.)

- [ ] **Step 5: `handleWebhook` recebe e propaga `tenantId`**

Trocar a assinatura de `handleWebhook` para incluir `tenantId` e usar as credenciais da pousada. Substituir:

```ts
  async handleWebhook(
    type: string,
    dataId: string,
    headers: { signature?: string; requestId?: string } = {},
  ): Promise<void> {
    if (type !== 'payment' || !dataId) return;

    if (!(await this.isSignatureValid(dataId, headers))) {
      this.logger.warn(`Webhook com assinatura inválida (data.id ${dataId}) — ignorado.`);
      return;
    }

    const mpPayment = new MpPayment(await this.mpClient());
```

por:

```ts
  async handleWebhook(
    type: string,
    dataId: string,
    headers: { signature?: string; requestId?: string } = {},
    tenantId?: string,
  ): Promise<void> {
    if (type !== 'payment' || !dataId || !tenantId) return;

    if (!(await this.isSignatureValid(dataId, headers, tenantId))) {
      this.logger.warn(`Webhook com assinatura inválida (data.id ${dataId}) — ignorado.`);
      return;
    }

    const mpPayment = new MpPayment(await this.mpClient(tenantId));
```

(o restante de `handleWebhook` — buscar pagamento, idempotência, liquidação — fica igual.)

- [ ] **Step 6: Typecheck da API**

Run: `pnpm --filter @adelina/api exec tsc --noEmit -p tsconfig.json`
Expected: sem erros novos em `payments.service.ts`. (Erro esperado AGORA em `payments.controller.ts` porque `handleWebhook` ganhou um parâmetro — será resolvido na Task 6. Se o typecheck reclamar só disso, ok seguir.)

- [ ] **Step 7: Rodar a suíte de testes da API**

Run: `pnpm --filter @adelina/api test`
Expected: PASS (testes existentes de `mp-webhook`, `payment-status` etc. + os novos das Tasks 1/2/4).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/payments/payments.service.ts
git commit -m "feat(payments): credenciais MP por pousada (mpClient/webhook/checkout por tenantId)"
```

---

## Task 6: `PaymentsController` — webhook resolve o tenant pela query

**Files:**
- Modify: `apps/api/src/modules/payments/payments.controller.ts`

- [ ] **Step 1: Ler `?tenant` e propagar**

Em `apps/api/src/modules/payments/payments.controller.ts`, substituir o método `webhook` por:

```ts
  @Public()
  @Post('pay/webhook')
  async webhook(@Body() body: unknown, @Req() req: FastifyRequest) {
    const parsed = body as { type?: string; data?: { id?: string } };
    const query = req.query as { type?: string; 'data.id'?: string; tenant?: string };
    const type = parsed?.type ?? query?.type;
    const dataId = parsed?.data?.id ?? query?.['data.id'];
    const tenantId = query?.tenant;
    if (type && dataId && tenantId) {
      await this.payments.handleWebhook(type, String(dataId), {
        signature: req.headers['x-signature'] as string | undefined,
        requestId: req.headers['x-request-id'] as string | undefined,
      }, String(tenantId));
    }
    return { ok: true };
  }
```

- [ ] **Step 2: Typecheck da API**

Run: `pnpm --filter @adelina/api exec tsc --noEmit -p tsconfig.json`
Expected: sem erros novos (o erro da Task 5 sobre `handleWebhook` deve sumir).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/payments/payments.controller.ts
git commit -m "feat(payments): webhook resolve a pousada por ?tenant na URL"
```

---

## Task 7: Web — corrigir GET e adicionar seção da conta de recebimento com guia

**Files:**
- Modify: `apps/web/src/app/(dashboard)/configuracoes/page.tsx`

- [ ] **Step 1: Corrigir o GET quebrado da seção Pagamentos**

Em `PagamentosSettings` (≈ linha 520), trocar o endpoint do GET de `/configuracoes` (404) para `/settings`:

```ts
      }>('/settings'),
```

- [ ] **Step 2: Renderizar a nova seção (só owner) junto da Pagamentos**

Localizar (≈ linha 96):

```tsx
          {can('settings:manage') && <PagamentosSettings />}
```

e inserir logo abaixo:

```tsx
          {can('settings:manage') && <PagamentosSettings />}
          {can('payment:account') && <PaymentAccountSettings />}
```

- [ ] **Step 3: Adicionar o componente `PaymentAccountSettings`**

No fim de `apps/web/src/app/(dashboard)/configuracoes/page.tsx`, antes do componente `Field` (≈ linha 614), adicionar:

```tsx
function PaymentAccountSettings() {
  const qc = useQueryClient();
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () =>
      api<{ payment_mp_access_token: string; payment_mp_webhook_secret: string }>('/settings'),
  });
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: { tenantId: string } }>('/me'),
  });

  const configured =
    !!data?.payment_mp_access_token && !!data?.payment_mp_webhook_secret;
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
  const webhookUrl = me
    ? `${apiBase}/api/payments/pay/webhook?tenant=${me.user.tenantId}`
    : '';

  const save = useMutation({
    mutationFn: async () => {
      await api('/settings/payment-account', {
        method: 'PUT',
        body: JSON.stringify({
          accessToken: token.trim() || undefined,
          webhookSecret: secret.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      setToken('');
      setSecret('');
      qc.invalidateQueries({ queryKey: ['tenant-settings'] });
      toast.success('Conta de recebimento salva');
    },
    onError: (err: Error) => toast.error('Erro ao salvar', { description: err.message }),
  });

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('URL do webhook copiada');
  };

  return (
    <section className="surface-card p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-ink flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-brand-600" /> Conta de recebimento (Mercado Pago)
        </h2>
        <p className="text-xs text-ink-muted mt-0.5">
          Onde o dinheiro dos links de pagamento das suas reservas vai cair.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-ink-muted">Carregando…</div>
      ) : (
        <>
          <div
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
              configured
                ? 'bg-emerald-500/10 text-emerald-600'
                : 'bg-amber-500/10 text-amber-600',
            )}
          >
            {configured ? (
              <>
                <Check className="w-4 h-4" /> Conta configurada — links de pagamento ativos.
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4" /> Conta ainda não configurada — os links de
                pagamento ficam indisponíveis até você preencher abaixo.
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Access Token do Mercado Pago
            </label>
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                data?.payment_mp_access_token
                  ? `Salvo: ${data.payment_mp_access_token} (deixe vazio p/ manter)`
                  : 'APP_USR-…'
              }
              className="input-base w-full text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Assinatura secreta (webhook)
            </label>
            <input
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={
                data?.payment_mp_webhook_secret
                  ? `Salvo: ${data.payment_mp_webhook_secret} (deixe vazio p/ manter)`
                  : 'cole a assinatura secreta do webhook'
              }
              className="input-base w-full text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">URL do webhook</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={webhookUrl}
                className="input-base w-full text-sm font-mono text-ink-muted"
              />
              <button onClick={copyWebhook} className="btn-secondary text-sm whitespace-nowrap">
                Copiar
              </button>
            </div>
          </div>

          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {save.isPending ? 'Salvando…' : 'Salvar conta de recebimento'}
          </button>

          <div className="border-t border-line pt-3">
            <button
              onClick={() => setShowGuide((v) => !v)}
              className="text-sm text-brand-600 hover:underline"
            >
              {showGuide ? '▾' : '▸'} Como configurar (passo a passo)
            </button>
            {showGuide && (
              <ol className="mt-3 space-y-2 text-sm text-ink-soft list-decimal pl-5">
                <li>
                  Crie ou entre na sua conta{' '}
                  <a
                    href="https://www.mercadopago.com.br/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 underline"
                  >
                    Mercado Pago
                  </a>
                  .
                </li>
                <li>
                  <strong>Access Token:</strong> no painel do MP, vá em{' '}
                  <em>Seu negócio → Configurações → Credenciais de produção</em>, copie o{' '}
                  <strong>Access Token</strong> (começa com <code>APP_USR-</code>) e cole no 1º
                  campo aqui.
                </li>
                <li>
                  <strong>Webhook:</strong> no painel do MP, vá em{' '}
                  <em>Suas integrações → Webhooks</em>, cole a <strong>URL do webhook</strong>{' '}
                  acima, marque o evento <strong>“Pagamentos”</strong> e salve. Depois copie a{' '}
                  <strong>Assinatura secreta</strong> e cole no 2º campo aqui.
                </li>
                <li>
                  Clique em <strong>Salvar</strong>. Pronto: os links das suas reservas passam a
                  cair na sua conta e dão baixa automática quando o hóspede paga.
                </li>
                <li>
                  <a
                    href="https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 underline"
                  >
                    Ajuda oficial do Mercado Pago
                  </a>{' '}
                  (caso a tela do MP mude).
                </li>
              </ol>
            )}
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Typecheck do web**

Run: `pnpm --filter './apps/web' exec tsc --noEmit -p tsconfig.json`
Expected: sem erros novos. (`cn`, `Check`, `AlertTriangle`, `CreditCard`, `toast`, `useQuery`, `useMutation`, `useQueryClient`, `useState`, `api` já estão importados no arquivo.)

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(dashboard)/configuracoes/page.tsx"
git commit -m "feat(web): seção Conta de recebimento (MP) por pousada + guia; corrige GET /settings"
```

---

## Task 8: Verificação final

**Files:** nenhum (verificação).

- [ ] **Step 1: Suíte de testes da API verde**

Run: `pnpm --filter @adelina/api test`
Expected: PASS — incluindo `permissions.spec`, `tenant-settings.mask`, `payments.account`, e os pré-existentes (`mp-webhook`, `payment-status`, `reports.*`, `payouts.calc`, `legal.tokens`, `dashboard.access`).

- [ ] **Step 2: Typecheck dos dois apps**

Run: `pnpm --filter @adelina/api exec tsc --noEmit -p tsconfig.json`
Expected: só o baseline pré-existente (~21 erros em dashboard.controller/whatsapp/zod-filter/availability); nada novo nos arquivos tocados.

Run: `pnpm --filter './apps/web' exec tsc --noEmit -p tsconfig.json`
Expected: sem erros novos.

- [ ] **Step 3: Revisão de fluxo (manual, sem deploy)**

Conferir mentalmente/visualmente:
- Owner vê a seção "Conta de recebimento (Mercado Pago)"; manager/recepção NÃO veem.
- GET `/settings` devolve token/secret mascarados (`••••xxxx`).
- Gerar link sem conta configurada → erro claro ("Conta de recebimento não configurada…").
- Assinatura do SaaS (super-admin) inalterada.

- [ ] **Step 4: Deploy (decisão do dono)**

NÃO deployar automaticamente. Ao terminar, perguntar ao dono se faz o deploy (`bash /root/adelina/deploy.sh`, com a pegadinha do Swarm `:latest`/`--force` e verificação de ID já documentada na memória do projeto) e lembrá-lo de **cadastrar o webhook no painel MP de cada pousada** usando a URL da tela.

---

## Notas de implementação

- **Sem migração de banco.** `tenant_settings` é key-value já com RLS; só adicionamos chaves.
- **Convenções confirmadas no código:** `toast` na página de Configurações vem do `sonner` (não `@/lib/toast`); `cn` de `@/lib/cn`; `api()` chama o controller em **inglês** (`/settings`, `/me`), nunca a rota PT da página.
- **Bug pré-existente corrigido de passagem:** a seção Pagamentos buscava `GET /configuracoes` (404 confirmado em prod) — agora `GET /settings`.
- **Limitação conhecida:** links criados ANTES desta feature (notification_url sem `?tenant=`) não dão baixa automática no novo modelo; baixa manual via "registrar recebimento" cobre o caso.
