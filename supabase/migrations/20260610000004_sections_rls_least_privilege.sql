-- Tighten action_item_sections RLS to least privilege:
--   • Everyone in the org can READ sections (needed to render grouping).
--   • Only non-vendor roles (super_admin/admin/user) can create/edit/delete sections,
--     matching the project_members write model. (The initial policy was the permissive
--     comments-style FOR ALL, which would have let vendor-role users mutate sections.)

DROP POLICY "Org isolation" ON public.action_item_sections;

CREATE POLICY "action_item_sections_select" ON public.action_item_sections
  FOR SELECT USING (org_id = public.user_org_id());

CREATE POLICY "action_item_sections_write" ON public.action_item_sections
  FOR ALL
  USING (org_id = public.user_org_id() AND public.user_role() IN ('super_admin','admin','user'))
  WITH CHECK (org_id = public.user_org_id() AND public.user_role() IN ('super_admin','admin','user'));
