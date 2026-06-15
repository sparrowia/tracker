-- Scope project visibility for vendor-role users.
--
-- Problem: the `projects_select` policy was org-wide for every active user,
-- including vendors. A vendor could therefore read ANY project row in the org
-- (name, description, notes) via a direct deep link — even projects with no
-- items assigned to them. This leaked internal-only project descriptions and,
-- in at least one case, credentials stored in `projects.notes`.
--
-- Fix: vendors may only SELECT a project they have a genuine stake in:
--   - an action item / RAID entry / blocker in the project assigned to their
--     vendor OR owned by them personally (mirrors the item SELECT policies)
--   - a project_vendor_owners row for their vendor
--   - a project_members row for them
-- Non-vendor roles (super_admin, admin, user) keep full org-wide visibility,
-- exactly as before.

-- Helper: set of project ids a vendor user is allowed to see.
-- SECURITY DEFINER so it runs without re-applying per-table RLS inside the
-- projects policy (matches user_visible_project_ids pattern).
CREATE OR REPLACE FUNCTION public.vendor_visible_project_ids(p_vendor_id uuid, p_person_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT project_id FROM action_items
    WHERE project_id IS NOT NULL AND (vendor_id = p_vendor_id OR owner_id = p_person_id)
  UNION
  SELECT project_id FROM raid_entries
    WHERE project_id IS NOT NULL AND (vendor_id = p_vendor_id OR owner_id = p_person_id)
  UNION
  SELECT project_id FROM blockers
    WHERE project_id IS NOT NULL AND (vendor_id = p_vendor_id OR owner_id = p_person_id)
  UNION
  SELECT project_id FROM agenda_items
    WHERE project_id IS NOT NULL AND vendor_id = p_vendor_id
  UNION
  SELECT project_id FROM project_vendor_owners
    WHERE vendor_id = p_vendor_id
  UNION
  SELECT project_id FROM project_members
    WHERE person_id = p_person_id
$$;

DROP POLICY IF EXISTS "projects_select" ON projects;
CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (
      public.user_role() <> 'vendor'
      OR id IN (SELECT public.vendor_visible_project_ids(public.user_vendor_id(), public.user_person_id()))
    )
  );
