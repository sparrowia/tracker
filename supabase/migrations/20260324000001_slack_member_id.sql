-- Add Slack member ID to people for DM deep links
ALTER TABLE public.people ADD COLUMN slack_member_id text;
