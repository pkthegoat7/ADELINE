-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (multi-tenant isolation)
--
-- Estratégia:
--  - Toda tabela tenant-scoped tem RLS habilitado.
--  - Política lê current_setting('app.current_tenant', true) que é
--    setado pela aplicação no início de cada transação:
--      SET LOCAL app.current_tenant = '<uuid>';
--  - Service role (bypassrls) ignora as políticas — usado por jobs.
-- ═══════════════════════════════════════════════════════════════

-- Helper: pega o tenant atual da sessão; NULL se não setado.
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid;
$$;

-- Helper para tabelas que herdam tenant indiretamente (via property/room/etc.)
CREATE OR REPLACE FUNCTION app_property_in_tenant(p_property_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM properties
    WHERE id = p_property_id AND tenant_id = app_current_tenant()
  );
$$;

CREATE OR REPLACE FUNCTION app_room_in_tenant(p_room_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM rooms r
    JOIN properties p ON p.id = r.property_id
    WHERE r.id = p_room_id AND p.tenant_id = app_current_tenant()
  );
$$;

CREATE OR REPLACE FUNCTION app_reservation_in_tenant(p_reservation_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM reservations
    WHERE id = p_reservation_id AND tenant_id = app_current_tenant()
  );
$$;

-- ── Tenants (cada user vê só o próprio tenant) ─────────────────
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON tenants
  USING (id = app_current_tenant());

-- ── Users ──────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_tenant ON users
  USING (tenant_id = app_current_tenant());

-- ── Properties ─────────────────────────────────────────────────
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY properties_tenant ON properties
  USING (tenant_id = app_current_tenant());

-- ── Room types (via property) ──────────────────────────────────
ALTER TABLE room_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY room_types_tenant ON room_types
  USING (app_property_in_tenant(property_id));

-- ── Rooms (via property) ───────────────────────────────────────
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY rooms_tenant ON rooms
  USING (app_property_in_tenant(property_id));

-- ── Availability (via room) ────────────────────────────────────
ALTER TABLE availability_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY availability_tenant ON availability_calendar
  USING (app_room_in_tenant(room_id));

-- ── Rate calendar (via room_type → property) ───────────────────
ALTER TABLE rate_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY rate_calendar_tenant ON rate_calendar
  USING (EXISTS (
    SELECT 1 FROM room_types rt
    JOIN properties p ON p.id = rt.property_id
    WHERE rt.id = rate_calendar.room_type_id AND p.tenant_id = app_current_tenant()
  ));

-- ── Guests ─────────────────────────────────────────────────────
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY guests_tenant ON guests
  USING (tenant_id = app_current_tenant());

-- ── Reservations ───────────────────────────────────────────────
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY reservations_tenant ON reservations
  USING (tenant_id = app_current_tenant());

-- ── Reservation rooms / guests ─────────────────────────────────
ALTER TABLE reservation_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY reservation_rooms_tenant ON reservation_rooms
  USING (app_reservation_in_tenant(reservation_id));

ALTER TABLE reservation_guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY reservation_guests_tenant ON reservation_guests
  USING (app_reservation_in_tenant(reservation_id));

-- ── Payments / Folios ──────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_tenant ON payments
  USING (app_reservation_in_tenant(reservation_id));

ALTER TABLE folios ENABLE ROW LEVEL SECURITY;
CREATE POLICY folios_tenant ON folios
  USING (app_reservation_in_tenant(reservation_id));

ALTER TABLE folio_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY folio_items_tenant ON folio_items
  USING (EXISTS (
    SELECT 1 FROM folios f
    WHERE f.id = folio_items.folio_id
      AND app_reservation_in_tenant(f.reservation_id)
  ));

-- ── Operação ───────────────────────────────────────────────────
ALTER TABLE housekeeping_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY housekeeping_tenant ON housekeeping_tasks
  USING (app_room_in_tenant(room_id));

ALTER TABLE maintenance_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY maintenance_tenant ON maintenance_tickets
  USING (app_room_in_tenant(room_id));

-- ── Channel manager ────────────────────────────────────────────
ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY channels_tenant ON channel_connections
  USING (app_property_in_tenant(property_id));

ALTER TABLE channel_room_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY channel_mappings_tenant ON channel_room_mappings
  USING (EXISTS (
    SELECT 1 FROM channel_connections cc
    WHERE cc.id = channel_room_mappings.connection_id
      AND app_property_in_tenant(cc.property_id)
  ));

ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY sync_logs_tenant ON sync_logs
  USING (EXISTS (
    SELECT 1 FROM channel_connections cc
    WHERE cc.id = sync_logs.connection_id
      AND app_property_in_tenant(cc.property_id)
  ));

-- ── Pricing rules ──────────────────────────────────────────────
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY pricing_rules_tenant ON pricing_rules
  USING (tenant_id = app_current_tenant());

-- ═══════════════════════════════════════════════════════════════
-- ÍNDICES EXTRA (performance crítica)
-- ═══════════════════════════════════════════════════════════════

-- Calendário operacional: query mais quente do sistema (range por room)
CREATE INDEX IF NOT EXISTS idx_avail_room_date_range
  ON availability_calendar (room_id, date)
  INCLUDE (status, source, reservation_id);

-- Busca de disponibilidade de um tipo de quarto em um intervalo
CREATE INDEX IF NOT EXISTS idx_reservation_property_dates
  ON reservations (property_id, check_in, check_out)
  WHERE status NOT IN ('cancelled', 'no_show');

-- ═══════════════════════════════════════════════════════════════
-- CONSTRAINT: check_out > check_in
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE reservations
  ADD CONSTRAINT reservations_dates_check CHECK (check_out > check_in);
