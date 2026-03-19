-- Project files storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('project-files', 'project-files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "project_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-files');

-- Allow authenticated users to read
CREATE POLICY "project_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'project-files');

-- Allow authenticated users to delete
CREATE POLICY "project_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'project-files');

-- Public read access
CREATE POLICY "project_files_public_read" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'project-files');
