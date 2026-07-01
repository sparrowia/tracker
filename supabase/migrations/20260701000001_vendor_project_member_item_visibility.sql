-- Vendor project members can see all items in projects they're approved for.
--
-- Problem: `project_members` (the "approved people" list in the Docs tab) is
-- documented as letting a person "see and interact with the project even
-- without assigned tasks." For non-vendor roles this works (they read org-wide).
-- But the vendor item SELECT policies only allow a vendor to see an item when
--   vendor_id = their vendor  OR  owner_id = them personally
-- and never consult project_members. So a vendor added as an approved person
-- could open the project (projects_select honors project_members via
-- vendor_visible_project_ids) but could not see any unassigned item in it.
-- Example: RAID entry b81978a1-… in "VP - VTP Relaunch" has vendor_id = null
-- and owner_id = null, so Yang Lu (Silk, a project member) could not see it.
--
-- Fix: extend the vendor SELECT policies on raid_entries / action_items /
-- blockers so a vendor project_member sees every item in that project.

-- Helper: set of project ids the current auth user is a project_member of.
-- SECURITY DEFINER so it bypasses project_members RLS (avoids recursion) —
-- matches the vendor_visible_project_ids / user_visible_project_ids pattern.
CREATE OR REPLACE FUNCTION public.user_project_member_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT pm.project_id
  FROM project_members pm
  JOIN people p ON p.id = pm.person_id
  WHERE p.profile_id = auth.uid()
$$;

-- Action Items
DROP POLICY IF EXISTS "action_items_select" ON action_items;
CREATE POLICY "action_items_select" ON action_items
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (
      public.user_role() != 'vendor'
      OR vendor_id = public.user_vendor_id()
      OR owner_id = public.user_person_id()
      OR project_id IN (SELECT public.user_project_member_ids())
    )
  );

-- RAID Entries
DROP POLICY IF EXISTS "raid_entries_select" ON raid_entries;
CREATE POLICY "raid_entries_select" ON raid_entries
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (
      public.user_role() != 'vendor'
      OR vendor_id = public.user_vendor_id()
      OR owner_id = public.user_person_id()
      OR project_id IN (SELECT public.user_project_member_ids())
    )
  );

-- Blockers
DROP POLICY IF EXISTS "blockers_select" ON blockers;
CREATE POLICY "blockers_select" ON blockers
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (
      public.user_role() != 'vendor'
      OR vendor_id = public.user_vendor_id()
      OR owner_id = public.user_person_id()
      OR project_id IN (SELECT public.user_project_member_ids())
    )
  );
