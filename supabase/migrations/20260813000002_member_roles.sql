-- Team member ROLES (Matt 2026-08-13, follow-up to 20260813000001).
--
-- Permission matrix:
--   owner            full, including deleting the project. Exactly one per
--                    project; defaults to the creator; only a super_admin may
--                    reassign (reassign_project_owner RPC).
--   project_manager  full except project delete; may delete ANY task.
--   product / qa     full except project delete; may delete only tasks they
--                    created. (qa is deliberately identical to product.)
--   member_full      edit everything, but cannot CREATE tasks (and so can
--                    effectively delete nothing new; delete stays own-created).
--   member_assigned  sees/updates ONLY tasks where they are assigned (owner),
--                    they opened (created_by / reporter), or they are
--                    mentioned. Cannot create in-app. DB-enforced.
--   vendor           identical to member_assigned (plus the account-level
--                    vendor scoping that already existed).
-- Account-level super_admin/admin bypass project roles entirely.

-- ============================================================
-- 1. Role column + backfill
-- ============================================================
ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member_assigned'
  CHECK (role IN ('owner','project_manager','product','qa','member_full','member_assigned','vendor'));

-- Map yesterday's labels / vendor people onto roles; internal default product.
UPDATE public.project_members pm SET role = CASE
  WHEN pm.role_label ILIKE '%project manager%' THEN 'project_manager'
  WHEN pm.role_label ILIKE '%qa%' THEN 'qa'
  WHEN pm.role_label ILIKE '%vendor owner%' THEN 'vendor'
  WHEN EXISTS (SELECT 1 FROM public.people pe WHERE pe.id = pm.person_id AND pe.vendor_id IS NOT NULL) THEN 'vendor'
  ELSE 'product'
END;

-- Owner backfill: the project_owner_id person, else the creator. Keep
-- projects.project_owner_id as the synced single-owner pointer.
INSERT INTO public.project_members (project_id, person_id, role)
SELECT p.id, p.project_owner_id, 'owner'
FROM public.projects p
WHERE p.project_owner_id IS NOT NULL
ON CONFLICT (project_id, person_id) DO UPDATE SET role = 'owner';

UPDATE public.projects p SET project_owner_id = pe.id
FROM public.people pe
WHERE pe.profile_id = p.created_by AND p.project_owner_id IS NULL;

INSERT INTO public.project_members (project_id, person_id, role)
SELECT p.id, p.project_owner_id, 'owner'
FROM public.projects p
WHERE p.project_owner_id IS NOT NULL
ON CONFLICT (project_id, person_id) DO UPDATE SET role = 'owner';

-- One owner per project, enforced.
CREATE UNIQUE INDEX IF NOT EXISTS project_members_one_owner
  ON public.project_members (project_id) WHERE role = 'owner';

