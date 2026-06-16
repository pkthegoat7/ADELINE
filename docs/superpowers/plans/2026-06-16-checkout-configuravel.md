# Checkout Configurável pelo Admin — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o super admin configure preço, texto e ciclo de cobrança do checkout de assinatura pela tela `/admin/configuracoes`, sem deploy.

**Architecture:** Reusar o key-value `SystemSetting` (mesmo padrão do `mp_access_token`). Backend ganha 3 chaves novas com validação por chave; o `SubscriptionsService` lê via um helper `getPlanConfig()` com fallback pros defaults atuais; a tela de admin ganha uma seção "Plano de assinatura".

**Tech Stack:** NestJS, Prisma, Zod, Next.js 15, TanStack Query, Tailwind

> **Nota de verificação:** o projeto não tem suíte de testes unitários (só `pnpm typecheck`). Seguindo o padrão do projeto, cada task é verificada por typecheck + um teste manual no fim. Não criar infra de testes nova.

---

## Task 1: Backend — Settings configuráveis no Admin

**Files:**
- Modify: `apps/api/src/modules/admin/admin.controller.ts`

- [ ] **Step 1: Adicionar as 3 chaves ao allowlist**

Em `admin.controller.ts`, localize a linha:

```typescript
  private static ALLOWED_SETTINGS = ['mp_access_token'] as const;
```

Substitua por:

```typescript
  private static ALLOWED_SETTINGS = [
    'mp_access_token',
    'mp_plan_amount',
    'mp_plan_reason',
    'mp_plan_frequency_months',
  ] as const;
```

`MASKED_SETTINGS` continua só com `mp_access_token` (não alterar) — as chaves de plano devem aparecer com o valor real na tela.

- [ ] **Step 2: Validação por chave no PUT**

Em `admin.controller.ts`, localize o método `upsertSetting`:

```typescript
  @Put('settings')
  async upsertSetting(@CurrentUser() user: AuthContext, @Body() body: unknown) {
    this.assertSuperAdmin(user);
    const schema = z.object({
      key: z.enum(AdminController.ALLOWED_SETTINGS),
      value: z.string().min(1, 'Valor obrigatório'),
    });
    const { key, value } = schema.parse(body);
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    return { ok: true, key };
  }
```

Substitua o corpo (depois do `const { key, value } = schema.parse(body);`) inserindo a validação por chave antes do `upsert`:

```typescript
  @Put('settings')
  async upsertSetting(@CurrentUser() user: AuthContext, @Body() body: unknown) {
    this.assertSuperAdmin(user);
    const schema = z.object({
      key: z.enum(AdminController.ALLOWED_SETTINGS),
      value: z.string().min(1, 'Valor obrigatório'),
    });
    const { key, value } = schema.parse(body);

    if (key === 'mp_plan_amount') {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        throw new BadRequestException('Preço deve ser um número maior que zero.');
      }
    }
    if (key === 'mp_plan_frequency_months' && !['1', '3', '12'].includes(value)) {
      throw new BadRequestException('Ciclo inválido. Use 1, 3 ou 12 meses.');
    }
    if (key === 'mp_plan_reason' && value.length > 255) {
      throw new BadRequestException('Descrição muito longa (máx. 255 caracteres).');
    }

    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    return { ok: true, key };
  }
```

(`BadRequestException` já está importado no topo do arquivo.)

- [ ] **Step 3: Verificar typecheck**

Run: `cd /root/adelina/ADELINE && pnpm --filter @adelina/api exec tsc --noEmit --pretty 2>&1 | tail -5`
Expected: Sem erros novos.

- [ ] **Step 4: Commit**

```bash
cd /root/adelina/ADELINE
git add apps/api/src/modules/admin/admin.controller.ts
git commit -m "feat(api): permitir configurar preço/texto/ciclo do plano via admin settings"
```

---

## Task 2: Backend — Service lê config do plano

**Files:**
- Modify: `apps/api/src/modules/subscriptions/subscriptions.service.ts`

- [ ] **Step 1: Adicionar helper getPlanConfig()**

Em `subscriptions.service.ts`, logo após o método `mpClient()` (antes de `createPreapproval`), adicione:

