-- Project documentation table
CREATE TABLE project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  section_title text NOT NULL,
  content text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, section_key)
);

ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_read_project_documents" ON project_documents
  FOR SELECT USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "org_insert_project_documents" ON project_documents
  FOR INSERT WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "org_update_project_documents" ON project_documents
  FOR UPDATE USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "org_delete_project_documents" ON project_documents
  FOR DELETE USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
