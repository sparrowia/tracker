-- Add updated_at to vendor_accountability view for "Last Updated" column

DROP VIEW IF EXISTS vendor_accountability;
CREATE VIEW vendor_accountability AS
SELECT * FROM (
  SELECT
    'action_item' AS entity_type,
    ai.id AS entity_id,
    ai.vendor_id,
    ai.org_id,
    ai.title,
    ai.status,
    ai.priority,
    ai.due_date,
    ai.first_flagged_at,
    ai.escalation_count,
    EXTRACT(DAY FROM now() - ai.first_flagged_at)::integer AS age_days,
    ai.owner_id,
    ai.project_id,
    ai.updated_at,
    CASE ai.priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END AS priority_order
  FROM action_items ai
  WHERE ai.status NOT IN ('complete') AND ai.vendor_id IS NOT NULL

  UNION ALL

  SELECT
    'blocker' AS entity_type,
    b.id AS entity_id,
    b.vendor_id,
    b.org_id,
    b.title,
    b.status,
    b.priority,
    b.due_date,
    b.first_flagged_at,
    b.escalation_count,
    EXTRACT(DAY FROM now() - b.first_flagged_at)::integer AS age_days,
    b.owner_id,
    b.project_id,
    b.updated_at,
    CASE b.priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END AS priority_order
  FROM blockers b
  WHERE b.status NOT IN ('complete') AND b.resolved_at IS NULL AND b.vendor_id IS NOT NULL

  UNION ALL

  SELECT
    'raid_entry' AS entity_type,
    r.id AS entity_id,
    r.vendor_id,
    r.org_id,
    r.title,
    r.status,
    r.priority,
    r.due_date,
    r.first_flagged_at,
    0 AS escalation_count,
    EXTRACT(DAY FROM now() - r.first_flagged_at)::integer AS age_days,
    r.owner_id,
    r.project_id,
    r.updated_at,
    CASE r.priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END AS priority_order
  FROM raid_entries r
  WHERE r.status NOT IN ('complete', 'closed', 'mitigated')
    AND r.resolved_at IS NULL
    AND r.vendor_id IS NOT NULL
    AND r.raid_type = 'issue'
) sub
ORDER BY priority_order, age_days DESC;
