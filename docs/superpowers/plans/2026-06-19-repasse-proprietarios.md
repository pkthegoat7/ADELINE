# Repasse a Proprietários — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir cadastrar proprietários, definir termos de administração (% + taxa fixa) por imóvel, e gerar/pagar o extrato mensal de repasse ao dono no estilo Stays (razão de créditos/débitos + lançamentos avulsos).

**Architecture:** Núcleo de cálculo é uma **função pura** (`computePayout`) testada com vitest sem banco. A `PayoutsService` busca reservas/despesas/lançamentos via `withTenant` e delega o cálculo; ao "marcar pago", congela um snapshot em `owner_payouts`. CRUD de proprietários espelha o módulo `expenses`. UI sob o menu Financeiro. RBAC espelhado nos dois lados; RLS multi-tenant; migração SQL aditiva (nunca `db push`).

**Tech Stack:** NestJS 10 + Fastify + Prisma 5 + Zod (API), Next.js 15 + React 19 + TanStack Query + Tailwind (web), Postgres + RLS, vitest (testes).

Spec: `docs/superpowers/specs/2026-06-19-repasse-proprietarios-design.md`

---

## File Structure

**DB / schema**
- Modify `packages/db/prisma/schema.prisma` — add `Owner`, `OwnerPayout`, `PayoutEntry`, enum `PayoutEntryType`; add 3 fields + relation to `Property`; add relations to `Tenant`.
- Create `packages/db/prisma/migrations/20260619000000_owner_payouts/migration.sql` — aditivo.

**API**
- Modify `apps/api/src/common/permissions.ts` — 4 capacidades novas.
- Create `apps/api/src/modules/payouts/payouts.calc.ts` — função pura.
- Create `apps/api/src/modules/payouts/payouts.calc.spec.ts` — testes vitest.
- Create `apps/api/src/modules/owners/owners.service.ts` / `owners.controller.ts` / `owners.module.ts`.
- Create `apps/api/src/modules/payouts/payouts.service.ts` / `payouts.controller.ts` / `payouts.module.ts`.
- Modify `apps/api/src/modules/properties/properties.controller.ts` — termos no PUT.
- Modify `apps/api/src/app.module.ts` — registra OwnersModule + PayoutsModule.
- Create `apps/api/vitest.config.ts`; modify `apps/api/package.json` — script + devDep vitest.

**Web**
- Modify `apps/web/src/lib/permissions.ts` — espelho das 4 capacidades.
- Create `apps/web/src/app/(dashboard)/financeiro/proprietarios/page.tsx`.
- Create `apps/web/src/app/(dashboard)/financeiro/repasses/page.tsx`.
- Modify `apps/web/src/app/(dashboard)/layout.tsx` — itens de menu.

---

## Task 1: Schema — modelos Owner, OwnerPayout, PayoutEntry e termos no Property

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Adicionar enum + 3 campos no Property**

Em `packages/db/prisma/schema.prisma`, dentro de `model Property` (após o campo `active`), adicione:

```prisma
  ownerId               String?  @map("owner_id") @db.Uuid
  mgmtCommissionPercent Decimal  @default(0) @map("mgmt_commission_percent") @db.Decimal(5, 2)
  mgmtMonthlyFee        Decimal  @default(0) @map("mgmt_monthly_fee") @db.Decimal(10, 2)
```

E na seção de relations do `Property` (onde estão `tenant`, `roomTypes`...), adicione:

```prisma
  owner              Owner?              @relation(fields: [ownerId], references: [id], onDelete: SetNull)
  payouts            OwnerPayout[]
  payoutEntries      PayoutEntry[]
```

E adicione o índice junto aos outros `@@index` do Property:

```prisma
  @@index([ownerId])
```

- [ ] **Step 2: Adicionar relations no Tenant**

Em `model Tenant`, na lista de relations (após `expenses Expense[]`), adicione:

```prisma
  owners                 Owner[]
  ownerPayouts           OwnerPayout[]
  payoutEntries          PayoutEntry[]
```

- [ ] **Step 3: Adicionar os modelos novos ao final da seção FINANCEIRO**

Após o `model Expense { ... }` (fim do arquivo), adicione:

```prisma
// ════════════════════════════════════════════════════════════════
// REPASSE A PROPRIETÁRIOS
// ════════════════════════════════════════════════════════════════

model Owner {
  id        String   @id @default(uuid()) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  name      String
  document  String?
  email     String?
  phone     String?
  pixKey    String?  @map("pix_key")
  bankInfo  String?  @map("bank_info")
  notes     String?
  active    Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  tenant     Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  properties Property[]
  payouts    OwnerPayout[]

  @@index([tenantId])
  @@map("owners")
}

enum PayoutEntryType {
  credit
  debit
}

model PayoutEntry {
  id          String          @id @default(uuid()) @db.Uuid
  tenantId    String          @map("tenant_id") @db.Uuid
  propertyId  String          @map("property_id") @db.Uuid
  competence  DateTime        @db.Date
  type        PayoutEntryType
  description String
  amount      Decimal         @db.Decimal(10, 2)
  createdAt   DateTime        @default(now()) @map("created_at")

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  property Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([propertyId, competence])
  @@map("payout_entries")
}

model OwnerPayout {
  id                  String   @id @default(uuid()) @db.Uuid
  tenantId            String   @map("tenant_id") @db.Uuid
  propertyId          String   @map("property_id") @db.Uuid
  ownerId             String?  @map("owner_id") @db.Uuid
  competence          DateTime @db.Date
  revenueAmount       Decimal  @map("revenue_amount") @db.Decimal(10, 2)
  commissionPercent   Decimal  @map("commission_percent") @db.Decimal(5, 2)
  commissionFeeAmount Decimal  @map("commission_fee_amount") @db.Decimal(10, 2)
  monthlyFeeAmount    Decimal  @map("monthly_fee_amount") @db.Decimal(10, 2)
  expensesAmount      Decimal  @map("expenses_amount") @db.Decimal(10, 2)
  netPayoutAmount     Decimal  @map("net_payout_amount") @db.Decimal(10, 2)
  reservationCount    Int      @map("reservation_count")
  breakdown           Json
  paidAt              DateTime @map("paid_at")
  paymentMethod       String?  @map("payment_method")
  receiptUrl          String?  @map("receipt_url")
  createdAt           DateTime @default(now()) @map("created_at")

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  property Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  owner    Owner?   @relation(fields: [ownerId], references: [id], onDelete: SetNull)

  @@unique([propertyId, competence])
  @@index([tenantId])
  @@index([propertyId])
  @@index([competence])
  @@map("owner_payouts")
}
```

