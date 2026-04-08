-- Links to external documents (Google Docs, Sheets, Slides, etc.)
CREATE TABLE project_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text NOT NULL,
  link_type text NOT NULL DEFAULT 'other', -- google_doc, google_sheet, google_slides, other
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_project_links_project ON project_links(project_id);

ALTER TABLE project_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_project_links" ON project_links
  FOR SELECT USING (org_id = user_org_id());

CREATE POLICY "insert_project_links" ON project_links
  FOR INSERT WITH CHECK (org_id = user_org_id() AND user_role() IN ('super_admin', 'admin', 'user'));

CREATE POLICY "update_project_links" ON project_links
  FOR UPDATE USING (org_id = user_org_id() AND user_role() IN ('super_admin', 'admin', 'user'));

CREATE POLICY "delete_project_links" ON project_links
  FOR DELETE USING (org_id = user_org_id() AND user_role() IN ('super_admin', 'admin'));

CREATE TRIGGER set_project_links_updated_at
  BEFORE UPDATE ON project_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
