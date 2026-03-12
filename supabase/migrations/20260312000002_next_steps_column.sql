-- Add next_steps column to action_items and raid_entries
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS next_steps text;
ALTER TABLE raid_entries ADD COLUMN IF NOT EXISTS next_steps text;
