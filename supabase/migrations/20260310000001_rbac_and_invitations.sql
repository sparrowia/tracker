-- RBAC & Invitations Migration
-- Adds: user_role enum, invitations table, created_by columns, helper functions, new RLS policies

-- ============================================================
-- 1a. Role enum + convert profiles.role
-- ============================================================

CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'user', 'vendor');

ALTER TABLE profiles ADD COLUMN role_enum user_role NOT NULL DEFAULT 'user';

-- Migrate existing data (all existing users become 'user')
UPDATE profiles SET role_enum = 'user';

-- Drop old text column and rename
ALTER TABLE profiles DROP COLUMN role;
ALTER TABLE profiles RENAME COLUMN role_enum TO role;

-- Set Matt as super_admin (match by email pattern)
UPDATE profiles SET role = 'super_admin'
WHERE email ILIKE '%matt%' OR email ILIKE '%lobel%';

-- ============================================================
-- 1b. New columns on profiles
-- ============================================================

ALTER TABLE profiles ADD COLUMN deactivated_at timestamptz;
ALTER TABLE profiles ADD COLUMN vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL;

CREATE INDEX idx_profiles_vendor ON profiles(vendor_id) WHERE vendor_id IS NOT NULL;

-- ============================================================
-- 1c. Add created_by to data tables
-- ============================================================

ALTER TABLE action_items ADD COLUMN created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE raid_entries ADD COLUMN created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE blockers ADD COLUMN created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE agenda_items ADD COLUMN created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE support_tickets ADD COLUMN created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE vendors ADD COLUMN created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE people ADD COLUMN created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 1d. Invitations table
-- ============================================================

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  invited_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_role_needs_vendor CHECK (
    role != 'vendor' OR vendor_id IS NOT NULL
  )
);

CREATE INDEX idx_invitations_org ON invitations(org_id);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_token ON invitations(token);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 1e. Helper functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.user_vendor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT vendor_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.user_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT deactivated_at IS NULL FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.user_can_edit(p_created_by uuid, p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    CASE
      WHEN public.user_role() IN ('super_admin', 'admin') THEN true
      WHEN auth.uid() = p_created_by THEN true
      WHEN p_owner_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.people WHERE id = p_owner_id AND profile_id = auth.uid()
      ) THEN true
      ELSE false
    END
$$;

-- ============================================================
-- 1f. Replace all RLS policies
-- ============================================================

-- Drop all existing "FOR ALL" policies
DROP POLICY IF EXISTS "Users see own org" ON organizations;
DROP POLICY IF EXISTS "Users see org profiles" ON profiles;
DROP POLICY IF EXISTS "Org isolation" ON vendors;
DROP POLICY IF EXISTS "Org isolation" ON people;
DROP POLICY IF EXISTS "Org isolation" ON projects;
DROP POLICY IF EXISTS "Org isolation" ON action_items;
DROP POLICY IF EXISTS "Org isolation" ON raid_entries;
DROP POLICY IF EXISTS "Org isolation" ON blockers;
DROP POLICY IF EXISTS "Org isolation" ON support_tickets;
DROP POLICY IF EXISTS "Org isolation" ON meetings;
DROP POLICY IF EXISTS "Org isolation" ON agenda_items;
DROP POLICY IF EXISTS "Org isolation" ON intakes;
DROP POLICY IF EXISTS "Org isolation" ON activity_log;
DROP POLICY IF EXISTS "Org isolation" ON comments;
DROP POLICY IF EXISTS "Org isolation" ON comment_attachments;
DROP POLICY IF EXISTS "Org isolation" ON project_vendors;
DROP POLICY IF EXISTS "Org isolation" ON meeting_projects;
DROP POLICY IF EXISTS "Org isolation" ON meeting_attendees;
DROP POLICY IF EXISTS "Org isolation" ON intake_entities;

-- ---- Organizations ----
CREATE POLICY "org_select" ON organizations
  FOR SELECT USING (id = public.user_org_id() AND public.user_is_active());

