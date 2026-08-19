-- supabase/tests/test_ad_rewards.sql
--
-- End-to-end test of the rewarded-ads path, run AS A REAL USER.
--
-- ── Why it is written this way ──────────────────────────────────────────────
-- Running as `postgres` proves nothing: a superuser bypasses RLS, so every
-- policy passes trivially. Each block sets `request.jwt.claims` and then
-- `SET LOCAL ROLE authenticated`, which is the closest thing to what supabase-js
-- actually sends. The whole run happens inside a transaction that is rolled
-- back, so it can be run against the live database without leaving rows behind.
--
-- Usage: node ./.dbq.mjs -f supabase/tests/test_ad_rewards.sql

BEGIN;

CREATE TEMP TABLE t (step text, ok boolean, detail text) ON COMMIT DROP;
-- The DO block writes results while impersonating `authenticated`, so that role
-- needs rights on the scratch table itself.
GRANT ALL ON t TO authenticated;

DO $$
DECLARE
  A         UUID;
  v_ad      UUID;
  v_ad2     UUID;
  v_session UUID;
  v_res     JSONB;
  v_dash    JSONB;
  v_cfg     public.ad_reward_config;
  v_n       INT;
  v_today   DATE := public.ad_today();
BEGIN
  SELECT * INTO v_cfg FROM public.ad_reward_config WHERE id;

  -- A real auth user, so the FKs hold.
  SELECT id INTO A FROM auth.users ORDER BY created_at LIMIT 1;
  IF A IS NULL THEN
    INSERT INTO t VALUES ('no auth users to test with', false, 'sign up once first');
    RETURN;
  END IF;

  -- Two creatives: one short and skippable, one that outlives the test.
  INSERT INTO public.ad_creatives
    (advertiser_name, headline, body, cta_url, format, duration_seconds,
     category, skip_after_seconds, app_name, app_store_url, weight)
  VALUES ('TEST Advertiser', 'Test headline', 'Test body', 'https://example.com',
          'rewarded', 5, 'test', 3, 'TestApp', 'https://apps.apple.com/x', 100)
  RETURNING id INTO v_ad;

  INSERT INTO public.ad_creatives
    (advertiser_name, headline, body, cta_url, format, duration_seconds, category, weight)
  VALUES ('TEST Advertiser 2', 'Second', '', 'https://example.com', 'rewarded', 5, 'test2', 1)
  RETURNING id INTO v_ad2;

  -- Start clean for this user so counts are predictable.
  DELETE FROM public.ad_daily_progress WHERE user_id = A AND day = v_today;
  DELETE FROM public.ad_sessions       WHERE user_id = A;
  DELETE FROM public.ad_streaks        WHERE user_id = A;
  DELETE FROM public.ad_suppressions   WHERE user_id = A;

  -- ── Become A ─────────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. Dashboard renders for a user with no history at all.
  v_dash := public.get_ad_dashboard();
  INSERT INTO t VALUES ('dashboard works from cold', v_dash IS NOT NULL,
    format('watched=%s quota=%s milestones=%s',
      v_dash->>'watched_today', v_dash->>'daily_quota',
      jsonb_array_length(v_dash->'milestones')));

  INSERT INTO t VALUES ('ladder is exposed with reached flags',
    (v_dash->'milestones'->0 ? 'reached'),
    v_dash->'milestones'->0 #>> '{}');

  -- 2. An ad is served.
  v_res := public.next_ad('rewarded');
  INSERT INTO t VALUES ('next_ad serves a rewarded ad', (v_res->>'ok')::boolean,
    coalesce(v_res->'ad'->>'advertiser_name', v_res->>'reason'));

  -- 3. Session opens.
  v_session := public.start_ad_session(v_ad);
  INSERT INTO t VALUES ('start_ad_session opens a session', v_session IS NOT NULL, v_session::text);

  -- Checked with the role reset: `ad_events` is the billing log and grants
  -- users no SELECT, so asking as the user would report "no row" for a row that
  -- was written correctly. The write is what is under test, not the read.
  RESET ROLE;
  INSERT INTO t VALUES ('impression recorded',
    EXISTS (SELECT 1 FROM public.ad_events WHERE ad_id = v_ad AND user_id = A AND kind='impression'),
    NULL);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 4. THE ANTI-FRAUD CHECK. Completing immediately must be refused, because
  --    the wall clock says almost no time has passed.
  v_res := public.complete_ad_session(v_session);
  INSERT INTO t VALUES ('instant completion is refused',
    (v_res->>'ok')::boolean IS FALSE AND v_res->>'reason' = 'too_short',
    v_res::text);

  INSERT INTO t VALUES ('refused session is marked abandoned',
    (SELECT status FROM public.ad_sessions WHERE id = v_session) = 'abandoned',
    (SELECT no_reward_reason FROM public.ad_sessions WHERE id = v_session));

  INSERT INTO t VALUES ('refused session paid nothing',
    (SELECT COALESCE(watched,0) FROM public.ad_daily_progress
      WHERE user_id=A AND day=v_today) = 0
    OR NOT EXISTS (SELECT 1 FROM public.ad_daily_progress WHERE user_id=A AND day=v_today),
    NULL);

  -- 5. A genuine watch. Backdating `started_at` is the only way to simulate
  --    elapsed time inside one transaction; it is exactly what a real 5-second
  --    watch would leave behind.
  v_session := public.start_ad_session(v_ad);
  RESET ROLE;
  UPDATE public.ad_sessions SET started_at = now() - interval '10 seconds'
   WHERE id = v_session;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v_res := public.complete_ad_session(v_session);
  INSERT INTO t VALUES ('a real watch pays out',
    (v_res->>'rewarded')::boolean, v_res::text);

  INSERT INTO t VALUES ('per-ad reward matches config',
    (v_res->>'reward')::numeric = v_cfg.rewarded_credits,
    format('%s vs %s', v_res->>'reward', v_cfg.rewarded_credits));

  -- 6. The first ad crosses the "at: 1" rung, so a milestone must have paid.
  INSERT INTO t VALUES ('first ad crosses the first ladder rung',
    (v_res->>'milestone_bonus')::numeric > 0,
    format('bonus=%s label=%s', v_res->>'milestone_bonus', v_res->>'milestone_label'));

  INSERT INTO t VALUES ('total_credited = reward + milestone',
    (v_res->>'total_credited')::numeric
      = (v_res->>'reward')::numeric + (v_res->>'milestone_bonus')::numeric
        + (v_res->>'streak_bonus')::numeric,
    v_res->>'total_credited');

  -- 7. Double-settling must not pay twice.
  v_res := public.complete_ad_session(v_session);
  INSERT INTO t VALUES ('settling twice is refused',
    (v_res->>'reason') = 'already_settled', v_res::text);

  SELECT watched INTO v_n FROM public.ad_daily_progress WHERE user_id=A AND day=v_today;
  INSERT INTO t VALUES ('double settle did not inflate the count', v_n = 1, v_n::text);

  -- 8. Cooldown is enforced right after a completed watch.
  v_res := public.next_ad('rewarded');
  INSERT INTO t VALUES ('cooldown blocks the next ad',
    (v_res->>'ok')::boolean IS FALSE AND v_res->>'reason' = 'cooldown',
    v_res->>'ready_at');

  -- 9. Suppression removes a creative from rotation.
  PERFORM public.suppress_ad(v_ad, 'creative', 'not_interested');
  INSERT INTO t VALUES ('suppress_ad records a dismissal',
    EXISTS (SELECT 1 FROM public.ad_suppressions WHERE user_id=A AND ad_id=v_ad), NULL);

  -- Clear the cooldown so serving can be tested again.
  RESET ROLE;
  UPDATE public.ad_sessions SET ended_at = now() - interval '10 minutes'
   WHERE user_id = A AND status='completed';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v_res := public.next_ad('rewarded');
  INSERT INTO t VALUES ('suppressed creative is not served again',
    (v_res->>'ok')::boolean IS FALSE OR (v_res->'ad'->>'id')::uuid <> v_ad,
    coalesce(v_res->'ad'->>'advertiser_name', v_res->>'reason'));

  -- 10. Muting a category takes the whole category out.
  PERFORM public.suppress_ad(v_ad2, 'category', 'category_muted');
  INSERT INTO t VALUES ('category mute lands in preferences',
    (SELECT muted_categories @> ARRAY['test2'] FROM public.ad_preferences WHERE user_id=A),
    (SELECT array_to_string(muted_categories, ',') FROM public.ad_preferences WHERE user_id=A));

  -- 11. Preferences round-trip.
  PERFORM public.set_ad_preferences(p_sound_on := true, p_reminder_hour := 21);
  INSERT INTO t VALUES ('preferences round-trip',
    (SELECT sound_on AND reminder_hour = 21 FROM public.ad_preferences WHERE user_id=A), NULL);

  -- Partial updates must not clobber the fields they were not given.
  PERFORM public.set_ad_preferences(p_autoplay_next := true);
  INSERT INTO t VALUES ('a partial update leaves other fields alone',
    (SELECT sound_on AND autoplay_next AND reminder_hour = 21
       FROM public.ad_preferences WHERE user_id=A), NULL);

  -- 12. History shows the failure as well as the payout.
  SELECT count(*) INTO v_n FROM public.list_ad_history(50, 0);
  INSERT INTO t VALUES ('history lists both the paid and the refused watch', v_n >= 2, v_n::text);

  INSERT INTO t VALUES ('history explains why a watch paid nothing',
    EXISTS (SELECT 1 FROM public.list_ad_history(50,0) h
             WHERE h.rewarded = false AND h.no_reward_reason IS NOT NULL), NULL);

  -- 13. Reporting.
  PERFORM public.report_ad(v_ad, 'misleading', 'test note');
  -- Same reason as the impression check: reports are insert-only for a user.
  -- Being unable to read back a report you filed is the intended behaviour.
  RESET ROLE;
  INSERT INTO t VALUES ('report_ad records a report',
    EXISTS (SELECT 1 FROM public.ad_reports WHERE user_id=A AND ad_id=v_ad), NULL);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 14. Another user's rows must be invisible.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM public.ad_sessions;
  INSERT INTO t VALUES ('RLS hides another user''s sessions', v_n = 0, v_n::text);

  SELECT count(*) INTO v_n FROM public.list_ad_history(50, 0);
  INSERT INTO t VALUES ('history is per-user', v_n = 0, v_n::text);

  -- 15. The config is readable but not writable from a client.
  SELECT count(*) INTO v_n FROM public.ad_reward_config;
  INSERT INTO t VALUES ('reward rules are readable', v_n = 1, v_n::text);

  BEGIN
    UPDATE public.ad_reward_config SET rewarded_credits = 99999;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    INSERT INTO t VALUES ('reward rules are NOT writable by a client', v_n = 0,
      format('%s rows updated', v_n));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t VALUES ('reward rules are NOT writable by a client', true, SQLERRM);
  END;

  RESET ROLE;
END $$;

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, step, detail
  FROM t ORDER BY ok, ctid;

SELECT count(*) FILTER (WHERE ok)     AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM t;

ROLLBACK;
