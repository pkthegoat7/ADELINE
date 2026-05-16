-- CreateEnum
CREATE TYPE "TenantPlan" AS ENUM ('trial', 'starter', 'pro', 'enterprise');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended', 'cancelled');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'manager', 'receptionist', 'housekeeper', 'readonly');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('clean', 'dirty', 'inspected', 'maintenance', 'out_of_order');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('available', 'blocked', 'reserved', 'maintenance');

-- CreateEnum
CREATE TYPE "ChannelSource" AS ENUM ('internal', 'direct', 'airbnb', 'booking', 'expedia', 'vrbo', 'despegar', 'walk_in');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('cpf', 'rg', 'passport', 'cnh', 'other');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'partial', 'paid', 'refunded', 'chargeback');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'pix', 'credit_card', 'debit_card', 'bank_transfer', 'link', 'channel_collected');

-- CreateEnum
CREATE TYPE "FolioItemType" AS ENUM ('room', 'service', 'minibar', 'food', 'beverage', 'laundry', 'tax', 'discount', 'other');

-- CreateEnum
CREATE TYPE "HousekeepingType" AS ENUM ('checkout_clean', 'daily_clean', 'deep_clean', 'inspection', 'turnover');

-- CreateEnum
CREATE TYPE "HousekeepingStatus" AS ENUM ('pending', 'in_progress', 'done', 'blocked');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('open', 'in_progress', 'resolved', 'cancelled');

-- CreateEnum
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('active', 'paused', 'error', 'disabled');

-- CreateEnum
CREATE TYPE "SyncDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('success', 'noop', 'conflict', 'error');

