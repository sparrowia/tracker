-- Comments + attachments for RAID entries, action items, and blockers

CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  raid_entry_id uuid REFERENCES public.raid_entries(id) ON DELETE CASCADE,
  action_item_id uuid REFERENCES public.action_items(id) ON DELETE CASCADE,
  blocker_id uuid REFERENCES public.blockers(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exactly_one_parent CHECK (
    num_nonnulls(raid_entry_id, action_item_id, blocker_id) = 1
  )
);

CREATE INDEX idx_comments_raid_entry ON public.comments(raid_entry_id) WHERE raid_entry_id IS NOT NULL;
CREATE INDEX idx_comments_action_item ON public.comments(action_item_id) WHERE action_item_id IS NOT NULL;
CREATE INDEX idx_comments_blocker ON public.comments(blocker_id) WHERE blocker_id IS NOT NULL;
CREATE INDEX idx_comments_org ON public.comments(org_id);

CREATE TABLE public.comment_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size integer,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_comment_attachments_comment ON public.comment_attachments(comment_id);

-- RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org isolation" ON public.comments
  FOR ALL USING (org_id = public.user_org_id());

CREATE POLICY "Org isolation" ON public.comment_attachments
  FOR ALL USING (org_id = public.user_org_id());

-- Storage bucket for comment attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('comment-attachments', 'comment-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: org members can upload/read/delete their own org's files
CREATE POLICY "Org members can upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'comment-attachments'
    AND (storage.foldername(name))[1] = public.user_org_id()::text
  );

CREATE POLICY "Org members can read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'comment-attachments'
    AND (storage.foldername(name))[1] = public.user_org_id()::text
  );

CREATE POLICY "Org members can delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'comment-attachments'
    AND (storage.foldername(name))[1] = public.user_org_id()::text
  );
