-- Don't auto-mark invitation accepted_at when auth user is created.
-- The auth user is created by generateLink before the user clicks the link.
-- accepted_at should only be set when they actually complete the callback.
-- Also don't link profile_id until they sign in (via callback).

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := COALESCE(
    (NEW.raw_user_meta_data ->> 'org_id')::uuid,
    (SELECT id FROM organizations LIMIT 1)
  );

  INSERT INTO public.profiles (id, org_id, full_name, email, role, vendor_id)
  VALUES (
    NEW.id,
    v_org_id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data ->> 'role')::user_role, 'user'),
    (NEW.raw_user_meta_data ->> 'vendor_id')::uuid
  );

  -- NOTE: Do NOT link people.profile_id or mark invitation accepted here.
  -- This trigger fires when generateLink creates the auth user (before the user clicks).
  -- The /auth/callback page handles accepted_at, and /api/invite/accept links profile_id.

  RETURN NEW;
END;
$$;