-- ============================================================
-- 2. Helpers
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_project_role(p_project_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT pm.role
  FROM project_members pm
  JOIN people pe ON pe.id = pm.person_id
  WHERE pm.project_id = p_project_id AND pe.profile_id = auth.uid()
  LIMIT 1
$$;

-- Initiative owners keep their pre-existing project-admin reach.
CREATE OR REPLACE FUNCTION public.user_is_initiative_owner(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT p_project_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_project_id AND p.initiative_id IS NOT NULL
      AND (
        EXISTS (SELECT 1 FROM initiative_owners io JOIN people pe ON pe.id = io.person_id
                WHERE io.initiative_id = p.initiative_id AND pe.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM initiatives i JOIN people pe ON pe.id = i.owner_id
                   WHERE i.id = p.initiative_id AND pe.profile_id = auth.uid())
      )
  )
$$;

-- "Project admin" now means: any full-edit role, or an initiative owner.
-- (member_assigned / vendor are NOT project admins.)
CREATE OR REPLACE FUNCTION public.user_is_project_admin(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT COALESCE(public.user_project_role(p_project_id)
                  IN ('owner','project_manager','product','qa','member_full'), false)
         OR public.user_is_initiative_owner(p_project_id)
$$;

-- ============================================================
-- 3. Mentions: recorded per task so limited-view policies can use them
-- ============================================================
CREATE TABLE IF NOT EXISTS public.item_mentions (
  entity_type text NOT NULL CHECK (entity_type IN ('action_item','raid_entry','blocker')),
  entity_id uuid NOT NULL,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id, person_id)
);
-- RLS default-deny: only the SECURITY DEFINER helper below reads it.
ALTER TABLE public.item_mentions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_mentioned_in(p_entity_type text, p_entity_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM item_mentions im
    JOIN people pe ON pe.id = im.person_id
    WHERE im.entity_type = p_entity_type AND im.entity_id = p_entity_id
      AND pe.profile_id = auth.uid()
  )
$$;

-- Record mentions on new comments (alongside the existing
-- add_mentioned_to_project trigger, which keeps auto-adding mentioned people
-- to the team — they now land with the default member_assigned role).
CREATE OR REPLACE FUNCTION public.record_item_mentions()
RETURNS trigger AS $$
DECLARE
  etype text;
  eid uuid;
  m record;
BEGIN
  IF NEW.action_item_id IS NOT NULL THEN etype := 'action_item'; eid := NEW.action_item_id;
  ELSIF NEW.raid_entry_id IS NOT NULL THEN etype := 'raid_entry'; eid := NEW.raid_entry_id;
  ELSIF NEW.blocker_id IS NOT NULL THEN etype := 'blocker'; eid := NEW.blocker_id;
  ELSE RETURN NEW;
  END IF;

  FOR m IN
    SELECT DISTINCT (regexp_matches(COALESCE(NEW.body,''), '@\[[^\]]+\]\(([0-9a-fA-F\-]{36})\)', 'g'))[1] AS pid
  LOOP
    BEGIN
      INSERT INTO public.item_mentions(entity_type, entity_id, person_id)
      VALUES (etype, eid, m.pid::uuid)
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN others THEN
      NULL; -- malformed ids / missing people
    END;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_record_item_mentions ON public.comments;
CREATE TRIGGER trg_record_item_mentions
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.record_item_mentions();

-- Backfill mentions from existing comments.
INSERT INTO public.item_mentions (entity_type, entity_id, person_id)
SELECT DISTINCT
  CASE WHEN c.action_item_id IS NOT NULL THEN 'action_item'
       WHEN c.raid_entry_id IS NOT NULL THEN 'raid_entry'
       ELSE 'blocker' END,
  COALESCE(c.action_item_id, c.raid_entry_id, c.blocker_id),
  m.pid::uuid
FROM public.comments c
CROSS JOIN LATERAL (
  SELECT DISTINCT (regexp_matches(COALESCE(c.body,''), '@\[[^\]]+\]\(([0-9a-fA-F\-]{36})\)', 'g'))[1] AS pid
) m
WHERE m.pid IN (SELECT id::text FROM public.people)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. New-project trigger: creator becomes owner automatically
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_creator_as_owner()
RETURNS trigger AS $$
DECLARE pid uuid;
BEGIN
  IF NEW.project_owner_id IS NOT NULL THEN
    pid := NEW.project_owner_id;
  ELSE
    SELECT id INTO pid FROM public.people WHERE profile_id = NEW.created_by LIMIT 1;
  END IF;
  IF pid IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.project_members(project_id, person_id, role)
  VALUES (NEW.id, pid, 'owner')
  ON CONFLICT (project_id, person_id) DO UPDATE SET role = 'owner';
  UPDATE public.projects SET project_owner_id = pid
  WHERE id = NEW.id AND project_owner_id IS DISTINCT FROM pid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_project_creator_owner ON public.projects;
CREATE TRIGGER trg_project_creator_owner
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.add_creator_as_owner();

-- ============================================================
-- 5. Owner reassignment: super_admin only, atomic
-- ============================================================
CREATE OR REPLACE FUNCTION public.reassign_project_owner(p_project_id uuid, p_person_id uuid)
RETURNS void AS $$
BEGIN
  IF public.user_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'Only a super admin can reassign the project owner';
  END IF;
  -- Demote the current owner to project_manager, then promote.
  UPDATE public.project_members SET role = 'project_manager'
  WHERE project_id = p_project_id AND role = 'owner' AND person_id <> p_person_id;
  INSERT INTO public.project_members(project_id, person_id, role)
  VALUES (p_project_id, p_person_id, 'owner')
  ON CONFLICT (project_id, person_id) DO UPDATE SET role = 'owner';
  UPDATE public.projects SET project_owner_id = p_person_id WHERE id = p_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.reassign_project_owner(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reassign_project_owner(uuid, uuid) TO authenticated;

-- ============================================================
-- 6. project_members policies: only super_admin touches owner rows
-- ============================================================
DROP POLICY IF EXISTS "project_members_insert" ON public.project_members;
CREATE POLICY "project_members_insert" ON public.project_members
  FOR INSERT WITH CHECK (
    public.user_role() = 'super_admin'
    OR (public.user_role() IN ('admin','user','qa') AND role <> 'owner')
  );
DROP POLICY IF EXISTS "project_members_update" ON public.project_members;
CREATE POLICY "project_members_update" ON public.project_members
  FOR UPDATE
  USING (
    public.user_role() = 'super_admin'
    OR (public.user_role() IN ('admin','user','qa') AND role <> 'owner')
  )
  WITH CHECK (
    public.user_role() = 'super_admin'
    OR (public.user_role() IN ('admin','user','qa') AND role <> 'owner')
  );
DROP POLICY IF EXISTS "project_members_delete" ON public.project_members;
CREATE POLICY "project_members_delete" ON public.project_members
  FOR DELETE USING (
    public.user_role() = 'super_admin'
    OR (public.user_role() IN ('admin','user','qa') AND role <> 'owner')
  );

-- ============================================================
-- 7. Task-table policies (action_items, raid_entries, blockers)
-- ============================================================

-- ---- SELECT: member_assigned/vendor project roles are limited to
-- ---- assigned / opened / mentioned. Vendor ACCOUNTS lose the old
-- ---- "project member sees everything" branch for the same reason.
DROP POLICY IF EXISTS "action_items_select" ON action_items;
CREATE POLICY "action_items_select" ON action_items
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (
      public.user_role() IN ('super_admin','admin')
      OR (public.user_role() = 'vendor' AND (
            vendor_id = public.user_vendor_id()
            OR owner_id = public.user_person_id()
            OR created_by = auth.uid()
            OR public.user_mentioned_in('action_item', id)
          ))
      OR (public.user_role() IN ('user','qa') AND (
            project_id IS NULL
            OR COALESCE(public.user_project_role(project_id),'') NOT IN ('member_assigned','vendor')
            OR owner_id = public.user_person_id()
            OR created_by = auth.uid()
            OR public.user_mentioned_in('action_item', id)
          ))
    )
  );

DROP POLICY IF EXISTS "raid_entries_select" ON raid_entries;
CREATE POLICY "raid_entries_select" ON raid_entries
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (
      public.user_role() IN ('super_admin','admin')
      OR (public.user_role() = 'vendor' AND (
            vendor_id = public.user_vendor_id()
            OR owner_id = public.user_person_id()
            OR reporter_id = public.user_person_id()
            OR created_by = auth.uid()
            OR public.user_mentioned_in('raid_entry', id)
          ))
      OR (public.user_role() IN ('user','qa') AND (
            project_id IS NULL
            OR COALESCE(public.user_project_role(project_id),'') NOT IN ('member_assigned','vendor')
            OR owner_id = public.user_person_id()
            OR reporter_id = public.user_person_id()
            OR created_by = auth.uid()
            OR public.user_mentioned_in('raid_entry', id)
          ))
    )
  );

