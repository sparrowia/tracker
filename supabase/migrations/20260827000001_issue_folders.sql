-- Issues Log folders are organizational containers, not RAID entries. Keeping
-- them in their own table prevents folders from inflating issue counts or
-- leaking into dashboards, reports, meeting agendas, and Jira-facing data.

CREATE TABLE public.issue_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (btrim(title) <> ''),
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_issue_folders_project
  ON public.issue_folders(project_id, sort_order, title);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.issue_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.issue_folders ENABLE ROW LEVEL SECURITY;

-- A folder is visible only when the user can see its project. The projects
-- table's current RLS remains the single source of truth for that decision.
CREATE POLICY "issue_folders_select" ON public.issue_folders
  FOR SELECT USING (
    org_id = public.user_org_id()
    AND public.user_is_active()
    AND EXISTS (
      SELECT 1 FROM public.projects p WHERE p.id = issue_folders.project_id
    )
  );

-- Match raid_entries creation rights: account admins always qualify; otherwise
-- an explicit project role wins, with the account role used only as fallback.
CREATE POLICY "issue_folders_insert" ON public.issue_folders
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = issue_folders.project_id AND p.org_id = issue_folders.org_id
    )
    AND (
      public.user_role() IN ('super_admin','admin')
      OR CASE
        WHEN public.user_project_role(project_id) IS NOT NULL THEN
          public.user_project_role(project_id) IN ('owner','project_manager','product','qa')
        ELSE public.user_role() IN ('user','qa')
      END
    )
  );

CREATE POLICY "issue_folders_update" ON public.issue_folders
  FOR UPDATE USING (
    org_id = public.user_org_id() AND (
      public.user_role() IN ('super_admin','admin')
      OR CASE
        WHEN public.user_project_role(project_id) IS NOT NULL THEN
          public.user_project_role(project_id) IN ('owner','project_manager','product','qa')
        ELSE public.user_role() IN ('user','qa')
      END
    )
  ) WITH CHECK (
    org_id = public.user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = issue_folders.project_id AND p.org_id = issue_folders.org_id
    )
    AND (
      public.user_role() IN ('super_admin','admin')
      OR CASE
        WHEN public.user_project_role(project_id) IS NOT NULL THEN
          public.user_project_role(project_id) IN ('owner','project_manager','product','qa')
        ELSE public.user_role() IN ('user','qa')
      END
    )
  );

CREATE POLICY "issue_folders_delete" ON public.issue_folders
  FOR DELETE USING (
    org_id = public.user_org_id() AND (
      public.user_role() IN ('super_admin','admin')
      OR CASE
        WHEN public.user_project_role(project_id) IS NOT NULL THEN
          public.user_project_role(project_id) IN ('owner','project_manager','product','qa')
        ELSE public.user_role() IN ('user','qa')
      END
    )
  );

ALTER TABLE public.raid_entries
  ADD COLUMN folder_id uuid REFERENCES public.issue_folders(id) ON DELETE SET NULL;

CREATE INDEX idx_raid_entries_folder
  ON public.raid_entries(folder_id) WHERE folder_id IS NOT NULL;
