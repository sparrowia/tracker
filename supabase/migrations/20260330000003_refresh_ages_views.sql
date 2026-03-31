-- Recreate blocker_ages and action_item_ages views to pick up new columns
-- (include_in_project_meeting, include_in_vendor_meeting added in 20260330000002)
-- Must DROP first because CREATE OR REPLACE can't change column order when b.* expands differently

DROP VIEW IF EXISTS blocker_ages;
CREATE VIEW blocker_ages AS
SELECT
  b.*,
  EXTRACT(DAY FROM now() - b.first_flagged_at)::integer AS age_days,
  CASE
    WHEN EXTRACT(DAY FROM now() - b.first_flagged_at) <= 7 THEN 'recent'
    WHEN EXTRACT(DAY FROM now() - b.first_flagged_at) <= 21 THEN 'aging'
    ELSE 'critical'
  END AS age_severity
FROM blockers b
WHERE b.status != 'complete' AND b.resolved_at IS NULL;

DROP VIEW IF EXISTS action_item_ages;
CREATE VIEW action_item_ages AS
SELECT
  ai.*,
  EXTRACT(DAY FROM now() - ai.first_flagged_at)::integer AS age_days,
  CASE
    WHEN ai.due_date IS NULL THEN NULL
    WHEN ai.due_date < CURRENT_DATE THEN (CURRENT_DATE - ai.due_date)
    ELSE 0
  END AS days_overdue,
  CASE
    WHEN ai.due_date IS NOT NULL AND ai.due_date < CURRENT_DATE THEN 'overdue'
    WHEN ai.priority = 'critical' THEN 'urgent'
    WHEN ai.due_date IS NOT NULL AND ai.due_date <= CURRENT_DATE + interval '3 days' THEN 'due_soon'
    ELSE 'normal'
  END AS urgency
FROM action_items ai
WHERE ai.status NOT IN ('complete');
