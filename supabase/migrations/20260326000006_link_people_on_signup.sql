-- Update handle_new_user to also link the people record by email

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

  -- Link existing people record by email
  UPDATE public.people
  SET profile_id = NEW.id
  WHERE email = NEW.email
    AND org_id = v_org_id
    AND profile_id IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
