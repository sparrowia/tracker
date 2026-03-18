-- Add public_issue_form toggle to projects
ALTER TABLE public.projects
  ADD COLUMN public_issue_form boolean NOT NULL DEFAULT false;

-- Create storage bucket for issue attachments (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('issue-attachments', 'issue-attachments', true);

-- Allow anonymous uploads to issue-attachments bucket
CREATE POLICY "issue_attachments_anon_upload"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'issue-attachments');

-- Allow public read on issue-attachments bucket
CREATE POLICY "issue_attachments_public_read"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'issue-attachments');

-- Also allow authenticated users to read/upload
CREATE POLICY "issue_attachments_auth_read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'issue-attachments');

CREATE POLICY "issue_attachments_auth_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'issue-attachments');
