-- migration_user_privacy.sql
--
-- Stops `public.users` from being a public directory, and makes username the
-- only handle anyone can be searched by.
--
-- ── What was actually wrong ─────────────────────────────────────────────────
-- `get_user_by_username` leaking one email at a time was the small half of the
-- problem. The large half was this policy:
--
--     CREATE POLICY "Users are publicly readable" ON public.users
--       FOR SELECT USING (true);
--
-- No role restriction, so it applied to PUBLIC — which includes `anon`. The
-- anon key ships inside the app bundle, so `GET /rest/v1/users?select=*`
-- returned EVERY row of the table to anyone who downloaded the app: email,
-- phone, kyc_status, is_admin, and — as soon as a driver adds one —
-- payout_bank_code, payout_account_number, nin_hash, bvn_hash. Verified against
-- the live database before writing this: 9 rows, 9 emails, 9 phone numbers.
--
-- Narrowing the RPC while that policy stood would have changed nothing.
--
-- ── The shape of the fix ────────────────────────────────────────────────────
-- Drop the blanket policy. Every legitimate cross-user read becomes a
-- SECURITY DEFINER function whose SELECT LIST IS THE ACCESS CONTROL — definer
-- rights bypass RLS, so a column named in one of these functions is a column
-- every signed-in user can see, and nothing else is reachable at all.
--
-- The remaining policies on `users` (own row, park-owner-reads-their-drivers,
-- driver-reads-passengers-on-a-shared-trip) are unchanged and still apply.

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. The directory dump
-- ═════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users are publicly readable" ON public.users;

-- Belt and braces: PostgREST reaches tables through role grants as well as
-- policies, and `anon` has no business selecting from this table under any
-- policy we might add later.
REVOKE SELECT ON public.users FROM anon;


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Display-safe profiles, by id
-- ═════════════════════════════════════════════════════════════════════════════
-- Replaces the direct `from('users').select(...)` reads in the messages store,
-- verify-driver and payment. Note what is NOT in the select list: email, phone,
-- every payout and KYC column, is_admin, device_fingerprint.
--
-- Phone deliberately stays out even here. It has its own function
-- (`get_contact_phone`) which additionally requires a shared conversation and
-- honours the user's `share_phone` switch.

