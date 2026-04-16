-- Fix: users who are the owner (but not creator) of an item could not change
-- the owner_id field. The UPDATE policies had no WITH CHECK clause, so
-- PostgreSQL re-evaluated the USING expression against the NEW row values.
-- After changing owner_id to someone else, user_can_edit(created_by, NEW.owner_id)
-- would fail because the user was no longer the owner, causing a silent rollback.
--
-- The fix adds an explicit WITH CHECK that only enforces org isolation,
-- since the USING clause already controls which rows a user may update.

-- ---- Action Items ----
DROP POLICY IF EXISTS "action_items_update" ON action_items;
CREATE POLICY "action_items_update" ON action_items
  FOR UPDATE
  USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_can_edit(created_by, owner_id)
      OR (public.user_role() = 'vendor' AND vendor_id = public.user_vendor_id())
    )
  )
  WITH CHECK (
    org_id = public.user_org_id()
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
      OR (public.user_role() = 'vendor' AND vendor_id = public.user_vendor_id())
    )
  )
  WITH CHECK (
    org_id = public.user_org_id()
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
      OR (public.user_role() = 'vendor' AND vendor_id = public.user_vendor_id())
    )
  )
  WITH CHECK (
    org_id = public.user_org_id()
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
    )
  )
  WITH CHECK (
    org_id = public.user_org_id()
  );

-- ---- Milestones ----
DROP POLICY IF EXISTS "milestones_update" ON milestones;
CREATE POLICY "milestones_update" ON milestones
  FOR UPDATE
  USING (
    org_id = public.user_org_id()
    AND public.user_can_edit(created_by, owner_id)
  )
  WITH CHECK (
    org_id = public.user_org_id()
  );
