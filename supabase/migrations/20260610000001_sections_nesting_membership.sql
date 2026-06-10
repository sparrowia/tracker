-- Unified 2 tracker enhancements (part 1 of 2)
--  • Sections: group action_items within a project
--  • 5-deep nesting guard for action_items (was effectively single parent/child in UI)
--  • Auto-add @mentioned people to the project (visibility) when they're tagged in a thread
--  • Allow a 'new_item' notification type (used by part 2 / new-ticket alerts)

-- ============================================================
-- 1. SECTIONS
-- ============================================================
CREATE TABLE public.action_item_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_action_item_sections_project ON public.action_item_sections(project_id);

ALTER TABLE public.action_item_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org isolation" ON public.action_item_sections
  FOR ALL USING (org_id = public.user_org_id());

-- Link action_items to a section (optional; null = ungrouped)
ALTER TABLE public.action_items
  ADD COLUMN section_id uuid REFERENCES public.action_item_sections(id) ON DELETE SET NULL;
CREATE INDEX idx_action_items_section ON public.action_items(section_id) WHERE section_id IS NOT NULL;

-- ============================================================
-- 2. NESTING DEPTH GUARD (max 5 levels)
--    Top-level = depth 1; rejects a parent chain deeper than 5.
--    Also breaks cycles (chain walk caps at 5 then raises).
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_action_item_depth()
RETURNS trigger AS $$
DECLARE
  depth int := 1;
  cur uuid := NEW.parent_id;
BEGIN
  WHILE cur IS NOT NULL LOOP
    depth := depth + 1;
    IF depth > 5 THEN
      RAISE EXCEPTION 'action_items nesting cannot exceed 5 levels (attempted % deep)', depth;
    END IF;
    IF cur = NEW.id THEN
      RAISE EXCEPTION 'action_items parent chain cannot be cyclic';
    END IF;
    SELECT parent_id INTO cur FROM public.action_items WHERE id = cur;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_action_item_depth
  BEFORE INSERT OR UPDATE OF parent_id ON public.action_items
  FOR EACH ROW WHEN (NEW.parent_id IS NOT NULL)
  EXECUTE FUNCTION public.check_action_item_depth();

-- ============================================================
-- 3. NOTIFICATION TYPE: allow 'new_item'
-- ============================================================
ALTER TABLE public.comment_notifications DROP CONSTRAINT comment_notifications_mention_type_check;
ALTER TABLE public.comment_notifications ADD CONSTRAINT comment_notifications_mention_type_check
  CHECK (mention_type IN ('mention','owner','assignment','status_change','file_share','new_item'));

-- ============================================================
-- 4. @MENTION -> AUTO-ADD TO PROJECT (visibility)
--    When a comment is posted, any @[Name](person_uuid) tagged in the body
--    is added as a project_member of the item's project, granting visibility
--    (user_visible_project_ids already includes project_members).
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_mentioned_to_project()
RETURNS trigger AS $$
DECLARE
  proj uuid;
  m record;
BEGIN
  IF NEW.action_item_id IS NOT NULL THEN
    SELECT project_id INTO proj FROM public.action_items WHERE id = NEW.action_item_id;
  ELSIF NEW.raid_entry_id IS NOT NULL THEN
    SELECT project_id INTO proj FROM public.raid_entries WHERE id = NEW.raid_entry_id;
  ELSIF NEW.blocker_id IS NOT NULL THEN
    SELECT project_id INTO proj FROM public.blockers WHERE id = NEW.blocker_id;
  END IF;
  IF proj IS NULL THEN RETURN NEW; END IF;

  FOR m IN
    SELECT DISTINCT (regexp_matches(COALESCE(NEW.body,''), '@\[[^\]]+\]\(([0-9a-fA-F\-]{36})\)', 'g'))[1] AS pid
  LOOP
    BEGIN
      INSERT INTO public.project_members(project_id, person_id)
      VALUES (proj, m.pid::uuid)
      ON CONFLICT (project_id, person_id) DO NOTHING;
    EXCEPTION WHEN others THEN
      -- ignore malformed ids / missing people
      NULL;
    END;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_add_mentioned_to_project
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.add_mentioned_to_project();
