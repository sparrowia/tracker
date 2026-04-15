-- Fix search_path: previous migration set '' which breaks unqualified table names.
-- Change to 'public' which still prevents search path injection but resolves tables.

ALTER FUNCTION public.user_role() SET search_path = 'public';
ALTER FUNCTION public.user_vendor_id() SET search_path = 'public';
ALTER FUNCTION public.user_is_active() SET search_path = 'public';
ALTER FUNCTION public.user_can_edit(uuid, uuid) SET search_path = 'public';
ALTER FUNCTION public.user_person_id() SET search_path = 'public';
ALTER FUNCTION public.auto_mark_read_on_update() SET search_path = 'public';
ALTER FUNCTION public.generate_project_agenda(uuid, integer) SET search_path = 'public';
ALTER FUNCTION public.vendor_item_counts() SET search_path = 'public';
ALTER FUNCTION public.generate_vendor_agenda(uuid, integer) SET search_path = 'public';
ALTER FUNCTION public.generate_project_agenda_from_selected(uuid, integer) SET search_path = 'public';
ALTER FUNCTION public.user_visible_project_ids(uuid, uuid) SET search_path = 'public';
ALTER FUNCTION public.user_org_id() SET search_path = 'public';
ALTER FUNCTION public.update_updated_at() SET search_path = 'public';

DO $$ BEGIN
  ALTER FUNCTION public.handle_new_user() SET search_path = 'public';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
