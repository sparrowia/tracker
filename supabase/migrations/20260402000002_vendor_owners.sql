-- Vendor owners per project — one person per vendor relationship
CREATE TABLE public.project_vendor_owners (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, vendor_id)
);

ALTER TABLE public.project_vendor_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_vendor_owners_select" ON public.project_vendor_owners
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.org_id = public.user_org_id())
  );
CREATE POLICY "project_vendor_owners_insert" ON public.project_vendor_owners
  FOR INSERT WITH CHECK (
    public.user_role() IN ('super_admin', 'admin', 'user')
  );
CREATE POLICY "project_vendor_owners_update" ON public.project_vendor_owners
  FOR UPDATE USING (
    public.user_role() IN ('super_admin', 'admin', 'user')
  );
CREATE POLICY "project_vendor_owners_delete" ON public.project_vendor_owners
  FOR DELETE USING (
    public.user_role() IN ('super_admin', 'admin', 'user')
  );
