-- Add parent/child nesting to action_items (mirrors raid_entries pattern)
ALTER TABLE public.action_items
  ADD COLUMN parent_id uuid REFERENCES public.action_items(id) ON DELETE SET NULL,
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX idx_action_items_parent ON public.action_items (parent_id) WHERE parent_id IS NOT NULL;
