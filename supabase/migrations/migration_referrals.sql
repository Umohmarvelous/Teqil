-- migration_referrals.sql
--
-- "Watch ads from your WhatsApp status" — the part of that idea that is real.
--
-- ── What was asked, and what is actually possible ───────────────────────────
-- The request was a way for users to watch ads via their WhatsApp Status that
-- still links back to EMILGO. The version where EMILGO earns ad revenue from
-- inside WhatsApp does not exist and cannot be built: Meta sells the ads that
-- appear in the Updates tab, and there is no publisher programme — no API, no
-- SDK, no revenue share. Anyone who tells you otherwise is describing a
-- different product.
--
-- The version that IS real, and is what every Nigerian fintech actually runs:
-- the user posts an EMILGO card to their own Status carrying a referral link.
-- Their contacts see it, install, and the sharer earns. The "ad" is the user's
-- own status; the inventory is their audience; WhatsApp is just the transport.
-- This file is the ledger that makes that payable.
--
-- ── Why the reward is NOT paid at signup ────────────────────────────────────
-- Signup-paid referrals are farmed to death within a week — a disposable email
-- costs nothing and a install is trivially automated. Payment happens on
-- QUALIFICATION: the referred person has to complete a real trip or watch a
-- real number of ads first. That single decision is the difference between a
-- growth channel and a money leak, and it is enforced in the database rather
-- than in the app, because the app is on the attacker's phone.
--
-- ── The four anti-fraud guards, all structural ──────────────────────────────
--   1. `referrals.referred_id` is UNIQUE. One person can be referred once,
--      ever, by one person. A constraint, not an `if` statement.
--   2. Self-referral is impossible: the code is resolved to a user id and
--      compared against `auth.uid()`.
--   3. A device that already owns an account cannot be referred again —
--      `users.device_fingerprint` is compared, so reinstalling to farm your own
--      link fails at the row level.
--   4. Payment is idempotent by `dedupe_key` on the pool ledger, so a retried
--      or replayed qualification pays exactly once.

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Tunables
-- ═════════════════════════════════════════════════════════════════════════════
-- One row, edited in the dashboard rather than in a deploy. The defaults are
-- deliberately modest: a referral costs real money and the payout should be
-- moved once you can see the conversion rate, not guessed now.

