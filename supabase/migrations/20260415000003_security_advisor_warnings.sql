-- Fix Supabase Security Advisor warnings

-- ============================================================
-- 1. SET search_path ON ALL FUNCTIONS (prevents search path injection)
--    Using 'public' instead of '' so unqualified table names still resolve.
-- ============================================================

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

-- Fix trigger/auth functions too
DO $$ BEGIN
  ALTER FUNCTION public.handle_new_user() SET search_path = 'public';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ============================================================
-- 2. REMOVE ANON ACCESS from project-files bucket
--    Project files are internal — no reason for anonymous access.
-- ============================================================

DROP POLICY IF EXISTS "project_files_public_read" ON storage.objects;
UPDATE storage.buckets SET public = false WHERE id = 'project-files';

-- ============================================================
-- NOTE: issue-attachments keeps anon access intentionally —
-- the public issue form (/issues/[slug]) uploads and reads
-- attachments from the browser using the anon Supabase client.
-- ============================================================