- [ ] **Step 4: Gerar o Prisma Client e checar o schema**

Run: `pnpm db:generate`
Expected: `Generated Prisma Client` sem erros. (NÃO rodar `db:push` nem `db:migrate` — prod recebe SQL aditivo na Task 2.)

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): modelos de repasse (Owner, OwnerPayout, PayoutEntry) + termos no Property"
```

---

## Task 2: Migração SQL aditiva

**Files:**
- Create: `packages/db/prisma/migrations/20260619000000_owner_payouts/migration.sql`

- [ ] **Step 1: Criar o arquivo de migração**

Crie `packages/db/prisma/migrations/20260619000000_owner_payouts/migration.sql`:

```sql
-- Módulo Repasse a Proprietários
-- Aditivo: enum PayoutEntryType; tabelas owners, payout_entries, owner_payouts;
-- 3 colunas em properties. RLS no padrão tenant-scoped (app_current_tenant()).

-- CreateEnum
CREATE TYPE "PayoutEntryType" AS ENUM ('credit', 'debit');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN "owner_id" UUID;
ALTER TABLE "properties" ADD COLUMN "mgmt_commission_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "properties" ADD COLUMN "mgmt_monthly_fee" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable owners
CREATE TABLE "owners" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "pix_key" TEXT,
    "bank_info" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "owners_tenant_id_idx" ON "owners"("tenant_id");

-- CreateTable payout_entries
CREATE TABLE "payout_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "competence" DATE NOT NULL,
    "type" "PayoutEntryType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payout_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payout_entries_tenant_id_idx" ON "payout_entries"("tenant_id");
CREATE INDEX "payout_entries_property_id_competence_idx" ON "payout_entries"("property_id", "competence");

-- CreateTable owner_payouts
CREATE TABLE "owner_payouts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "owner_id" UUID,
    "competence" DATE NOT NULL,
    "revenue_amount" DECIMAL(10,2) NOT NULL,
    "commission_percent" DECIMAL(5,2) NOT NULL,
    "commission_fee_amount" DECIMAL(10,2) NOT NULL,
    "monthly_fee_amount" DECIMAL(10,2) NOT NULL,
    "expenses_amount" DECIMAL(10,2) NOT NULL,
    "net_payout_amount" DECIMAL(10,2) NOT NULL,
    "reservation_count" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "payment_method" TEXT,
    "receipt_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "owner_payouts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "owner_payouts_property_id_competence_key" ON "owner_payouts"("property_id", "competence");
CREATE INDEX "owner_payouts_tenant_id_idx" ON "owner_payouts"("tenant_id");
CREATE INDEX "owner_payouts_property_id_idx" ON "owner_payouts"("property_id");
CREATE INDEX "owner_payouts_competence_idx" ON "owner_payouts"("competence");

-- ForeignKeys
ALTER TABLE "properties" ADD CONSTRAINT "properties_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "owners" ADD CONSTRAINT "owners_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payout_entries" ADD CONSTRAINT "payout_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payout_entries" ADD CONSTRAINT "payout_entries_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_payouts" ADD CONSTRAINT "owner_payouts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_payouts" ADD CONSTRAINT "owner_payouts_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_payouts" ADD CONSTRAINT "owner_payouts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (mesmo padrão das demais tabelas tenant-scoped)
ALTER TABLE "owners" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owners_tenant ON "owners" USING (tenant_id = app_current_tenant());
ALTER TABLE "payout_entries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY payout_entries_tenant ON "payout_entries" USING (tenant_id = app_current_tenant());
ALTER TABLE "owner_payouts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_payouts_tenant ON "owner_payouts" USING (tenant_id = app_current_tenant());
```

- [ ] **Step 2: Aplicar em prod via SQL aditivo (transação única)**

> ⚠️ NUNCA rodar `prisma db push` neste prod. Aplicar o SQL acima diretamente no container Postgres.

Run:
```bash
docker exec -i adelina_postgres psql -U postgres -d adelina --single-transaction < packages/db/prisma/migrations/20260619000000_owner_payouts/migration.sql
```
Expected: `CREATE TYPE`, `ALTER TABLE`, `CREATE TABLE`, `CREATE POLICY` etc. sem `ERROR`. (Confirme o usuário/database reais com `docker exec adelina_postgres psql -U postgres -c '\l'` se necessário.)

- [ ] **Step 3: Verificar tabelas e RLS criadas**

Run: `docker exec adelina_postgres psql -U postgres -d adelina -c "\dt owners owner_payouts payout_entries" -c "\d+ properties" | grep -E "owners|owner_payouts|payout_entries|mgmt_|owner_id"`
Expected: as 3 tabelas listadas e as 3 colunas novas em properties.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/migrations/20260619000000_owner_payouts
git commit -m "feat(db): migração aditiva do repasse (owners, owner_payouts, payout_entries)"
```

---

## Task 3: Capacidades RBAC (API + Web)

**Files:**
- Modify: `apps/api/src/common/permissions.ts`
- Modify: `apps/web/src/lib/permissions.ts`

- [ ] **Step 1: Adicionar as capacidades no tipo (API)**

Em `apps/api/src/common/permissions.ts`, no union `Capability`, após `| 'expense:manage'`, adicione:

```ts
  | 'owner:read' // ver proprietários
  | 'owner:manage' // criar/editar/excluir proprietário e termos
  | 'payout:read' // ver repasses
  | 'payout:manage' // marcar pago / reabrir / lançamentos
```

- [ ] **Step 2: Adicionar no mapa `CAPABILITY_ROLES` (API)**

