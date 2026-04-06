-- Steering Committee: phase enum, new project columns, department statuses table

-- Steering phase enum
CREATE TYPE steering_phase AS ENUM (
  'in_progress',
  'post_launch',
  'parking_lot',
  'upcoming',
  'completed',
  'on_hold'
);

-- Department traffic-light status enum
CREATE TYPE department_status AS ENUM ('green', 'yellow', 'red');

-- New columns on projects
ALTER TABLE projects
  ADD COLUMN executive_sponsor_id uuid REFERENCES people(id),
  ADD COLUMN steering_priority integer,
  ADD COLUMN steering_phase steering_phase,
  ADD COLUMN original_completion_date date,
  ADD COLUMN original_completion_notes text,
  ADD COLUMN actual_completion_date date,
  ADD COLUMN actual_completion_notes text;

-- Department statuses per project
CREATE TABLE project_department_statuses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  department text NOT NULL,
  rep_person_id uuid REFERENCES people(id),
  status department_status,
  roadblocks text,
  decisions text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique constraint: one row per project+department
ALTER TABLE project_department_statuses
  ADD CONSTRAINT unique_project_department UNIQUE (project_id, department);

-- Index for fast lookups
CREATE INDEX idx_project_dept_statuses_project ON project_department_statuses(project_id);

-- RLS
ALTER TABLE project_department_statuses ENABLE ROW LEVEL SECURITY;

-- Select: org-scoped, no vendors
CREATE POLICY "select_project_dept_statuses" ON project_department_statuses
  FOR SELECT USING (
    org_id = user_org_id()
    AND user_role() IN ('super_admin', 'admin', 'user')
  );

-- Insert: admin+ only
CREATE POLICY "insert_project_dept_statuses" ON project_department_statuses
  FOR INSERT WITH CHECK (
    org_id = user_org_id()
    AND user_role() IN ('super_admin', 'admin', 'user')
  );

-- Update: admin+ or project owner/sponsor
CREATE POLICY "update_project_dept_statuses" ON project_department_statuses
  FOR UPDATE USING (
    org_id = user_org_id()
    AND user_role() IN ('super_admin', 'admin', 'user')
  );

-- Delete: admin+
CREATE POLICY "delete_project_dept_statuses" ON project_department_statuses
  FOR DELETE USING (
    org_id = user_org_id()
    AND user_role() IN ('super_admin', 'admin')
  );

-- updated_at trigger
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON project_department_statuses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
