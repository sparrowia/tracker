-- PR association for imported Jira tickets (mined from ed-cet/unified PR
-- titles/branches; Jira's own dev-panel link is not connected — see U2-87).
ALTER TABLE jira_tickets ADD COLUMN IF NOT EXISTS has_pr boolean NOT NULL DEFAULT false;
ALTER TABLE jira_tickets ADD COLUMN IF NOT EXISTS pr_numbers integer[] NOT NULL DEFAULT '{}';
