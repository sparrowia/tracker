-- Add parent_id for parent/child milestone grouping
ALTER TABLE public.milestones ADD COLUMN parent_id uuid REFERENCES public.milestones(id) ON DELETE CASCADE;
CREATE INDEX idx_milestones_parent ON public.milestones(parent_id) WHERE parent_id IS NOT NULL;
