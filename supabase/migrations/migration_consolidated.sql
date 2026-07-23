-- ═════════════════════════════════════════════════════════════════════════════
-- EMILGO / Teqil — CONSOLIDATED database migration
--
-- Run this ONCE in Supabase → SQL Editor → Run  (or `supabase db push`).
-- It is idempotent (IF NOT EXISTS / CREATE OR REPLACE), so re-running is safe.
--
-- It combines, in order:
--   1. users columns + credits_history table + RLS   (migration_credits_auth.sql)
--   2. case-insensitive username lookup               (migration_username_login.sql)
--   3. defensive new-user trigger                      (migration_fix_signup_trigger.sql)
-- ═════════════════════════════════════════════════════════════════════════════


-- ── 1. users columns ─────────────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS credits_balance INTEGER DEFAULT 0;


-- ── 1b. credits_history ledger + RLS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.credits_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    post_id UUID,
    comment_id UUID,
    synced BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.credits_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own credits history" ON public.credits_history;
CREATE POLICY "Users can view their own credits history"
    ON public.credits_history FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own credits history" ON public.credits_history;
CREATE POLICY "Users can insert their own credits history"
    ON public.credits_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);


-- ── 2. Case-insensitive username lookup ──────────────────────────────────────
-- Unique, case-insensitive index (usernames are stored lower-cased by the app).
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uidx
  ON public.users (lower(username))
  WHERE username IS NOT NULL;

-- Resolve a username → minimal login fields, without exposing the users table.
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

-- The login screen calls this while unauthenticated (anon).
GRANT EXECUTE ON FUNCTION public.get_user_by_username(TEXT) TO anon, authenticated;


-- ── 3. Defensive new-user trigger ────────────────────────────────────────────
-- Fixes "Database error saving new user": mirrors the signup into public.users
-- and NEVER blocks auth signup if the mirror fails.
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
    RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
