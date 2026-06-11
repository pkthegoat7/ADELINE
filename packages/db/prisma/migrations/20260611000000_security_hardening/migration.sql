-- Hardening de segurança (resposta aos lints do Supabase)

-- _prisma_migrations estava exposta via PostgREST sem RLS
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._prisma_migrations FROM anon, authenticated;

-- Fixar search_path das funções helper de RLS (evita hijack via search_path)
ALTER FUNCTION public.app_current_tenant() SET search_path = '';
ALTER FUNCTION public.app_property_in_tenant(uuid) SET search_path = '';
ALTER FUNCTION public.app_room_in_tenant(uuid) SET search_path = '';
ALTER FUNCTION public.app_reservation_in_tenant(uuid) SET search_path = '';
