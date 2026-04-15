-- Fix unqualified function calls in RLS policies.
-- Policies should use public.user_org_id() and public.user_role()
-- to be resilient to search_path changes.

-- correction_log
DROP POLICY IF EXISTS "correction_log_select" ON correction_log;
CREATE POLICY "correction_log_select" ON correction_log
  FOR SELECT USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS "correction_log_insert" ON correction_log;
CREATE POLICY "correction_log_insert" ON correction_log
  FOR INSERT WITH CHECK (org_id = public.user_org_id());

-- project_department_statuses
DROP POLICY IF EXISTS "select_project_dept_statuses" ON project_department_statuses;
CREATE POLICY "select_project_dept_statuses" ON project_department_statuses
  FOR SELECT USING (
    org_id = public.user_org_id()
    AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

DROP POLICY IF EXISTS "insert_project_dept_statuses" ON project_department_statuses;
CREATE POLICY "insert_project_dept_statuses" ON project_department_statuses
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id()
    AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

DROP POLICY IF EXISTS "update_project_dept_statuses" ON project_department_statuses;
CREATE POLICY "update_project_dept_statuses" ON project_department_statuses
  FOR UPDATE USING (
    org_id = public.user_org_id()
    AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

DROP POLICY IF EXISTS "delete_project_dept_statuses" ON project_department_statuses;
CREATE POLICY "delete_project_dept_statuses" ON project_department_statuses
  FOR DELETE USING (
    org_id = public.user_org_id()
    AND public.user_role() IN ('super_admin', 'admin')
  );

-- project_links
DROP POLICY IF EXISTS "select_project_links" ON project_links;
CREATE POLICY "select_project_links" ON project_links
  FOR SELECT USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS "insert_project_links" ON project_links;
CREATE POLICY "insert_project_links" ON project_links
  FOR INSERT WITH CHECK (org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin', 'user'));

DROP POLICY IF EXISTS "update_project_links" ON project_links;
CREATE POLICY "update_project_links" ON project_links
  FOR UPDATE USING (org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin', 'user'));

DROP POLICY IF EXISTS "delete_project_links" ON project_links;
CREATE POLICY "delete_project_links" ON project_links
  FOR DELETE USING (org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin'));
