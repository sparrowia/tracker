-- Add stage column to raid_entries and action_items
ALTER TABLE raid_entries ADD COLUMN stage text;
ALTER TABLE action_items ADD COLUMN stage text;
