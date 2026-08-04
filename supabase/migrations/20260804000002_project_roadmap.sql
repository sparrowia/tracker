-- On/off switch for the per-project Roadmap tab (placeholder tab for now).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS roadmap_enabled boolean NOT NULL DEFAULT false;
