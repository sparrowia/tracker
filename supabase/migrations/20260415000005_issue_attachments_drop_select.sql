-- Drop broad SELECT policies on issue-attachments bucket.
-- The bucket is public, so getPublicUrl() works without a SELECT policy.
-- These SELECT policies only enabled file listing, which is not needed.

DROP POLICY IF EXISTS "issue_attachments_public_read" ON storage.objects;
DROP POLICY IF EXISTS "issue_attachments_auth_read" ON storage.objects;
