-- Jira tickets imported from the U2 (Unified V2) board for the release roadmap,
-- plus per-user up/down votes on roadmap cards.

CREATE TABLE IF NOT EXISTS jira_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  jira_key text NOT NULL UNIQUE,
  summary text NOT NULL,
  status text,
  status_category text,
  issue_type text,
  jira_priority text,
  assignee_name text,
  -- Local scheduling date for the roadmap; NOT synced back to Jira.
  due_date date,
  release_target text,
  epic text,
  labels text[] NOT NULL DEFAULT '{}',
  jira_url text,
  jira_created_at timestamptz,
  jira_updated_at timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jira_tickets_project ON jira_tickets(project_id);

ALTER TABLE jira_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jira_tickets_select" ON jira_tickets
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active() AND public.user_role() != 'vendor'
  );

-- UPDATE covers roadmap drag-scheduling (due_date). Inserts/deletes stay
-- service-role only (import script).
CREATE POLICY "jira_tickets_update" ON jira_tickets
  FOR UPDATE USING (
    org_id = public.user_org_id() AND public.user_is_active() AND public.user_role() != 'vendor'
  );

CREATE TABLE IF NOT EXISTS roadmap_votes (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('raid_entry', 'jira_ticket')),
  entity_id uuid NOT NULL,
  vote smallint NOT NULL CHECK (vote IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_roadmap_votes_entity ON roadmap_votes(entity_type, entity_id);

ALTER TABLE roadmap_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roadmap_votes_select" ON roadmap_votes
  FOR SELECT USING (org_id = public.user_org_id() AND public.user_is_active());

CREATE POLICY "roadmap_votes_insert" ON roadmap_votes
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id() AND profile_id = auth.uid() AND public.user_is_active()
  );

CREATE POLICY "roadmap_votes_update" ON roadmap_votes
  FOR UPDATE USING (profile_id = auth.uid());

CREATE POLICY "roadmap_votes_delete" ON roadmap_votes
  FOR DELETE USING (profile_id = auth.uid());
