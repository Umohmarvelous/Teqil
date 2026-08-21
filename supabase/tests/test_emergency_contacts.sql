-- supabase/tests/test_emergency_contacts.sql
--
-- Proves an emergency contact is consented, deduplicated, ordered, and that the
-- dispatcher's silence is always explained.
--
-- Usage: node ./.dbq.mjs -f supabase/tests/test_emergency_contacts.sql

BEGIN;

CREATE TEMP TABLE t (n int generated always as identity, step text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t TO authenticated, anon;

-- Clearing the ledger between assertions has to happen OUTSIDE the RLS role:
-- there is deliberately no DELETE policy on emergency_events (an audit log you
-- can erase is not an audit log), so a delete as `authenticated` silently
-- matches nothing and the rows accumulate.
CREATE OR REPLACE FUNCTION test_reset(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  DELETE FROM public.emergency_events WHERE user_id = p_user;
  DELETE FROM public.emergency_alerts WHERE from_user_id = p_user;
END $fn$;
GRANT EXECUTE ON FUNCTION test_reset(uuid) TO authenticated;

DO $$
DECLARE
  A UUID; B UUID;
  v JSONB; v_id UUID; v_id2 UUID; v_n INT; v_txt TEXT;
BEGIN
  SELECT id INTO A FROM public.users ORDER BY created_at LIMIT 1;
  SELECT id INTO B FROM public.users WHERE id <> A ORDER BY created_at LIMIT 1;
  IF A IS NULL OR B IS NULL THEN
    INSERT INTO t (step, ok, detail) VALUES ('need two users', false, 'sign up twice first');
    RETURN;
  END IF;

  -- B gets a known number so A can add them and the match must be found.
  UPDATE public.users SET phone = '+2348031234567' WHERE id = B;
  UPDATE public.users SET phone = '+2349099999999' WHERE id = A;
  DELETE FROM public.emergency_alerts WHERE contact_user_id IN (A, B) OR from_user_id IN (A, B);
  DELETE FROM public.emergency_events WHERE user_id IN (A, B);
  DELETE FROM public.emergency_contacts WHERE user_id IN (A, B);

  -- ── Normalisation ───────────────────────────────────────────────────────
  INSERT INTO t (step, ok, detail) VALUES (
    'four spellings of one number normalise the same',
    public.ec_normalise_phone('0803 123 4567') = '+2348031234567'
      AND public.ec_normalise_phone('+234 803 123 4567') = '+2348031234567'
      AND public.ec_normalise_phone('2348031234567') = '+2348031234567'
      AND public.ec_normalise_phone('8031234567') = '+2348031234567',
    public.ec_normalise_phone('0803 123 4567'));

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- ── Adding ──────────────────────────────────────────────────────────────
  v := public.ec_add('Mama', '0803 123 4567', 'Mother');
  v_id := (v ->> 'id')::uuid;
  INSERT INTO t (step, ok, detail) VALUES ('a contact is added', (v ->> 'ok') = 'true', v::text);
  INSERT INTO t (step, ok, detail) VALUES (
    'a number with an EMILGO account is reachable in-app',
    (v ->> 'reachable_in_app') = 'true', v ->> 'reachable_in_app');
  INSERT INTO t (step, ok, detail) VALUES (
    'the match is linked to the right account',
    (SELECT contact_user_id FROM public.emergency_contacts WHERE id = v_id) = B, NULL);
  INSERT INTO t (step, ok, detail) VALUES (
    'a new contact starts unverified',
    (SELECT status FROM public.emergency_contacts WHERE id = v_id) = 'pending', NULL);

  v := public.ec_add('Mama again', '+2348031234567');
  INSERT INTO t (step, ok, detail) VALUES (
    'the same number in another spelling is a duplicate',
    (v ->> 'reason') = 'duplicate', v::text);

  v := public.ec_add('Me', '+2349099999999');
  INSERT INTO t (step, ok, detail) VALUES (
    'you cannot be your own emergency contact', (v ->> 'reason') = 'own_number', v::text);

  v := public.ec_add('', '08031111111');
  INSERT INTO t (step, ok, detail) VALUES (
    'a nameless contact is refused', (v ->> 'reason') = 'name_required', v::text);

  v := public.ec_add('Short', '123');
  INSERT INTO t (step, ok, detail) VALUES (
    'an impossible number is refused', (v ->> 'reason') = 'phone_invalid', v::text);

  -- ── The cap ─────────────────────────────────────────────────────────────
  FOR v_n IN 1 .. 9 LOOP
    PERFORM public.ec_add('Filler ' || v_n, '080100000' || lpad(v_n::text, 2, '0'));
  END LOOP;
  v := public.ec_add('One too many', '08055555555');
  INSERT INTO t (step, ok, detail) VALUES (
    'the tenth contact is the last', (v ->> 'reason') = 'limit_reached', v::text);
  INSERT INTO t (step, ok, detail) VALUES (
    'exactly ten are stored',
    (SELECT count(*) FROM public.emergency_contacts WHERE user_id = A) = 10, NULL);

  -- ── Dispatch: nobody verified yet ───────────────────────────────────────
  SELECT count(*) INTO v_n FROM public.ec_dispatch('trip_start', 'Trip started', 'On the way');
  INSERT INTO t (step, ok, detail) VALUES (
    'a routine ping reaches nobody while consent is pending', v_n = 0, v_n::text);
  INSERT INTO t (step, ok, detail) VALUES (
    'and every skip says WHY',
    (SELECT count(*) FROM public.emergency_events
      WHERE user_id = A AND outcome = 'skipped_unverified') = 10, NULL);

  -- ── An SOS overrides the hold ───────────────────────────────────────────
  PERFORM test_reset(A);
  SELECT count(*) INTO v_n FROM public.ec_dispatch('sos', 'SOS', 'Help', NULL, NULL, 6.5, 3.3);
  INSERT INTO t (step, ok, detail) VALUES (
    'an SOS still reaches an unconfirmed contact',
    (SELECT count(*) FROM public.emergency_events WHERE user_id = A AND outcome = 'sent') = 10,
    v_n::text);
  INSERT INTO t (step, ok, detail) VALUES (
    'the in-app contact got a real alert',
    (SELECT count(*) FROM public.emergency_alerts WHERE contact_user_id = B AND kind = 'sos') = 1, NULL);
  INSERT INTO t (step, ok, detail) VALUES (
    'an SOS carries the location even without live-location sharing',
    (SELECT lat FROM public.emergency_alerts WHERE contact_user_id = B AND kind = 'sos') = 6.5, NULL);
  INSERT INTO t (step, ok, detail) VALUES (
    'the nine unreachable contacts came back for the device composer', v_n = 9, v_n::text);

  -- ── Consent, from the contact's side ────────────────────────────────────
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', B, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO t (step, ok, detail) VALUES (
    'the contact sees the request', (SELECT count(*) FROM public.ec_requests_for_me()) = 1, NULL);

  v := public.ec_respond(v_id, true);
  INSERT INTO t (step, ok, detail) VALUES (
    'the contact can accept', (v ->> 'status') = 'verified', v::text);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM test_reset(A);
  PERFORM public.ec_dispatch('trip_start', 'Trip started', 'On the way to Ojuelegba');
  INSERT INTO t (step, ok, detail) VALUES (
    'now the routine ping goes through',
    (SELECT count(*) FROM public.emergency_events
      WHERE user_id = A AND outcome = 'sent' AND channel = 'in_app') = 1, NULL);
  INSERT INTO t (step, ok, detail) VALUES (
    'a trip ping withholds location unless sharing is on',
    (SELECT lat FROM public.emergency_alerts
      WHERE contact_user_id = B AND kind = 'trip_start') IS NULL, NULL);

  -- ── Per-contact preferences ─────────────────────────────────────────────
  PERFORM public.ec_update(v_id, p_notify_trip_start := false);
  PERFORM test_reset(A);
  PERFORM public.ec_dispatch('trip_start', 'Trip started', 'Again');
  INSERT INTO t (step, ok, detail) VALUES (
    'turning off trip-start silences that contact',
    (SELECT count(*) FROM public.emergency_events WHERE user_id = A AND contact_id = v_id) = 0, NULL);

  PERFORM public.ec_update(v_id, p_notify_trip_start := true,
                           p_muted_until := now() + interval '1 hour');
  PERFORM test_reset(A);
  PERFORM public.ec_dispatch('trip_start', 'Trip started', 'Muted');
  INSERT INTO t (step, ok, detail) VALUES (
    'a muted contact is skipped, and logged as muted',
    (SELECT outcome FROM public.emergency_events
      WHERE user_id = A AND contact_id = v_id) = 'skipped_muted', NULL);

  PERFORM test_reset(A);
  PERFORM public.ec_dispatch('sos', 'SOS', 'Muted but urgent');
  INSERT INTO t (step, ok, detail) VALUES (
    'mute does not silence an SOS',
    (SELECT outcome FROM public.emergency_events
      WHERE user_id = A AND contact_id = v_id) = 'sent', NULL);

  -- Quiet hours covering the whole day, so the window cannot be flaky.
  PERFORM public.ec_update(v_id, p_clear_mute := true,
                           p_silent_from := '00:00'::time, p_silent_to := '23:59'::time);
  PERFORM test_reset(A);
  PERFORM public.ec_dispatch('trip_start', 'Trip started', 'Quiet');
  INSERT INTO t (step, ok, detail) VALUES (
    'quiet hours are honoured, and logged as quiet',
    (SELECT outcome FROM public.emergency_events
      WHERE user_id = A AND contact_id = v_id) = 'skipped_quiet', NULL);

  -- ── Changing the number withdraws consent ───────────────────────────────
  PERFORM public.ec_update(v_id, p_clear_silent := true, p_phone := '08077777777');
  INSERT INTO t (step, ok, detail) VALUES (
    'changing the number resets consent to pending',
    (SELECT status FROM public.emergency_contacts WHERE id = v_id) = 'pending', NULL);
  INSERT INTO t (step, ok, detail) VALUES (
    'and unlinks the account that no longer owns it',
    (SELECT contact_user_id FROM public.emergency_contacts WHERE id = v_id) IS NULL, NULL);

  -- ── Ordering ────────────────────────────────────────────────────────────
  SELECT id INTO v_id2 FROM public.emergency_contacts
   WHERE user_id = A AND id <> v_id ORDER BY priority LIMIT 1;
  PERFORM public.ec_reorder(ARRAY[v_id2, v_id]);
  INSERT INTO t (step, ok, detail) VALUES (
    'reordering puts the chosen contact first',
    (SELECT priority FROM public.emergency_contacts WHERE id = v_id2) = 0
      AND (SELECT priority FROM public.emergency_contacts WHERE id = v_id) = 1, NULL);
  INSERT INTO t (step, ok, detail) VALUES (
    'the list comes back in that order',
    (SELECT id FROM public.ec_list() LIMIT 1) = v_id2, NULL);

  -- ── Deleting ────────────────────────────────────────────────────────────
  INSERT INTO t (step, ok, detail) VALUES (
    'a contact can be deleted', public.ec_delete(v_id), NULL);
  INSERT INTO t (step, ok, detail) VALUES (
    'deleting someone else''s contact does nothing',
    public.ec_delete(v_id) = false, NULL);

  -- ── Isolation ───────────────────────────────────────────────────────────
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', B, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO t (step, ok, detail) VALUES (
    'another user does not see your contact list',
    (SELECT count(*) FROM public.ec_list()) = 0, NULL);

  RESET ROLE;
END $$;

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, step, detail FROM t ORDER BY n;
SELECT count(*) FILTER (WHERE ok) || '/' || count(*) AS score FROM t;

ROLLBACK;
