-- Anyone assigned to a project sees that project's items.
--
-- member_assigned previously narrowed reads to rows the person owned, reported,
-- created, or was mentioned in. In practice that made a project look empty to
-- them: folders rendered with a zero count and the tabs showed nothing, which
-- reads as a broken page rather than as a permission boundary.
--
-- Project membership is now the whole test for reading. vendor is deliberately
-- left scoped: a vendor still sees only their own vendor's rows, so one vendor
-- cannot read another's work on a shared project.

DROP POLICY IF EXISTS "action_items_select" ON public.action_items;
CREATE POLICY "action_items_select" ON public.action_items FOR SELECT USING (
  org_id = public.user_org_id() AND public.user_is_active() AND (
    public.user_role() IN ('super_admin','admin')
    OR CASE
      WHEN public.user_project_role(project_id) IN
        ('owner','project_manager','product','qa','member_full','member_assigned') THEN true
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
      WHEN public.user_project_role(project_id) IN
        ('owner','project_manager','product','qa','member_full','member_assigned') THEN true
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
      WHEN public.user_project_role(project_id) IN
        ('owner','project_manager','product','qa','member_full','member_assigned') THEN true
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
