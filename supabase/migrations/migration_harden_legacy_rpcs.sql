-- migration_harden_legacy_rpcs.sql
--
-- Closes a live financial hole and hardens the RPCs that predate this session.
--
-- ── The hole ────────────────────────────────────────────────────────────────
-- `redeem_fuel(p_driver_id, p_amount, p_trip_id)` was SECURITY DEFINER, took
-- the driver's id as a PARAMETER, never called `auth.uid()`, and was executable
-- by `anon`. The anon key ships inside the app bundle — it is public by design —
-- so anyone who downloaded the app could call:
--
--   POST /rest/v1/rpc/redeem_fuel
--   { "p_driver_id": "<any uuid>", "p_amount": 500000, "p_trip_id": "<random>" }
--
-- and drain the communal fuel pool. The dedupe key is per-trip, so varying
-- `p_trip_id` defeats the only guard that existed. Nothing about this required
-- an account.
--
-- `claim_free_ride(p_offer_id, p_passenger_id)` had the same shape: claim a ride
-- as any passenger, unauthenticated. `resolve_barter_violation` let anyone
-- settle a moderation dispute.
--
-- ── The rule this establishes ───────────────────────────────────────────────
-- A SECURITY DEFINER function must never take the acting user's identity as an
-- argument. It derives it from `auth.uid()`. An argument is a claim by the
-- caller; `auth.uid()` is a fact from the verified JWT. Where a signature has to
-- stay for compatibility, the parameter is now checked AGAINST `auth.uid()`
-- rather than trusted.
--
-- Found by Supabase's own advisor (`anon_security_definer_function_executable`)
-- after the ads work. Worth running `get_advisors` after every migration.

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. redeem_fuel — the money one
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.redeem_fuel(
  p_driver_id UUID,
  p_amount    NUMERIC,
  p_trip_id   TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me      UUID := auth.uid();
  v_balance NUMERIC;
  v_key     TEXT := 'redeem:' || p_trip_id;
BEGIN
  -- The two lines that were missing. The signature is unchanged so existing
  -- callers keep working, but the id is now checked rather than believed.
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  IF p_driver_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'you can only redeem your own fuel';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN 0; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('emilgo_fuel_pool'));

  IF EXISTS (SELECT 1 FROM public.fuel_pool_history WHERE dedupe_key = v_key) THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance FROM public.fuel_pool_history;
  IF v_balance < p_amount THEN
    RETURN 0;
  END IF;

  INSERT INTO public.fuel_pool_history (user_id, amount, kind, trip_id, dedupe_key)
  VALUES (v_me, -p_amount, 'fuel_redemption', p_trip_id, v_key);

  RETURN p_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_fuel(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_fuel(UUID, NUMERIC, TEXT) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. claim_free_ride — same shape, same fix
-- ═════════════════════════════════════════════════════════════════════════════

-- The body below is the original, unchanged, with only the identity guard
-- prepended. The seat-race logic (SELECT ... FOR UPDATE, the claimed_count
-- bump) is correct and rewriting it blind is how a security fix becomes a
-- regression.
CREATE OR REPLACE FUNCTION public.claim_free_ride(p_offer_id UUID, p_passenger_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_offer    public.free_ride_offers%ROWTYPE;
  v_claim_id UUID;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  IF p_passenger_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'you can only claim a ride for yourself';
  END IF;

  SELECT * INTO v_offer FROM public.free_ride_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND OR v_offer.status <> 'open' OR v_offer.claimed_count >= v_offer.max_passengers THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.free_ride_claims
     WHERE offer_id = p_offer_id AND passenger_id = v_me
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.free_ride_claims (offer_id, driver_id, passenger_id)
  VALUES (p_offer_id, v_offer.driver_id, v_me)
  RETURNING id INTO v_claim_id;

  UPDATE public.free_ride_offers
     SET claimed_count = claimed_count + 1,
         status = CASE WHEN claimed_count + 1 >= max_passengers THEN 'full' ELSE 'open' END
   WHERE id = p_offer_id;

  RETURN v_claim_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_free_ride(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_free_ride(UUID, UUID) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. resolve_barter_violation — moderation, admin only
-- ═════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.resolve_barter_violation(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_barter_violation(UUID, BOOLEAN) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Revoke anon everywhere it is not needed
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Postgres grants EXECUTE to PUBLIC on every new function, and `anon` inherits
-- from PUBLIC — so a function is anon-callable unless someone actively revokes
-- it. That default is why 27 of these were exposed without anyone deciding to
-- expose them.
--
-- `get_user_by_username` is the ONE deliberate exception: username login has to
-- resolve a username to an email before a session exists. See the note at the
-- bottom.

DO $$
DECLARE
  r RECORD;
  -- Functions that legitimately run before authentication.
  keep_anon TEXT[] := ARRAY['get_user_by_username'];
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef                                   -- SECURITY DEFINER only
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND NOT (p.proname = ANY (keep_anon))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
                   r.proname, r.args);
    -- service_role too: revoking from PUBLIC takes it away from every role
    -- that had it only by inheritance, and server-side jobs run as service_role.
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
                   r.proname, r.args);
  END LOOP;
END;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Pin search_path on every function that lacks it
-- ═════════════════════════════════════════════════════════════════════════════
--
-- An unpinned `search_path` on a SECURITY DEFINER function lets a caller who can
-- create a schema shadow a table or operator the function relies on, and have it
-- run with the definer's rights. `ALTER FUNCTION ... SET search_path` fixes it
-- without touching a single function body.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND (p.proconfig IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
            ))
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
                   r.proname, r.args);
  END LOOP;
END;
$$;

COMMIT;

-- ── Left deliberately alone ─────────────────────────────────────────────────
--
-- `get_user_by_username` stays anon-callable because login needs it, but it
-- returns an EMAIL for any username handed to it, so usernames can be walked to
-- harvest addresses. Narrowing it means moving username login behind an edge
-- function that returns a session rather than an email, which is a change to the
-- auth flow and not something to fold into a security patch. Tracked in
-- HANDOFF.md; it is a privacy leak, not a privilege escalation.
--
-- `v_active_park_trips` is still a SECURITY DEFINER view (advisor ERROR). It
-- predates this session and its owner's rights are what make it work at all, so
-- converting it needs the park-owner access rules rewritten as policies first.
