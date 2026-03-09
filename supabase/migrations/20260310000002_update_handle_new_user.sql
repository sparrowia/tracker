-- Update handle_new_user trigger to read role and vendor_id from invite metadata

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, org_id, full_name, email, role, vendor_id)
  VALUES (
    NEW.id,
    COALESCE(
      (NEW.raw_user_meta_data ->> 'org_id')::uuid,
      (SELECT id FROM organizations LIMIT 1)
    ),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data ->> 'role')::user_role, 'user'),
    (NEW.raw_user_meta_data ->> 'vendor_id')::uuid
  );
  RETURN NEW;
END;
$$;

-- Recreate trigger (drop first in case it exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
