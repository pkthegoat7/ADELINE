-- WhatsApp (Evolution API) + ficha de cadastro pública

CREATE TYPE "WhatsappInstanceStatus" AS ENUM ('disconnected', 'connecting', 'connected');
CREATE TYPE "RegistrationLinkStatus" AS ENUM ('pending', 'completed', 'expired');

-- Guest: documento anexado + acompanhantes
ALTER TABLE guests ADD COLUMN document_file_path TEXT;
ALTER TABLE guests ADD COLUMN primary_guest_id UUID;
ALTER TABLE guests ADD CONSTRAINT guests_primary_guest_id_fkey
  FOREIGN KEY (primary_guest_id) REFERENCES guests(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE whatsapp_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  instance_name TEXT NOT NULL,
  status "WhatsappInstanceStatus" NOT NULL DEFAULT 'disconnected',
  phone_number TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT whatsapp_instances_pkey PRIMARY KEY (id),
  CONSTRAINT whatsapp_instances_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX whatsapp_instances_tenant_id_key ON whatsapp_instances(tenant_id);
CREATE UNIQUE INDEX whatsapp_instances_instance_name_key ON whatsapp_instances(instance_name);

CREATE TABLE guest_registration_links (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  token TEXT NOT NULL,
  phone TEXT NOT NULL,
  status "RegistrationLinkStatus" NOT NULL DEFAULT 'pending',
  guest_id UUID,
  expires_at TIMESTAMP(3) NOT NULL,
  completed_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT guest_registration_links_pkey PRIMARY KEY (id),
  CONSTRAINT guest_registration_links_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT guest_registration_links_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX guest_registration_links_token_key ON guest_registration_links(token);
CREATE INDEX guest_registration_links_tenant_id_status_idx ON guest_registration_links(tenant_id, status);

-- RLS (mesmo padrão das demais tabelas tenant-scoped)
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_instances_tenant ON whatsapp_instances
  USING (tenant_id = app_current_tenant());

ALTER TABLE guest_registration_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY guest_registration_links_tenant ON guest_registration_links
  USING (tenant_id = app_current_tenant());
