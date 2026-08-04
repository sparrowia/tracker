-- Per-project module (tab) selection, replacing the single roadmap_enabled flag.
-- Valid values: actions, blockers, raid, agenda, docs, roadmap.
-- "actions" is required and the UI always treats it as on regardless of the array.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS modules text[] NOT NULL DEFAULT '{actions,raid,docs}';
UPDATE projects SET modules = modules || '{roadmap}' WHERE roadmap_enabled;
ALTER TABLE projects DROP COLUMN IF EXISTS roadmap_enabled;
