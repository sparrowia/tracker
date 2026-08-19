-- An explicit project role is more specific than the account-level role and
-- therefore governs task access inside that project. Account role is only the
-- fallback when user_project_role(project_id) is null. This lets a vendor
-- account participate as member_full/product/QA/PM on selected projects while
-- remaining vendor-scoped everywhere else.
--
-- super_admin/admin retain their existing emergency bypass.

-- SELECT ---------------------------------------------------------------------

DROP POLICY IF EXISTS "action_items_select" ON public.action_items;
CREATE POLICY "action_items_select" ON public.action_items FOR SELECT USING (
  org_id = public.user_org_id() AND public.user_is_active() AND (
    public.user_role() IN ('super_admin','admin')
    OR CASE
      WHEN public.user_project_role(project_id) IN ('owner','project_manager','product','qa','member_full') THEN true
      WHEN public.user_project_role(project_id) = 'member_assigned' THEN
        owner_id = public.user_person_id() OR created_by = auth.uid()
        OR public.user_mentioned_in('action_item', id)
      WHEN public.user_project_role(project_id) = 'vendor' THEN
        vendor_id = public.user_vendor_id() OR owner_id = public.user_person_id()
        OR created_by = auth.uid() OR public.user_mentioned_in('action_item', id)
      WHEN public.user_project_role(project_id) IS NULL THEN
        public.user_role() IN ('user','qa')
        OR (public.user_role() = 'vendor' AND (
          vendor_id = public.user_vendor_id() OR owner_id = public.user_person_id()
          OR created_by = auth.uid() OR public.user_mentioned_in('action_item', id)
        ))
      ELSE false
    END
  )
);

DROP POLICY IF EXISTS "raid_entries_select" ON public.raid_entries;
CREATE POLICY "raid_entries_select" ON public.raid_entries FOR SELECT USING (
  org_id = public.user_org_id() AND public.user_is_active() AND (
    public.user_role() IN ('super_admin','admin')
    OR CASE
      WHEN public.user_project_role(project_id) IN ('owner','project_manager','product','qa','member_full') THEN true
      WHEN public.user_project_role(project_id) = 'member_assigned' THEN
        owner_id = public.user_person_id() OR reporter_id = public.user_person_id()
        OR created_by = auth.uid() OR public.user_mentioned_in('raid_entry', id)
      WHEN public.user_project_role(project_id) = 'vendor' THEN
        vendor_id = public.user_vendor_id() OR owner_id = public.user_person_id()
        OR reporter_id = public.user_person_id() OR created_by = auth.uid()
        OR public.user_mentioned_in('raid_entry', id)
      WHEN public.user_project_role(project_id) IS NULL THEN
        public.user_role() IN ('user','qa')
        OR (public.user_role() = 'vendor' AND (
          vendor_id = public.user_vendor_id() OR owner_id = public.user_person_id()
          OR reporter_id = public.user_person_id() OR created_by = auth.uid()
          OR public.user_mentioned_in('raid_entry', id)
        ))
      ELSE false
    END
  )
);

DROP POLICY IF EXISTS "blockers_select" ON public.blockers;
CREATE POLICY "blockers_select" ON public.blockers FOR SELECT USING (
  org_id = public.user_org_id() AND public.user_is_active() AND (
    public.user_role() IN ('super_admin','admin')
    OR CASE
      WHEN public.user_project_role(project_id) IN ('owner','project_manager','product','qa','member_full') THEN true
      WHEN public.user_project_role(project_id) = 'member_assigned' THEN
        owner_id = public.user_person_id() OR created_by = auth.uid()
        OR public.user_mentioned_in('blocker', id)
      WHEN public.user_project_role(project_id) = 'vendor' THEN
        vendor_id = public.user_vendor_id() OR owner_id = public.user_person_id()
        OR created_by = auth.uid() OR public.user_mentioned_in('blocker', id)
      WHEN public.user_project_role(project_id) IS NULL THEN
        public.user_role() IN ('user','qa')
        OR (public.user_role() = 'vendor' AND (
          vendor_id = public.user_vendor_id() OR owner_id = public.user_person_id()
          OR created_by = auth.uid() OR public.user_mentioned_in('blocker', id)
        ))
      ELSE false
    END
  )
);

