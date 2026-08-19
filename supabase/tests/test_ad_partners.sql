BEGIN;
CREATE TEMP TABLE t (step text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t TO authenticated;

DO $$
DECLARE A UUID; v_n INT; v_id UUID;
BEGIN
  -- Must be a user with a public.users PROFILE, not merely an auth row:
  -- is_admin() reads public.users, and only 9 of 26 auth users have one.
  SELECT u.id INTO A FROM public.users u JOIN auth.users a ON a.id = u.id LIMIT 1;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- A normal user must be refused everything in the console.
  BEGIN
    PERFORM public.upsert_ad_partner(p_name := 'Sneaky');
    INSERT INTO t VALUES ('non-admin cannot create a partner', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t VALUES ('non-admin cannot create a partner', true, SQLERRM);
  END;

  BEGIN
    PERFORM public.list_ad_creatives();
    INSERT INTO t VALUES ('non-admin cannot list creatives', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t VALUES ('non-admin cannot list creatives', true, SQLERRM);
  END;

  -- The privilege-escalation path: granting yourself admin.
  BEGIN
    UPDATE public.users SET is_admin = true WHERE id = A;
    INSERT INTO t VALUES ('user cannot self-grant admin', false, 'UPDATE succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t VALUES ('user cannot self-grant admin', true, SQLERRM);
  END;

  INSERT INTO t VALUES ('is_admin() is false for a normal user',
    public.is_admin() = false, NULL);

  -- Now make them an admin the only way that works: as the service role.
  RESET ROLE;
  UPDATE public.users SET is_admin = true WHERE id = A;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO t VALUES ('is_admin() is true once granted', public.is_admin(), NULL);

  v_id := public.upsert_ad_partner(p_name := 'TEST Partner', p_cpm := 2000, p_budget := 100);
  INSERT INTO t VALUES ('admin can create a partner', v_id IS NOT NULL, v_id::text);

  -- Validation must bite.
  BEGIN
    PERFORM public.upsert_ad_creative(p_headline := 'x', p_cta_url := '', p_format := 'rewarded');
    INSERT INTO t VALUES ('a creative needs a destination URL', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t VALUES ('a creative needs a destination URL', true, SQLERRM);
  END;

  BEGIN
    PERFORM public.upsert_ad_creative(
      p_headline := 'x', p_cta_url := 'https://e.com', p_format := 'rewarded', p_media_url := '');
    INSERT INTO t VALUES ('a rewarded ad needs media', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t VALUES ('a rewarded ad needs media', true, SQLERRM);
  END;

  -- A real creative, then check it serves.
  PERFORM public.upsert_ad_creative(
    p_partner := v_id, p_headline := 'Real headline',
    p_cta_url := 'https://example.com', p_media_url := 'https://example.com/v.mp4',
    p_media_type := 'video', p_format := 'rewarded', p_duration_seconds := 10);

  SELECT count(*) INTO v_n FROM public.list_ad_creatives();
  INSERT INTO t VALUES ('admin can list creatives', v_n >= 1, v_n::text);

  INSERT INTO t VALUES ('a fresh partner is in budget', public.partner_has_budget(v_id), NULL);

  INSERT INTO t VALUES ('the creative now serves',
    (public.next_ad('rewarded')->>'ok')::boolean,
    public.next_ad('rewarded')->'ad'->>'headline');

  -- Exhaust the budget: ₦100 at ₦2000 CPM is 50 impressions.
  RESET ROLE;
  INSERT INTO public.ad_events (ad_id, user_id, kind)
  SELECT c.id, A, 'impression'
    FROM public.ad_creatives c, generate_series(1, 60)
   WHERE c.partner_id = v_id;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO t VALUES ('an overspent partner is out of budget',
    public.partner_has_budget(v_id) = false, NULL);

  INSERT INTO t VALUES ('an overspent partner stops being served',
    (public.next_ad('rewarded')->>'ok')::boolean IS FALSE,
    public.next_ad('rewarded')->>'reason');

  RESET ROLE;
END $$;

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, step, detail FROM t ORDER BY ok, ctid;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM t;
ROLLBACK;