Após a linha `'expense:manage': ['owner', 'manager'],`:

```ts
  'owner:read': ['owner', 'manager'],
  'owner:manage': ['owner', 'manager'],
  'payout:read': ['owner', 'manager'],
  'payout:manage': ['owner', 'manager'],
```

- [ ] **Step 3: Espelhar no tipo e no mapa (Web)**

Em `apps/web/src/lib/permissions.ts`, adicione as mesmas 4 entradas no union `Capability` (após `'expense:manage'`) e no mapa `CAPABILITY_ROLES` (após `'expense:manage': ['owner', 'manager'],`), idênticas às da API.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @adelina/api typecheck`
Expected: sem erros novos. (Há ~21 erros pré-existentes em `dashboard.controller.ts`/`reminder-scheduler.service.ts` — ignorar; o build usa SWC.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/permissions.ts apps/web/src/lib/permissions.ts
git commit -m "feat(rbac): capacidades owner:* e payout:* (owner+manager)"
```

---

## Task 4: Motor de cálculo (função pura) — TDD

**Files:**
- Create: `apps/api/vitest.config.ts`
- Modify: `apps/api/package.json`
- Create: `apps/api/src/modules/payouts/payouts.calc.ts`
- Test: `apps/api/src/modules/payouts/payouts.calc.spec.ts`

- [ ] **Step 1: Adicionar vitest ao projeto**

Run: `pnpm --filter @adelina/api add -D vitest`
Expected: vitest adicionado a `devDependencies`.

Em `apps/api/package.json`, no bloco `scripts`, adicione:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 2: Config do vitest**

Crie `apps/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Escrever os testes que falham**

Crie `apps/api/src/modules/payouts/payouts.calc.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computePayout } from './payouts.calc';

const base = { reservations: [], expenses: [], entries: [], commissionPercent: 0, monthlyFee: 0 };

describe('computePayout', () => {
  it('soma receita líquida das reservas', () => {
    const r = computePayout({
      ...base,
      reservations: [
        { code: 'A1', guestName: 'Ana', checkOut: '2026-06-10', netAmount: 300 },
        { code: 'A2', guestName: 'Bia', checkOut: '2026-06-20', netAmount: 200.5 },
      ],
    });
    expect(r.revenueAmount).toBe(500.5);
    expect(r.reservationCount).toBe(2);
    expect(r.netPayoutAmount).toBe(500.5);
  });

  it('aplica comissão percentual sobre o líquido, arredondada a 2 casas', () => {
    const r = computePayout({
      ...base,
      reservations: [{ code: 'A1', guestName: 'Ana', checkOut: '2026-06-10', netAmount: 1000 }],
      commissionPercent: 18.5,
    });
    expect(r.commissionFeeAmount).toBe(185);
    expect(r.netPayoutAmount).toBe(815);
  });

  it('soma a taxa fixa mensal aos débitos', () => {
    const r = computePayout({
      ...base,
      reservations: [{ code: 'A1', guestName: 'Ana', checkOut: '2026-06-10', netAmount: 1000 }],
      commissionPercent: 10,
      monthlyFee: 150,
    });
    expect(r.monthlyFeeAmount).toBe(150);
    expect(r.netPayoutAmount).toBe(1000 - 100 - 150);
  });

  it('deduz despesas do período', () => {
    const r = computePayout({
      ...base,
      reservations: [{ code: 'A1', guestName: 'Ana', checkOut: '2026-06-10', netAmount: 1000 }],
      expenses: [
        { description: 'Luz', category: 'utilities_power', date: '2026-06-05', amount: 120 },
        { description: 'Água', category: 'utilities_water', date: '2026-06-06', amount: 80 },
      ],
    });
    expect(r.expensesAmount).toBe(200);
    expect(r.netPayoutAmount).toBe(800);
  });

  it('crédito soma e débito subtrai nos lançamentos avulsos', () => {
    const r = computePayout({
      ...base,
      reservations: [{ code: 'A1', guestName: 'Ana', checkOut: '2026-06-10', netAmount: 1000 }],
      entries: [
        { id: 'e1', type: 'credit', description: 'Reembolso', amount: 50 },
        { id: 'e2', type: 'debit', description: 'Adiantamento', amount: 200 },
      ],
    });
    expect(r.adjustmentsCredit).toBe(50);
    expect(r.adjustmentsDebit).toBe(200);
    expect(r.netPayoutAmount).toBe(1000 + 50 - 200);
  });

  it('permite repasse negativo quando débitos superam créditos', () => {
    const r = computePayout({
      ...base,
      reservations: [{ code: 'A1', guestName: 'Ana', checkOut: '2026-06-10', netAmount: 100 }],
      expenses: [{ description: 'Reforma', category: 'maintenance', date: '2026-06-05', amount: 500 }],
    });
    expect(r.netPayoutAmount).toBe(-400);
  });

  it('monta o breakdown como razão de crédito/débito', () => {
    const r = computePayout({
      ...base,
      reservations: [{ code: 'A1', guestName: 'Ana', checkOut: '2026-06-10', netAmount: 1000 }],
      commissionPercent: 10,
      monthlyFee: 50,
      expenses: [{ description: 'Luz', category: 'utilities_power', date: '2026-06-05', amount: 120 }],
      entries: [{ id: 'e1', type: 'credit', description: 'Reembolso', amount: 30 }],
    });
    const kinds = r.breakdown.lines.map((l) => l.kind);
    expect(kinds).toEqual(['reservation', 'commission', 'monthly_fee', 'expense', 'adjustment']);
    const totalCredit = r.breakdown.lines.reduce((s, l) => s + l.credit, 0);
    const totalDebit = r.breakdown.lines.reduce((s, l) => s + l.debit, 0);
    expect(Number((totalCredit - totalDebit).toFixed(2))).toBe(r.netPayoutAmount);
  });
});
```

- [ ] **Step 4: Rodar os testes e ver falhar**

Run: `pnpm --filter @adelina/api test`
Expected: FAIL — `Cannot find module './payouts.calc'`.

- [ ] **Step 5: Implementar a função pura**

Crie `apps/api/src/modules/payouts/payouts.calc.ts`:

```ts
export type PayoutEntryType = 'credit' | 'debit';

