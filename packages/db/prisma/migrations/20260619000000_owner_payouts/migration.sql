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
