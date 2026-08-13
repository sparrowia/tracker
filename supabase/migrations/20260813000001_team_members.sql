-- Team Members replace per-project role fields (Matt 2026-08-13).
--
-- The Edit Project form's role dropdowns (Project Manager, Lead QA, Vendor
-- Owner per vendor) created "permissions soup": PM had no rights (removed as a
-- mistake in 20260507000003), Lead QA had full rights, vendor owners had none.
-- New model: ONE Project Owner (projects.project_owner_id, unchanged) plus a
-- flat Team Members list (project_members), every team member with full
-- project-admin rights for now. Former roles are preserved as a display label
-- on the membership row (e.g. "Lead QA"), not as separate permission paths.
--
-- The old columns (project_manager_id, lead_qa_id) and project_vendor_owners
-- are kept for history/notification routing but are no longer written by the
-- UI and no longer grant permissions.

-- 1. Display label on membership rows
ALTER TABLE public.project_members ADD COLUMN IF NOT EXISTS role_label text;

-- 2. Backfill: former role holders become team members with their role as label.
-- Project Manager
INSERT INTO public.project_members (project_id, person_id, role_label)
SELECT id, project_manager_id, 'Project Manager'
FROM public.projects
WHERE project_manager_id IS NOT NULL
ON CONFLICT (project_id, person_id) DO UPDATE
SET role_label = CASE
  WHEN project_members.role_label IS NULL OR project_members.role_label = '' THEN EXCLUDED.role_label
  ELSE project_members.role_label || ' / ' || EXCLUDED.role_label
END;

-- Lead QA
INSERT INTO public.project_members (project_id, person_id, role_label)
SELECT id, lead_qa_id, 'Lead QA'
FROM public.projects
WHERE lead_qa_id IS NOT NULL
ON CONFLICT (project_id, person_id) DO UPDATE
SET role_label = CASE
  WHEN project_members.role_label IS NULL OR project_members.role_label = '' THEN EXCLUDED.role_label
  ELSE project_members.role_label || ' / ' || EXCLUDED.role_label
END;

-- Vendor Owners (grouped so one person owning two vendors on the same project
-- cannot hit the same row twice within one INSERT)
INSERT INTO public.project_members (project_id, person_id, role_label)
SELECT pvo.project_id, pvo.person_id,
       string_agg('Vendor Owner - ' || v.name, ' / ' ORDER BY v.name)
FROM public.project_vendor_owners pvo
JOIN public.vendors v ON v.id = pvo.vendor_id
GROUP BY pvo.project_id, pvo.person_id
ON CONFLICT (project_id, person_id) DO UPDATE
SET role_label = CASE
  WHEN project_members.role_label IS NULL OR project_members.role_label = '' THEN EXCLUDED.role_label
  ELSE project_members.role_label || ' / ' || EXCLUDED.role_label
END;

-- 3. UPDATE policy on project_members (none existed — label edits would be
-- silently dropped by RLS). Same roles as insert/delete, plus qa for parity
-- with 20260702000002's INSERT-parity rule.
DROP POLICY IF EXISTS "project_members_update" ON public.project_members;
CREATE POLICY "project_members_update" ON public.project_members
  FOR UPDATE USING (
    public.user_role() IN ('super_admin', 'admin', 'user', 'qa')
  )
  WITH CHECK (
    public.user_role() IN ('super_admin', 'admin', 'user', 'qa')
  );

-- Insert/delete parity: the original policies predate the qa role; make sure
-- qa can manage membership like user can.
DROP POLICY IF EXISTS "project_members_insert" ON public.project_members;
CREATE POLICY "project_members_insert" ON public.project_members
  FOR INSERT WITH CHECK (
    public.user_role() IN ('super_admin', 'admin', 'user', 'qa')
  );
DROP POLICY IF EXISTS "project_members_delete" ON public.project_members;
CREATE POLICY "project_members_delete" ON public.project_members
  FOR DELETE USING (
    public.user_role() IN ('super_admin', 'admin', 'user', 'qa')
  );

-- 4. Permissions: project admin = Project Owner OR any team member
-- (plus the existing initiative-owner branches). lead_qa_id is dropped from
-- the function — Lead QAs were backfilled as team members above, so their
-- rights carry over through membership.
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
          OR EXISTS (
            SELECT 1
            FROM project_members pm
            JOIN people pe ON pe.id = pm.person_id
            WHERE pm.project_id = p.id
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
