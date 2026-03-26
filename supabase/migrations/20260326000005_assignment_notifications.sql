-- Make comment_id nullable so the table can also store assignment notifications
ALTER TABLE public.comment_notifications DROP CONSTRAINT comment_notifications_comment_id_fkey;
ALTER TABLE public.comment_notifications ALTER COLUMN comment_id DROP NOT NULL;
ALTER TABLE public.comment_notifications ADD CONSTRAINT comment_notifications_comment_id_fkey
  FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;

-- Allow 'assignment' as a mention_type
ALTER TABLE public.comment_notifications DROP CONSTRAINT comment_notifications_mention_type_check;
ALTER TABLE public.comment_notifications ADD CONSTRAINT comment_notifications_mention_type_check
  CHECK (mention_type IN ('mention', 'owner', 'assignment'));

-- Make commenter_name nullable (not applicable for assignments)
ALTER TABLE public.comment_notifications ALTER COLUMN commenter_name DROP NOT NULL;

-- Make comment_body nullable (assignments use item_title instead)
ALTER TABLE public.comment_notifications ALTER COLUMN comment_body DROP NOT NULL;

-- Add assigned_by field for assignment notifications
ALTER TABLE public.comment_notifications ADD COLUMN assigned_by text;
