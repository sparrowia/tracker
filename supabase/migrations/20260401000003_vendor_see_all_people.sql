-- Allow vendors to see all people in the org (not just their own vendor's contacts)
-- This lets them assign items to anyone via the owner dropdown

DROP POLICY IF EXISTS "people_select" ON people;
CREATE POLICY "people_select" ON people
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
  );
