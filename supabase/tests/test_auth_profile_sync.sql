-- supabase/tests/test_auth_profile_sync.sql
--
-- Proves the auth→profile trigger carries what registration needs and destroys
-- nothing on the way.
--
-- Usage: node ./.dbq.mjs -f supabase/tests/test_auth_profile_sync.sql

BEGIN;

CREATE TEMP TABLE t (step text, ok boolean, detail text) ON COMMIT DROP;

DO $$
DECLARE
  uid UUID := gen_random_uuid();
  v TEXT; n INT;
BEGIN
  -- ── 1. The OTP step: an auth row with NO metadata ───────────────────────
  -- This is what `signInWithOtp({shouldCreateUser:true})` produces. The old
  -- flow never hit this case because signUp carried everything at once.
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data,
                          created_at, updated_at)
  VALUES (uid, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'sync-test@example.com', '{}'::jsonb, now(), now());

  SELECT count(*) INTO n FROM public.users WHERE id = uid;
  INSERT INTO t VALUES ('a verified-but-unfinished signup gets a profile row', n = 1, n::text);

  SELECT role INTO v FROM public.users WHERE id = uid;
  INSERT INTO t VALUES ('it defaults to passenger until told otherwise', v = 'passenger', v);

  -- ── 2. finishSignUp: the profile arrives on an UPDATE ───────────────────
  UPDATE auth.users SET raw_user_meta_data = jsonb_build_object(
      'username', 'synctester', 'first_name', 'Sync', 'last_name', 'Tester',
      'full_name', 'Sync Tester', 'age', '27', 'role', 'driver',
      'driver_id', 'DRV-SYNC01', 'country_code', 'GH', 'currency_code', 'GHS',
      'phone', '+233200000000'
    ) WHERE id = uid;

  SELECT username INTO v FROM public.users WHERE id = uid;
  INSERT INTO t VALUES ('the username arrives on the UPDATE path', v = 'synctester', coalesce(v, 'NULL'));

  SELECT role INTO v FROM public.users WHERE id = uid;
  INSERT INTO t VALUES ('the role is upgraded to driver', v = 'driver', v);

  SELECT currency_code INTO v FROM public.users WHERE id = uid;
  INSERT INTO t VALUES ('the currency follows the country', v = 'GHS', v);

  SELECT driver_id INTO v FROM public.users WHERE id = uid;
  INSERT INTO t VALUES ('the driver badge is set', v = 'DRV-SYNC01', coalesce(v, 'NULL'));

  -- ── 3. Profile completion writes fields the trigger must not own ────────
  UPDATE public.users
     SET vehicle_details = 'Toyota Hiace, white', park_name = 'Oshodi', avg_rating = 4.8
   WHERE id = uid;

  -- ── 4. A LATER metadata update must not wipe them ───────────────────────
  -- This is the bug: raw_user_meta_data only carries the keys the last
  -- updateUser passed, and the old trigger wrote them all straight over.
  UPDATE auth.users
     SET raw_user_meta_data = jsonb_build_object('profile_complete', true)
   WHERE id = uid;

  SELECT vehicle_details INTO v FROM public.users WHERE id = uid;
  INSERT INTO t VALUES ('a partial metadata update does NOT wipe the vehicle',
    v = 'Toyota Hiace, white', coalesce(v, 'NULL'));

  SELECT park_name INTO v FROM public.users WHERE id = uid;
  INSERT INTO t VALUES ('…nor the park', v = 'Oshodi', coalesce(v, 'NULL'));

  SELECT username INTO v FROM public.users WHERE id = uid;
  INSERT INTO t VALUES ('…nor the username', v = 'synctester', coalesce(v, 'NULL'));

  SELECT role INTO v FROM public.users WHERE id = uid;
  INSERT INTO t VALUES ('…nor the role', v = 'driver', v);

  SELECT profile_complete::text INTO v FROM public.users WHERE id = uid;
  INSERT INTO t VALUES ('but it DOES apply what it carried', v = 'true', v);

  -- ── 5. Balances are never taken from client metadata ────────────────────
  UPDATE public.users SET credits_balance = 0 WHERE id = uid;
  UPDATE auth.users
     SET raw_user_meta_data = jsonb_build_object('credits_balance', '999999')
   WHERE id = uid;

  SELECT credits_balance::text INTO v FROM public.users WHERE id = uid;
  INSERT INTO t VALUES ('a user cannot set their own balance through metadata',
    v = '0', v);
END $$;

SELECT CASE WHEN ok THEN 'PASS' ELSE '**FAIL**' END AS result, step, detail FROM t;
SELECT count(*) FILTER (WHERE ok) || '/' || count(*) AS score FROM t;

ROLLBACK;
