-- Track AI extraction corrections for feedback loop
-- Logs differences between what AI extracted and what the user approved
CREATE TABLE correction_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  intake_id uuid REFERENCES intakes(id) ON DELETE SET NULL,
  -- What the AI produced
  extracted_category text NOT NULL,    -- action_items, decisions, issues, risks, blockers, status_updates
  extracted_title text NOT NULL,
  extracted_priority text,
  -- What the user changed it to
  correction_type text NOT NULL,       -- title_edit, type_change, priority_change, rejected, accepted_as_is
  corrected_value text,                -- new title, new type, new priority, or null for rejected
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_correction_log_org ON correction_log(org_id);
CREATE INDEX idx_correction_log_intake ON correction_log(intake_id);

-- RLS
ALTER TABLE correction_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "correction_log_select" ON correction_log
  FOR SELECT USING (org_id = user_org_id());

CREATE POLICY "correction_log_insert" ON correction_log
  FOR INSERT WITH CHECK (org_id = user_org_id());
