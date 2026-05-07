-- Project owners and initiative owners act as admins on items in their projects.
--
-- Background: prior policies only let a non-admin update an item if they were
-- the creator or the current owner. Project managers (e.g. project_owner_id)
-- and initiative owners couldn't close or reassign items they were responsible
-- for. PostgREST returns "0 rows affected, no error" on RLS-denied UPDATEs, so
-- the UI's optimistic state would silently revert on the next refetch.
--
-- New rule: if the row is linked to a project, and the current auth user is
-- (a) the project_owner_id of that project, or
-- (b) listed in initiative_owners for that project's initiative, or
-- (c) the legacy single initiatives.owner_id of that project's initiative,
-- then they get admin-equivalent UPDATE/DELETE rights on the row.

CREATE OR REPLACE FUNCTION public.user_is_project_admin(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    p_project_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = p_project_id
        AND (
          EXISTS (
            SELECT 1 FROM people pe
            WHERE pe.id = p.project_owner_id
              AND pe.profile_id = auth.uid()
          )
          OR (
            p.initiative_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM initiative_owners io
              JOIN people pe ON pe.id = io.person_id
              WHERE io.initiative_id = p.initiative_id
                AND pe.profile_id = auth.uid()
            )
          )
          OR (
            p.initiative_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM initiatives i
              JOIN people pe ON pe.id = i.owner_id
              WHERE i.id = p.initiative_id
                AND pe.profile_id = auth.uid()
            )
          )
        )
    )
$$;

-- ---- Action Items ----
DROP POLICY IF EXISTS "action_items_update" ON action_items;
CREATE POLICY "action_items_update" ON action_items
  FOR UPDATE
  USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_can_edit(created_by, owner_id)
      OR public.user_is_project_admin(project_id)
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
    )
  );

-- ---- RAID Entries ----
DROP POLICY IF EXISTS "raid_entries_update" ON raid_entries;
CREATE POLICY "raid_entries_update" ON raid_entries
  FOR UPDATE
  USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_can_edit(created_by, owner_id)
      OR public.user_is_project_admin(project_id)
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
    )
  );

-- ---- Blockers ----
DROP POLICY IF EXISTS "blockers_update" ON blockers;
CREATE POLICY "blockers_update" ON blockers
  FOR UPDATE
  USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_can_edit(created_by, owner_id)
      OR public.user_is_project_admin(project_id)
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
    )
  );

-- ---- Agenda Items ----
DROP POLICY IF EXISTS "agenda_items_update" ON agenda_items;
CREATE POLICY "agenda_items_update" ON agenda_items
  FOR UPDATE
  USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_can_edit(created_by, owner_id)
      OR public.user_is_project_admin(project_id)
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
    )
  );
