-- Log a "created" entry in activity_log whenever an action_item, raid_entry,
-- or blocker is inserted, so the changelog shows who opened the item.

CREATE OR REPLACE FUNCTION public.log_entity_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity_log (org_id, entity_type, entity_id, action, performed_by, created_at)
  VALUES (NEW.org_id, TG_ARGV[0], NEW.id, 'created', NEW.created_by, NEW.created_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_action_item_created ON public.action_items;
CREATE TRIGGER log_action_item_created
  AFTER INSERT ON public.action_items
  FOR EACH ROW EXECUTE FUNCTION public.log_entity_created('action_item');

DROP TRIGGER IF EXISTS log_raid_entry_created ON public.raid_entries;
CREATE TRIGGER log_raid_entry_created
  AFTER INSERT ON public.raid_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_entity_created('raid_entry');

DROP TRIGGER IF EXISTS log_blocker_created ON public.blockers;
CREATE TRIGGER log_blocker_created
  AFTER INSERT ON public.blockers
  FOR EACH ROW EXECUTE FUNCTION public.log_entity_created('blocker');

-- Backfill: write a created entry for any existing row that doesn't have one.
INSERT INTO public.activity_log (org_id, entity_type, entity_id, action, performed_by, created_at)
SELECT a.org_id, 'action_item', a.id, 'created', a.created_by, a.created_at
FROM public.action_items a
WHERE NOT EXISTS (
  SELECT 1 FROM public.activity_log l
  WHERE l.entity_type = 'action_item' AND l.entity_id = a.id AND l.action = 'created'
);

INSERT INTO public.activity_log (org_id, entity_type, entity_id, action, performed_by, created_at)
SELECT r.org_id, 'raid_entry', r.id, 'created', r.created_by, r.created_at
FROM public.raid_entries r
WHERE NOT EXISTS (
  SELECT 1 FROM public.activity_log l
  WHERE l.entity_type = 'raid_entry' AND l.entity_id = r.id AND l.action = 'created'
);

INSERT INTO public.activity_log (org_id, entity_type, entity_id, action, performed_by, created_at)
SELECT b.org_id, 'blocker', b.id, 'created', b.created_by, b.created_at
FROM public.blockers b
WHERE NOT EXISTS (
  SELECT 1 FROM public.activity_log l
  WHERE l.entity_type = 'blocker' AND l.entity_id = b.id AND l.action = 'created'
);
