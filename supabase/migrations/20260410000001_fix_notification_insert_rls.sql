-- Fix: the existing policy uses FOR ALL with USING but no WITH CHECK,
-- which blocks INSERT for authenticated users.
-- Replace with explicit INSERT policy.
DROP POLICY IF EXISTS "comment_notifications_service" ON public.comment_notifications;

CREATE POLICY "comment_notifications_select" ON public.comment_notifications
  FOR SELECT TO authenticated
  USING (org_id = public.user_org_id());

CREATE POLICY "comment_notifications_insert" ON public.comment_notifications
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.user_org_id());

CREATE POLICY "comment_notifications_update" ON public.comment_notifications
  FOR UPDATE TO authenticated
  USING (org_id = public.user_org_id());
