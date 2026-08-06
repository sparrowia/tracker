-- Business Unit on RAID entries — which internal team owns an issue.
--
-- Replaces the Impact field in the Issues editor. Impact was a <select> of
-- low/medium/high in the UI but 194 rows hold free text (long written impact
-- analyses on issues, plus a handful of stray issue-type strings like 'UI/UX'
-- from an older form). That data is real, so the `impact` column is NOT
-- dropped: Impact stays editable on Risks and Decisions, where the concept
-- belongs, and any entry that already has impact text keeps rendering it
-- read-only. Only the Issues editor loses the field.
--
-- CHECK rather than an enum, matching raid_entries.issue_type — the option
-- list is then a one-line change here plus one in src/lib/business-units.ts.
-- Nullable with no default and no backfill: 1312 existing rows stay unset
-- rather than being guessed into a team, and a bulk UPDATE would trip the
-- BEFORE UPDATE set_updated_at trigger and mark every row unread for every
-- user (see CLAUDE.md).

ALTER TABLE raid_entries
  ADD COLUMN IF NOT EXISTS business_unit text;

ALTER TABLE raid_entries
  DROP CONSTRAINT IF EXISTS raid_entries_business_unit_check;

ALTER TABLE raid_entries
  ADD CONSTRAINT raid_entries_business_unit_check
  CHECK (business_unit IS NULL OR business_unit IN (
    'compliance',
    'la_team',
    'marketing',
    'operations',
    'product_development',
    'sales'
  ));

COMMENT ON COLUMN raid_entries.business_unit IS
  'Owning internal team for an issue. Labels in src/lib/business-units.ts; keep this CHECK in sync with BUSINESS_UNIT_OPTIONS.';
