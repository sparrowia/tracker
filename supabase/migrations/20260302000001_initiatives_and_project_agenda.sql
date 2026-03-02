-- ============================================================
-- Migration: Initiatives & Project-scoped Agendas
-- ============================================================

-- 1. Create initiatives table
CREATE TABLE IF NOT EXISTS initiatives (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  description text,
  health      text NOT NULL DEFAULT 'on_track'
              CHECK (health IN ('on_track','in_progress','at_risk','blocked','paused','complete')),
  owner_id    uuid REFERENCES people(id) ON DELETE SET NULL,
  target_completion date,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. RLS on initiatives
ALTER TABLE initiatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "initiatives_org_isolation" ON initiatives
  USING (org_id = public.user_org_id());

-- 3. updated_at trigger (reuses existing function)
CREATE TRIGGER update_initiatives_updated_at
  BEFORE UPDATE ON initiatives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. Add initiative_id to projects (nullable FK)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS initiative_id uuid REFERENCES initiatives(id) ON DELETE SET NULL;

-- 5. Add project_id to agenda_items (nullable FK)
ALTER TABLE agenda_items
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

-- 6. Make vendor_id nullable on agenda_items (was NOT NULL)
ALTER TABLE agenda_items
  ALTER COLUMN vendor_id DROP NOT NULL;

-- 7. RPC: generate_project_agenda — same scoring as vendor version, filtered by project_id
CREATE OR REPLACE FUNCTION generate_project_agenda(p_project_id uuid, p_limit int DEFAULT 20)
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
    -- agenda_items scoped to project
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
    LEFT JOIN people p ON p.id = ai.action_item_id  -- no direct owner on agenda_items
    LEFT JOIN vendors v ON v.id = ai.vendor_id
    WHERE ai.project_id = p_project_id
      AND ai.status <> 'complete'

    UNION ALL

    -- blockers scoped to project
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

    UNION ALL

    -- action_items scoped to project
    SELECT
      'action_item'::text,
      a.id,
      a.title,
      'normal'::text,
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
      AND a.status <> 'complete'
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY
      CASE priority
        WHEN 'critical' THEN 0
        WHEN 'high'     THEN 1
        WHEN 'medium'   THEN 2
        WHEN 'low'      THEN 3
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
      + escalation_count * 10
      + LEAST(age_days, 30) * 2
    , 1) AS score,
    owner_name,
    vendor_name
  FROM combined
  ORDER BY rank
  LIMIT p_limit;
$$;
