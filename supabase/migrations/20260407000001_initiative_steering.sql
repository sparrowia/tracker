-- Add steering committee fields to initiatives (mirrors projects)
ALTER TABLE initiatives
  ADD COLUMN executive_sponsor_id uuid REFERENCES people(id),
  ADD COLUMN steering_priority integer,
  ADD COLUMN steering_phase steering_phase,
  ADD COLUMN original_completion_date date,
  ADD COLUMN original_completion_notes text,
  ADD COLUMN actual_completion_date date,
  ADD COLUMN actual_completion_notes text;

-- Allow department statuses to reference either a project OR an initiative
ALTER TABLE project_department_statuses
  ALTER COLUMN project_id DROP NOT NULL,
  ADD COLUMN initiative_id uuid REFERENCES initiatives(id) ON DELETE CASCADE;

-- Ensure at least one parent is set
ALTER TABLE project_department_statuses
  ADD CONSTRAINT dept_status_has_parent CHECK (project_id IS NOT NULL OR initiative_id IS NOT NULL);

-- Unique per initiative+department
ALTER TABLE project_department_statuses
  ADD CONSTRAINT unique_initiative_department UNIQUE (initiative_id, department);

-- Index for initiative lookups
CREATE INDEX idx_project_dept_statuses_initiative ON project_department_statuses(initiative_id);
