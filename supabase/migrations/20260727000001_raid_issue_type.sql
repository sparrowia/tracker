-- Issues log: categorize an issue as Feature / Bug / Media / UX / Copy.
--
-- Nullable by design: every existing issue (and every non-issue RAID entry)
-- starts with no type. No backfill — a bulk UPDATE here would trip the
-- set_updated_at trigger on raid_entries and mark every item unread for
-- every user (see CLAUDE.md → Supabase Migrations).
--
-- CHECK rather than a Postgres enum so the option list can be extended with a
-- one-line constraint swap instead of an ALTER TYPE.

ALTER TABLE raid_entries
  ADD COLUMN IF NOT EXISTS issue_type text;

ALTER TABLE raid_entries
  DROP CONSTRAINT IF EXISTS raid_entries_issue_type_check;

ALTER TABLE raid_entries
  ADD CONSTRAINT raid_entries_issue_type_check
  CHECK (issue_type IS NULL OR issue_type IN ('feature', 'bug', 'media', 'ux', 'copy'));
