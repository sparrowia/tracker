-- Business Unit on imported Jira tickets, so the roadmap can filter the whole
-- board by owning team rather than only the tracker's own Issues.
--
-- Same six-value vocabulary as raid_entries.business_unit (20260806000001 and
-- the Product/Development split in 20260806000002) — keep all three in sync
-- with BUSINESS_UNIT_OPTIONS in src/lib/business-units.ts.
--
-- Local-only, like due_date: this is the roadmap's own classification and is
-- never written back to Jira. scripts/sync-jira.mjs must therefore not clobber
-- it on re-sync (it upserts an explicit column list that excludes this).

ALTER TABLE jira_tickets
  ADD COLUMN IF NOT EXISTS business_unit text;

ALTER TABLE jira_tickets
  DROP CONSTRAINT IF EXISTS jira_tickets_business_unit_check;

ALTER TABLE jira_tickets
  ADD CONSTRAINT jira_tickets_business_unit_check
  CHECK (business_unit IS NULL OR business_unit IN (
    'compliance',
    'development',
    'la_team',
    'marketing',
    'operations',
    'product',
    'sales'
  ));

COMMENT ON COLUMN jira_tickets.business_unit IS
  'Owning internal team, set from the roadmap detail view. Local only — never synced to Jira, and preserved across re-syncs.';
