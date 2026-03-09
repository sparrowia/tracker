-- Add project_id and project_slug to vendor agenda RPC for linking

DROP FUNCTION IF EXISTS generate_vendor_agenda(uuid, integer);

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
  status text,
  due_date date,
  age_days integer,
  escalation_count integer,
  score numeric,
  owner_name text,
  project_name text,
  project_slug text,
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
      ag.status::text,
      NULL::date AS due_date,
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
      proj.name AS project_name,
      proj.slug AS project_slug,
      ag.owner_id,
      ag.vendor_id
    FROM agenda_items ag
    LEFT JOIN people p ON p.id = ag.owner_id
    LEFT JOIN projects proj ON proj.id = ag.project_id
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
      b.status::text,
      b.due_date,
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
      proj.slug,
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
      ai.status::text,
      ai.due_date,
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
      proj.slug,
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
    status,
    due_date,
    age_days,
    escalation_count,
    score,
    owner_name,
    project_name,
    project_slug,
    owner_id,
    vendor_id
  FROM scored_items
  ORDER BY score DESC
  LIMIT p_limit;
$$;
