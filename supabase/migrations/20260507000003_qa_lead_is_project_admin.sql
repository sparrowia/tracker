-- Correction: project_manager_id was added by mistake in the previous migration.
-- The intent is that the project's QA lead has admin-on-project rights, alongside
-- the project owner and initiative owner branches.

CREATE OR REPLACE FUNCTION public.user_is_project_admin(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    p_project_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = p_project_id
        AND (
          EXISTS (
            SELECT 1 FROM people pe
            WHERE pe.id IN (p.project_owner_id, p.lead_qa_id)
              AND pe.profile_id = auth.uid()
          )
          OR (
            p.initiative_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM initiative_owners io
              JOIN people pe ON pe.id = io.person_id
              WHERE io.initiative_id = p.initiative_id
                AND pe.profile_id = auth.uid()
            )
          )
          OR (
            p.initiative_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM initiatives i
              JOIN people pe ON pe.id = i.owner_id
              WHERE i.id = p.initiative_id
                AND pe.profile_id = auth.uid()
            )
          )
        )
    )
$$;
