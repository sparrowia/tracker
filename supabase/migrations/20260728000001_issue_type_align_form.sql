-- Align raid_entries.issue_type with the public reporting form's type list.
--
-- The form (/issues/[slug]) and the RAID log Type column were maintained as two
-- separate lists, and the form's value was only ever written into the entry
-- description as text — it never reached the issue_type column. Both now draw
-- from one list (src/lib/issue-types.ts) and the submit route writes the column
-- directly, so a reported type lands on the board unchanged.
--
-- Three legacy slugs are renamed to their form equivalents. 'feature' ->
-- 'feature_request' and 'ux' -> 'ui_ux' are pure renames; 'copy' -> 'content'
-- is the one genuine reclassification (approved: the form has no Copy option
-- and Content is its nearest equivalent). 'media' and 'ext_system' are kept and
-- have been added to the form, so no rows are orphaned.
--
-- Also note: "Performance - Load or Lag Times" is now just "Performance". Only
-- the option label changed; the ~390 entries already submitted through the form
-- keep the old string inside their description text. No backfill of the Type
-- column for those entries — deliberately going-forward-only.
--
-- Trigger disabled around the UPDATE per CLAUDE.md: raid_entries has a BEFORE
-- UPDATE trigger (set_updated_at) that would stamp updated_at on every touched
-- row and show them as unread for every user.

ALTER TABLE raid_entries DISABLE TRIGGER set_updated_at;

UPDATE raid_entries SET issue_type = 'feature_request' WHERE issue_type = 'feature';
UPDATE raid_entries SET issue_type = 'ui_ux'           WHERE issue_type = 'ux';
UPDATE raid_entries SET issue_type = 'content'         WHERE issue_type = 'copy';

ALTER TABLE raid_entries ENABLE TRIGGER set_updated_at;

-- Constraint swap, as anticipated in 20260727000001 (CHECK rather than an enum
-- so the option list is a one-line change).
ALTER TABLE raid_entries
  DROP CONSTRAINT IF EXISTS raid_entries_issue_type_check;

ALTER TABLE raid_entries
  ADD CONSTRAINT raid_entries_issue_type_check
  CHECK (issue_type IS NULL OR issue_type IN (
    'accessibility',
    'broken_link',
    'bug',
    'content',
    'error',
    'ext_system',
    'feature_request',
    'functionality',
    'media',
    'navigation',
    'performance',
    'responsive',
    'security',
    'support_request',
    'ui_ux',
    'other'
  ));
