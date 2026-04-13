-- Remove Sparrow-only agent infrastructure from Edcetera

-- Delete the Claude AI agent person record
DELETE FROM people WHERE is_agent = true;

-- Drop agent auto-status triggers
DROP TRIGGER IF EXISTS auto_agent_status_action_items ON action_items;
DROP TRIGGER IF EXISTS auto_agent_status_raid_entries ON raid_entries;
DROP TRIGGER IF EXISTS auto_agent_status_blockers ON blockers;
DROP FUNCTION IF EXISTS set_agent_status();

-- Drop agent_status columns
ALTER TABLE action_items DROP COLUMN IF EXISTS agent_status;
ALTER TABLE raid_entries DROP COLUMN IF EXISTS agent_status;
ALTER TABLE blockers DROP COLUMN IF EXISTS agent_status;

-- Drop agent flag from people
ALTER TABLE people DROP COLUMN IF EXISTS is_agent;

-- Drop repo mapping fields from projects (Sparrow-only)
ALTER TABLE projects DROP COLUMN IF EXISTS repo_url;
ALTER TABLE projects DROP COLUMN IF EXISTS working_directory;
