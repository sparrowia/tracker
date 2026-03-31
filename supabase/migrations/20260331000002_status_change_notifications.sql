-- Allow status_change as a notification type
ALTER TABLE public.comment_notifications DROP CONSTRAINT comment_notifications_mention_type_check;
ALTER TABLE public.comment_notifications ADD CONSTRAINT comment_notifications_mention_type_check
  CHECK (mention_type IN ('mention', 'owner', 'assignment', 'status_change'));

-- Add fields for status change notifications
ALTER TABLE public.comment_notifications ADD COLUMN changed_by text;
ALTER TABLE public.comment_notifications ADD COLUMN new_status text;
