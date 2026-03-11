-- Returns project IDs that a user is associated with (as owner on items or project creator)
CREATE OR REPLACE FUNCTION user_visible_project_ids(p_person_id uuid, p_profile_id uuid)
RETURNS SETOF uuid AS $$
  SELECT DISTINCT project_id FROM action_items WHERE owner_id = p_person_id AND project_id IS NOT NULL
  UNION
  SELECT DISTINCT project_id FROM blockers WHERE owner_id = p_person_id AND project_id IS NOT NULL
  UNION
  SELECT DISTINCT project_id FROM raid_entries WHERE owner_id = p_person_id AND project_id IS NOT NULL
  UNION
  SELECT DISTINCT id FROM projects WHERE created_by = p_profile_id
$$ LANGUAGE sql STABLE SECURITY DEFINER;