CREATE POLICY "org_all_admin" ON organizations
  FOR ALL USING (id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin'));

-- ---- Profiles ----
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (org_id = public.user_org_id() AND public.user_is_active());

CREATE POLICY "profiles_update_self" ON profiles
  FOR UPDATE USING (id = auth.uid() AND public.user_is_active());

CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE USING (org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin'));

-- Helper: vendor scoping for data tables
-- Vendors only see items linked to their vendor_id

-- ---- Vendors (the company records) ----
CREATE POLICY "vendors_select" ON vendors
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (public.user_role() != 'vendor' OR id = public.user_vendor_id())
  );

CREATE POLICY "vendors_insert" ON vendors
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

CREATE POLICY "vendors_update" ON vendors
  FOR UPDATE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

CREATE POLICY "vendors_delete" ON vendors
  FOR DELETE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

-- ---- People ----
CREATE POLICY "people_select" ON people
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (public.user_role() != 'vendor' OR vendor_id = public.user_vendor_id())
  );

CREATE POLICY "people_insert" ON people
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

CREATE POLICY "people_update" ON people
  FOR UPDATE USING (
    org_id = public.user_org_id()
    AND (public.user_role() IN ('super_admin', 'admin') OR public.user_can_edit(created_by, NULL))
  );

CREATE POLICY "people_delete" ON people
  FOR DELETE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

-- ---- Projects ----
CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
  );

CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (
    org_id = public.user_org_id()
    AND (public.user_role() IN ('super_admin', 'admin') OR public.user_can_edit(created_by, NULL))
  );

CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

-- ---- Action Items ----
CREATE POLICY "action_items_select" ON action_items
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (public.user_role() != 'vendor' OR vendor_id = public.user_vendor_id())
  );

CREATE POLICY "action_items_insert" ON action_items
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

CREATE POLICY "action_items_update" ON action_items
  FOR UPDATE USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_can_edit(created_by, owner_id)
      OR (public.user_role() = 'vendor' AND vendor_id = public.user_vendor_id())
    )
  );

CREATE POLICY "action_items_delete" ON action_items
  FOR DELETE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

-- ---- RAID Entries ----
CREATE POLICY "raid_entries_select" ON raid_entries
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (public.user_role() != 'vendor' OR vendor_id = public.user_vendor_id())
  );

CREATE POLICY "raid_entries_insert" ON raid_entries
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

CREATE POLICY "raid_entries_update" ON raid_entries
  FOR UPDATE USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_can_edit(created_by, owner_id)
      OR (public.user_role() = 'vendor' AND vendor_id = public.user_vendor_id())
    )
  );

CREATE POLICY "raid_entries_delete" ON raid_entries
  FOR DELETE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

-- ---- Blockers ----
CREATE POLICY "blockers_select" ON blockers
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (public.user_role() != 'vendor' OR vendor_id = public.user_vendor_id())
  );

CREATE POLICY "blockers_insert" ON blockers
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

CREATE POLICY "blockers_update" ON blockers
  FOR UPDATE USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_can_edit(created_by, owner_id)
      OR (public.user_role() = 'vendor' AND vendor_id = public.user_vendor_id())
    )
  );

CREATE POLICY "blockers_delete" ON blockers
  FOR DELETE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

-- ---- Support Tickets ----
CREATE POLICY "support_tickets_select" ON support_tickets
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (public.user_role() != 'vendor' OR vendor_id = public.user_vendor_id())
  );

CREATE POLICY "support_tickets_insert" ON support_tickets
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

CREATE POLICY "support_tickets_update" ON support_tickets
  FOR UPDATE USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_can_edit(created_by, NULL)
    )
  );

CREATE POLICY "support_tickets_delete" ON support_tickets
  FOR DELETE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

-- ---- Meetings ----
CREATE POLICY "meetings_select" ON meetings
  FOR SELECT USING (org_id = public.user_org_id() AND public.user_is_active());

