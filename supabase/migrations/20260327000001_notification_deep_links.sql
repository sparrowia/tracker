-- Add entity_id and project_slug to comment_notifications for deep-linking in digest emails
ALTER TABLE public.comment_notifications ADD COLUMN entity_id uuid;
ALTER TABLE public.comment_notifications ADD COLUMN project_slug text;
