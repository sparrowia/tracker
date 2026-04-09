-- Add repo mapping fields to projects
ALTER TABLE projects
  ADD COLUMN repo_url text,
  ADD COLUMN working_directory text;

-- Add agent flag to people (for Claude pseudo-person)
ALTER TABLE people
  ADD COLUMN is_agent boolean NOT NULL DEFAULT false;

-- Add agent_status to action items and raid entries for tracking agent work
-- pending_agent = assigned to agent, waiting to be picked up
-- agent_running = agent is working on it
-- agent_done = agent finished, awaiting review
ALTER TABLE action_items
  ADD COLUMN agent_status text CHECK (agent_status IN ('pending_agent', 'agent_running', 'agent_done'));

ALTER TABLE raid_entries
  ADD COLUMN agent_status text CHECK (agent_status IN ('pending_agent', 'agent_running', 'agent_done'));

ALTER TABLE blockers
  ADD COLUMN agent_status text CHECK (agent_status IN ('pending_agent', 'agent_running', 'agent_done'));
