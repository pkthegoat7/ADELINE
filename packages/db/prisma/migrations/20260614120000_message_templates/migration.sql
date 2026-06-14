-- Templates de mensagem WhatsApp customizáveis por tenant.

CREATE TYPE "MessageTemplateType" AS ENUM (
  'checkin_tomorrow',
  'post_checkout',
  'pending_registration',
  'registration_link',
  'password_reset'
);

CREATE TABLE message_templates (
  id         UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  type       "MessageTemplateType" NOT NULL,
  body       TEXT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  hour_brt   INTEGER,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT message_templates_pkey PRIMARY KEY (id),
  CONSTRAINT message_templates_tenant_id_fkey FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT message_templates_hour_brt_range CHECK (hour_brt IS NULL OR (hour_brt >= 0 AND hour_brt <= 23))
);

CREATE UNIQUE INDEX message_templates_tenant_id_type_key ON message_templates(tenant_id, type);
CREATE INDEX message_templates_tenant_id_idx ON message_templates(tenant_id);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_templates_tenant ON message_templates
  USING (tenant_id = app_current_tenant());