export interface CalcReservation {
  code: string;
  guestName: string;
  checkOut: string; // ISO yyyy-mm-dd
  netAmount: number;
}

export interface CalcExpense {
  description: string;
  category: string;
  date: string; // ISO yyyy-mm-dd
  amount: number;
}

export interface CalcEntry {
  id: string;
  type: PayoutEntryType;
  description: string;
  amount: number;
}

export interface PayoutCalcInput {
  reservations: CalcReservation[];
  expenses: CalcExpense[];
  entries: CalcEntry[];
  commissionPercent: number; // ex.: 18.5
  monthlyFee: number;
}

export type PayoutLineKind = 'reservation' | 'commission' | 'monthly_fee' | 'expense' | 'adjustment';

export interface PayoutLine {
  kind: PayoutLineKind;
  date: string | null;
  description: string;
  credit: number;
  debit: number;
}

export interface PayoutCalcResult {
  revenueAmount: number;
  commissionPercent: number;
  commissionFeeAmount: number;
  monthlyFeeAmount: number;
  expensesAmount: number;
  adjustmentsCredit: number;
  adjustmentsDebit: number;
  netPayoutAmount: number;
  reservationCount: number;
  breakdown: { lines: PayoutLine[] };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const sum = (arr: number[]) => arr.reduce((s, n) => s + n, 0);

export function computePayout(input: PayoutCalcInput): PayoutCalcResult {
  const revenueAmount = round2(sum(input.reservations.map((r) => r.netAmount)));
  const commissionFeeAmount = round2((revenueAmount * input.commissionPercent) / 100);
  const monthlyFeeAmount = round2(input.monthlyFee);
  const expensesAmount = round2(sum(input.expenses.map((e) => e.amount)));
  const adjustmentsCredit = round2(
    sum(input.entries.filter((e) => e.type === 'credit').map((e) => e.amount)),
  );
  const adjustmentsDebit = round2(
    sum(input.entries.filter((e) => e.type === 'debit').map((e) => e.amount)),
  );
  const netPayoutAmount = round2(
    revenueAmount - commissionFeeAmount - monthlyFeeAmount - expensesAmount + adjustmentsCredit - adjustmentsDebit,
  );

  const lines: PayoutLine[] = [];
  for (const r of input.reservations) {
    lines.push({ kind: 'reservation', date: r.checkOut, description: `Reserva ${r.code} — ${r.guestName}`, credit: round2(r.netAmount), debit: 0 });
  }
  if (commissionFeeAmount > 0) {
    lines.push({ kind: 'commission', date: null, description: `Comissão de administração (${input.commissionPercent}%)`, credit: 0, debit: commissionFeeAmount });
  }
  if (monthlyFeeAmount > 0) {
    lines.push({ kind: 'monthly_fee', date: null, description: 'Taxa fixa mensal', credit: 0, debit: monthlyFeeAmount });
  }
  for (const e of input.expenses) {
    lines.push({ kind: 'expense', date: e.date, description: e.description, credit: 0, debit: round2(e.amount) });
  }
  for (const e of input.entries) {
    lines.push({ kind: 'adjustment', date: null, description: e.description, credit: e.type === 'credit' ? round2(e.amount) : 0, debit: e.type === 'debit' ? round2(e.amount) : 0 });
  }

  return {
    revenueAmount,
    commissionPercent: input.commissionPercent,
    commissionFeeAmount,
    monthlyFeeAmount,
    expensesAmount,
    adjustmentsCredit,
    adjustmentsDebit,
    netPayoutAmount,
    reservationCount: input.reservations.length,
    breakdown: { lines },
  };
}
```

- [ ] **Step 6: Rodar os testes e ver passar**

Run: `pnpm --filter @adelina/api test`
Expected: PASS — 7 testes verdes.

- [ ] **Step 7: Commit**

```bash
git add apps/api/vitest.config.ts apps/api/package.json apps/api/src/modules/payouts/payouts.calc.ts apps/api/src/modules/payouts/payouts.calc.spec.ts
git commit -m "feat(payouts): motor de cálculo do repasse (função pura) + testes vitest"
```

---

## Task 5: Módulo Owners (CRUD de proprietários)

**Files:**
- Create: `apps/api/src/modules/owners/owners.service.ts`
- Create: `apps/api/src/modules/owners/owners.controller.ts`
- Create: `apps/api/src/modules/owners/owners.module.ts`

- [ ] **Step 1: Service**

Crie `apps/api/src/modules/owners/owners.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@adelina/db';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateOwnerInput {
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  pixKey?: string | null;
  bankInfo?: string | null;
  notes?: string | null;
}
export type UpdateOwnerInput = Partial<CreateOwnerInput> & { active?: boolean };

@Injectable()
export class OwnersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.owner.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
        include: { _count: { select: { properties: true } } },
      }),
    );
  }

  async findOne(tenantId: string, id: string) {
    const owner = await this.prisma.withTenant(tenantId, (tx) =>
      tx.owner.findFirst({
        where: { id, tenantId },
        include: { properties: { select: { id: true, name: true } } },
      }),
    );
    if (!owner) throw new NotFoundException('Proprietário não encontrado.');
    return owner;
  }

  async create(tenantId: string, input: CreateOwnerInput) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.owner.create({
        data: {
          tenantId,
          name: input.name,
          document: input.document ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          pixKey: input.pixKey ?? null,
          bankInfo: input.bankInfo ?? null,
          notes: input.notes ?? null,
        },
      }),
    );
  }

  async update(tenantId: string, id: string, input: UpdateOwnerInput) {
    await this.findOne(tenantId, id);
    const data: Prisma.OwnerUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.document !== undefined) data.document = input.document ?? null;
    if (input.email !== undefined) data.email = input.email ?? null;
    if (input.phone !== undefined) data.phone = input.phone ?? null;
    if (input.pixKey !== undefined) data.pixKey = input.pixKey ?? null;
    if (input.bankInfo !== undefined) data.bankInfo = input.bankInfo ?? null;
    if (input.notes !== undefined) data.notes = input.notes ?? null;
    if (input.active !== undefined) data.active = input.active;
    return this.prisma.withTenant(tenantId, (tx) => tx.owner.update({ where: { id }, data }));
  }

  async remove(tenantId: string, id: string) {
    const owner = await this.findOne(tenantId, id);
    if (owner.properties.length > 0) {
      throw new BadRequestException(
        'Desvincule os imóveis deste proprietário antes de excluí-lo.',
      );
    }
    await this.prisma.withTenant(tenantId, (tx) => tx.owner.delete({ where: { id } }));
    return { ok: true };
  }
}
```

- [ ] **Step 2: Controller**

Crie `apps/api/src/modules/owners/owners.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequireCapability } from '../../common/require-capability.decorator';
import { OwnersService } from './owners.service';

const CreateSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório.').max(160),
  document: z.string().max(40).nullish(),
  email: z.string().email('E-mail inválido.').max(160).nullish().or(z.literal('')),
  phone: z.string().max(40).nullish(),
  pixKey: z.string().max(160).nullish(),
  bankInfo: z.string().max(500).nullish(),
  notes: z.string().max(1000).nullish(),
});
const UpdateSchema = CreateSchema.partial().extend({ active: z.boolean().optional() });

@ApiTags('owners')
@ApiBearerAuth()
@Controller('owners')
export class OwnersController {
  constructor(private readonly owners: OwnersService) {}

  @RequireCapability('owner:read')
  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.owners.findAll(tenantId);
  }

  @RequireCapability('owner:read')
  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.owners.findOne(tenantId, id);
  }

  @RequireCapability('owner:manage')
  @Post()
  create(@TenantId() tenantId: string, @Body() body: unknown) {
    return this.owners.create(tenantId, CreateSchema.parse(body));
  }

  @RequireCapability('owner:manage')
  @Patch(':id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.owners.update(tenantId, id, UpdateSchema.parse(body));
  }

  @RequireCapability('owner:manage')
  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.owners.remove(tenantId, id);
  }
}
```

- [ ] **Step 3: Module**

Crie `apps/api/src/modules/owners/owners.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { OwnersController } from './owners.controller';
import { OwnersService } from './owners.service';

@Module({
  controllers: [OwnersController],
  providers: [OwnersService],
  exports: [OwnersService],
})
export class OwnersModule {}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @adelina/api typecheck`
Expected: sem erros novos além dos ~21 pré-existentes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/owners
git commit -m "feat(api): módulo owners (CRUD de proprietários)"
```

---

## Task 6: Termos de administração no Property (PUT)

**Files:**
- Modify: `apps/api/src/modules/properties/properties.controller.ts`

- [ ] **Step 1: Estender o schema com os termos**

Em `apps/api/src/modules/properties/properties.controller.ts`, no `CreatePropertySchema`, adicione (após `email`):

```ts
  ownerId: z.string().uuid().nullish(),
  mgmtCommissionPercent: z.number().min(0).max(100).optional(),
  mgmtMonthlyFee: z.number().min(0).optional(),
```

> Nota: o `update` usa `CreatePropertySchema.partial()`, então os 3 campos já entram no PUT.
> O `connect/disconnect` do owner é tratado no Step 2.

- [ ] **Step 2: Tratar ownerId no update (connect/disconnect)**

Substitua o método `update` por:

```ts
  @Put(':id')
  @RequireCapability('property:manage')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: unknown) {
    const { ownerId, ...rest } = CreatePropertySchema.partial().parse(body);
    const data: Record<string, unknown> = { ...rest };
    if (ownerId !== undefined) {
      data.owner = ownerId ? { connect: { id: ownerId } } : { disconnect: true };
    }
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.property.update({ where: { id }, data }),
    );
  }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @adelina/api typecheck`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/properties/properties.controller.ts
