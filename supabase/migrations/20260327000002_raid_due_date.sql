-- Add due_date to raid_entries for issue tracking
ALTER TABLE public.raid_entries ADD COLUMN due_date date;
