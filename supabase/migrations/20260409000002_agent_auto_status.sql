-- Auto-set agent_status when owner_id changes to/from an agent person
CREATE OR REPLACE FUNCTION set_agent_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the new owner is an agent
  IF NEW.owner_id IS NOT NULL AND EXISTS (SELECT 1 FROM people WHERE id = NEW.owner_id AND is_agent = true) THEN
    NEW.agent_status := 'pending_agent';
  ELSE
    -- Clear agent_status if reassigned away from agent
    IF OLD.agent_status IS NOT NULL THEN
      NEW.agent_status := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_agent_status_action_items
  BEFORE UPDATE OF owner_id ON action_items
  FOR EACH ROW EXECUTE FUNCTION set_agent_status();

CREATE TRIGGER auto_agent_status_raid_entries
  BEFORE UPDATE OF owner_id ON raid_entries
  FOR EACH ROW EXECUTE FUNCTION set_agent_status();

CREATE TRIGGER auto_agent_status_blockers
  BEFORE UPDATE OF owner_id ON blockers
  FOR EACH ROW EXECUTE FUNCTION set_agent_status();