git commit -m "feat(api): termos de administração (owner, %, taxa fixa) no PUT de properties"
```

---

## Task 7: Módulo Payouts (service de orquestração)

**Files:**
- Create: `apps/api/src/modules/payouts/payouts.service.ts`

- [ ] **Step 1: Service**

Crie `apps/api/src/modules/payouts/payouts.service.ts`:

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PayoutEntryType } from '@adelina/db';
import { startOfMonth, endOfMonth, parse } from 'date-fns';
import { PrismaService } from '../../common/prisma/prisma.service';
import { computePayout, PayoutCalcResult } from './payouts.calc';

/** 'YYYY-MM' -> Date do 1º dia do mês (UTC). Lança se inválido. */
function competenceToDate(competence: string): Date {
  if (!/^\d{4}-\d{2}$/.test(competence)) {
    throw new BadRequestException('Competência inválida (use YYYY-MM).');
  }
  const d = parse(competence + '-01', 'yyyy-MM-dd', new Date());
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Competência inválida.');
  return startOfMonth(d);
}

export interface PayoutView extends PayoutCalcResult {
  propertyId: string;
  propertyName: string;
  ownerId: string | null;
  ownerName: string | null;
  competence: string; // YYYY-MM
  status: 'open' | 'paid';
  paidAt: string | null;
  paymentMethod: string | null;
  receiptUrl: string | null;
}

@Injectable()
export class PayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Mapeia uma linha congelada (owner_payouts) para a forma de view. */
  private frozenToView(p: any, propertyName: string, ownerName: string | null): PayoutView {
    return {
      propertyId: p.propertyId,
      propertyName,
      ownerId: p.ownerId,
      ownerName,
      competence: p.competence.toISOString().slice(0, 7),
      status: 'paid',
      paidAt: p.paidAt.toISOString(),
      paymentMethod: p.paymentMethod,
      receiptUrl: p.receiptUrl,
      revenueAmount: Number(p.revenueAmount),
      commissionPercent: Number(p.commissionPercent),
      commissionFeeAmount: Number(p.commissionFeeAmount),
      monthlyFeeAmount: Number(p.monthlyFeeAmount),
      expensesAmount: Number(p.expensesAmount),
      adjustmentsCredit: 0,
      adjustmentsDebit: 0,
      netPayoutAmount: Number(p.netPayoutAmount),
      reservationCount: p.reservationCount,
      breakdown: p.breakdown,
    };
  }

  /** Calcula (ao vivo) o repasse de um imóvel num mês, OU devolve o snapshot se já pago. */
  async compute(tenantId: string, propertyId: string, competence: string): Promise<PayoutView> {
    const first = competenceToDate(competence);
    const last = endOfMonth(first);

    return this.prisma.withTenant(tenantId, async (tx) => {
      const property = await tx.property.findFirst({
        where: { id: propertyId, tenantId },
        include: { owner: { select: { id: true, name: true } } },
      });
      if (!property) throw new NotFoundException('Imóvel não encontrado.');

      const frozen = await tx.ownerPayout.findUnique({
        where: { propertyId_competence: { propertyId, competence: first } },
      });
      if (frozen) {
        return this.frozenToView(frozen, property.name, property.owner?.name ?? null);
      }

      const [reservations, expenses, entries] = await Promise.all([
        tx.reservation.findMany({
          where: {
            propertyId,
            checkOut: { gte: first, lte: last },
            status: { in: ['confirmed', 'checked_in', 'checked_out'] },
          },
          include: { guest: { select: { fullName: true } } },
          orderBy: { checkOut: 'asc' },
        }),
        tx.expense.findMany({
          where: { propertyId, date: { gte: first, lte: last } },
          orderBy: { date: 'asc' },
        }),
        tx.payoutEntry.findMany({
          where: { propertyId, competence: first },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

      const calc = computePayout({
        reservations: reservations.map((r) => ({
          code: r.code,
          guestName: r.guest?.fullName ?? 'Hóspede',
          checkOut: r.checkOut.toISOString().slice(0, 10),
          netAmount: Number(r.netAmount),
        })),
        expenses: expenses.map((e) => ({
          description: e.description,
          category: e.category,
          date: e.date.toISOString().slice(0, 10),
          amount: Number(e.amount),
        })),
        entries: entries.map((e) => ({
          id: e.id,
          type: e.type as 'credit' | 'debit',
          description: e.description,
          amount: Number(e.amount),
        })),
        commissionPercent: Number(property.mgmtCommissionPercent),
        monthlyFee: Number(property.mgmtMonthlyFee),
      });

      return {
        propertyId,
        propertyName: property.name,
        ownerId: property.owner?.id ?? null,
        ownerName: property.owner?.name ?? null,
        competence,
        status: 'open' as const,
        paidAt: null,
        paymentMethod: null,
        receiptUrl: null,
        ...calc,
      };
    });
  }

  /** Lista repasses de todos os imóveis COM proprietário, na competência. */
  async list(tenantId: string, competence: string): Promise<PayoutView[]> {
    const properties = await this.prisma.withTenant(tenantId, (tx) =>
      tx.property.findMany({
        where: { tenantId, ownerId: { not: null } },
        select: { id: true },
        orderBy: { name: 'asc' },
      }),
    );
    return Promise.all(properties.map((p) => this.compute(tenantId, p.id, competence)));
  }

  /** Lançamento avulso — só com o mês aberto. */
  async addEntry(
    tenantId: string,
    propertyId: string,
    competence: string,
    input: { type: PayoutEntryType; description: string; amount: number },
  ) {
    const first = competenceToDate(competence);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const property = await tx.property.findFirst({ where: { id: propertyId, tenantId }, select: { id: true } });
      if (!property) throw new NotFoundException('Imóvel não encontrado.');
      const frozen = await tx.ownerPayout.findUnique({
        where: { propertyId_competence: { propertyId, competence: first } },
        select: { id: true },
      });
      if (frozen) throw new ConflictException('Repasse já pago. Reabra para editar lançamentos.');
      return tx.payoutEntry.create({
        data: { tenantId, propertyId, competence: first, type: input.type, description: input.description, amount: input.amount },
      });
    });
  }

  async removeEntry(tenantId: string, entryId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const entry = await tx.payoutEntry.findFirst({ where: { id: entryId, tenantId } });
      if (!entry) throw new NotFoundException('Lançamento não encontrado.');
      const frozen = await tx.ownerPayout.findUnique({
        where: { propertyId_competence: { propertyId: entry.propertyId, competence: entry.competence } },
        select: { id: true },
      });
      if (frozen) throw new ConflictException('Repasse já pago. Reabra para editar lançamentos.');
      await tx.payoutEntry.delete({ where: { id: entryId } });
      return { ok: true };
    });
  }

  /** Congela o snapshot e marca pago. */
  async pay(
    tenantId: string,
    propertyId: string,
    competence: string,
    input: { paidAt?: string; paymentMethod?: string | null; receiptUrl?: string | null },
  ) {
    const first = competenceToDate(competence);
    const view = await this.compute(tenantId, propertyId, competence);
    if (view.status === 'paid') throw new ConflictException('Repasse já está pago.');

    return this.prisma.withTenant(tenantId, (tx) =>
      tx.ownerPayout.create({
        data: {
          tenantId,
          propertyId,
          ownerId: view.ownerId,
          competence: first,
          revenueAmount: view.revenueAmount,
          commissionPercent: view.commissionPercent,
          commissionFeeAmount: view.commissionFeeAmount,
          monthlyFeeAmount: view.monthlyFeeAmount,
          expensesAmount: view.expensesAmount,
          netPayoutAmount: view.netPayoutAmount,
          reservationCount: view.reservationCount,
          breakdown: view.breakdown as object,
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
          paymentMethod: input.paymentMethod ?? null,
          receiptUrl: input.receiptUrl ?? null,
        },
      }),
    );
  }

  /** Apaga a linha congelada (reabre o mês). */
  async reopen(tenantId: string, propertyId: string, competence: string) {
    const first = competenceToDate(competence);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const frozen = await tx.ownerPayout.findUnique({
        where: { propertyId_competence: { propertyId, competence: first } },
        select: { id: true, tenantId: true },
      });
      if (!frozen || frozen.tenantId !== tenantId) throw new NotFoundException('Repasse pago não encontrado.');
      await tx.ownerPayout.delete({ where: { id: frozen.id } });
      return { ok: true };
    });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @adelina/api typecheck`