```typescript
  private async getPlanConfig(): Promise<{
    amount: number;
    reason: string;
    frequencyMonths: number;
  }> {
    const rows = await this.prisma.systemSetting.findMany({
      where: {
        key: { in: ['mp_plan_amount', 'mp_plan_reason', 'mp_plan_frequency_months'] },
      },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const amount = Number(map.get('mp_plan_amount'));
    const frequencyMonths = Number(map.get('mp_plan_frequency_months'));

    return {
      amount: Number.isFinite(amount) && amount > 0 ? amount : 249,
      reason: map.get('mp_plan_reason') || 'Adelina PMS — Assinatura Mensal',
      frequencyMonths: [1, 3, 12].includes(frequencyMonths) ? frequencyMonths : 1,
    };
  }
```

- [ ] **Step 2: Usar a config em createPreapproval**

Localize `createPreapproval` e substitua o corpo até o `const result = await preapproval.create(...)`:

```typescript
  async createPreapproval(backUrl: string): Promise<{ initPoint: string }> {
    const preapproval = new PreApproval(await this.mpClient());
    const plan = await this.getPlanConfig();
    const now = new Date();

    const result = await preapproval.create({
      body: {
        reason: plan.reason,
        auto_recurring: {
          frequency: plan.frequencyMonths,
          frequency_type: 'months',
          transaction_amount: plan.amount,
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
```

- [ ] **Step 3: Usar o ciclo no cálculo de renovação do webhook**

Em `handleWebhook`, localize:

```typescript
        ...(newStatus === 'cancelled'
          ? {}
          : {
              currentPeriodStart: new Date(),
              currentPeriodEnd: addMonths(new Date(), 1),
            }),
```

Substitua por (carregando a config logo antes do `update`):

```typescript
    const plan = await this.getPlanConfig();
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: newStatus,
        ...(newStatus === 'cancelled'
          ? {}
          : {
              currentPeriodStart: new Date(),
              currentPeriodEnd: addMonths(new Date(), plan.frequencyMonths),
            }),
      },
    });
```

(Isso substitui o bloco `await this.prisma.subscription.update({ ... })` inteiro do webhook — confira que não duplicou o `update`.)

- [ ] **Step 4: Usar amount/ciclo no activate**

Em `activate`, localize:

```typescript
    const passwordHash = await this.auth.hashPassword(input.password);
    const now = new Date();
```

Substitua por:

```typescript
    const passwordHash = await this.auth.hashPassword(input.password);
    const plan = await this.getPlanConfig();
    const now = new Date();
```

Depois, dentro do `tx.subscription.create`, localize:

```typescript
          planAmount: 249,
          currentPeriodStart: now,
          currentPeriodEnd: addMonths(now, 1),
```

Substitua por:

```typescript
          planAmount: plan.amount,
          currentPeriodStart: now,
          currentPeriodEnd: addMonths(now, plan.frequencyMonths),
```

- [ ] **Step 5: Verificar typecheck**

Run: `cd /root/adelina/ADELINE && pnpm --filter @adelina/api exec tsc --noEmit --pretty 2>&1 | tail -5`
Expected: Sem erros novos.

- [ ] **Step 6: Commit**

```bash
cd /root/adelina/ADELINE
git add apps/api/src/modules/subscriptions/subscriptions.service.ts
git commit -m "feat(api): checkout usa preço/texto/ciclo configurados (fallback pros defaults)"
```

---

## Task 3: Frontend — Seção "Plano de assinatura" no admin

**Files:**
- Modify: `apps/web/src/app/(dashboard)/admin/configuracoes/page.tsx`

- [ ] **Step 1: Renderizar a nova seção**

Em `configuracoes/page.tsx`, localize:

```tsx
      <MercadoPagoSection />
    </div>
  );
}
```

Substitua por:

```tsx
      <MercadoPagoSection />
      <PlanoSection />
    </div>
  );
}
```

- [ ] **Step 2: Adicionar o ícone Tag ao import do lucide**

Localize:

```tsx
import { ShieldAlert, Save, Eye, EyeOff, CreditCard } from 'lucide-react';
```

Substitua por:

```tsx
import { ShieldAlert, Save, Eye, EyeOff, CreditCard, Tag } from 'lucide-react';
```

- [ ] **Step 3: Adicionar o componente PlanoSection**

No fim do arquivo (depois do fechamento de `MercadoPagoSection`), adicione:

