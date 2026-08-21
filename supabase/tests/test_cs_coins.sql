-- supabase/tests/test_cs_coins.sql
--
-- Proves the coin system does the two things COMPLIANCE.md relies on:
--   1. every cs a user holds came OUT of the general pool — none is invented;
--   2. there is no path from cs to money.
--
-- Usage: node ./.dbq.mjs -f supabase/tests/test_cs_coins.sql

BEGIN;

CREATE TEMP TABLE t (step text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t TO authenticated, anon;

DO $$
DECLARE
  A UUID; B UUID;
  v JSONB; n BIGINT; m BIGINT; c INT;
BEGIN
  SELECT id INTO A FROM public.users ORDER BY created_at LIMIT 1;
  SELECT id INTO B FROM public.users WHERE id <> A ORDER BY created_at LIMIT 1;
  IF A IS NULL OR B IS NULL THEN
    INSERT INTO t VALUES ('need two users', false, 'sign up twice first');
    RETURN;
  END IF;

  -- Fund the general pool as the operator would after an ad network settles.
  INSERT INTO public.cs_general_ledger (amount, kind, reference, dedupe_key)
  VALUES (10000, 'ad_network_payout', 'TEST-SETTLEMENT-1', 'test:seed:1');

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- ── 1. A user cannot mint cs ────────────────────────────────────────────
  BEGIN
    INSERT INTO public.cs_ledger (user_id, amount, kind) VALUES (A, 999999, 'correction');
    INSERT INTO t VALUES ('a user CANNOT insert into their own ledger', false, 'the insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t VALUES ('a user cannot insert into their own ledger', true, SQLERRM);
  END;

  -- ── 2. Watching an ad moves cs out of the general pool ──────────────────
  m := public.cs_general_balance();
  v := public.cs_grant_from_general(120, 'test:adsession:aaaa1111', 'ad');
  INSERT INTO t VALUES ('ad grant succeeded', (v->>'ok') = 'true', v::text);
  INSERT INTO t VALUES ('the user was credited 120 cs',
    public.cs_balance() = 120, public.cs_balance()::text);
  INSERT INTO t VALUES ('the general pool fell by exactly 120',
    public.cs_general_balance() = m - 120, public.cs_general_balance()::text);

  -- ── 3. A retried grant pays once ────────────────────────────────────────
  v := public.cs_grant_from_general(120, 'test:adsession:aaaa1111', 'ad');
  INSERT INTO t VALUES ('a replayed ad session grants nothing',
    (v->>'duplicate') = 'true' AND public.cs_balance() = 120, v::text);

  -- ── 4. The pool cannot be overdrawn ─────────────────────────────────────
  v := public.cs_grant_from_general(999999999, 'test:adsession:bbbb2222', 'ad');
  INSERT INTO t VALUES ('a grant larger than the pool is refused, not overdrawn',
    (v->>'reason') = 'general_pool_empty', v::text);

  -- ── 5. Gifting ──────────────────────────────────────────────────────────
  v := public.cs_gift(B, 50, 'thanks for the ride');
  INSERT INTO t VALUES ('gift of 50 cs succeeded', (v->>'ok') = 'true', v::text);
  INSERT INTO t VALUES ('sender is down to 70 cs', public.cs_balance() = 70, public.cs_balance()::text);

  v := public.cs_gift(A, 10, 'to myself');
  INSERT INTO t VALUES ('you cannot gift yourself', (v->>'reason') = 'invalid_recipient', v::text);

  v := public.cs_gift(B, 100000, 'too much');
  INSERT INTO t VALUES ('a gift above the max is refused', (v->>'reason') = 'out_of_range', v::text);

  v := public.cs_gift(B, 400, 'more than I hold');
  INSERT INTO t VALUES ('you cannot gift cs you do not hold',
    (v->>'reason') = 'insufficient', v::text);

  -- ── 6. Gifting does not create or destroy cs ────────────────────────────
  -- Checked with RLS OFF on purpose: under RLS the caller sees only their own
  -- half of the transfer, so this sum would be -50 no matter how correct the
  -- code is. The invariant is about BOTH ledgers, so it has to be read from
  -- outside either user's view.
  RESET ROLE;
  SELECT coalesce(sum(amount),0) INTO n FROM public.cs_ledger
   WHERE kind IN ('gift_sent','gift_received');
  INSERT INTO t VALUES ('gifts net to exactly zero across both ledgers', n = 0, n::text);

  -- The same invariant for the whole system: every cs a user holds came out of
  -- the general pool, so the two ledgers must mirror each other exactly.
  SELECT coalesce(sum(amount),0) INTO n FROM public.cs_ledger;
  SELECT coalesce(-sum(amount),0) INTO m FROM public.cs_general_ledger
   WHERE kind = 'ad_watch_grant';
  INSERT INTO t VALUES ('every cs held by a user was granted out of the general pool',
    n + (SELECT coalesce(sum(price_cs),0) FROM public.cs_redemptions) = m,
    n::text || ' held+spent vs ' || m::text || ' granted');

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- ── 7. Redeeming buys a THING at a fixed cs price ───────────────────────
  v := public.cs_grant_from_general(300, 'test:adsession:cccc3333', 'ad');
  v := public.cs_redeem('half_fare');
  INSERT INTO t VALUES ('half-fare redeemed for a voucher code',
    (v->>'ok') = 'true' AND length(v->>'voucher') = 8, v::text);
  INSERT INTO t VALUES ('the voucher cost the listed cs price, not a currency amount',
    (v->>'price') = '200', v::text);

  v := public.cs_redeem('fuel_voucher');
  INSERT INTO t VALUES ('a passenger cannot redeem a driver entitlement',
    (v->>'reason') = 'wrong_role', v::text);

  v := public.cs_redeem('not_a_real_thing');
  INSERT INTO t VALUES ('an unknown entitlement is refused',
    (v->>'reason') = 'unknown_entitlement', v::text);

  -- ── 8. Replenishment is admin-only ──────────────────────────────────────
  BEGIN
    v := public.cs_replenish_general(5000, 'TEST-2');
    INSERT INTO t VALUES ('a normal user CANNOT replenish the pool', false, 'it worked');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t VALUES ('a normal user cannot replenish the pool', true, SQLERRM);
  END;

  -- ── 9. No route from cs to money ────────────────────────────────────────
  SELECT count(*) INTO c
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname ~* '^cs_'
     AND (p.proname ~* '(naira|cash|withdraw|payout|bank|fiat|convert|exchange)');
  INSERT INTO t VALUES ('no cs_* function mentions cash, banks or conversion', c = 0, c::text);

  SELECT count(*) INTO c
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('cs_ledger','cs_general_ledger','cs_redemptions','cs_entitlements')
     AND column_name ~* '(naira|currency|amount_ngn|fiat|rate|bank|account_number)';
  INSERT INTO t VALUES ('no cs table carries a currency, a rate or an account number',
    c = 0, c::text);

  -- ── 10. The other side sees the gift ────────────────────────────────────
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', B, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO t VALUES ('recipient holds the 50 cs', public.cs_balance() = 50, public.cs_balance()::text);
  SELECT count(*) INTO c FROM public.cs_history() WHERE kind = 'gift_received';
  INSERT INTO t VALUES ('it appears in the recipient''s history', c = 1, c::text);

  SELECT count(*) INTO c FROM public.cs_ledger WHERE user_id = A;
  INSERT INTO t VALUES ('B cannot read A''s ledger', c = 0, c::text);

  RESET ROLE;
END $$;

SELECT CASE WHEN ok THEN 'PASS' ELSE '**FAIL**' END AS result, step, detail FROM t;
SELECT count(*) FILTER (WHERE ok) || '/' || count(*) AS score FROM t;

ROLLBACK;
