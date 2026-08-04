-- Project deletion: only the creator or a super_admin.
-- Replaces the blanket super_admin/admin delete — admins may now only delete
-- projects they created themselves.
DROP POLICY IF EXISTS "projects_delete" ON projects;
CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (public.user_role() = 'super_admin' OR created_by = auth.uid())
  );
