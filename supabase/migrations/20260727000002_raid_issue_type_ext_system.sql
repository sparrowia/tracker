-- Issues log: add "Ext System" to the issue_type option list.
--
-- For defects whose fix lives in a third-party system we integrate with
-- (Thought Industries, Zoom, Salesforce, BigCommerce) rather than in our own
-- code. Keeps vendor-side work visible on the board without it competing for
-- attention with bugs we can actually fix ourselves.
--
-- As anticipated in 20260727000001, this is the one-line constraint swap the
-- CHECK (rather than an enum) was chosen to allow. No data migration: existing
-- rows keep their current value, and reclassification is done from the UI.

ALTER TABLE raid_entries
  DROP CONSTRAINT IF EXISTS raid_entries_issue_type_check;

ALTER TABLE raid_entries
  ADD CONSTRAINT raid_entries_issue_type_check
  CHECK (issue_type IS NULL OR issue_type IN ('feature', 'bug', 'media', 'ux', 'copy', 'ext_system'));
