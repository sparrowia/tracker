-- Queue for comment notifications, batched into email digests
CREATE TABLE public.comment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  recipient_person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  commenter_name text NOT NULL,
  comment_body text NOT NULL,
  item_title text NOT NULL,
  item_type text NOT NULL,
  project_name text,
  mention_type text NOT NULL CHECK (mention_type IN ('mention', 'owner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX idx_comment_notifications_unsent ON public.comment_notifications(sent_at) WHERE sent_at IS NULL;
CREATE INDEX idx_comment_notifications_recipient ON public.comment_notifications(recipient_person_id);

ALTER TABLE public.comment_notifications ENABLE ROW LEVEL SECURITY;

-- Only the system (service role) writes/reads these — no user access needed
CREATE POLICY "comment_notifications_service" ON public.comment_notifications
  FOR ALL TO authenticated
  USING (org_id = public.user_org_id());
