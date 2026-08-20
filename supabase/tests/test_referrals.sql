-- supabase/tests/test_referrals.sql
--
-- Proves the referral ledger pays the right people, once, and cannot be farmed.
--
-- Usage: node ./.dbq.mjs -f supabase/tests/test_referrals.sql

BEGIN;

CREATE TEMP TABLE t (step text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t TO authenticated, anon;

DO $$
DECLARE
  A UUID; B UUID;
  v_code   TEXT;
  v_code2  TEXT;
  v_res    JSONB;
  v_n      INT;
  v_paid   NUMERIC;
BEGIN
  -- public.users, not auth.users: every referral table has a foreign key into
  -- public.users, and the two are not guaranteed to be in step.
  SELECT id INTO A FROM public.users ORDER BY created_at LIMIT 1;
  SELECT id INTO B FROM public.users WHERE id <> A ORDER BY created_at LIMIT 1;
  IF A IS NULL OR B IS NULL THEN
    INSERT INTO t VALUES ('need two users in public.users', false, 'sign up twice first');
    RETURN;
  END IF;

  -- The claim window is measured against users.created_at, and both test
  -- accounts are older than 72h. Widen it for the duration of this
  -- transaction; the ROLLBACK puts it back.
  UPDATE public.referral_config SET claim_window_hours = 999999 WHERE id;

  -- Two users on distinct devices, so the device guard is not what is being
  -- measured here (it gets its own step below).
  UPDATE public.users SET device_fingerprint = 'test-device-A' WHERE id = A;
  UPDATE public.users SET device_fingerprint = 'test-device-B' WHERE id = B;

  -- ── 1. A code is minted once and then reused ────────────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v_code  := public.my_referral() ->> 'code';
  v_code2 := public.my_referral() ->> 'code';
  INSERT INTO t VALUES ('my_referral mints a code', v_code IS NOT NULL, v_code);
  INSERT INTO t VALUES ('calling it twice returns the same code', v_code = v_code2, v_code2);

  INSERT INTO t VALUES ('the https link is what Status can open',
    public.my_referral() ->> 'link' LIKE 'https://%/r/' || v_code, NULL);

  -- ── 2. You cannot refer yourself ────────────────────────────────────────
  v_res := public.claim_referral(v_code);
  INSERT INTO t VALUES ('own code is refused',
    (v_res ->> 'ok') = 'false' AND (v_res ->> 'reason') = 'own_code', v_res::text);

  v_res := public.claim_referral('ZZZZZZ');
  INSERT INTO t VALUES ('unknown code is refused',
    (v_res ->> 'reason') = 'unknown_code', v_res::text);

  -- ── 3. B claims A's code ────────────────────────────────────────────────
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', B, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v_res := public.claim_referral(v_code);
  INSERT INTO t VALUES ('a new user can claim a code',
    (v_res ->> 'ok') = 'true' AND (v_res ->> 'status') = 'pending', v_res::text);

  v_res := public.claim_referral(v_code);
  INSERT INTO t VALUES ('claiming a second time is refused',
    (v_res ->> 'reason') = 'already_referred', v_res::text);

  -- ── 4. Nothing is paid before qualification ─────────────────────────────
  SELECT COUNT(*) INTO v_n FROM public.fuel_pool_history
   WHERE kind = 'referral_reward';
  INSERT INTO t VALUES ('signing up alone pays nobody', v_n = 0, v_n::text);

  v_res := public.try_qualify_referral();
  INSERT INTO t VALUES ('qualifying too early is refused',
    (v_res ->> 'reason') = 'not_yet', v_res::text);

  -- ── 5. Meet the ad condition, then qualify ──────────────────────────────
  RESET ROLE;
  INSERT INTO public.ad_sessions
    (user_id, format, status, network, started_at, ended_at, duration_seconds, watched_ms, rewarded)
  SELECT B, 'rewarded', 'completed', 'admob', now() - interval '31 seconds', now(), 30, 30000, TRUE
    FROM generate_series(1, (SELECT qualify_ads FROM public.referral_config WHERE id));

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', B, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v_res := public.try_qualify_referral();
  INSERT INTO t VALUES ('qualifying works once the condition is met',
    (v_res ->> 'ok') = 'true' AND (v_res ->> 'status') = 'qualified', v_res::text);

  RESET ROLE;
  SELECT COUNT(*), COALESCE(SUM(amount), 0) INTO v_n, v_paid
    FROM public.fuel_pool_history WHERE kind = 'referral_reward';
  INSERT INTO t VALUES ('both sides are credited exactly once',
    v_n = 2, v_n || ' rows, ' || v_paid || ' naira');

  INSERT INTO t VALUES ('the referrer is one of them',
    EXISTS (SELECT 1 FROM public.fuel_pool_history
             WHERE kind = 'referral_reward' AND user_id = A), NULL);
  INSERT INTO t VALUES ('the referred user is the other',
    EXISTS (SELECT 1 FROM public.fuel_pool_history
             WHERE kind = 'referral_reward' AND user_id = B), NULL);

  -- ── 6. Replay pays nothing more ─────────────────────────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', B, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.try_qualify_referral();
  PERFORM public.try_qualify_referral();
  RESET ROLE;

  SELECT COUNT(*) INTO v_n FROM public.fuel_pool_history WHERE kind = 'referral_reward';
  INSERT INTO t VALUES ('replaying qualification pays nothing extra', v_n = 2, v_n::text);

  -- ── 7. The device guard ─────────────────────────────────────────────────
  -- B already holds a referral, so a THIRD account on B's handset must not be
  -- claimable. Simulated by pointing A at B's fingerprint and clearing A's row.
  DELETE FROM public.referrals WHERE referred_id = A;
  UPDATE public.users SET device_fingerprint = 'test-device-B' WHERE id = A;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT code INTO v_code2 FROM public.referral_codes WHERE user_id = A;
  RESET ROLE;

  -- Give B a code so A has something to claim.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', B, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_code2 := public.my_referral() ->> 'code';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_res := public.claim_referral(v_code2);
  INSERT INTO t VALUES ('a handset that was already referred cannot be referred again',
    (v_res ->> 'ok') = 'false'
      AND (v_res ->> 'reason') IN ('device_already_referred', 'same_device_as_referrer'),
    v_res::text);
  RESET ROLE;

  -- ── 8. Anon reaches none of it ──────────────────────────────────────────
  SELECT COUNT(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('my_referral','claim_referral','try_qualify_referral',
                       'record_referral_share','list_my_referrals','gen_referral_code')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  INSERT INTO t VALUES ('no referral function is anon-executable', v_n = 0, v_n::text);
END $$;

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, step, detail
  FROM t ORDER BY ok, ctid;

SELECT count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM t;

ROLLBACK;
