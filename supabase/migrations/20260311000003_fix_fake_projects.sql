-- Move items from "Daily Dose" (should be under "Unified System") and
-- "Procedural Videos" (should be under "VetPrep / VTP"), then delete those fake projects.

-- Move action_items from Daily Dose → Unified System
UPDATE action_items
SET project_id = (SELECT id FROM projects WHERE name = 'Unified System' LIMIT 1)
WHERE project_id = (SELECT id FROM projects WHERE name = 'Daily Dose' LIMIT 1);

-- Move action_items from Procedural Videos → VetPrep / VTP
UPDATE action_items
SET project_id = (SELECT id FROM projects WHERE name = 'VetPrep / VTP' LIMIT 1)
WHERE project_id = (SELECT id FROM projects WHERE name = 'Procedural Videos' LIMIT 1);

-- Move blockers
UPDATE blockers
SET project_id = (SELECT id FROM projects WHERE name = 'Unified System' LIMIT 1)
WHERE project_id = (SELECT id FROM projects WHERE name = 'Daily Dose' LIMIT 1);

UPDATE blockers
SET project_id = (SELECT id FROM projects WHERE name = 'VetPrep / VTP' LIMIT 1)
WHERE project_id = (SELECT id FROM projects WHERE name = 'Procedural Videos' LIMIT 1);

-- Move raid_entries
UPDATE raid_entries
SET project_id = (SELECT id FROM projects WHERE name = 'Unified System' LIMIT 1)
WHERE project_id = (SELECT id FROM projects WHERE name = 'Daily Dose' LIMIT 1);

UPDATE raid_entries
SET project_id = (SELECT id FROM projects WHERE name = 'VetPrep / VTP' LIMIT 1)
WHERE project_id = (SELECT id FROM projects WHERE name = 'Procedural Videos' LIMIT 1);

-- Move agenda_items
UPDATE agenda_items
SET project_id = (SELECT id FROM projects WHERE name = 'Unified System' LIMIT 1)
WHERE project_id = (SELECT id FROM projects WHERE name = 'Daily Dose' LIMIT 1);

UPDATE agenda_items
SET project_id = (SELECT id FROM projects WHERE name = 'VetPrep / VTP' LIMIT 1)
WHERE project_id = (SELECT id FROM projects WHERE name = 'Procedural Videos' LIMIT 1);

-- Move support_tickets
UPDATE support_tickets
SET project_id = (SELECT id FROM projects WHERE name = 'Unified System' LIMIT 1)
WHERE project_id = (SELECT id FROM projects WHERE name = 'Daily Dose' LIMIT 1);

UPDATE support_tickets
SET project_id = (SELECT id FROM projects WHERE name = 'VetPrep / VTP' LIMIT 1)
WHERE project_id = (SELECT id FROM projects WHERE name = 'Procedural Videos' LIMIT 1);

-- Move intakes (if project_id column exists)
UPDATE intakes
SET project_id = (SELECT id FROM projects WHERE name = 'Unified System' LIMIT 1)
WHERE project_id = (SELECT id FROM projects WHERE name = 'Daily Dose' LIMIT 1);

UPDATE intakes
SET project_id = (SELECT id FROM projects WHERE name = 'VetPrep / VTP' LIMIT 1)
WHERE project_id = (SELECT id FROM projects WHERE name = 'Procedural Videos' LIMIT 1);

-- Delete the fake projects
DELETE FROM projects WHERE name = 'Daily Dose';
DELETE FROM projects WHERE name = 'Procedural Videos';
