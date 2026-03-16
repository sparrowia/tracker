-- Wiki pages for documentation
CREATE TABLE public.wiki_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  content jsonb NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
  parent_id uuid REFERENCES public.wiki_pages(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, slug)
);

CREATE INDEX idx_wiki_pages_org ON public.wiki_pages(org_id);
CREATE INDEX idx_wiki_pages_parent ON public.wiki_pages(parent_id) WHERE parent_id IS NOT NULL;

-- Updated_at trigger
CREATE TRIGGER set_wiki_pages_updated_at
  BEFORE UPDATE ON public.wiki_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE public.wiki_pages ENABLE ROW LEVEL SECURITY;

-- SELECT: org-scoped, hidden from vendors
CREATE POLICY "wiki_pages_select" ON public.wiki_pages
  FOR SELECT USING (
    org_id = public.user_org_id()
    AND public.user_is_active()
    AND public.user_role() != 'vendor'
  );

-- INSERT: admin, super_admin, user
CREATE POLICY "wiki_pages_insert" ON public.wiki_pages
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id()
    AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

-- UPDATE: admin+ always, user if creator
CREATE POLICY "wiki_pages_update" ON public.wiki_pages
  FOR UPDATE USING (
    org_id = public.user_org_id()
    AND (public.user_role() IN ('super_admin', 'admin') OR created_by = auth.uid())
  );

-- DELETE: admin+ only
CREATE POLICY "wiki_pages_delete" ON public.wiki_pages
  FOR DELETE USING (
    org_id = public.user_org_id()
    AND public.user_role() IN ('super_admin', 'admin')
  );
