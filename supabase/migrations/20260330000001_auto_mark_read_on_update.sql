-- Automatically mark items as read for the user who performed the update.
-- This prevents your own changes from triggering the red ❗ unread indicator.
-- Runs AFTER the updated_at trigger so NEW.updated_at has the correct value.

CREATE OR REPLACE FUNCTION auto_mark_read_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id uuid;
  v_entity_type text;
BEGIN
  -- Get the current authenticated user's profile ID
  v_profile_id := auth.uid();
  IF v_profile_id IS NULL THEN RETURN NEW; END IF;

  -- Entity type passed as trigger argument
  v_entity_type := TG_ARGV[0];

  -- Upsert item_reads so this user's read_at matches the new updated_at
  INSERT INTO item_reads (profile_id, entity_type, entity_id, read_at)
  VALUES (v_profile_id, v_entity_type, NEW.id, NEW.updated_at)
  ON CONFLICT (profile_id, entity_type, entity_id)
  DO UPDATE SET read_at = EXCLUDED.read_at;

  RETURN NEW;
END;
$$;

-- Fire AFTER update (after the set_updated_at trigger sets NEW.updated_at = now())
CREATE TRIGGER auto_mark_read AFTER UPDATE ON raid_entries
  FOR EACH ROW EXECUTE FUNCTION auto_mark_read_on_update('raid_entry');

CREATE TRIGGER auto_mark_read AFTER UPDATE ON action_items
  FOR EACH ROW EXECUTE FUNCTION auto_mark_read_on_update('action_item');
