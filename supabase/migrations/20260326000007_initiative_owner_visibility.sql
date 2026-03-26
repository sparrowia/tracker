-- Update user_visible_project_ids to include projects under initiatives the person owns
CREATE OR REPLACE FUNCTION user_visible_project_ids(p_person_id uuid, p_profile_id uuid)
RETURNS SETOF uuid AS $$
  SELECT DISTINCT project_id FROM action_items WHERE owner_id = p_person_id AND project_id IS NOT NULL
  UNION
  SELECT DISTINCT project_id FROM blockers WHERE owner_id = p_person_id AND project_id IS NOT NULL
  UNION
  SELECT DISTINCT project_id FROM raid_entries WHERE owner_id = p_person_id AND project_id IS NOT NULL
  UNION
  SELECT DISTINCT id FROM projects WHERE created_by = p_profile_id
  UNION
  SELECT DISTINCT p.id FROM projects p
    JOIN initiatives i ON p.initiative_id = i.id
    WHERE i.owner_id = p_person_id
$$ LANGUAGE sql STABLE SECURITY DEFINER;