Expected: sem erros novos. (Se `parse` do date-fns acusar tipo, confirme o import `import { parse } from 'date-fns'`.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/payouts/payouts.service.ts
git commit -m "feat(payouts): service de orquestração (compute, list, pay, reopen, lançamentos)"
```

---

## Task 8: Payouts controller + module + registro no AppModule

**Files:**
- Create: `apps/api/src/modules/payouts/payouts.controller.ts`
- Create: `apps/api/src/modules/payouts/payouts.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Controller**

Crie `apps/api/src/modules/payouts/payouts.controller.ts`:

```ts
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
```

> Nota de ordem de rotas: `Delete('entries/:id')` e `Get(':propertyId/:competence')` coexistem
> sem conflito porque um é DELETE e o outro GET. O `Get()` raiz (lista) usa querystring.

- [ ] **Step 2: Module**

Crie `apps/api/src/modules/payouts/payouts.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

@Module({
  controllers: [PayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
```

- [ ] **Step 3: Registrar no AppModule**

Em `apps/api/src/app.module.ts`, adicione os imports (após `ExpensesModule`):

```ts
import { OwnersModule } from './modules/owners/owners.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
```

E no array `imports` do `@Module`, após `ExpensesModule`, adicione:

```ts
    OwnersModule,
    PayoutsModule,
```

- [ ] **Step 4: Build da API (SWC) p/ validar wiring**

Run: `pnpm --filter @adelina/api build`
Expected: build conclui sem erro (SWC ignora os ~21 erros de tipo pré-existentes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/payouts/payouts.controller.ts apps/api/src/modules/payouts/payouts.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): payouts controller/module + registro no AppModule"
```

---

## Task 9: Web — página de Proprietários

**Files:**
- Create: `apps/web/src/app/(dashboard)/financeiro/proprietarios/page.tsx`

> **Padrão a seguir:** copie a estrutura de `apps/web/src/app/(dashboard)/financeiro/despesas/page.tsx`
> (lista + modal + TanStack Query). Convenções já usadas lá: `api(path, { method, body })` SEMPRE com
> path EN do `@Controller` (`/owners`, `/properties`); componente `Select` recebe `options:{value,label}[]`
> + `onChange:(v:string)=>void`; inputs usam classe `input-base`; `toast.success(msg, desc?)` /
> `toast.error(msg, desc?)` do `sonner`; gating com `useCan()` de `@/lib/use-permissions`.

- [ ] **Step 1: Criar a página**

Crie `apps/web/src/app/(dashboard)/financeiro/proprietarios/page.tsx` com:

- `useQuery(['owners'], () => api('/owners'))` para listar; cada item mostra `name`, `document`,
  contato (`email`/`phone`), `_count.properties` e dados de pagamento (`pixKey`).
- Botão "Novo proprietário" → modal com campos: `name` (obrigatório), `document`, `email`, `phone`,
  `pixKey`, `bankInfo` (textarea), `notes` (textarea).
- Submeter cria via `api('/owners', { method: 'POST', body })` ou edita via
  `api('/owners/'+id, { method: 'PATCH', body })`; on success `invalidateQueries(['owners'])` +
  `toast.success('Proprietário salvo')`.
- Excluir via `api('/owners/'+id, { method: 'DELETE' })`; on error mostrar a mensagem do servidor
  (`toast.error(err.message)`) — o backend bloqueia se houver imóvel vinculado.
- Seção "Imóveis administrados": `useQuery(['properties'], () => api('/properties'))`; para cada
  imóvel, um form inline com `Select` de proprietário (options = owners + opção "— Sem proprietário —"
  com value `''`), input `mgmtCommissionPercent` (number, %) e `mgmtMonthlyFee` (number, R$). Salvar
  via `api('/properties/'+propertyId, { method: 'PUT', body: { ownerId: value || null, mgmtCommissionPercent, mgmtMonthlyFee } })`,
  depois `invalidateQueries(['properties'])`.
- Toda a página gated: se `!useCan('owner:read')`, renderizar aviso "Sem acesso".

- [ ] **Step 2: Typecheck/lint do web**

Run: `pnpm --filter @adelina/web typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/financeiro/proprietarios/page.tsx"
git commit -m "feat(web): página de proprietários (CRUD + termos de administração)"
```

---

## Task 10: Web — página de Repasses (extrato em razão)

**Files:**
- Create: `apps/web/src/app/(dashboard)/financeiro/repasses/page.tsx`

> Mesmo padrão da Task 9. Datas/labels com `date-fns` (locale pt-BR já usado no projeto).
> Valores: API devolve números (a calc já converte Decimal→number), formatar com
> `toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })`.

- [ ] **Step 1: Criar a página**

Crie `apps/web/src/app/(dashboard)/financeiro/repasses/page.tsx` com:

- Estado `competence` (default: mês atual `format(new Date(),'yyyy-MM')`); seletor de mês
  (input `type="month"` ou dois `Select` ano/mês).
- `useQuery(['payouts', competence], () => api('/payouts?competence='+competence))` → lista de
  `PayoutView`. Tabela com colunas: Imóvel · Proprietário · Receita (`revenueAmount`) ·
  Taxa adm (`commissionFeeAmount` + `monthlyFeeAmount`, mostrar `commissionPercent`%) ·
  Despesas (`expensesAmount`) · **Repasse** (`netPayoutAmount`) · Status
  (`status==='paid' ? 'Pago em '+format(paidAt) : 'Em aberto'`).
- Linha clicável → "Ver extrato" abre modal que faz
  `useQuery(['payout', propertyId, competence], () => api('/payouts/'+propertyId+'/'+competence))`.
- **Modal (extrato em razão):** renderizar `breakdown.lines` numa tabela Descrição · Crédito · Débito ·
  Saldo (saldo corrente acumulado no cliente: `acc += credit - debit`). Última linha em destaque:
  "Repasse líquido = `netPayoutAmount`".
- Se `status==='open'`:
  - Form "Adicionar lançamento": `Select` type (`credit`/`debit`), input descrição, input valor →
    `api('/payouts/'+propertyId+'/'+competence+'/entries', { method:'POST', body })` →
    `invalidateQueries(['payout', propertyId, competence])` + `['payouts', competence]`.
  - Cada linha `kind==='adjustment'` carrega `entryId` (adicionado ao breakdown na Step 2) e exibe
    um botão remover que chama `api('/payouts/entries/'+line.entryId, { method:'DELETE' })` →
    `invalidateQueries(['payout', propertyId, competence])` + `['payouts', competence]`.
  - Botão "Marcar pago": modal pequeno com `paidAt` (default hoje), `paymentMethod` (texto),
    `receiptUrl` (opcional) → `api('/payouts/'+propertyId+'/'+competence+'/pay', { method:'POST', body })`.
- Se `status==='paid'`: botão "Reabrir" → `api('/payouts/'+propertyId+'/'+competence+'/reopen', { method:'POST' })`.
- Página gated em `useCan('payout:read')`; ações de escrita gated em `useCan('payout:manage')`.

- [ ] **Step 2: Expor o id do lançamento no breakdown (ajuste no calc + service)**

Para permitir remover lançamentos pela UI, inclua o id na linha de ajuste.

Em `apps/api/src/modules/payouts/payouts.calc.ts`, adicione campo opcional `entryId` a `PayoutLine`:

```ts
export interface PayoutLine {
  kind: PayoutLineKind;
  date: string | null;
  description: string;
  credit: number;
  debit: number;
  entryId?: string; // preenchido só em kind==='adjustment'
}
```

E na montagem das linhas de ajuste:

```ts
  for (const e of input.entries) {
    lines.push({ kind: 'adjustment', date: null, description: e.description, credit: e.type === 'credit' ? round2(e.amount) : 0, debit: e.type === 'debit' ? round2(e.amount) : 0, entryId: e.id });
  }