CREATE POLICY "meetings_insert" ON meetings
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

CREATE POLICY "meetings_update" ON meetings
  FOR UPDATE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

CREATE POLICY "meetings_delete" ON meetings
  FOR DELETE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

-- ---- Agenda Items ----
CREATE POLICY "agenda_items_select" ON agenda_items
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (public.user_role() != 'vendor' OR vendor_id = public.user_vendor_id())
  );

CREATE POLICY "agenda_items_insert" ON agenda_items
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

CREATE POLICY "agenda_items_update" ON agenda_items
  FOR UPDATE USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin', 'admin')
      OR public.user_can_edit(created_by, owner_id)
    )
  );

CREATE POLICY "agenda_items_delete" ON agenda_items
  FOR DELETE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

-- ---- Intakes ----
CREATE POLICY "intakes_select" ON intakes
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND public.user_role() != 'vendor'
  );

CREATE POLICY "intakes_insert" ON intakes
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

CREATE POLICY "intakes_update" ON intakes
  FOR UPDATE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

CREATE POLICY "intakes_delete" ON intakes
  FOR DELETE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

-- ---- Activity Log ----
CREATE POLICY "activity_log_select" ON activity_log
  FOR SELECT USING (org_id = public.user_org_id() AND public.user_is_active());

CREATE POLICY "activity_log_insert" ON activity_log
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

-- ---- Comments ----
CREATE POLICY "comments_select" ON comments
  FOR SELECT USING (org_id = public.user_org_id() AND public.user_is_active());

CREATE POLICY "comments_insert" ON comments
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id() AND public.user_is_active()
  );

CREATE POLICY "comments_update" ON comments
  FOR UPDATE USING (
    org_id = public.user_org_id()
    AND (public.user_role() IN ('super_admin', 'admin') OR author_id IN (
      SELECT id FROM people WHERE profile_id = auth.uid()
    ))
  );

CREATE POLICY "comments_delete" ON comments
  FOR DELETE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

-- ---- Comment Attachments ----
CREATE POLICY "comment_attachments_select" ON comment_attachments
  FOR SELECT USING (org_id = public.user_org_id() AND public.user_is_active());

CREATE POLICY "comment_attachments_insert" ON comment_attachments
  FOR INSERT WITH CHECK (org_id = public.user_org_id() AND public.user_is_active());

CREATE POLICY "comment_attachments_delete" ON comment_attachments
  FOR DELETE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

-- ---- Invitations ----
CREATE POLICY "invitations_select" ON invitations
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

CREATE POLICY "invitations_insert" ON invitations
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

CREATE POLICY "invitations_update" ON invitations
  FOR UPDATE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

CREATE POLICY "invitations_delete" ON invitations
  FOR DELETE USING (
    org_id = public.user_org_id() AND public.user_role() IN ('super_admin', 'admin')
  );

-- ---- Junction tables (keep simple org isolation) ----
CREATE POLICY "project_vendors_select" ON project_vendors
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.org_id = public.user_org_id())
    AND public.user_is_active()
  );

CREATE POLICY "project_vendors_insert" ON project_vendors
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.org_id = public.user_org_id())
    AND public.user_role() IN ('super_admin', 'admin', 'user')
  );

CREATE POLICY "project_vendors_delete" ON project_vendors
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.org_id = public.user_org_id())
    AND public.user_role() IN ('super_admin', 'admin')
  );

CREATE POLICY "meeting_projects_all" ON meeting_projects
  FOR ALL USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_id AND m.org_id = public.user_org_id())
    AND public.user_is_active()
  );

CREATE POLICY "meeting_attendees_all" ON meeting_attendees
  FOR ALL USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_id AND m.org_id = public.user_org_id())
    AND public.user_is_active()
  );

CREATE POLICY "intake_entities_all" ON intake_entities
  FOR ALL USING (
    EXISTS (SELECT 1 FROM intakes i WHERE i.id = intake_id AND i.org_id = public.user_org_id())
    AND public.user_is_active()
  );
