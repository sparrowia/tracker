-- Add subtask support to RAID entries via self-referencing parent_id
ALTER TABLE public.raid_entries
  ADD COLUMN parent_id uuid REFERENCES public.raid_entries(id) ON DELETE SET NULL;

CREATE INDEX idx_raid_entries_parent ON public.raid_entries(parent_id) WHERE parent_id IS NOT NULL;
