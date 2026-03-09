-- Remove duplicate entries created by multiple "Confirm Items" clicks on intake review
-- Keeps the oldest (first) row in each duplicate set, deletes the rest

-- Delete duplicate action_items (same title + org_id, created after 2026-03-09)
DELETE FROM action_items
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY org_id, title ORDER BY created_at ASC, id ASC) AS rn
    FROM action_items
    WHERE created_at >= '2026-03-09T00:00:00Z'
  ) dupes
  WHERE rn > 1
);

-- Delete duplicate blockers (same title + org_id, created after 2026-03-09)
DELETE FROM blockers
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY org_id, title ORDER BY created_at ASC, id ASC) AS rn
    FROM blockers
    WHERE created_at >= '2026-03-09T00:00:00Z'
  ) dupes
  WHERE rn > 1
);

-- Delete duplicate raid_entries (same title + org_id + raid_type, created after 2026-03-09)
DELETE FROM raid_entries
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY org_id, title, raid_type ORDER BY created_at ASC, id ASC) AS rn
    FROM raid_entries
    WHERE created_at >= '2026-03-09T00:00:00Z'
  ) dupes
  WHERE rn > 1
);
