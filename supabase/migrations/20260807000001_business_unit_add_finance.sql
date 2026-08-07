-- Add Finance to the Business Unit vocabulary.
--
-- Finance owns its own work (billing questions, revenue reporting, reconciliation)
-- and had no home in the original list, so those items were landing under
-- Operations. Requested 2026-08-07.
--
-- Both tables carry the same vocabulary and both constraints must be widened
-- together, or the field accepts Finance on Issues and rejects it on Jira cards:
--   raid_entries.business_unit  (20260806000001, split in 20260806000002)
--   jira_tickets.business_unit  (20260806000004)
-- Keep in sync with BUSINESS_UNIT_OPTIONS in src/lib/business-units.ts.
--
-- Purely additive: no existing row can violate a widened CHECK, so this needs
-- no backfill and is safe to re-run.

ALTER TABLE raid_entries
  DROP CONSTRAINT IF EXISTS raid_entries_business_unit_check;

ALTER TABLE raid_entries
  ADD CONSTRAINT raid_entries_business_unit_check
  CHECK (business_unit IS NULL OR business_unit IN (
    'compliance',
    'development',
    'finance',
    'la_team',
    'marketing',
    'operations',
    'product',
    'sales'
  ));

ALTER TABLE jira_tickets
  DROP CONSTRAINT IF EXISTS jira_tickets_business_unit_check;

ALTER TABLE jira_tickets
  ADD CONSTRAINT jira_tickets_business_unit_check
  CHECK (business_unit IS NULL OR business_unit IN (
    'compliance',
    'development',
    'finance',
    'la_team',
    'marketing',
    'operations',
    'product',
    'sales'
  ));
