-- Add Salesforce case reference fields to raid_entries for bidirectional linking
ALTER TABLE public.raid_entries
  ADD COLUMN sf_case_id text,
  ADD COLUMN sf_case_number text,
  ADD COLUMN sf_case_url text;

CREATE UNIQUE INDEX idx_raid_entries_sf_case_id ON public.raid_entries(sf_case_id) WHERE sf_case_id IS NOT NULL;
