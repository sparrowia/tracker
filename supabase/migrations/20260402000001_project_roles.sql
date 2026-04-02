-- Add project role fields: Lead QA, Project Manager, Project Owner
ALTER TABLE projects
  ADD COLUMN lead_qa_id uuid REFERENCES people(id) ON DELETE SET NULL,
  ADD COLUMN project_manager_id uuid REFERENCES people(id) ON DELETE SET NULL,
  ADD COLUMN project_owner_id uuid REFERENCES people(id) ON DELETE SET NULL;
