-- Retain the reporter's choice even if staff later move the issue.
ALTER TABLE public.raid_entries
  ADD COLUMN post_release_issue boolean NOT NULL DEFAULT false;

-- Run in the insert transaction: failed submissions cannot leave empty folders.
-- Invoker rights preserve RLS; public intake uses the existing service-role API.
CREATE FUNCTION public.file_post_release_issue()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT NEW.post_release_issue THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = NEW.project_id AND org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'Post release issues require a matching project and organization';
  END IF;

  -- Serialize first submissions within a project, without blocking other projects.
  PERFORM pg_advisory_xact_lock(hashtextextended('post-release:' || NEW.project_id::text, 0));

  SELECT id INTO NEW.folder_id
  FROM public.issue_folders
  WHERE project_id = NEW.project_id AND org_id = NEW.org_id
    AND title = 'Post Release'
  ORDER BY created_at, id
  LIMIT 1;

  IF NEW.folder_id IS NULL THEN
    INSERT INTO public.issue_folders (org_id, project_id, title, created_by)
    VALUES (NEW.org_id, NEW.project_id, 'Post Release', NEW.created_by)
    RETURNING id INTO NEW.folder_id;
  END IF;

  NEW.raid_type := 'issue';
  NEW.parent_id := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER file_post_release_issue
BEFORE INSERT ON public.raid_entries
FOR EACH ROW EXECUTE FUNCTION public.file_post_release_issue();
