-- Allow file_share as a notification type
ALTER TABLE public.comment_notifications DROP CONSTRAINT comment_notifications_mention_type_check;
ALTER TABLE public.comment_notifications ADD CONSTRAINT comment_notifications_mention_type_check
  CHECK (mention_type IN ('mention', 'owner', 'assignment', 'status_change', 'file_share'));

-- Add column for shared file/link URL
ALTER TABLE public.comment_notifications ADD COLUMN shared_url text;
