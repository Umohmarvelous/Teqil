-- supabase/tests/test_user_privacy.sql
--
-- Proves `public.users` is no longer a public directory, and that a person can
-- be found by username and by nothing else.
--
-- What this is guarding against, concretely: before migration_user_privacy.sql
-- the table carried a policy `USING (true)` with no role restriction, so
-- `GET /rest/v1/users?select=*` with the bundled anon key returned every row —
-- 9 accounts, 9 emails, 9 phone numbers, and every payout/KYC column the
-- moment a driver filled one in.
--
-- Usage: node ./.dbq.mjs -f supabase/tests/test_user_privacy.sql

BEGIN;

CREATE TEMP TABLE t (step text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t TO authenticated, anon;

DO $$
DECLARE
  A        UUID;
  v_uname  TEXT;
  v_drv    TEXT;
  v_name   TEXT;
  v_n      INT;
  v_ok     BOOLEAN;
BEGIN
  -- A real account with a username, so the search assertions test the real
  -- shape of the data rather than a row invented for the test.
  SELECT id, username, driver_id, full_name
    INTO A, v_uname, v_drv, v_name
    FROM public.users
   WHERE username IS NOT NULL AND length(username) >= 3
   ORDER BY created_at
   LIMIT 1;

  IF A IS NULL THEN
    INSERT INTO t VALUES ('a user with a username exists to test with', false,
                          'set a username on one account first');
    RETURN;
  END IF;

  -- ── 1. The directory dump is closed ─────────────────────────────────────
  INSERT INTO t VALUES ('anon has no SELECT grant on users',
    NOT has_table_privilege('anon', 'public.users', 'SELECT'), NULL);

  SELECT count(*) INTO v_n
    FROM pg_policy
   WHERE polrelid = 'public.users'::regclass
     AND polcmd = 'r'
     AND polroles = '{0}'                       -- 0 = PUBLIC
     AND pg_get_expr(polqual, polrelid) = 'true';
  INSERT INTO t VALUES ('no unrestricted public SELECT policy on users',
    v_n = 0, v_n::text || ' found');

  -- The attempt itself, not just the catalogue. This is the exact request the
  -- app's own anon key would make.
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM 1 FROM public.users LIMIT 1;
    RESET ROLE;
    INSERT INTO t VALUES ('anon selecting from users is refused', false, 'IT WENT THROUGH');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO t VALUES ('anon selecting from users is refused', true, SQLERRM);
  END;

  -- ── 2. Emails are off the wire ──────────────────────────────────────────
  INSERT INTO t VALUES ('get_user_by_username is not anon-executable',
    NOT has_function_privilege('anon', 'public.get_user_by_username(text)', 'EXECUTE'), NULL);

  INSERT INTO t VALUES ('get_user_by_username is not reachable by signed-in users either',
    NOT has_function_privilege('authenticated', 'public.get_user_by_username(text)', 'EXECUTE'),
    'only service_role, via the username-login edge function');

  -- ── 3. …but signup can still check a handle ─────────────────────────────
  INSERT INTO t VALUES ('username_available is anon-executable',
    has_function_privilege('anon', 'public.username_available(text)', 'EXECUTE'), NULL);

  SELECT public.username_available(v_uname) INTO v_ok;
  INSERT INTO t VALUES ('a taken username reports unavailable', v_ok IS FALSE, v_ok::text);

  SELECT public.username_available('zz-not-a-real-handle-' || gen_random_uuid()::text) INTO v_ok;
  INSERT INTO t VALUES ('a free username reports available', v_ok IS TRUE, v_ok::text);

  -- ── 4. Search is username-only ──────────────────────────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- Searching as A for A returns nothing (self is excluded), so these run from
  -- A's session against A's OWN handle only where that is the point; for match
  -- assertions we need a second account.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  DECLARE
    B UUID;
  BEGIN
    SELECT id INTO B FROM public.users WHERE id <> A ORDER BY created_at LIMIT 1;
    IF B IS NULL THEN
      INSERT INTO t VALUES ('a second account exists to search from', false,
                            'sign up once more to exercise search');
      RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', B, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    -- Prefix of the username: found.
    SELECT count(*) INTO v_n
      FROM public.search_users_for_chat(left(v_uname, 3), 10)
     WHERE id = A;
    INSERT INTO t VALUES ('a username prefix finds the account', v_n = 1, v_n::text);

    -- Badge ID and full name must not match. Asserting "searching the badge ID
    -- returns nothing" is the obvious probe and it is WRONG here: badge IDs are
    -- generated FROM the username (`generateDriverIdFromUsername`), so this
    -- account's id "daniel" is a prefix of its handle "danieloky" and a correct
    -- username-only search still returns it. That is a match on the username,
    -- not on the ID, and the test has to be able to tell those apart.
    --
    -- So assert the property itself: every row a search returns must have a
    -- username starting with the query. If any other column could match, some
    -- row would come back that fails this — whatever the data happens to be.
    SELECT count(*) INTO v_n
      FROM public.search_users_for_chat(COALESCE(v_drv, left(v_uname, 3)), 25) r
     WHERE lower(r.username) NOT LIKE lower(COALESCE(v_drv, left(v_uname, 3))) || '%';
    INSERT INTO t VALUES ('searching a badge ID matches usernames only',
      v_n = 0, COALESCE(v_drv, '(no driver_id)'));

    IF v_name IS NOT NULL AND length(v_name) >= 3 THEN
      SELECT count(*) INTO v_n
        FROM public.search_users_for_chat(left(v_name, 3), 25) r
       WHERE lower(r.username) NOT LIKE lower(left(v_name, 3)) || '%';
      INSERT INTO t VALUES ('searching a full name matches usernames only',
        v_n = 0, left(v_name, 3));
    END IF;

    -- Exact resolution has the same property, and it is the one that opens a
    -- chat — a false match here messages a stranger.
    IF v_drv IS NOT NULL AND lower(v_drv) <> lower(v_uname) THEN
      SELECT count(*) INTO v_n FROM public.find_user_for_chat(v_drv);
      INSERT INTO t VALUES ('a driver badge ID does not resolve to an account', v_n = 0, v_drv);
    END IF;

    -- Exact username still resolves, "@" and case included.
    SELECT count(*) INTO v_n FROM public.find_user_for_chat('@' || upper(v_uname));
    INSERT INTO t VALUES ('an exact username resolves, @ and case ignored', v_n = 1, v_uname);

    -- One character is a scrape, not a search.
    SELECT count(*) INTO v_n FROM public.search_users_for_chat(left(v_uname, 1), 10);
    INSERT INTO t VALUES ('a one-character query returns nothing', v_n = 0, v_n::text);

    -- ── 5. The profile RPC leaks no contact details ───────────────────────
    SELECT count(*) INTO v_n
      FROM information_schema.routines r
      JOIN information_schema.parameters p
        ON p.specific_name = r.specific_name
     WHERE r.routine_schema = 'public'
       AND r.routine_name = 'get_public_profiles'
       AND p.parameter_mode = 'OUT'
       AND p.parameter_name IN ('email', 'phone', 'payout_account_number',
                                'bvn_hash', 'nin_hash', 'device_fingerprint', 'is_admin');
    INSERT INTO t VALUES ('get_public_profiles returns no contact or payout column',
      v_n = 0, v_n::text || ' sensitive columns');

    SELECT count(*) INTO v_n FROM public.get_public_profiles(ARRAY[A]);
    INSERT INTO t VALUES ('get_public_profiles resolves a known id', v_n = 1, v_n::text);

    RESET ROLE;
  END;

  -- ── 6. The old ID-search door is gone ───────────────────────────────────
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'search_drivers';
  INSERT INTO t VALUES ('search_drivers no longer exists', v_n = 0, v_n::text);
END $$;

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, step, detail
  FROM t ORDER BY ok, ctid;

SELECT count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM t;

ROLLBACK;
