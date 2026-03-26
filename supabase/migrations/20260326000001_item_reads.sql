-- Track when users last viewed items, for unread/updated indicators
CREATE TABLE public.item_reads (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('action_item', 'raid_entry')),
  entity_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, entity_type, entity_id)
);

CREATE INDEX idx_item_reads_entity ON public.item_reads(entity_type, entity_id);

ALTER TABLE public.item_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_reads_select_own" ON public.item_reads FOR SELECT TO authenticated
  USING (profile_id = auth.uid());
CREATE POLICY "item_reads_insert_own" ON public.item_reads FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());
CREATE POLICY "item_reads_update_own" ON public.item_reads FOR UPDATE TO authenticated
  USING (profile_id = auth.uid());
CREATE POLICY "item_reads_delete_own" ON public.item_reads FOR DELETE TO authenticated
  USING (profile_id = auth.uid());