CREATE TABLE IF NOT EXISTS public.referral_config (
  id                BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  -- Naira credited to the fuel pool on qualification.
  referrer_reward   NUMERIC(10,2) NOT NULL DEFAULT 150.00,
  referred_reward   NUMERIC(10,2) NOT NULL DEFAULT 100.00,
  -- What "qualified" means. Either is enough.
  qualify_trips     INT NOT NULL DEFAULT 1,
  qualify_ads       INT NOT NULL DEFAULT 5,
  -- An account older than this cannot be claimed as a new referral. Without it,
  -- two existing users refer each other on day 400 and both get paid.
  claim_window_hours INT NOT NULL DEFAULT 72,
  -- Cap on what one account can earn from referrals in a day.
  daily_reward_cap  NUMERIC(10,2) NOT NULL DEFAULT 1500.00,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.referral_config (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Codes
-- ═════════════════════════════════════════════════════════════════════════════
-- Generated on first request rather than at signup: most users never share, and
-- a code nobody asked for is a row nobody reads.
--
-- The alphabet omits O/0 and I/1/L. A referral code gets read aloud, typed from
-- a blurry screenshot, and dictated over a bad line — the characters that look
-- alike are the ones that generate support tickets.

CREATE TABLE IF NOT EXISTS public.referral_codes (
  user_id    UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.gen_referral_code()
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SET search_path = public, pg_temp AS $fn$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code TEXT;
  i INT;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::INT, 1);
    END LOOP;
    -- 31^6 ≈ 887 million. A collision is vanishingly unlikely and completely
    -- survivable, so retry rather than reserving a keyspace.
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE code = v_code);
  END LOOP;
  RETURN v_code;
END;
$fn$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Shares — where the link actually went
-- ═════════════════════════════════════════════════════════════════════════════
-- Attribution needs a denominator. Without a share log you can see that ten
-- people signed up and have no idea whether that came from 12 shares or 1,200,
-- and no way to tell whether Status outperforms a direct WhatsApp message.

CREATE TABLE IF NOT EXISTS public.referral_shares (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sharer_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL CHECK (channel IN (
               'whatsapp_status', 'whatsapp_direct', 'copy_link',
               'system_share', 'qr', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_shares_sharer_idx
  ON public.referral_shares (sharer_id, created_at DESC);


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. The attribution row
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.referrals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- UNIQUE is the whole anti-fraud story. One person, one referrer, forever.
  referred_id   UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  channel       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'qualified', 'rejected')),
  reject_reason TEXT,
  referrer_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  referred_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  qualified_at  TIMESTAMPTZ,
  CONSTRAINT referrals_no_self CHECK (referrer_id <> referred_id)
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx
  ON public.referrals (referrer_id, status, created_at DESC);

ALTER TABLE public.referral_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals       ENABLE ROW LEVEL SECURITY;

-- No policies on purpose, except the two reads a user needs about themselves.
-- Everything else goes through the definer functions below, so the reward rules
-- live in exactly one place.
DO $pol$
BEGIN
  DROP POLICY IF EXISTS referral_codes_own ON public.referral_codes;
  CREATE POLICY referral_codes_own ON public.referral_codes
    FOR SELECT TO authenticated USING (user_id = auth.uid());

  DROP POLICY IF EXISTS referrals_mine ON public.referrals;
  CREATE POLICY referrals_mine ON public.referrals
    FOR SELECT TO authenticated
    USING (referrer_id = auth.uid() OR referred_id = auth.uid());
END;
$pol$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 5. My code + my numbers
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.my_referral(p_origin TEXT DEFAULT 'https://teqil.app')
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_me   UUID := auth.uid();
  v_code TEXT;
  v_cfg  public.referral_config;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  SELECT * INTO v_cfg FROM public.referral_config WHERE id;

  SELECT code INTO v_code FROM public.referral_codes WHERE user_id = v_me;
  IF v_code IS NULL THEN
    v_code := public.gen_referral_code();
    INSERT INTO public.referral_codes (user_id, code) VALUES (v_me, v_code)
      ON CONFLICT (user_id) DO UPDATE SET code = public.referral_codes.code
      RETURNING code INTO v_code;
  END IF;

  RETURN jsonb_build_object(
    'code',      v_code,
    -- Two links, on purpose. The https one is what goes in a WhatsApp Status:
    -- a `teqil://` scheme is not tappable in Status text and dies on any device
    -- without the app, which is every device you are trying to reach.
    'link',      p_origin || '/r/' || v_code,
    'deep_link', 'teqil://r/' || v_code,
    'enabled',   v_cfg.enabled,
    'referrer_reward', v_cfg.referrer_reward,
    'referred_reward', v_cfg.referred_reward,
    'qualify_trips',   v_cfg.qualify_trips,
    'qualify_ads',     v_cfg.qualify_ads,
    'shares',    (SELECT COUNT(*) FROM public.referral_shares WHERE sharer_id = v_me),
    'signups',   (SELECT COUNT(*) FROM public.referrals WHERE referrer_id = v_me),
    'pending',   (SELECT COUNT(*) FROM public.referrals
                   WHERE referrer_id = v_me AND status = 'pending'),
    'qualified', (SELECT COUNT(*) FROM public.referrals
                   WHERE referrer_id = v_me AND status = 'qualified'),
    'earned',    (SELECT COALESCE(SUM(referrer_paid), 0) FROM public.referrals
                   WHERE referrer_id = v_me),
    'by_channel', (
      SELECT COALESCE(jsonb_object_agg(channel, n), '{}'::JSONB)
        FROM (SELECT channel, COUNT(*) AS n FROM public.referral_shares
               WHERE sharer_id = v_me GROUP BY channel) c
    )
  );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.record_referral_share(p_channel TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  -- An unknown channel is logged as 'other' rather than rejected: losing a
  -- share event to a typo in a new client is worse than a slightly blunt stat.
  INSERT INTO public.referral_shares (sharer_id, channel)
  VALUES (v_me, CASE WHEN p_channel IN ('whatsapp_status','whatsapp_direct',
                                        'copy_link','system_share','qr')
                     THEN p_channel ELSE 'other' END);
END;
$fn$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Claiming
-- ═════════════════════════════════════════════════════════════════════════════
-- Called by the NEW user, once, shortly after signing up. Returns a JSON result
-- rather than raising for the ordinary refusals — "you already used a code" is
-- a normal thing to tell someone, not an exception.

CREATE OR REPLACE FUNCTION public.claim_referral(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_me       UUID := auth.uid();
  v_code     TEXT := upper(btrim(COALESCE(p_code, '')));
  v_cfg      public.referral_config;
  v_referrer UUID;
  v_my_fp    TEXT;
  v_created  TIMESTAMPTZ;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  SELECT * INTO v_cfg FROM public.referral_config WHERE id;
  IF NOT v_cfg.enabled THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'disabled');
  END IF;

  SELECT user_id INTO v_referrer FROM public.referral_codes WHERE code = v_code;
  IF v_referrer IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_code');
  END IF;
  IF v_referrer = v_me THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'own_code');
  END IF;

  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = v_me) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_referred');
  END IF;

  SELECT created_at, device_fingerprint INTO v_created, v_my_fp
    FROM public.users WHERE id = v_me;

  -- Guard 3: the same handset cannot be referred twice. Reinstalling the app to
  -- claim your own link is the single most common referral fraud, and it is
  -- free to stop here.
  IF v_my_fp IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users u
      JOIN public.referrals r ON r.referred_id = u.id
     WHERE u.device_fingerprint = v_my_fp AND u.id <> v_me
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'device_already_referred');
  END IF;

  IF v_my_fp IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users WHERE id = v_referrer AND device_fingerprint = v_my_fp
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'same_device_as_referrer');
  END IF;

  IF v_created IS NOT NULL
     AND v_created < now() - make_interval(hours => v_cfg.claim_window_hours) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_too_old');
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_id, code)
  VALUES (v_referrer, v_me, v_code)
  -- The unique index is the real guard; this keeps a double-tap from raising.
  ON CONFLICT (referred_id) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'pending',
    'referred_reward', v_cfg.referred_reward,
    'qualify_trips', v_cfg.qualify_trips,
    'qualify_ads', v_cfg.qualify_ads
  );
