-- Link de pagamento da reserva + configurações por pousada
-- Aditivo: cria enum PaymentLinkStatus, tabelas payment_links e tenant_settings.
-- RLS no mesmo padrão das demais tabelas tenant-scoped (app_current_tenant()).

CREATE TYPE "PaymentLinkStatus" AS ENUM ('pending', 'paid', 'expired', 'cancelled');

CREATE TABLE payment_links (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  reservation_id UUID NOT NULL,
  token TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  status "PaymentLinkStatus" NOT NULL DEFAULT 'pending',
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  terms_accepted_at TIMESTAMP(3),
  lgpd_accepted_at TIMESTAMP(3),
  accepted_ip TEXT,
  terms_snapshot TEXT,
  expires_at TIMESTAMP(3) NOT NULL,
  paid_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payment_links_pkey PRIMARY KEY (id),
  CONSTRAINT payment_links_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT payment_links_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX payment_links_token_key ON payment_links(token);
CREATE INDEX payment_links_tenant_id_idx ON payment_links(tenant_id);
CREATE INDEX payment_links_reservation_id_idx ON payment_links(reservation_id);

CREATE TABLE tenant_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tenant_settings_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX tenant_settings_tenant_id_key_key ON tenant_settings(tenant_id, key);

-- RLS (mesmo padrão das demais tabelas tenant-scoped)
ALTER TABLE payment_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_links_tenant ON payment_links
  USING (tenant_id = app_current_tenant());

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_settings_tenant ON tenant_settings
  USING (tenant_id = app_current_tenant());