-- CreateEnum
CREATE TYPE "PricingRuleType" AS ENUM ('weekday', 'occupancy', 'lead_time', 'date_range', 'min_stay');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "TenantPlan" NOT NULL DEFAULT 'trial',
    "status" "TenantStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'receptionist',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'BR',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "cnpj" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "description" TEXT,
    "amenities" JSONB NOT NULL DEFAULT '[]',
    "photos" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_types" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "beds" INTEGER NOT NULL DEFAULT 1,
    "base_price" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "amenities" JSONB NOT NULL DEFAULT '[]',
    "photos" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_type_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "floor" INTEGER,
    "status" "RoomStatus" NOT NULL DEFAULT 'clean',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_calendar" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'available',
    "source" "ChannelSource" NOT NULL DEFAULT 'internal',
    "source_ref" TEXT,
    "reservation_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availability_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_calendar" (
    "id" UUID NOT NULL,
    "room_type_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "channel" "ChannelSource",
    "price" DECIMAL(10,2) NOT NULL,
    "min_stay" INTEGER NOT NULL DEFAULT 1,
    "max_stay" INTEGER,
    "closed_to_arrival" BOOLEAN NOT NULL DEFAULT false,
    "closed_to_departure" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "document_type" "DocumentType" NOT NULL DEFAULT 'cpf',
    "document" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "birth_date" DATE,
    "nationality" TEXT,
    "address" JSONB,
    "notes" TEXT,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "guest_id" UUID NOT NULL,
    "channel" "ChannelSource" NOT NULL DEFAULT 'direct',
    "channel_reservation_id" TEXT,
    "channel_raw" JSONB,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "commission_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" "ReservationStatus" NOT NULL DEFAULT 'pending',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "special_requests" TEXT,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "checked_in_at" TIMESTAMP(3),
    "checked_out_at" TIMESTAMP(3),

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_rooms" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "room_type_id" UUID NOT NULL,
    "guests_count" INTEGER NOT NULL DEFAULT 1,
    "nightly_rates" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_guests" (
    "reservation_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "fnrh_data" JSONB,
    "fnrh_signed_at" TIMESTAMP(3),

    CONSTRAINT "reservation_guests_pkey" PRIMARY KEY ("reservation_id","guest_id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "gateway" TEXT,
    "gateway_transaction_id" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folios" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folio_items" (
    "id" UUID NOT NULL,
    "folio_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "type" "FolioItemType" NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folio_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "housekeeping_tasks" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "type" "HousekeepingType" NOT NULL,
    "status" "HousekeepingStatus" NOT NULL DEFAULT 'pending',
    "assigned_to_id" UUID,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "housekeeping_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_tickets" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'medium',
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "maintenance_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_connections" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "channel" "ChannelSource" NOT NULL,
    "status" "ChannelConnectionStatus" NOT NULL DEFAULT 'active',
    "ical_import_url" TEXT,
    "ical_export_token" TEXT,
    "credentials" JSONB,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_hash" TEXT,
    "sync_error" TEXT,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_room_mappings" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "external_room_id" TEXT NOT NULL,
    "external_room_name" TEXT,

    CONSTRAINT "channel_room_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "direction" "SyncDirection" NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "payload_hash" TEXT,
    "items_count" INTEGER NOT NULL DEFAULT 0,
    "conflicts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "property_id" UUID,
    "room_type_id" UUID,
    "name" TEXT NOT NULL,
    "type" "PricingRuleType" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "properties_tenant_id_idx" ON "properties"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "properties_tenant_id_slug_key" ON "properties"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "room_types_property_id_idx" ON "room_types"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "room_types_property_id_code_key" ON "room_types"("property_id", "code");

-- CreateIndex
CREATE INDEX "rooms_property_id_idx" ON "rooms"("property_id");

-- CreateIndex
CREATE INDEX "rooms_room_type_id_idx" ON "rooms"("room_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_property_id_code_key" ON "rooms"("property_id", "code");

-- CreateIndex
CREATE INDEX "availability_calendar_date_idx" ON "availability_calendar"("date");

-- CreateIndex
CREATE INDEX "availability_calendar_reservation_id_idx" ON "availability_calendar"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "availability_calendar_room_id_date_key" ON "availability_calendar"("room_id", "date");

-- CreateIndex
CREATE INDEX "rate_calendar_date_idx" ON "rate_calendar"("date");

-- CreateIndex
CREATE UNIQUE INDEX "rate_calendar_room_type_id_date_channel_key" ON "rate_calendar"("room_type_id", "date", "channel");

-- CreateIndex
CREATE INDEX "guests_tenant_id_idx" ON "guests"("tenant_id");

-- CreateIndex
CREATE INDEX "guests_tenant_id_document_idx" ON "guests"("tenant_id", "document");

-- CreateIndex
CREATE INDEX "guests_tenant_id_email_idx" ON "guests"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "reservations_tenant_id_idx" ON "reservations"("tenant_id");

-- CreateIndex
CREATE INDEX "reservations_property_id_check_in_check_out_idx" ON "reservations"("property_id", "check_in", "check_out");

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_tenant_id_code_key" ON "reservations"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_channel_channel_reservation_id_key" ON "reservations"("channel", "channel_reservation_id");

-- CreateIndex
CREATE INDEX "reservation_rooms_room_id_idx" ON "reservation_rooms"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_rooms_reservation_id_room_id_key" ON "reservation_rooms"("reservation_id", "room_id");

-- CreateIndex
CREATE INDEX "payments_reservation_id_idx" ON "payments"("reservation_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "folios_reservation_id_key" ON "folios"("reservation_id");

-- CreateIndex
CREATE INDEX "folio_items_folio_id_idx" ON "folio_items"("folio_id");

-- CreateIndex
CREATE INDEX "housekeeping_tasks_room_id_idx" ON "housekeeping_tasks"("room_id");

-- CreateIndex
CREATE INDEX "housekeeping_tasks_status_scheduled_for_idx" ON "housekeeping_tasks"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "maintenance_tickets_room_id_idx" ON "maintenance_tickets"("room_id");

-- CreateIndex
CREATE INDEX "maintenance_tickets_status_priority_idx" ON "maintenance_tickets"("status", "priority");

-- CreateIndex
CREATE INDEX "channel_connections_status_last_sync_at_idx" ON "channel_connections"("status", "last_sync_at");

-- CreateIndex
CREATE UNIQUE INDEX "channel_connections_property_id_channel_key" ON "channel_connections"("property_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "channel_room_mappings_connection_id_external_room_id_key" ON "channel_room_mappings"("connection_id", "external_room_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_room_mappings_connection_id_room_id_key" ON "channel_room_mappings"("connection_id", "room_id");

-- CreateIndex
CREATE INDEX "sync_logs_connection_id_created_at_idx" ON "sync_logs"("connection_id", "created_at");

-- CreateIndex
CREATE INDEX "pricing_rules_tenant_id_active_idx" ON "pricing_rules"("tenant_id", "active");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_calendar" ADD CONSTRAINT "availability_calendar_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_calendar" ADD CONSTRAINT "availability_calendar_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_calendar" ADD CONSTRAINT "rate_calendar_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_guests" ADD CONSTRAINT "reservation_guests_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_guests" ADD CONSTRAINT "reservation_guests_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folios" ADD CONSTRAINT "folios_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folio_items" ADD CONSTRAINT "folio_items_folio_id_fkey" FOREIGN KEY ("folio_id") REFERENCES "folios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_room_mappings" ADD CONSTRAINT "channel_room_mappings_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "channel_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_room_mappings" ADD CONSTRAINT "channel_room_mappings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "channel_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
