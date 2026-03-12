-- Add notes column to raid_entries for free-form notes (separate from description)
ALTER TABLE raid_entries ADD COLUMN IF NOT EXISTS notes text;
