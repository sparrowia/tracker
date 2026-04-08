-- Add product_type and asana_link columns to projects
ALTER TABLE projects
  ADD COLUMN product_type text,
  ADD COLUMN asana_link text;
