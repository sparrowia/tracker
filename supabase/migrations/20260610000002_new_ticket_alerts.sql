-- Unified 2 tracker enhancements (part 2 of 2)
--  • New-ticket alerts: when a new top-level ticket is added to a project,
--    queue a digest notification (normal digest format) to the project's
--    assigned PM (project_manager_id); if none, the product owner (project_owner_id).
--  Notes:
--   - Fires only for top-level tickets (parent_id IS NULL) with a project, to avoid
--     alerting on every sub-task breakdown.
--   - Uses the existing comment_notifications queue + 2-hourly digest cron.

CREATE OR REPLACE FUNCTION public.notify_new_ticket()
RETURNS trigger AS $$
DECLARE
  recip_person uuid;
  proj_name text;
  proj_slug text;
  recip_email text;
BEGIN
  IF NEW.project_id IS NULL OR NEW.parent_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT name, slug, COALESCE(project_manager_id, project_owner_id)
    INTO proj_name, proj_slug, recip_person
    FROM public.projects WHERE id = NEW.project_id;

  IF recip_person IS NULL THEN RETURN NEW; END IF;

  SELECT email INTO recip_email FROM public.people WHERE id = recip_person;
  IF recip_email IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.comment_notifications(
    org_id, recipient_person_id, recipient_email, comment_id,
    commenter_name, comment_body, item_title, item_type,
    project_name, mention_type, entity_id, project_slug)
  VALUES (
    NEW.org_id, recip_person, recip_email, NULL,
    NULL, NULL, NEW.title, 'action item',
    proj_name, 'new_item', NEW.id, proj_slug);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_notify_new_ticket
  AFTER INSERT ON public.action_items
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_ticket();
