-- Add owner_id and vendor_id to agenda RPCs so detail panels can use pickers

-- Must drop first because return type is changing
DROP FUNCTION IF EXISTS generate_project_agenda_from_selected(uuid, int);
DROP FUNCTION IF EXISTS generate_vendor_agenda(uuid, integer);

-- Project agenda
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
  vendor_name  text,
  owner_id     uuid,
  vendor_id    uuid
)
LANGUAGE sql STABLE
AS $$
  WITH combined AS (
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
      v.name                                AS vendor_name,
      ai.owner_id,
      ai.vendor_id
    FROM agenda_items ai
    LEFT JOIN people p ON p.id = ai.owner_id
    LEFT JOIN vendors v ON v.id = ai.vendor_id
    WHERE ai.project_id = p_project_id
      AND ai.status <> 'complete'

    UNION ALL

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
      v.name,
      b.owner_id,
      b.vendor_id
    FROM blockers b
    LEFT JOIN people p ON p.id = b.owner_id
    LEFT JOIN vendors v ON v.id = b.vendor_id
    WHERE b.project_id = p_project_id
      AND b.include_in_meeting = true
      AND b.status NOT IN ('complete', 'paused')

    UNION ALL

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
      v.name,
      a.owner_id,
      a.vendor_id
    FROM action_items a
    LEFT JOIN people p ON p.id = a.owner_id
    LEFT JOIN vendors v ON v.id = a.vendor_id
    WHERE a.project_id = p_project_id
      AND a.include_in_meeting = true
      AND a.status NOT IN ('complete', 'paused')

    UNION ALL

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
      v.name,
      r.owner_id,
      r.vendor_id
    FROM raid_entries r
    LEFT JOIN people p ON p.id = r.owner_id
    LEFT JOIN vendors v ON v.id = r.vendor_id
    WHERE r.project_id = p_project_id
      AND r.raid_type IN ('risk', 'issue', 'assumption', 'decision')
      AND r.include_in_meeting = true
      AND r.status NOT IN ('complete', 'closed', 'mitigated')
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
    vendor_name,
    owner_id,
    vendor_id
  FROM combined
  ORDER BY rank
  LIMIT p_limit;
$$;

-- Vendor agenda
CREATE OR REPLACE FUNCTION generate_vendor_agenda(p_vendor_id uuid, p_limit integer DEFAULT 20)
RETURNS TABLE (
  rank integer,
  entity_type text,
  entity_id uuid,
  title text,
  severity severity_indicator,
  context text,
  ask text,
  priority priority_level,
  age_days integer,
  escalation_count integer,
  score numeric,
  owner_name text,
  project_name text,
  owner_id uuid,
  vendor_id uuid
)
LANGUAGE sql STABLE
AS $$
  WITH scored_items AS (
    SELECT
      'agenda_item'::text AS entity_type,
      ag.id AS entity_id,
      ag.title,
      ag.severity,
      ag.context,
      ag.ask,
      ag.priority,
      EXTRACT(DAY FROM now() - ag.first_raised_at)::integer AS age_days,
      ag.escalation_count,
      (
        CASE ag.priority
          WHEN 'critical' THEN 100
          WHEN 'high' THEN 75
          WHEN 'medium' THEN 50
          WHEN 'low' THEN 25
        END
        + (EXTRACT(DAY FROM now() - ag.first_raised_at) * 2)
        + (ag.escalation_count * 15)
        + CASE ag.severity
            WHEN 'critical' THEN 50
            WHEN 'high' THEN 30
            WHEN 'new' THEN 10
            ELSE 0
          END
      )::numeric AS score,
      p.full_name AS owner_name,
      NULL::text AS project_name,
      ag.owner_id,
      ag.vendor_id
    FROM agenda_items ag
    LEFT JOIN people p ON p.id = ag.owner_id
    WHERE ag.vendor_id = p_vendor_id
      AND ag.status NOT IN ('complete')
      AND ag.resolved_at IS NULL

    UNION ALL

    SELECT
      'blocker'::text,
      b.id,
      b.title,
      CASE
        WHEN EXTRACT(DAY FROM now() - b.first_flagged_at) > 21 THEN 'critical'::severity_indicator
        WHEN EXTRACT(DAY FROM now() - b.first_flagged_at) > 7 THEN 'high'::severity_indicator
        ELSE 'new'::severity_indicator
      END,
      b.description,
      b.impact_description,
      b.priority,
      EXTRACT(DAY FROM now() - b.first_flagged_at)::integer,
      b.escalation_count,
      (
        CASE b.priority
          WHEN 'critical' THEN 100
          WHEN 'high' THEN 75
          WHEN 'medium' THEN 50
          WHEN 'low' THEN 25
        END
        + (EXTRACT(DAY FROM now() - b.first_flagged_at) * 2)
        + (b.escalation_count * 15)
        + 30
      )::numeric,
      p.full_name,
      proj.name,
      b.owner_id,
      b.vendor_id
    FROM blockers b
    LEFT JOIN people p ON p.id = b.owner_id
    LEFT JOIN projects proj ON proj.id = b.project_id
    WHERE b.vendor_id = p_vendor_id
      AND b.status NOT IN ('complete')
      AND b.resolved_at IS NULL

    UNION ALL

    SELECT
      'action_item'::text,
      ai.id,
      ai.title,
      CASE
        WHEN ai.due_date < CURRENT_DATE - interval '7 days' THEN 'critical'::severity_indicator
        WHEN ai.due_date < CURRENT_DATE THEN 'high'::severity_indicator
        ELSE 'normal'::severity_indicator
      END,
      ai.description,
      ai.notes,
      ai.priority,
      EXTRACT(DAY FROM now() - ai.first_flagged_at)::integer,
      ai.escalation_count,
      (
        CASE ai.priority
          WHEN 'critical' THEN 100
          WHEN 'high' THEN 75
          WHEN 'medium' THEN 50
          WHEN 'low' THEN 25
        END
        + (EXTRACT(DAY FROM now() - ai.first_flagged_at) * 2)
        + (ai.escalation_count * 15)
        + CASE
            WHEN ai.due_date IS NOT NULL AND ai.due_date < CURRENT_DATE
            THEN LEAST((CURRENT_DATE - ai.due_date) * 3, 60)
            ELSE 0
          END
      )::numeric,
      p.full_name,
      proj.name,
      ai.owner_id,
      ai.vendor_id
    FROM action_items ai
    LEFT JOIN people p ON p.id = ai.owner_id
    LEFT JOIN projects proj ON proj.id = ai.project_id
    WHERE ai.vendor_id = p_vendor_id
      AND ai.status NOT IN ('complete')
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY score DESC)::integer AS rank,
    entity_type,
    entity_id,
    title,
    severity,
    context,
    ask,
    priority,
    age_days,
    escalation_count,
    score,
    owner_name,
    project_name,
    owner_id,
    vendor_id
  FROM scored_items
  ORDER BY score DESC
  LIMIT p_limit;
$$;
