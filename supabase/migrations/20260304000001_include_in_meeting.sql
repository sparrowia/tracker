-- Add include_in_meeting toggle to action_items, blockers, and raid_entries
ALTER TABLE action_items ADD COLUMN include_in_meeting boolean NOT NULL DEFAULT false;
ALTER TABLE blockers ADD COLUMN include_in_meeting boolean NOT NULL DEFAULT false;
ALTER TABLE raid_entries ADD COLUMN include_in_meeting boolean NOT NULL DEFAULT false;

-- RPC: generate agenda from only selected (include_in_meeting = true) items
CREATE OR REPLACE FUNCTION generate_project_agenda_from_selected(p_project_id uuid, p_limit int DEFAULT 20)
RETURNS TABLE (
  rank         bigint,
  entity_type  text,
  entity_id    uuid,
  title        text,
  severity     text,
  context      text,
  ask          text,
  priority     text,
  age_days     int,
  escalation_count int,
  score        numeric,
  owner_name   text,
  vendor_name  text
)
LANGUAGE sql STABLE
AS $$
  WITH combined AS (
    -- agenda_items always included (they are meeting-specific by nature)
    SELECT
      'agenda_item'::text                   AS entity_type,
      ai.id                                 AS entity_id,
      ai.title,
      ai.severity::text,
      ai.context,
      ai.ask,
      ai.priority::text,
      EXTRACT(DAY FROM now() - ai.first_raised_at)::int AS age_days,
      ai.escalation_count,
      p.full_name                           AS owner_name,
      v.name                                AS vendor_name
    FROM agenda_items ai
    LEFT JOIN people p ON p.id = ai.action_item_id
    LEFT JOIN vendors v ON v.id = ai.vendor_id
    WHERE ai.project_id = p_project_id
      AND ai.status <> 'complete'

    UNION ALL

    -- blockers: only those toggled for meeting
    SELECT
      'blocker'::text,
      b.id,
      b.title,
      'critical'::text,
      b.impact_description,
      NULL,
      b.priority::text,
      EXTRACT(DAY FROM now() - b.first_flagged_at)::int,
      b.escalation_count,
      p.full_name,
      v.name
    FROM blockers b
    LEFT JOIN people p ON p.id = b.owner_id
    LEFT JOIN vendors v ON v.id = b.vendor_id
    WHERE b.project_id = p_project_id
      AND b.resolved_at IS NULL
      AND b.include_in_meeting = true

    UNION ALL

    -- action_items: only those toggled for meeting
    SELECT
      'action_item'::text,
      a.id,
      a.title,
      CASE
        WHEN a.status IN ('blocked', 'at_risk') THEN 'critical'
        WHEN a.due_date < CURRENT_DATE THEN 'critical'
        WHEN a.status = 'needs_verification' THEN 'follow_up'
        ELSE 'normal'
      END::text,
      a.notes,
      NULL,
      a.priority::text,
      EXTRACT(DAY FROM now() - a.first_flagged_at)::int,
      a.escalation_count,
      p.full_name,
      v.name
    FROM action_items a
    LEFT JOIN people p ON p.id = a.owner_id
    LEFT JOIN vendors v ON v.id = a.vendor_id
    WHERE a.project_id = p_project_id
      AND a.status NOT IN ('complete', 'paused')
      AND a.include_in_meeting = true

    UNION ALL

    -- RAID entries: risks, issues, actions, AND decisions — only toggled
    SELECT
      'raid_' || r.raid_type::text,
      r.id,
      r.title,
      CASE
        WHEN r.status IN ('blocked', 'at_risk') THEN 'critical'
        WHEN r.status = 'needs_verification' THEN 'follow_up'
        ELSE 'normal'
      END::text,
      COALESCE(r.impact, r.description),
      NULL,
      r.priority::text,
      EXTRACT(DAY FROM now() - r.first_flagged_at)::int,
      r.escalation_count,
      p.full_name,
      v.name
    FROM raid_entries r
    LEFT JOIN people p ON p.id = r.owner_id
    LEFT JOIN vendors v ON v.id = r.vendor_id
    WHERE r.project_id = p_project_id
      AND r.raid_type IN ('risk', 'issue', 'action', 'decision')
      AND r.status NOT IN ('complete', 'paused')
      AND r.resolved_at IS NULL
      AND r.include_in_meeting = true
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY
      CASE priority
        WHEN 'critical' THEN 0
        WHEN 'high'     THEN 1
        WHEN 'medium'   THEN 2
        WHEN 'low'      THEN 3
      END,
      CASE severity
        WHEN 'critical'  THEN 0
        WHEN 'follow_up' THEN 1
        WHEN 'normal'    THEN 2
        ELSE 3
      END,
      (escalation_count * 10 + age_days) DESC
    ) AS rank,
    entity_type,
    entity_id,
    title,
    severity,
    context,
    ask,
    priority,
    age_days,
    escalation_count,
    ROUND(
      CASE priority
        WHEN 'critical' THEN 100
        WHEN 'high'     THEN 75
        WHEN 'medium'   THEN 50
        WHEN 'low'      THEN 25
      END
      + CASE severity
          WHEN 'critical'  THEN 20
          WHEN 'follow_up' THEN 10
          ELSE 0
        END
      + escalation_count * 10
      + LEAST(age_days, 30) * 2
    , 1) AS score,
    owner_name,
    vendor_name
  FROM combined
  ORDER BY rank
  LIMIT p_limit;
$$;
