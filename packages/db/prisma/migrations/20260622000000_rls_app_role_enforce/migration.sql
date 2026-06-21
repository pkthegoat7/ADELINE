-- Hardening multi-tenant: bypass de sistema (GUC app.bypass_rls) + cobre tabelas órfãs + grants p/ adelina_app.
-- Aplicada via psql --single-transaction. NÃO usa db push.

-- 1) Helper de bypass de sistema.
CREATE OR REPLACE FUNCTION public.app_is_bypass() RETURNS boolean
  LANGUAGE sql STABLE SET search_path TO '' AS
$$ SELECT current_setting('app.bypass_rls', true) = 'on' $$;

-- 2) Bake bypass nas funções-helper (cobrem availability/housekeeping/maintenance/
--    channel_connections/room_types/rooms/folios/payments/reservation_guests/
--    reservation_rooms + os EXISTS que usam elas: channel_room_mappings/sync_logs/folio_items).
CREATE OR REPLACE FUNCTION public.app_room_in_tenant(p_room_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SET search_path TO '' AS
$$ SELECT public.app_is_bypass() OR EXISTS (
     SELECT 1 FROM public.rooms r JOIN public.properties p ON p.id = r.property_id
     WHERE r.id = p_room_id AND p.tenant_id = public.app_current_tenant()) $$;

CREATE OR REPLACE FUNCTION public.app_property_in_tenant(p_property_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SET search_path TO '' AS
$$ SELECT public.app_is_bypass() OR EXISTS (
     SELECT 1 FROM public.properties p
     WHERE p.id = p_property_id AND p.tenant_id = public.app_current_tenant()) $$;

CREATE OR REPLACE FUNCTION public.app_reservation_in_tenant(p_reservation_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SET search_path TO '' AS
$$ SELECT public.app_is_bypass() OR EXISTS (
     SELECT 1 FROM public.reservations r
     WHERE r.id = p_reservation_id AND r.tenant_id = public.app_current_tenant()) $$;

-- 3) Reescrever as policies que comparam tenant_id/id direto (não passam por helper).
ALTER POLICY expenses_tenant ON expenses USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY guests_tenant ON guests USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY guest_registration_links_tenant ON guest_registration_links USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY message_templates_tenant ON message_templates USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY owner_payouts_tenant ON owner_payouts USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY owners_tenant ON owners USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY payment_links_tenant ON payment_links USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY payout_entries_tenant ON payout_entries USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY pricing_rules_tenant ON pricing_rules USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY properties_tenant ON properties USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY reservation_reminders_tenant ON reservation_reminders USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY reservations_tenant ON reservations USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY tenant_settings_tenant ON tenant_settings USING (app_is_bypass() OR tenant_id = app_current_tenant());
ALTER POLICY tenant_self ON tenants USING (app_is_bypass() OR id = app_current_tenant());

-- EXISTS que comparam tenant_id direto (não via helper):
ALTER POLICY rate_calendar_tenant ON rate_calendar USING (
  app_is_bypass() OR EXISTS (
    SELECT 1 FROM room_types rt JOIN properties p ON p.id = rt.property_id
    WHERE rt.id = rate_calendar.room_type_id AND p.tenant_id = app_current_tenant()));
ALTER POLICY password_reset_tokens_tenant ON password_reset_tokens USING (
  app_is_bypass() OR EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = password_reset_tokens.user_id AND u.tenant_id = app_current_tenant()));

-- 4) Cobrir tabelas órfãs (tinham tenant_id mas sem policy / sem RLS).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_tenant ON users;
CREATE POLICY users_tenant ON users USING (app_is_bypass() OR tenant_id = app_current_tenant());

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriptions_tenant ON subscriptions;
CREATE POLICY subscriptions_tenant ON subscriptions USING (app_is_bypass() OR tenant_id = app_current_tenant());

ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_instances_tenant ON whatsapp_instances;
CREATE POLICY whatsapp_instances_tenant ON whatsapp_instances USING (app_is_bypass() OR tenant_id = app_current_tenant());

-- 5) Grants para o role de app (não-dono precisa de privilégio explícito).
GRANT USAGE ON SCHEMA public TO adelina_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO adelina_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO adelina_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO adelina_app;
ALTER DEFAULT PRIVILEGES FOR ROLE adelina IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO adelina_app;
ALTER DEFAULT PRIVILEGES FOR ROLE adelina IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO adelina_app;
ALTER DEFAULT PRIVILEGES FOR ROLE adelina IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO adelina_app;
