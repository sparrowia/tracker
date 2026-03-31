-- Project members: people who can see and interact with a project
-- regardless of whether they have tasks assigned

CREATE TABLE public.project_members (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, person_id)
);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_members_select" ON public.project_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.org_id = public.user_org_id())
  );
CREATE POLICY "project_members_insert" ON public.project_members
  FOR INSERT WITH CHECK (
    public.user_role() IN ('super_admin', 'admin', 'user')
  );
CREATE POLICY "project_members_delete" ON public.project_members
  FOR DELETE USING (
    public.user_role() IN ('super_admin', 'admin', 'user')
  );

-- Update visibility RPC to include projects where person is a member
CREATE OR REPLACE FUNCTION user_visible_project_ids(p_person_id uuid, p_profile_id uuid)
RETURNS SETOF uuid AS $$
  SELECT DISTINCT project_id FROM action_items WHERE owner_id = p_person_id AND project_id IS NOT NULL
  UNION
  SELECT DISTINCT project_id FROM blockers WHERE owner_id = p_person_id AND project_id IS NOT NULL
  UNION
  SELECT DISTINCT project_id FROM raid_entries WHERE owner_id = p_person_id AND project_id IS NOT NULL
  UNION
  SELECT DISTINCT id FROM projects WHERE created_by = p_profile_id
  UNION
  SELECT DISTINCT p.id FROM projects p
    JOIN initiatives i ON p.initiative_id = i.id
    WHERE i.owner_id = p_person_id
  UNION
  SELECT DISTINCT p.id FROM projects p
    JOIN initiative_owners io ON p.initiative_id = io.initiative_id
    WHERE io.person_id = p_person_id
  UNION
  SELECT DISTINCT project_id FROM project_members WHERE person_id = p_person_id
$$ LANGUAGE sql STABLE SECURITY DEFINER;