END;
$fn$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Qualifying — where money actually moves
-- ═════════════════════════════════════════════════════════════════════════════
-- Callable by the referred user at any time. That is safe, and deliberate: the
-- function does not take the caller's word for anything. It recomputes the
-- qualifying condition from trips and ad sessions the database already holds,
-- and the dedupe keys mean calling it a thousand times pays once.

CREATE OR REPLACE FUNCTION public.try_qualify_referral()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_me      UUID := auth.uid();
  v_cfg     public.referral_config;
  v_ref     public.referrals;
  v_trips   INT;
  v_ads     INT;
  v_paid_today NUMERIC;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  SELECT * INTO v_cfg FROM public.referral_config WHERE id;

  SELECT * INTO v_ref FROM public.referrals WHERE referred_id = v_me FOR UPDATE;
  IF v_ref.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_referral');
  END IF;
  IF v_ref.status = 'qualified' THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_qualified');
  END IF;
  IF v_ref.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rejected');
  END IF;

  -- Completed trips, either seat. A driver referring another driver is a real
  -- and valuable case, so both sides of the trip count.
  SELECT COUNT(*) INTO v_trips FROM public.trips t
   WHERE t.status = 'completed'
     AND (t.driver_id = v_me
          OR EXISTS (SELECT 1 FROM public.passengers p
                      WHERE p.trip_id = t.id AND p.user_id = v_me));

  SELECT COUNT(*) INTO v_ads FROM public.ad_sessions
   WHERE user_id = v_me AND status = 'completed';

  IF v_trips < v_cfg.qualify_trips AND v_ads < v_cfg.qualify_ads THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'not_yet',
      'trips', v_trips, 'trips_needed', v_cfg.qualify_trips,
      'ads', v_ads, 'ads_needed', v_cfg.qualify_ads);
  END IF;

  -- Daily cap on the REFERRER, checked against what has actually been paid
  -- rather than a counter that could drift.
  SELECT COALESCE(SUM(referrer_paid), 0) INTO v_paid_today
    FROM public.referrals
   WHERE referrer_id = v_ref.referrer_id
     AND qualified_at >= date_trunc('day', now());

  IF v_paid_today + v_cfg.referrer_reward > v_cfg.daily_reward_cap THEN
    UPDATE public.referrals
       SET status = 'rejected', reject_reason = 'referrer_daily_cap'
     WHERE id = v_ref.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'referrer_daily_cap');
  END IF;

  -- Both credits share the referral id, so a replay of this whole function is
  -- absorbed by the unique index on dedupe_key rather than paying twice.
  INSERT INTO public.fuel_pool_history (user_id, amount, kind, dedupe_key)
  VALUES (v_ref.referrer_id, v_cfg.referrer_reward, 'referral_reward',
          'referral:' || v_ref.id::TEXT || ':referrer')
  ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO public.fuel_pool_history (user_id, amount, kind, dedupe_key)
  VALUES (v_me, v_cfg.referred_reward, 'referral_reward',
          'referral:' || v_ref.id::TEXT || ':referred')
  ON CONFLICT (dedupe_key) DO NOTHING;

  UPDATE public.referrals
     SET status = 'qualified',
         qualified_at = now(),
         referrer_paid = v_cfg.referrer_reward,
         referred_paid = v_cfg.referred_reward
   WHERE id = v_ref.id;

  RETURN jsonb_build_object(
    'ok', true, 'status', 'qualified',
    'referred_reward', v_cfg.referred_reward,
    'referrer_reward', v_cfg.referrer_reward);