DROP POLICY IF EXISTS "blockers_select" ON blockers;
CREATE POLICY "blockers_select" ON blockers
  FOR SELECT USING (
    org_id = public.user_org_id() AND public.user_is_active()
    AND (
      public.user_role() IN ('super_admin','admin')
      OR (public.user_role() = 'vendor' AND (
            vendor_id = public.user_vendor_id()
            OR owner_id = public.user_person_id()
            OR created_by = auth.uid()
            OR public.user_mentioned_in('blocker', id)
          ))
      OR (public.user_role() IN ('user','qa') AND (
            project_id IS NULL
            OR COALESCE(public.user_project_role(project_id),'') NOT IN ('member_assigned','vendor')
            OR owner_id = public.user_person_id()
            OR created_by = auth.uid()
            OR public.user_mentioned_in('blocker', id)
          ))
    )
  );

-- ---- INSERT: member_full / member_assigned / vendor roles cannot create
-- ---- tasks in their project. (Vendor accounts already cannot INSERT.)
DROP POLICY IF EXISTS "action_items_insert" ON action_items;
CREATE POLICY "action_items_insert" ON action_items
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin','admin')
      OR (public.user_role() IN ('user','qa') AND (
            project_id IS NULL
            OR COALESCE(public.user_project_role(project_id),'') NOT IN ('member_full','member_assigned','vendor')
          ))
    )
  );