```tsx
function PlanoSection() {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [frequency, setFrequency] = useState('1');
  const [loaded, setLoaded] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api<SystemSetting[]>('/admin/settings'),
  });

  // Preenche os campos com os valores salvos na primeira carga
  if (settings && !loaded) {
    setAmount(settings.find((s) => s.key === 'mp_plan_amount')?.value ?? '');
    setReason(settings.find((s) => s.key === 'mp_plan_reason')?.value ?? '');
    setFrequency(settings.find((s) => s.key === 'mp_plan_frequency_months')?.value ?? '1');
    setLoaded(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      await api('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ key: 'mp_plan_amount', value: amount.trim() }),
      });
      await api('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ key: 'mp_plan_reason', value: reason.trim() }),
      });
      await api('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ key: 'mp_plan_frequency_months', value: frequency }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      toast.success('Plano de assinatura salvo com sucesso');
    },
    onError: (err: Error) => toast.error('Erro ao salvar', err.message),
  });

  return (
    <div className="surface-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
          <Tag className="w-5 h-5" />
        </span>
        <div>
          <h3 className="font-semibold text-ink">Plano de assinatura</h3>
          <p className="text-xs text-ink-muted">Preço, descrição e ciclo do checkout</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-ink-muted">Carregando…</div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="plan-amount" className="block text-sm font-medium text-ink mb-1">
              Valor (R$)
            </label>
            <input
              id="plan-amount"
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-base w-full"
              placeholder="249.00"
            />
          </div>

          <div>
            <label htmlFor="plan-reason" className="block text-sm font-medium text-ink mb-1">
              Descrição (aparece no checkout do Mercado Pago)
            </label>
            <input
              id="plan-reason"
              type="text"
              maxLength={255}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-base w-full"
              placeholder="Adelina PMS — Assinatura Mensal"
            />
          </div>

          <div>
            <label htmlFor="plan-frequency" className="block text-sm font-medium text-ink mb-1">
              Ciclo de cobrança
            </label>
            <select
              id="plan-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="input-base w-full"
            >
              <option value="1">Mensal</option>
              <option value="3">Trimestral</option>
              <option value="12">Anual</option>
            </select>
          </div>

          <button
            onClick={() => save.mutate()}
            disabled={!amount.trim() || !reason.trim() || save.isPending}
            className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {save.isPending ? 'Salvando…' : 'Salvar plano'}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verificar typecheck**

Run: `cd /root/adelina/ADELINE && pnpm --filter @adelina/web exec tsc --noEmit --pretty 2>&1 | tail -5`
Expected: Sem erros novos.

- [ ] **Step 5: Commit**

```bash
cd /root/adelina/ADELINE
git add "apps/web/src/app/(dashboard)/admin/configuracoes/page.tsx"
git commit -m "feat(web): seção de plano configurável (preço/texto/ciclo) no admin"
```

---

## Task 4: Verificação final + Deploy

- [ ] **Step 1: Typecheck completo**

Run:
```bash
cd /root/adelina/ADELINE
pnpm --filter @adelina/api exec tsc --noEmit --pretty 2>&1 | tail -5
pnpm --filter @adelina/web exec tsc --noEmit --pretty 2>&1 | tail -5
```
Expected: Sem erros nos arquivos novos.

- [ ] **Step 2: Deploy**

Run: `bash /root/adelina/deploy.sh`
Expected: termina com `✓ deploy concluído`.

- [ ] **Step 3: Teste manual (super admin)**

1. Logar como super admin → `/admin/configuracoes`.
2. Na seção "Plano de assinatura": confirmar que os campos carregam os valores atuais (ou vazios na 1ª vez).
3. Salvar um preço novo (ex: `299`), descrição e ciclo → confirmar toast de sucesso.
4. Recarregar a página → confirmar que os valores persistiram.
5. Na landing, clicar "Assinar agora" → no checkout do Mercado Pago, confirmar que valor, descrição e ciclo refletem a config salva.
6. Tentar salvar preço `0` ou vazio → confirmar erro (`400`).

- [ ] **Step 4: Atualizar memória do projeto**

Atualizar `project_adelina.md` para registrar que o plano de checkout é configurável via admin settings (chaves `mp_plan_amount`, `mp_plan_reason`, `mp_plan_frequency_months`).