END;
$fn$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 8. The list behind "My invites"
-- ═════════════════════════════════════════════════════════════════════════════
-- Display-safe columns only. A referral list is not a reason to learn someone's
-- email — see migration_user_privacy.sql.

CREATE OR REPLACE FUNCTION public.list_my_referrals(p_limit INT DEFAULT 50)
RETURNS TABLE (
  id           UUID,
  name         TEXT,
  username     TEXT,
  photo        TEXT,
  status       TEXT,
  reward       NUMERIC,
  created_at   TIMESTAMPTZ,
  qualified_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  RETURN QUERY
    SELECT r.id,
           COALESCE(NULLIF(btrim(u.full_name), ''), u.username, 'New user'),
           u.username, u.profile_photo, r.status, r.referrer_paid,
           r.created_at, r.qualified_at
      FROM public.referrals r
      JOIN public.users u ON u.id = r.referred_id
     WHERE r.referrer_id = v_me
     ORDER BY r.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END;
$fn$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 9. Grants
-- ═════════════════════════════════════════════════════════════════════════════
-- REVOKE before GRANT: Postgres gives EXECUTE to PUBLIC by default and `anon`
-- inherits it, which is how 27 functions ended up anon-callable before anyone
-- noticed. Nothing here runs before a session exists.

DO $g$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT format('public.%I(%s)', p.proname,
                  pg_get_function_identity_arguments(p.oid)) AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('my_referral', 'record_referral_share', 'claim_referral',
                         'try_qualify_referral', 'list_my_referrals',
                         'gen_referral_code')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END;
$g$;

-- `gen_referral_code` is an internal helper; it has no business being callable.
REVOKE ALL ON FUNCTION public.gen_referral_code() FROM PUBLIC, anon, authenticated;

-- The ledger already allows users to insert their own 'premium_share' rows and
-- nothing else, so referral credits can only ever be written by the definer
-- function above. No new table grants are needed.

COMMIT;
