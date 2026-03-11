-- Performance indexes for commonly queried columns

-- RAID entries: reporter joins, resolved filtering, owner lookups
CREATE INDEX IF NOT EXISTS idx_raid_entries_reporter ON public.raid_entries(reporter_id) WHERE reporter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_raid_entries_owner ON public.raid_entries(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_raid_entries_status ON public.raid_entries(status);
CREATE INDEX IF NOT EXISTS idx_raid_entries_resolved ON public.raid_entries(resolved_at) WHERE resolved_at IS NOT NULL;

-- Action items: dashboard sorts by due_date, filters by priority+status
CREATE INDEX IF NOT EXISTS idx_action_items_due_date ON public.action_items(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_action_items_priority_status ON public.action_items(priority, status);

-- Blockers: sidebar filters by project+status, project detail sorts by priority
CREATE INDEX IF NOT EXISTS idx_blockers_project ON public.blockers(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blockers_owner ON public.blockers(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blockers_resolved ON public.blockers(resolved_at) WHERE resolved_at IS NOT NULL;

-- Projects: sidebar joins by initiative_id
CREATE INDEX IF NOT EXISTS idx_projects_initiative ON public.projects(initiative_id) WHERE initiative_id IS NOT NULL;

-- People: profile lookups for auth/role matching
CREATE INDEX IF NOT EXISTS idx_people_profile ON public.people(profile_id) WHERE profile_id IS NOT NULL;

-- Vendor item counts RPC — avoids full table scan + client-side aggregation
CREATE OR REPLACE FUNCTION vendor_item_counts()
RETURNS TABLE(vendor_id uuid, action_count bigint, blocker_count bigint, people_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    v.id AS vendor_id,
    COALESCE(a.cnt, 0) AS action_count,
    COALESCE(b.cnt, 0) AS blocker_count,
    COALESCE(p.cnt, 0) AS people_count
  FROM vendors v
  LEFT JOIN (
    SELECT ai.vendor_id, COUNT(*) AS cnt
    FROM action_items ai
    WHERE ai.status != 'complete' AND ai.vendor_id IS NOT NULL
    GROUP BY ai.vendor_id
  ) a ON a.vendor_id = v.id
  LEFT JOIN (
    SELECT bl.vendor_id, COUNT(*) AS cnt
    FROM blockers bl
    WHERE bl.resolved_at IS NULL AND bl.vendor_id IS NOT NULL
    GROUP BY bl.vendor_id
  ) b ON b.vendor_id = v.id
  LEFT JOIN (
    SELECT pe.vendor_id, COUNT(*) AS cnt
    FROM people pe
    WHERE pe.vendor_id IS NOT NULL
    GROUP BY pe.vendor_id
  ) p ON p.vendor_id = v.id;
$$;
