-- QA role — policies (enum value added in 20260702000001).
--
-- Semantics (Matt 2026-07-02, prompted by a QA member's silent RLS-blocked
-- status updates): on projects where the QA user's person row is in
-- project_members, they can UPDATE any task and DELETE their OWN tasks
-- (creator or owner), but NOT delete other people's. Everywhere a plain
-- 'user' can INSERT, QA can too (QA is a superset of user).

-- Is the current user a QA member of this project?
CREATE OR REPLACE FUNCTION public.user_is_qa_on_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT public.user_role() = 'qa'
    AND p_project_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM project_members pm
      JOIN people pe ON pe.id = pm.person_id
      WHERE pm.project_id = p_project_id
        AND pe.profile_id = auth.uid()
    )
$$;

-- INSERT parity: add 'qa' to every INSERT policy that currently lists 'user'.
-- pg_policies stores the normalized expression ('user'::user_role inside an
-- ANY(ARRAY[...])), so a targeted replace is exact and idempotent.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, with_check
    FROM pg_policies
    WHERE cmd = 'INSERT'
      AND with_check LIKE '%''user''::user_role%'
      AND with_check NOT LIKE '%''qa''::user_role%'
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
      r.policyname, r.schemaname, r.tablename,
      replace(r.with_check, '''user''::user_role', '''user''::user_role, ''qa''::user_role')
    );
  END LOOP;
END $$;

-- ---- Task tables: UPDATE anything on member projects; DELETE own only ----

-- Action Items
DROP POLICY IF EXISTS "action_items_update" ON action_items;
CREATE POLICY "action_items_update" ON action_items
  FOR UPDATE
  USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_can_edit(created_by, owner_id)
      OR public.user_is_project_admin(project_id)
      OR public.user_is_qa_on_project(project_id)
      OR (public.user_role() = 'vendor' AND vendor_id = public.user_vendor_id())
    )
  )
  WITH CHECK (
    org_id = public.user_org_id()
  );

DROP POLICY IF EXISTS "action_items_delete" ON action_items;
CREATE POLICY "action_items_delete" ON action_items
  FOR DELETE USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_is_project_admin(project_id)
      OR (public.user_is_qa_on_project(project_id) AND public.user_can_edit(created_by, owner_id))
    )
  );

-- RAID Entries
DROP POLICY IF EXISTS "raid_entries_update" ON raid_entries;
CREATE POLICY "raid_entries_update" ON raid_entries
  FOR UPDATE
  USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_can_edit(created_by, owner_id)
      OR public.user_is_project_admin(project_id)
      OR public.user_is_qa_on_project(project_id)
      OR (public.user_role() = 'vendor' AND vendor_id = public.user_vendor_id())
    )
  )
  WITH CHECK (
    org_id = public.user_org_id()
  );

DROP POLICY IF EXISTS "raid_entries_delete" ON raid_entries;
CREATE POLICY "raid_entries_delete" ON raid_entries
  FOR DELETE USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_is_project_admin(project_id)
      OR (public.user_is_qa_on_project(project_id) AND public.user_can_edit(created_by, owner_id))
    )
  );

-- Blockers
DROP POLICY IF EXISTS "blockers_update" ON blockers;
CREATE POLICY "blockers_update" ON blockers
  FOR UPDATE
  USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_can_edit(created_by, owner_id)
      OR public.user_is_project_admin(project_id)
      OR public.user_is_qa_on_project(project_id)
      OR (public.user_role() = 'vendor' AND vendor_id = public.user_vendor_id())
    )
  )
  WITH CHECK (
    org_id = public.user_org_id()
  );

DROP POLICY IF EXISTS "blockers_delete" ON blockers;
CREATE POLICY "blockers_delete" ON blockers
  FOR DELETE USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_is_project_admin(project_id)
      OR (public.user_is_qa_on_project(project_id) AND public.user_can_edit(created_by, owner_id))
    )
  );

-- Agenda Items
DROP POLICY IF EXISTS "agenda_items_update" ON agenda_items;
CREATE POLICY "agenda_items_update" ON agenda_items
  FOR UPDATE
  USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_can_edit(created_by, owner_id)
      OR public.user_is_project_admin(project_id)
      OR public.user_is_qa_on_project(project_id)
    )
  )
  WITH CHECK (
    org_id = public.user_org_id()
  );

DROP POLICY IF EXISTS "agenda_items_delete" ON agenda_items;
CREATE POLICY "agenda_items_delete" ON agenda_items
  FOR DELETE USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_is_project_admin(project_id)
      OR (public.user_is_qa_on_project(project_id) AND public.user_can_edit(created_by, owner_id))
    )
  );