CREATE OR REPLACE FUNCTION public.get_public_profiles(p_ids UUID[])
RETURNS TABLE (
  id              UUID,
  full_name       TEXT,
  username        TEXT,
  role            TEXT,
  driver_id       TEXT,
  profile_photo   TEXT,
  vehicle_details TEXT,
  park_name       TEXT,
  park_location   TEXT,
  avg_rating      DOUBLE PRECISION,
  follower_count  INTEGER,
  following_count INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT u.id, u.full_name, u.username, u.role::TEXT, u.driver_id,
           u.profile_photo, u.vehicle_details, u.park_name, u.park_location,
           u.avg_rating, u.follower_count, u.following_count
      FROM public.users u
     WHERE u.id = ANY (p_ids)
     -- A caller who passes 10,000 ids is enumerating, not rendering a screen.
     LIMIT 200;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_public_profiles(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(UUID[]) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Driver resolution for the QR / pay flow
-- ═════════════════════════════════════════════════════════════════════════════
-- A SCANNED code is not a typed search. The passenger already physically holds
-- the driver's QR, so resolving the badge id it contains leaks nothing they
-- were not just handed — which is why driver_id still resolves HERE, and only
-- here, after being removed from every search path in section 5.

CREATE OR REPLACE FUNCTION public.get_driver_public(p_driver_id TEXT)
RETURNS TABLE (
  id              UUID,
  driver_id       TEXT,
  full_name       TEXT,
  username        TEXT,
  vehicle_details TEXT,
  park_name       TEXT,
  avg_rating      DOUBLE PRECISION,
  profile_photo   TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_handle TEXT := btrim(COALESCE(p_driver_id, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF v_handle = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT u.id, u.driver_id, u.full_name, u.username, u.vehicle_details,
           u.park_name, u.avg_rating, u.profile_photo
      FROM public.users u
     WHERE (v_handle ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND u.id = v_handle::UUID)
        OR upper(u.driver_id) = upper(v_handle)
     LIMIT 1;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_driver_public(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_public(TEXT) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Username availability — the ONE thing signup needs before a session
-- ═════════════════════════════════════════════════════════════════════════════
-- Returns a boolean and nothing else. A signup form inherently reveals whether
-- a handle is taken — that is the entire point of the field — but it must not
-- also hand over the email attached to it, which is what the old
-- `get_user_by_username` did for anyone who asked.

CREATE OR REPLACE FUNCTION public.username_available(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.users
     WHERE lower(username) = lower(btrim(COALESCE(p_username, '')))
  ) AND btrim(COALESCE(p_username, '')) <> '';
$fn$;

REVOKE ALL ON FUNCTION public.username_available(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.username_available(TEXT) TO anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 5. get_user_by_username — off the public internet
-- ═════════════════════════════════════════════════════════════════════════════
-- Username login still needs username → email, but that resolution now happens
-- inside the `username-login` edge function using the service-role key, and the
-- email never reaches the device. So this function keeps its job and loses its
-- audience.

REVOKE ALL ON FUNCTION public.get_user_by_username(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_by_username(TEXT) TO service_role;

ALTER FUNCTION public.get_user_by_username(TEXT) SET search_path = public, pg_temp;


-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Search is username-only
-- ═════════════════════════════════════════════════════════════════════════════
-- Driver badge IDs are printed on a QR sticker and issued in sequence-ish form;
-- letting them be typed into a search box turns them into a guessable index of
-- every driver on the platform. Full name matching went the same way — people
-- do not choose their legal name, and they cannot change it to stop being
-- found. A username is chosen, is public by intent, and can be changed.

CREATE OR REPLACE FUNCTION public.find_user_for_chat(p_handle TEXT)
RETURNS TABLE (
  id              UUID,
  full_name       TEXT,
  username        TEXT,
  role            TEXT,
  driver_id       TEXT,
  profile_photo   TEXT,
  vehicle_details TEXT,
  park_name       TEXT,
  avg_rating      NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_me   UUID := auth.uid();
  v_bare TEXT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  -- "@ada" and "ada" are the same handle.
  v_bare := lower(ltrim(btrim(COALESCE(p_handle, '')), '@'));
  IF v_bare = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT u.id, u.full_name, u.username, u.role::TEXT, u.driver_id,
           u.profile_photo, u.vehicle_details, u.park_name, u.avg_rating::NUMERIC
      FROM public.users u
     -- Messaging yourself is always a mistake, never a feature.
     WHERE u.id <> v_me
       AND lower(u.username) = v_bare
     LIMIT 1;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.search_users_for_chat(
  p_query TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id              UUID,
  full_name       TEXT,
  username        TEXT,
  role            TEXT,
  driver_id       TEXT,
  profile_photo   TEXT,
  vehicle_details TEXT,
  avg_rating      NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_me   UUID := auth.uid();
  v_bare TEXT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  v_bare := lower(ltrim(btrim(COALESCE(p_query, '')), '@'));

  -- One character matches too much of the table to be a search; it is a scrape.
  IF length(v_bare) < 2 THEN
    RETURN;
  END IF;

  -- Prefix, not substring. `%ada%` over a user table is a directory-scraping
  -- primitive — two characters would enumerate a large share of the user base.
  -- A prefix means you broadly know the handle already, which is the real use
  -- case. `escape_like` keeps `_` and `%` in a username from matching wildly.
  RETURN QUERY
    SELECT u.id, u.full_name, u.username, u.role::TEXT, u.driver_id,
           u.profile_photo, u.vehicle_details, u.avg_rating::NUMERIC
      FROM public.users u
     WHERE u.id <> v_me
       AND u.username IS NOT NULL
       AND lower(u.username) LIKE
           replace(replace(replace(v_bare, '\', '\\'), '%', '\%'), '_', '\_') || '%'
     ORDER BY (lower(u.username) = v_bare) DESC,
              length(u.username) ASC,
              u.username ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 25);
END;
$fn$;

REVOKE ALL ON FUNCTION public.find_user_for_chat(TEXT)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_users_for_chat(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_user_for_chat(TEXT)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_users_for_chat(TEXT, INTEGER) TO authenticated;

-- `search_drivers` was the other typed-ID path into the user table. Nothing
-- should call it any more; drop it rather than leave a second door.
DROP FUNCTION IF EXISTS public.search_drivers(TEXT);


-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Park lookups the sync layer still needs
-- ═════════════════════════════════════════════════════════════════════════════
-- `pullBroadcasts` resolved a park name to its owner's id with a direct read,
-- which the dropped policy was silently permitting.

CREATE OR REPLACE FUNCTION public.get_park_owner_id(p_park_name TEXT)
RETURNS UUID
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT u.id
    FROM public.users u
   WHERE auth.uid() IS NOT NULL
     AND u.role = 'park_owner'
     AND u.park_name = p_park_name
   LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.get_park_owner_id(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_park_owner_id(TEXT) TO authenticated;

COMMIT;
