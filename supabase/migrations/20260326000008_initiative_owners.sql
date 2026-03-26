-- Junction table for multiple initiative owners
CREATE TABLE public.initiative_owners (
  initiative_id uuid NOT NULL REFERENCES public.initiatives(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (initiative_id, person_id)
);

ALTER TABLE public.initiative_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "initiative_owners_select" ON public.initiative_owners
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM initiatives i WHERE i.id = initiative_id AND i.org_id = public.user_org_id())
  );
CREATE POLICY "initiative_owners_insert" ON public.initiative_owners
  FOR INSERT WITH CHECK (
    public.user_role() IN ('super_admin', 'admin')
  );
CREATE POLICY "initiative_owners_delete" ON public.initiative_owners
  FOR DELETE USING (
    public.user_role() IN ('super_admin', 'admin')
  );

-- Migrate existing owner_id data into the junction table
INSERT INTO public.initiative_owners (initiative_id, person_id)
SELECT id, owner_id FROM public.initiatives WHERE owner_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Update visibility RPC to use junction table
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
$$ LANGUAGE sql STABLE SECURITY DEFINER;