-- INSERT ---------------------------------------------------------------------

DROP POLICY IF EXISTS "action_items_insert" ON public.action_items;
CREATE POLICY "action_items_insert" ON public.action_items FOR INSERT WITH CHECK (
  org_id = public.user_org_id() AND (
    public.user_role() IN ('super_admin','admin')
    OR CASE
      WHEN public.user_project_role(project_id) IS NOT NULL THEN
        public.user_project_role(project_id) IN ('owner','project_manager','product','qa')
      ELSE public.user_role() IN ('user','qa')
    END
  )
);

DROP POLICY IF EXISTS "raid_entries_insert" ON public.raid_entries;
CREATE POLICY "raid_entries_insert" ON public.raid_entries FOR INSERT WITH CHECK (
  org_id = public.user_org_id() AND (
    public.user_role() IN ('super_admin','admin')
    OR CASE
      WHEN public.user_project_role(project_id) IS NOT NULL THEN
        public.user_project_role(project_id) IN ('owner','project_manager','product','qa')
      ELSE public.user_role() IN ('user','qa')
    END
  )
);

DROP POLICY IF EXISTS "blockers_insert" ON public.blockers;
CREATE POLICY "blockers_insert" ON public.blockers FOR INSERT WITH CHECK (
  org_id = public.user_org_id() AND (
    public.user_role() IN ('super_admin','admin')
    OR CASE
      WHEN public.user_project_role(project_id) IS NOT NULL THEN
        public.user_project_role(project_id) IN ('owner','project_manager','product','qa')
      ELSE public.user_role() IN ('user','qa')
    END
  )
);

-- UPDATE ---------------------------------------------------------------------

DROP POLICY IF EXISTS "action_items_update" ON public.action_items;
CREATE POLICY "action_items_update" ON public.action_items FOR UPDATE USING (
  org_id = public.user_org_id() AND (
    public.user_role() IN ('super_admin','admin')
    OR CASE
      WHEN public.user_project_role(project_id) IN ('owner','project_manager','product','qa','member_full') THEN true
      WHEN public.user_project_role(project_id) = 'member_assigned' THEN
        owner_id = public.user_person_id() OR created_by = auth.uid()
        OR public.user_mentioned_in('action_item', id)
      WHEN public.user_project_role(project_id) = 'vendor' THEN
        vendor_id = public.user_vendor_id() OR owner_id = public.user_person_id()
        OR created_by = auth.uid() OR public.user_mentioned_in('action_item', id)
      WHEN public.user_project_role(project_id) IS NULL THEN
        (public.user_role() IN ('user','qa') AND public.user_can_edit(created_by, owner_id))
        OR (public.user_role() = 'vendor' AND (
          vendor_id = public.user_vendor_id() OR owner_id = public.user_person_id()
          OR created_by = auth.uid() OR public.user_mentioned_in('action_item', id)
        ))
      ELSE false
    END
  )
) WITH CHECK (org_id = public.user_org_id());

DROP POLICY IF EXISTS "raid_entries_update" ON public.raid_entries;
CREATE POLICY "raid_entries_update" ON public.raid_entries FOR UPDATE USING (
  org_id = public.user_org_id() AND (
    public.user_role() IN ('super_admin','admin')
    OR CASE
      WHEN public.user_project_role(project_id) IN ('owner','project_manager','product','qa','member_full') THEN true
      WHEN public.user_project_role(project_id) = 'member_assigned' THEN
        owner_id = public.user_person_id() OR reporter_id = public.user_person_id()
        OR created_by = auth.uid() OR public.user_mentioned_in('raid_entry', id)
      WHEN public.user_project_role(project_id) = 'vendor' THEN
        vendor_id = public.user_vendor_id() OR owner_id = public.user_person_id()
        OR reporter_id = public.user_person_id() OR created_by = auth.uid()
        OR public.user_mentioned_in('raid_entry', id)
      WHEN public.user_project_role(project_id) IS NULL THEN
        (public.user_role() IN ('user','qa') AND public.user_can_edit(created_by, owner_id))
        OR (public.user_role() = 'vendor' AND (
          vendor_id = public.user_vendor_id() OR owner_id = public.user_person_id()
          OR reporter_id = public.user_person_id() OR created_by = auth.uid()
          OR public.user_mentioned_in('raid_entry', id)
        ))
      ELSE false
    END
  )
) WITH CHECK (org_id = public.user_org_id());

