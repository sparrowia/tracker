-- Milestones table for company timeline

CREATE TABLE public.milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  target_date date NOT NULL,
  milestone_type text NOT NULL CHECK (milestone_type IN ('project', 'initiative', 'proposed_project', 'proposed_initiative')),
  initiative_id uuid REFERENCES public.initiatives(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'complete')),
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_milestones_org ON public.milestones(org_id);
CREATE INDEX idx_milestones_target_date ON public.milestones(target_date);
CREATE INDEX idx_milestones_project ON public.milestones(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_milestones_initiative ON public.milestones(initiative_id) WHERE initiative_id IS NOT NULL;

-- Updated_at trigger
CREATE TRIGGER set_milestones_updated_at
  BEFORE UPDATE ON public.milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

-- SELECT: org-scoped, hidden from vendors
CREATE POLICY "milestones_select" ON public.milestones
  FOR SELECT USING (
    org_id = public.user_org_id()
    AND public.user_is_active()
    AND public.user_role() != 'vendor'
  );

-- INSERT: admin, super_admin, user
CREATE POLICY "milestones_insert" ON public.milestones
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id()
    AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

-- UPDATE: admin+ always, user if creator or owner
CREATE POLICY "milestones_update" ON public.milestones
  FOR UPDATE USING (
    org_id = public.user_org_id()
    AND public.user_can_edit(created_by, owner_id)
  );

-- DELETE: admin+ only
CREATE POLICY "milestones_delete" ON public.milestones
  FOR DELETE USING (
    org_id = public.user_org_id()
    AND public.user_role() IN ('super_admin', 'admin')
  );
