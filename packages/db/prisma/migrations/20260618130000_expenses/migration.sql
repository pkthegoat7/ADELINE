-- Módulo Despesas (Expenses)
-- Aditivo: cria enums ExpenseCategory e ExpenseStatus, tabela expenses.
-- RLS no mesmo padrão das demais tabelas tenant-scoped (app_current_tenant()).

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('utilities_water', 'utilities_power', 'utilities_internet', 'cleaning', 'maintenance', 'salaries', 'taxes', 'supplies', 'marketing', 'software', 'rent', 'other');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('pending', 'paid');

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "property_id" UUID,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "supplier" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'pending',
    "due_date" DATE,
    "paid_at" DATE,
    "receipt_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expenses_tenant_id_idx" ON "expenses"("tenant_id");
CREATE INDEX "expenses_property_id_idx" ON "expenses"("property_id");
CREATE INDEX "expenses_status_idx" ON "expenses"("status");
CREATE INDEX "expenses_date_idx" ON "expenses"("date");
CREATE INDEX "expenses_due_date_idx" ON "expenses"("due_date");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (mesmo padrão das demais tabelas tenant-scoped)
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY expenses_tenant ON "expenses"
  USING (tenant_id = app_current_tenant());
