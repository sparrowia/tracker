-- Split the Business Unit value 'product_development' into 'product' and
-- 'development' — they are separate teams, so one combined option forced a
-- wrong answer for every issue owned by only one of them.
--
-- Shipped hours earlier in 20260806000001 with no backfill, so the column is
-- entirely NULL and there is nothing to migrate: no UPDATE, and therefore no
-- need to disable set_updated_at. Verified before writing this migration
-- (0 rows with a non-null business_unit).
--
-- If a row had picked up 'product_development' between the two deploys it
-- would now fail the new CHECK, so the constraint swap re-points any such row
-- at 'product' first. Guarded by the trigger disable in case it matches
-- anything, per CLAUDE.md.

ALTER TABLE raid_entries
  DROP CONSTRAINT IF EXISTS raid_entries_business_unit_check;

ALTER TABLE raid_entries DISABLE TRIGGER set_updated_at;

UPDATE raid_entries
  SET business_unit = 'product'
  WHERE business_unit = 'product_development';

ALTER TABLE raid_entries ENABLE TRIGGER set_updated_at;

ALTER TABLE raid_entries
  ADD CONSTRAINT raid_entries_business_unit_check
  CHECK (business_unit IS NULL OR business_unit IN (
    'compliance',
    'development',
    'la_team',
    'marketing',
    'operations',
    'product',
    'sales'
  ));