DROP POLICY IF EXISTS "raid_entries_insert" ON raid_entries;
CREATE POLICY "raid_entries_insert" ON raid_entries
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin','admin')
      OR (public.user_role() IN ('user','qa') AND (
            project_id IS NULL
            OR COALESCE(public.user_project_role(project_id),'') NOT IN ('member_full','member_assigned','vendor')
          ))
    )
  );
DROP POLICY IF EXISTS "blockers_insert" ON blockers;
CREATE POLICY "blockers_insert" ON blockers
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin','admin')
      OR (public.user_role() IN ('user','qa') AND (
            project_id IS NULL
            OR COALESCE(public.user_project_role(project_id),'') NOT IN ('member_full','member_assigned','vendor')
          ))
    )
  );

-- ---- UPDATE: full-edit roles edit anything in the project;
-- ---- member_assigned/vendor only their visible tasks; non-members keep the
-- ---- creator/owner baseline.
DROP POLICY IF EXISTS "action_items_update" ON action_items;
CREATE POLICY "action_items_update" ON action_items
  FOR UPDATE
  USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin','admin')
      OR (public.user_role() = 'vendor' AND (
            vendor_id = public.user_vendor_id()
            OR owner_id = public.user_person_id()
            OR created_by = auth.uid()
            OR public.user_mentioned_in('action_item', id)
          ))
      OR (public.user_role() IN ('user','qa') AND (
            public.user_is_project_admin(project_id)
            OR (COALESCE(public.user_project_role(project_id),'') IN ('member_assigned','vendor') AND (
                  owner_id = public.user_person_id()
                  OR created_by = auth.uid()
                  OR public.user_mentioned_in('action_item', id)
                ))
            OR (public.user_project_role(project_id) IS NULL AND public.user_can_edit(created_by, owner_id))
          ))
    )
  )
  WITH CHECK (org_id = public.user_org_id());

