-- supabase/tests/test_legacy_rpc_hardening.sql
--
-- Proves the fuel-pool drain is closed, and stays closed.
--
-- The exploit this guards against needed no account at all: `redeem_fuel` was
-- SECURITY DEFINER, took the driver's id as an argument, never called
-- `auth.uid()`, and `anon` could execute it. The anon key ships in the app
-- bundle. See migration_harden_legacy_rpcs.sql.
--
-- Usage: node ./.dbq.mjs -f supabase/tests/test_legacy_rpc_hardening.sql

BEGIN;

CREATE TEMP TABLE t (step text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t TO authenticated, anon;

DO $$
DECLARE
  A       UUID;
  B       UUID;
  v_n     INT;
  v_names TEXT;
BEGIN
  SELECT id INTO A FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT id INTO B FROM auth.users WHERE id <> A ORDER BY created_at LIMIT 1;
  IF A IS NULL THEN
    INSERT INTO t VALUES ('no auth users to test with', false, 'sign up once first');
    RETURN;
  END IF;

  -- ── 1. anon can no longer reach the money RPCs ──────────────────────────
  SELECT count(*), string_agg(p.proname, ', ')
    INTO v_n, v_names
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     -- The one deliberate exception. Signup has to know whether a handle is
     -- free before a session exists, and `username_available` returns a
     -- BOOLEAN and nothing else.
     --
     -- This used to say `get_user_by_username`, which was reachable for the
     -- same reason and returned the account's EMAIL. It is now behind the
     -- `username-login` edge function and unreachable by anon or authenticated
     -- alike — see migration_user_privacy.sql and test_user_privacy.sql.
     AND p.proname <> 'username_available';

  INSERT INTO t VALUES ('no anon-executable SECURITY DEFINER functions remain',
    v_n = 0, COALESCE(v_names, 'none'));

  INSERT INTO t VALUES ('redeem_fuel is not anon-executable',
    NOT has_function_privilege('anon', 'public.redeem_fuel(uuid,numeric,text)', 'EXECUTE'),
    NULL);

  INSERT INTO t VALUES ('claim_free_ride is not anon-executable',
    NOT has_function_privilege('anon', 'public.claim_free_ride(uuid,uuid)', 'EXECUTE'),
    NULL);

  -- ── 2. every function has a pinned search_path ──────────────────────────
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f'
     AND (p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));
  INSERT INTO t VALUES ('every function pins search_path', v_n = 0, v_n::text);

  -- ── 3. An unauthenticated caller is refused ─────────────────────────────
  -- No JWT claims at all: `auth.uid()` is NULL, which is exactly the state the
  -- original exploit ran in.
  PERFORM set_config('request.jwt.claims', NULL, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.redeem_fuel(gen_random_uuid(), 500000, 'exploit-' || gen_random_uuid()::text);
    INSERT INTO t VALUES ('unauthenticated redeem is refused', false, 'IT WENT THROUGH');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t VALUES ('unauthenticated redeem is refused', true, SQLERRM);
  END;
  RESET ROLE;

  -- ── 4. A signed-in user cannot redeem against someone else ──────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.redeem_fuel(
      COALESCE(B, gen_random_uuid()), 500000, 'exploit-' || gen_random_uuid()::text);
    INSERT INTO t VALUES ('redeeming against another user is refused', false, 'IT WENT THROUGH');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t VALUES ('redeeming against another user is refused', true, SQLERRM);
  END;

  -- ── 5. …but redeeming your own still works ──────────────────────────────
  -- An empty pool returns 0 rather than raising, which is the correct
  -- "insufficient balance" path. What matters is that the GUARD does not fire.
  BEGIN
    PERFORM public.redeem_fuel(A, 1, 'selftest-' || gen_random_uuid()::text);
    INSERT INTO t VALUES ('redeeming your own fuel still works', true, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t VALUES ('redeeming your own fuel still works', false, SQLERRM);
  END;

  -- ── 6. Same for claiming a free ride as someone else ────────────────────
  BEGIN
    PERFORM public.claim_free_ride(gen_random_uuid(), COALESCE(B, gen_random_uuid()));
    INSERT INTO t VALUES ('claiming a ride as another user is refused', false, 'IT WENT THROUGH');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t VALUES ('claiming a ride as another user is refused', true, SQLERRM);
  END;

  RESET ROLE;
END $$;

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, step, detail
  FROM t ORDER BY ok, ctid;

SELECT count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM t;

ROLLBACK;
