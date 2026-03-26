-- Helper: get the people.id for the current auth user
CREATE OR REPLACE FUNCTION public.user_person_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT id FROM public.people WHERE profile_id = auth.uid() LIMIT 1;
$$;

-- Update SELECT policies: vendors can see items assigned to their vendor OR to them personally

-- Action Items
DROP POLICY IF EXISTS "action_items_select" ON action_items;
CREATE POLICY "action_items_select" ON action_items
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (
      public.user_role() != 'vendor'
      OR vendor_id = public.user_vendor_id()
      OR owner_id = public.user_person_id()
    )
  );

-- RAID Entries
DROP POLICY IF EXISTS "raid_entries_select" ON raid_entries;
CREATE POLICY "raid_entries_select" ON raid_entries
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (
      public.user_role() != 'vendor'
      OR vendor_id = public.user_vendor_id()
      OR owner_id = public.user_person_id()
    )
  );

-- Blockers
DROP POLICY IF EXISTS "blockers_select" ON blockers;
CREATE POLICY "blockers_select" ON blockers
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (
      public.user_role() != 'vendor'
      OR vendor_id = public.user_vendor_id()
      OR owner_id = public.user_person_id()
    )
  );

-- Agenda Items
DROP POLICY IF EXISTS "agenda_items_select" ON agenda_items;
CREATE POLICY "agenda_items_select" ON agenda_items
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (
      public.user_role() != 'vendor'
      OR vendor_id = public.user_vendor_id()
    )
  );
