-- ─────────────────────────────────────────────────────────────────────────────
-- Username-based login
--
-- The `username` column and get_user_by_username() were introduced in
-- migration_credits_auth.sql. This migration hardens them for the new
-- "type username → auto login" flow:
--   1. Guarantees username uniqueness is CASE-INSENSITIVE (usernames are stored
--      lower-cased by the app, but this protects against any legacy mixed-case rows).
--   2. Adds an index for fast username lookups on every keystroke.
--   3. Recreates the lookup RPC as a case-insensitive match.
--
-- Safe to run multiple times (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 + 2. Case-insensitive uniqueness + fast lookup index.
--        (The original `username TEXT UNIQUE` constraint stays; this adds the
--         case-insensitive guard the app relies on.)
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uidx
  ON public.users (lower(username))
  WHERE username IS NOT NULL;

-- 3. Case-insensitive username resolver used by the login screen.
--    SECURITY DEFINER so an anonymous client can resolve a username to the
--    minimal fields needed to start a login, without exposing the users table.
CREATE OR REPLACE FUNCTION public.get_user_by_username(p_username TEXT)
RETURNS TABLE (email TEXT, device_fingerprint TEXT) AS $$
BEGIN
  RETURN QUERY
    SELECT u.email, u.device_fingerprint
    FROM public.users u
    WHERE lower(u.username) = lower(p_username)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
