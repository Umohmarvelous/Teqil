-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: "Database error saving new user" on registration.
--
-- That error is raised when the AFTER INSERT trigger on auth.users (which mirrors
-- the new account into public.users) throws — e.g. a NOT NULL column, a type cast,
-- or a constraint it doesn't satisfy. This redefines the trigger to:
--   * pull every field from the signup metadata with safe defaults,
--   * upsert (ON CONFLICT DO NOTHING) so it never collides with the client-side
--     syncUserToPublicTable() upsert,
--   * swallow any error so a profile-mirror problem can NEVER block auth signup.
--
-- Safe to run multiple times (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id, email, username, first_name, last_name, full_name, phone, age, role,
    driver_id, profile_photo, device_fingerprint, points_balance, credits_balance,
    profile_complete, created_at, updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'username', ''),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE((NEW.raw_user_meta_data->>'age')::int, 18),
    COALESCE(NEW.raw_user_meta_data->>'role', 'passenger'),
    NULLIF(NEW.raw_user_meta_data->>'driver_id', ''),
    NEW.raw_user_meta_data->>'profile_photo',
    NEW.raw_user_meta_data->>'device_fingerprint',
    COALESCE((NEW.raw_user_meta_data->>'points_balance')::int, 0),
    COALESCE((NEW.raw_user_meta_data->>'credits_balance')::int, 10),
    COALESCE((NEW.raw_user_meta_data->>'profile_complete')::boolean, false),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block auth signup because of the profile mirror; the client's
    -- syncUserToPublicTable() upsert will fill the row in right after signup.
    RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
