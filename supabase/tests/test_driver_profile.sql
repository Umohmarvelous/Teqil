-- supabase/tests/test_driver_profile.sql
--
-- Proves a driver badge is claimed once and never reissued, that a username
-- cannot be stolen or changed, and that a park is genuinely optional.
--
-- Usage: node ./.dbq.mjs -f supabase/tests/test_driver_profile.sql

BEGIN;

CREATE TEMP TABLE t (step text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t TO authenticated, anon;

DO $$
DECLARE
  A UUID; B UUID;
  v JSONB; s TEXT; s2 TEXT;
BEGIN
  SELECT id INTO A FROM public.users ORDER BY created_at LIMIT 1;
  SELECT id INTO B FROM public.users WHERE id <> A ORDER BY created_at LIMIT 1;
  IF A IS NULL OR B IS NULL THEN
    INSERT INTO t VALUES ('need two users', false, 'sign up twice first'); RETURN;
  END IF;

  -- Start both from a clean slate inside the transaction.
  UPDATE public.users SET driver_id = NULL, username = 'testhandlea',
         vehicle_details = NULL, park_name = NULL, profile_complete = false
   WHERE id = A;
  UPDATE public.users SET driver_id = 'testhandleb', username = 'testhandleb' WHERE id = B;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- ── 1. A badge is derived from the username ────────────────────────────
  s := public.claim_driver_id(NULL);
  INSERT INTO t VALUES ('a badge is derived from the username, not random',
    s LIKE 'testha%', s);

  -- ── 2. It is claimed ONCE ──────────────────────────────────────────────
  s2 := public.claim_driver_id(NULL);
  INSERT INTO t VALUES ('claiming again returns the SAME badge', s = s2, s2);

  -- Even asking for a different base must not reissue: a badge is printed on a
  -- QR sticker and carries the driver's ratings.
  s2 := public.claim_driver_id('somethingelse');
  INSERT INTO t VALUES ('a different base cannot reissue an existing badge', s = s2, s2);

  -- ── 3. Saving a profile ────────────────────────────────────────────────
  v := public.save_driver_profile('Ada Obi', 'Toyota Hiace, white, ABC-123-XY');
  INSERT INTO t VALUES ('a profile saves without a park', (v->>'ok') = 'true', v::text);

  SELECT park_name INTO s2 FROM public.users WHERE id = A;
  INSERT INTO t VALUES ('no park means NULL, not an invented one', s2 IS NULL, coalesce(s2,'NULL'));

  SELECT profile_complete::text INTO s2 FROM public.users WHERE id = A;
  INSERT INTO t VALUES ('the profile is marked complete', s2 = 'true', s2);

  SELECT vehicle_details INTO s2 FROM public.users WHERE id = A;
  INSERT INTO t VALUES ('the vehicle is stored', s2 LIKE 'Toyota%', coalesce(s2,'NULL'));

  -- ── 4. Required fields ─────────────────────────────────────────────────
  v := public.save_driver_profile('', 'Toyota Hiace');
  INSERT INTO t VALUES ('a nameless profile is refused', (v->>'reason') = 'name_required', v::text);

  v := public.save_driver_profile('Ada Obi', '   ');
  INSERT INTO t VALUES ('a profile with no vehicle is refused',
    (v->>'reason') = 'vehicle_required', v::text);

  -- ── 5. A username cannot be changed once set ───────────────────────────
  v := public.save_driver_profile('Ada Obi', 'Toyota Hiace', NULL, NULL, NULL, 'brandnewhandle');
  SELECT username INTO s2 FROM public.users WHERE id = A;
  INSERT INTO t VALUES ('an existing username is NOT overwritten',
    s2 = 'testhandlea', s2);

  -- ── 6. An account with no username must supply one ─────────────────────
  RESET ROLE;
  UPDATE public.users SET username = NULL WHERE id = A;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v := public.save_driver_profile('Ada Obi', 'Toyota Hiace');
  INSERT INTO t VALUES ('an account with no username is asked for one',
    (v->>'reason') = 'username_required', v::text);

  v := public.save_driver_profile('Ada Obi', 'Toyota Hiace', NULL, NULL, NULL, 'AB');
  INSERT INTO t VALUES ('a too-short username is refused',
    (v->>'reason') = 'username_invalid', v::text);

  v := public.save_driver_profile('Ada Obi', 'Toyota Hiace', NULL, NULL, NULL, 'testhandleb');
  INSERT INTO t VALUES ('someone else''s username cannot be taken',
    (v->>'reason') = 'username_taken', v::text);

  v := public.save_driver_profile('Ada Obi', 'Toyota Hiace', NULL, NULL, NULL, 'FreshHandle');
  INSERT INTO t VALUES ('a free username is accepted and lowercased',
    (v->>'ok') = 'true' AND (v->>'username') = 'freshhandle', v::text);

  -- ── 7. Two drivers never share a badge ─────────────────────────────────
  RESET ROLE;
  SELECT count(*)::text INTO s2 FROM (
    SELECT driver_id FROM public.users
     WHERE driver_id IS NOT NULL GROUP BY driver_id HAVING count(*) > 1
  ) d;
  INSERT INTO t VALUES ('no two accounts share a driver badge', s2 = '0', s2);
END $$;

SELECT CASE WHEN ok THEN 'PASS' ELSE '**FAIL**' END AS result, step, detail FROM t;
SELECT count(*) FILTER (WHERE ok) || '/' || count(*) AS score FROM t;

ROLLBACK;
