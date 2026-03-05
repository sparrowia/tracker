-- Add reporter_id to raid_entries
ALTER TABLE raid_entries ADD COLUMN IF NOT EXISTS reporter_id UUID REFERENCES people(id);