```

Atualize o teste do breakdown em `payouts.calc.spec.ts` (Task 4, Step 3) adicionando, no caso com `entries`:

```ts
    const adj = r.breakdown.lines.find((l) => l.kind === 'adjustment');
    expect(adj?.entryId).toBe('e1');
```

Run: `pnpm --filter @adelina/api test`
Expected: PASS.

Na UI, o botão remover aparece nas linhas com `entryId` e chama `DELETE /payouts/entries/'+line.entryId`.

- [ ] **Step 3: Typecheck do web + retest da API**

Run: `pnpm --filter @adelina/web typecheck && pnpm --filter @adelina/api test`
Expected: sem erros; testes verdes.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(dashboard)/financeiro/repasses/page.tsx" apps/api/src/modules/payouts/payouts.calc.ts apps/api/src/modules/payouts/payouts.calc.spec.ts
git commit -m "feat(web): página de repasses com extrato em razão + lançamentos avulsos"
```

---

## Task 11: Menu Financeiro (Repasses + Proprietários)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Importar ícones**

No import de `lucide-react` em `apps/web/src/app/(dashboard)/layout.tsx`, adicione `HandCoins` e `Building2` à lista (junto de `Wallet`).

- [ ] **Step 2: Adicionar itens ao `extraNav`**

No array `extraNav` (onde está o item Financeiro/Despesas), logo após o item de despesas, adicione:

```tsx
        { href: '/financeiro/repasses', label: 'Repasses', icon: HandCoins, hint: 'Proprietários' },
        { href: '/financeiro/proprietarios', label: 'Proprietários', icon: Building2 },
```

(Mantêm o mesmo gating owner/manager já aplicado ao bloco `extraNav`.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @adelina/web typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(dashboard)/layout.tsx"
git commit -m "feat(web): itens de menu Repasses e Proprietários no Financeiro"
```

---

## Task 12: Deploy + verificação em produção

**Files:** nenhum (operacional)

- [ ] **Step 1: Garantir que a migração já foi aplicada (Task 2)**

Run: `docker exec adelina_postgres psql -U postgres -d adelina -c "\dt owners owner_payouts payout_entries"`
Expected: 3 tabelas presentes. (Se ausentes, rode a Task 2 Step 2 antes do deploy.)

- [ ] **Step 2: Deploy**

Run: `bash /root/adelina/deploy.sh`
Expected: build de api+web, `docker stack deploy`, e `service update --force`. Ver "✓ deploy concluído".

- [ ] **Step 3: Verificar imagens novas no ar (gotcha do Swarm :latest)**

Run: `docker inspect adelina_api --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'` e compare o image ID do container em execução com o recém-buildado (`docker images adelina-api:latest -q`).
Expected: o container roda a imagem nova. (Se não, `docker service update --force --image adelina-api:latest adelina_api`.)

- [ ] **Step 4: Smoke test autenticado**

Logar no painel como owner/manager, abrir **Financeiro → Proprietários**, criar 1 proprietário,
vinculá-lo a um imóvel com % e taxa fixa. Abrir **Financeiro → Repasses** no mês corrente, conferir
a linha do imóvel, abrir o extrato (razão), adicionar 1 lançamento de crédito e 1 de débito, conferir
o saldo, **marcar pago** e depois **reabrir**.
Expected: valores batem com a fórmula `receita − comissão − taxa fixa − despesas + créditos − débitos`.

- [ ] **Step 5: Verificar isolamento (RLS) e papéis**

Confirmar que um usuário `receptionist`/`readonly` NÃO vê o menu Financeiro e que as rotas
`/api/owners` e `/api/payouts` retornam 403 para esses papéis.
Expected: 403 (CapabilityGuard) para papéis sem `owner:*`/`payout:*`.

---

## Notas de verificação final
- A fórmula canônica está no spec; o motor (`payouts.calc.ts`) é a fonte da verdade e tem testes.
- Repasse pago **não** cria `Expense` (sem dedução recursiva).
- Ao mudar regra de papel, atualizar os DOIS espelhos de permissões (api + web).
- Toda query autenticada passa por `withTenant`; nunca `prisma.x` direto.