DROP POLICY IF EXISTS "blockers_update" ON public.blockers;
CREATE POLICY "blockers_update" ON public.blockers FOR UPDATE USING (
  org_id = public.user_org_id() AND (
    public.user_role() IN ('super_admin','admin')
    OR CASE
      WHEN public.user_project_role(project_id) IN ('owner','project_manager','product','qa','member_full') THEN true
      WHEN public.user_project_role(project_id) = 'member_assigned' THEN
        owner_id = public.user_person_id() OR created_by = auth.uid()
        OR public.user_mentioned_in('blocker', id)
      WHEN public.user_project_role(project_id) = 'vendor' THEN
        vendor_id = public.user_vendor_id() OR owner_id = public.user_person_id()
        OR created_by = auth.uid() OR public.user_mentioned_in('blocker', id)
      WHEN public.user_project_role(project_id) IS NULL THEN
        (public.user_role() IN ('user','qa') AND public.user_can_edit(created_by, owner_id))
        OR (public.user_role() = 'vendor' AND (
          vendor_id = public.user_vendor_id() OR owner_id = public.user_person_id()
          OR created_by = auth.uid() OR public.user_mentioned_in('blocker', id)
        ))
      ELSE false
    END
  )
) WITH CHECK (org_id = public.user_org_id());

-- DELETE ---------------------------------------------------------------------

DROP POLICY IF EXISTS "action_items_delete" ON public.action_items;
CREATE POLICY "action_items_delete" ON public.action_items FOR DELETE USING (
  org_id = public.user_org_id() AND (
    public.user_role() IN ('super_admin','admin')
    OR CASE
      WHEN public.user_project_role(project_id) IN ('owner','project_manager') THEN true
      WHEN public.user_project_role(project_id) IN ('product','qa','member_full') THEN created_by = auth.uid()
      WHEN public.user_project_role(project_id) IS NOT NULL THEN false
      ELSE public.user_role() IN ('user','qa') AND public.user_is_initiative_owner(project_id)
    END
  )
);

DROP POLICY IF EXISTS "raid_entries_delete" ON public.raid_entries;
CREATE POLICY "raid_entries_delete" ON public.raid_entries FOR DELETE USING (
  org_id = public.user_org_id() AND (
    public.user_role() IN ('super_admin','admin')
    OR CASE
      WHEN public.user_project_role(project_id) IN ('owner','project_manager') THEN true
      WHEN public.user_project_role(project_id) IN ('product','qa','member_full') THEN created_by = auth.uid()
      WHEN public.user_project_role(project_id) IS NOT NULL THEN false
      ELSE public.user_role() IN ('user','qa') AND public.user_is_initiative_owner(project_id)
    END
  )
);

DROP POLICY IF EXISTS "blockers_delete" ON public.blockers;
CREATE POLICY "blockers_delete" ON public.blockers FOR DELETE USING (
  org_id = public.user_org_id() AND (
    public.user_role() IN ('super_admin','admin')
    OR CASE
      WHEN public.user_project_role(project_id) IN ('owner','project_manager') THEN true
      WHEN public.user_project_role(project_id) IN ('product','qa','member_full') THEN created_by = auth.uid()
      WHEN public.user_project_role(project_id) IS NOT NULL THEN false
      ELSE public.user_role() IN ('user','qa') AND public.user_is_initiative_owner(project_id)
    END
  )
);