DROP POLICY IF EXISTS "raid_entries_update" ON raid_entries;
CREATE POLICY "raid_entries_update" ON raid_entries
  FOR UPDATE
  USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin','admin')
      OR (public.user_role() = 'vendor' AND (
            vendor_id = public.user_vendor_id()
            OR owner_id = public.user_person_id()
            OR reporter_id = public.user_person_id()
            OR created_by = auth.uid()
            OR public.user_mentioned_in('raid_entry', id)
          ))
      OR (public.user_role() IN ('user','qa') AND (
            public.user_is_project_admin(project_id)
            OR (COALESCE(public.user_project_role(project_id),'') IN ('member_assigned','vendor') AND (
                  owner_id = public.user_person_id()
                  OR reporter_id = public.user_person_id()
                  OR created_by = auth.uid()
                  OR public.user_mentioned_in('raid_entry', id)
                ))
            OR (public.user_project_role(project_id) IS NULL AND public.user_can_edit(created_by, owner_id))
          ))
    )
  )
  WITH CHECK (org_id = public.user_org_id());

DROP POLICY IF EXISTS "blockers_update" ON blockers;
CREATE POLICY "blockers_update" ON blockers
  FOR UPDATE
  USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin','admin')
      OR (public.user_role() = 'vendor' AND (
            vendor_id = public.user_vendor_id()
            OR owner_id = public.user_person_id()
            OR created_by = auth.uid()
            OR public.user_mentioned_in('blocker', id)
          ))
      OR (public.user_role() IN ('user','qa') AND (
            public.user_is_project_admin(project_id)
            OR (COALESCE(public.user_project_role(project_id),'') IN ('member_assigned','vendor') AND (
                  owner_id = public.user_person_id()
                  OR created_by = auth.uid()
                  OR public.user_mentioned_in('blocker', id)
                ))
            OR (public.user_project_role(project_id) IS NULL AND public.user_can_edit(created_by, owner_id))
          ))
    )
  )
  WITH CHECK (org_id = public.user_org_id());

-- ---- DELETE: owner/PM delete any task; product/qa/member_full only their
-- ---- own; member_assigned/vendor none. Initiative owners (non-members) keep
-- ---- PM-equivalent delete.
DROP POLICY IF EXISTS "action_items_delete" ON action_items;
CREATE POLICY "action_items_delete" ON action_items
  FOR DELETE USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin','admin')
      OR (public.user_role() IN ('user','qa') AND (
            COALESCE(public.user_project_role(project_id),'') IN ('owner','project_manager')
            OR (COALESCE(public.user_project_role(project_id),'') IN ('product','qa','member_full') AND created_by = auth.uid())
            OR (public.user_project_role(project_id) IS NULL AND public.user_is_initiative_owner(project_id))
          ))
    )
  );
DROP POLICY IF EXISTS "raid_entries_delete" ON raid_entries;
CREATE POLICY "raid_entries_delete" ON raid_entries
  FOR DELETE USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin','admin')
      OR (public.user_role() IN ('user','qa') AND (
            COALESCE(public.user_project_role(project_id),'') IN ('owner','project_manager')
            OR (COALESCE(public.user_project_role(project_id),'') IN ('product','qa','member_full') AND created_by = auth.uid())
            OR (public.user_project_role(project_id) IS NULL AND public.user_is_initiative_owner(project_id))
          ))
    )
  );
DROP POLICY IF EXISTS "blockers_delete" ON blockers;
CREATE POLICY "blockers_delete" ON blockers
  FOR DELETE USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('super_admin','admin')
      OR (public.user_role() IN ('user','qa') AND (
            COALESCE(public.user_project_role(project_id),'') IN ('owner','project_manager')
            OR (COALESCE(public.user_project_role(project_id),'') IN ('product','qa','member_full') AND created_by = auth.uid())
            OR (public.user_project_role(project_id) IS NULL AND public.user_is_initiative_owner(project_id))
          ))
    )
  );

-- ============================================================
-- 8. Project delete: owner or super_admin (creator rule retired)
-- ============================================================
DROP POLICY IF EXISTS "projects_delete" ON public.projects;
CREATE POLICY "projects_delete" ON public.projects
  FOR DELETE USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() = 'super_admin'
      OR public.user_project_role(id) = 'owner'
    )
  );
