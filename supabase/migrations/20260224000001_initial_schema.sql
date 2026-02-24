-- Edcetera Project Tracker — Initial Schema

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE item_status AS ENUM (
  'pending', 'in_progress', 'complete', 'needs_verification', 'paused', 'at_risk', 'blocked'
);

CREATE TYPE priority_level AS ENUM (
  'critical', 'high', 'medium', 'low'
);

CREATE TYPE project_health AS ENUM (
  'on_track', 'in_progress', 'at_risk', 'blocked', 'paused', 'complete'
);

CREATE TYPE raid_type AS ENUM (
  'risk', 'action', 'issue', 'decision'
);

CREATE TYPE severity_indicator AS ENUM (
  'critical', 'high', 'new', 'normal'
);

CREATE TYPE intake_source AS ENUM (
  'slack', 'email', 'meeting_notes', 'manual', 'fathom_transcript'
);

-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  role text DEFAULT 'member',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  website text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  title text,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  is_internal boolean NOT NULL DEFAULT false,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  health project_health NOT NULL DEFAULT 'on_track',
  platform_status text,
  start_date date,
  target_completion date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  owner_id uuid REFERENCES people(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  status item_status NOT NULL DEFAULT 'pending',
  priority priority_level NOT NULL DEFAULT 'medium',
  due_date date,
  first_flagged_at timestamptz NOT NULL DEFAULT now(),
  escalation_count integer NOT NULL DEFAULT 0,
  resolved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE raid_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  raid_type raid_type NOT NULL,
  display_id text NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  impact text,
  priority priority_level NOT NULL DEFAULT 'medium',
  status item_status NOT NULL DEFAULT 'pending',
  owner_id uuid REFERENCES people(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  decision_date date,
  first_flagged_at timestamptz NOT NULL DEFAULT now(),
  escalation_count integer NOT NULL DEFAULT 0,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE blockers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  impact_description text,
  owner_id uuid REFERENCES people(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  status item_status NOT NULL DEFAULT 'blocked',
  priority priority_level NOT NULL DEFAULT 'high',
  due_date date,
  first_flagged_at timestamptz NOT NULL DEFAULT now(),
  escalation_count integer NOT NULL DEFAULT 0,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_number text NOT NULL,
  system text,
  title text,
  description text,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  status item_status NOT NULL DEFAULT 'pending',
  priority priority_level NOT NULL DEFAULT 'medium',
  opened_at timestamptz,
  resolved_at timestamptz,
  external_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  meeting_date timestamptz,
  duration_minutes integer,
  recording_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  title text NOT NULL,
  severity severity_indicator NOT NULL DEFAULT 'normal',
  context text,
  ask text,
  priority priority_level NOT NULL DEFAULT 'medium',
  status item_status NOT NULL DEFAULT 'pending',
  first_raised_at timestamptz NOT NULL DEFAULT now(),
  escalation_count integer NOT NULL DEFAULT 0,
  resolved_at timestamptz,
  action_item_id uuid REFERENCES action_items(id) ON DELETE SET NULL,
  blocker_id uuid REFERENCES blockers(id) ON DELETE SET NULL,
  raid_entry_id uuid REFERENCES raid_entries(id) ON DELETE SET NULL,
  support_ticket_id uuid REFERENCES support_tickets(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  raw_text text NOT NULL,
  source intake_source NOT NULL DEFAULT 'manual',
  extraction_status text NOT NULL DEFAULT 'pending',
  extracted_data jsonb,
  submitted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  field_name text,
  old_value text,
  new_value text,
  performed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- JUNCTION TABLES
-- ============================================================

CREATE TABLE project_vendors (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, vendor_id)
);

CREATE TABLE meeting_projects (
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (meeting_id, project_id)
);

CREATE TABLE meeting_attendees (
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (meeting_id, person_id)
);

CREATE TABLE intake_entities (
  intake_id uuid NOT NULL REFERENCES intakes(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  PRIMARY KEY (intake_id, entity_type, entity_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_profiles_org ON profiles(org_id);
CREATE INDEX idx_vendors_org ON vendors(org_id);
CREATE INDEX idx_people_org ON people(org_id);
CREATE INDEX idx_people_vendor ON people(vendor_id);
CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_projects_slug ON projects(slug);
CREATE INDEX idx_action_items_org ON action_items(org_id);
CREATE INDEX idx_action_items_project ON action_items(project_id);
CREATE INDEX idx_action_items_vendor ON action_items(vendor_id);
CREATE INDEX idx_action_items_owner ON action_items(owner_id);
CREATE INDEX idx_action_items_status ON action_items(status);
CREATE INDEX idx_raid_entries_org ON raid_entries(org_id);
CREATE INDEX idx_raid_entries_project ON raid_entries(project_id);
CREATE INDEX idx_raid_entries_type ON raid_entries(raid_type);
CREATE INDEX idx_blockers_org ON blockers(org_id);
CREATE INDEX idx_blockers_vendor ON blockers(vendor_id);
CREATE INDEX idx_blockers_status ON blockers(status);
CREATE INDEX idx_support_tickets_org ON support_tickets(org_id);
CREATE INDEX idx_agenda_items_vendor ON agenda_items(vendor_id);
CREATE INDEX idx_agenda_items_status ON agenda_items(status);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_org ON activity_log(org_id);

-- ============================================================
-- HELPER FUNCTION (after tables exist)
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
$$;

-- ============================================================
-- COMPUTED VIEWS
-- ============================================================

CREATE OR REPLACE VIEW blocker_ages AS
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

CREATE OR REPLACE VIEW action_item_ages AS
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

CREATE OR REPLACE VIEW vendor_accountability AS
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
    CASE b.priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END AS priority_order
  FROM blockers b
  WHERE b.status NOT IN ('complete') AND b.resolved_at IS NULL AND b.vendor_id IS NOT NULL
) sub
ORDER BY priority_order, age_days DESC;

-- ============================================================
-- AGENDA RANKING FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION generate_vendor_agenda(
  p_vendor_id uuid,
  p_limit integer DEFAULT 20
)
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
  project_name text
)
LANGUAGE sql
STABLE
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
      NULL::text AS project_name
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
      proj.name
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
      proj.name
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
    project_name
  FROM scored_items
  ORDER BY score DESC
  LIMIT p_limit;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE raid_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockers ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own org" ON organizations
  FOR ALL USING (id = public.user_org_id());

CREATE POLICY "Users see org profiles" ON profiles
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "Org isolation" ON vendors
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "Org isolation" ON people
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "Org isolation" ON projects
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "Org isolation" ON action_items
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "Org isolation" ON raid_entries
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "Org isolation" ON blockers
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "Org isolation" ON support_tickets
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "Org isolation" ON meetings
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "Org isolation" ON agenda_items
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "Org isolation" ON intakes
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "Org isolation" ON activity_log
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "Org isolation" ON project_vendors
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.org_id = public.user_org_id())
  );

CREATE POLICY "Org isolation" ON meeting_projects
  FOR ALL USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_id AND m.org_id = public.user_org_id())
  );

CREATE POLICY "Org isolation" ON meeting_attendees
  FOR ALL USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_id AND m.org_id = public.user_org_id())
  );

CREATE POLICY "Org isolation" ON intake_entities
  FOR ALL USING (
    EXISTS (SELECT 1 FROM intakes i WHERE i.id = intake_id AND i.org_id = public.user_org_id())
  );

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON people FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON action_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON raid_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON blockers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON support_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON agenda_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON intakes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- PROFILE AUTO-CREATE ON SIGNUP
-- This requires superuser access. Run separately in Supabase
-- Dashboard SQL Editor after migration completes:
-- ============================================================
/*
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, org_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(
      (NEW.raw_user_meta_data ->> 'org_id')::uuid,
      (SELECT id FROM organizations LIMIT 1)
    ),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
*/
