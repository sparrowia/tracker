-- Add sort_order to raid_entries for drag-and-drop reordering
ALTER TABLE public.raid_entries
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0;

-- Initialize sort_order based on current created_at ordering within each type
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY project_id, raid_type ORDER BY created_at) * 1000 AS rn
  FROM public.raid_entries
)
UPDATE public.raid_entries SET sort_order = numbered.rn FROM numbered WHERE public.raid_entries.id = numbered.id;
