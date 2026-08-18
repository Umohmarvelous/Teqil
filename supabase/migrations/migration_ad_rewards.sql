-- migration_ad_rewards.sql
--
-- Watch ads, earn into your fuel pool. Step 4 of the revenue plan.
--
-- ── The product ─────────────────────────────────────────────────────────────
-- A passenger watches ads; the reward lands in their FUEL POOL, which is what
-- pays for half their fare. So the loop is "watch three ads on the bus, your
-- next trip is cheaper" — not an abstract points balance. `addAdRevenue` in
-- usePoolStore has been waiting for this since it was written.
--
-- A daily LADDER of milestones pays out as the count climbs (1st ad, 3rd, 5th,
-- 8th), and clearing the streak quota on consecutive days builds a STREAK with
-- its own milestone payouts.
--
-- ── Why the server owns everything ──────────────────────────────────────────
-- Every value that decides a payout — how long the ad ran, whether it finished,
-- what it is worth, how many you have already watched today — is computed here
-- from rows the client cannot forge. The client reports elapsed milliseconds,
-- but `complete_ad_session` ignores that number if it disagrees with the wall
-- clock between `started_at` and now. An honest client and a patched client get
-- the same answer.
--
-- ── ⚠️ The unit economics, stated plainly ───────────────────────────────────
-- Rewarded-video eCPM in Nigeria runs roughly $0.50–$2.00 per 1,000 impressions.
-- At ₦1,500/$ that is **₦0.75–₦3.00 of gross revenue per ad watched**.
--
-- The defaults seeded below pay ₦8.00 per rewarded ad. That is a **growth
-- subsidy costing ₦5–7 per ad**, not a share of revenue, and at 10,000 daily
-- active users clearing the quota it burns roughly ₦2–3.5m per month.
--
-- They are in a table, not a constant, precisely so they can be changed without
-- a deploy once the real eCPM from a live ad network is known:
--
--   UPDATE public.ad_reward_config SET rewarded_credits = 2.00;
--
-- Nothing in the app reads a hard-coded reward. See SETUP-KEYS.md §6.

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- CONFIG — one row, so payouts are tunable without shipping a build
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ad_reward_config (
  id                     BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),

  -- Naira credited to the fuel pool per completed ad, by format.
  rewarded_credits       NUMERIC(10,2) NOT NULL DEFAULT 8.00,
  interstitial_credits   NUMERIC(10,2) NOT NULL DEFAULT 3.00,
  banner_credits         NUMERIC(10,2) NOT NULL DEFAULT 1.00,

  -- ── The daily ladder ──────────────────────────────────────────────────────
  -- Not one flat quota but a sequence of named milestones, so the tracker can
  -- show "you are 2 ads from ₦30" instead of an anonymous bar. `at` is the
  -- cumulative ad count that unlocks it; `naira` is paid into the fuel pool on
  -- top of the per-ad reward; `label` is what the UI prints on the tile.
  --
  -- Ordered ascending. The LAST entry is the day's full clear.
  daily_milestones       JSONB         NOT NULL DEFAULT
    '[{"at": 1, "naira": 5,  "label": "First watch"},
      {"at": 3, "naira": 15, "label": "Warm up"},
      {"at": 5, "naira": 30, "label": "Daily goal"},
      {"at": 8, "naira": 60, "label": "Full clear"}]'::JSONB,

  -- Ads that must be watched for the day to COUNT TOWARDS THE STREAK. Kept
  -- separate from the ladder's last rung deliberately: the streak should
  -- survive a day where someone only had time for the goal, not demand a
  -- full clear every single day.
  daily_quota            INT           NOT NULL DEFAULT 5  CHECK (daily_quota > 0),

  -- Milestone payouts, keyed by streak length.
  streak_milestones      JSONB         NOT NULL DEFAULT
    '{"3": 25, "7": 100, "14": 250, "30": 500, "90": 2000}'::JSONB,

  -- Hard ceiling per user per day. Without this, one scripted account drains
  -- the budget overnight.
  max_ads_per_day        INT           NOT NULL DEFAULT 20 CHECK (max_ads_per_day > 0),
  -- Seconds a user must wait between two ads. Stops instant replay farming and
  -- is also just better pacing.
  cooldown_seconds       INT           NOT NULL DEFAULT 20,
  -- Fraction of an ad's duration that counts as "watched".
  completion_threshold   NUMERIC(3,2)  NOT NULL DEFAULT 0.95
                           CHECK (completion_threshold > 0 AND completion_threshold <= 1),
  -- How many times one creative may be shown to one user per day.
  per_creative_daily_cap INT           NOT NULL DEFAULT 3,
  -- Missing one day normally resets the streak. This many "freezes" per month
  -- forgive a miss — Duolingo's mechanic, and the reason their streaks survive
  -- a bad week instead of being abandoned.
  monthly_streak_freezes INT           NOT NULL DEFAULT 2,

  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT now()
);

INSERT INTO public.ad_reward_config (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.ad_reward_config ENABLE ROW LEVEL SECURITY;

-- Everyone signed in may READ the rules — the app shows them on the Rewards
-- screen, and a reward system whose terms are hidden is not a reward system.
-- Nobody may write them from a client.
DROP POLICY IF EXISTS ad_reward_config_read ON public.ad_reward_config;
CREATE POLICY ad_reward_config_read ON public.ad_reward_config
  FOR SELECT TO authenticated USING (TRUE);


-- ═════════════════════════════════════════════════════════════════════════════
-- CREATIVES — extend the table the feed's promoted units already use
-- ═════════════════════════════════════════════════════════════════════════════

-- `ad_creatives` was created by migration_social_feed.sql for in-feed promoted
-- posts. A rewarded video is the same advertiser and the same billing, in a
-- different slot, so it extends that table rather than starting a parallel one.
ALTER TABLE public.ad_creatives
  ADD COLUMN IF NOT EXISTS format           TEXT NOT NULL DEFAULT 'feed'
    CHECK (format IN ('feed', 'banner', 'interstitial', 'rewarded')),
  ADD COLUMN IF NOT EXISTS duration_seconds INT  NOT NULL DEFAULT 15
    CHECK (duration_seconds BETWEEN 5 AND 120),
  ADD COLUMN IF NOT EXISTS category         TEXT NOT NULL DEFAULT 'general',
  -- Skippable after N seconds; NULL means not skippable. Skipping forfeits the
  -- reward, which the player screen says out loud before it happens.
  ADD COLUMN IF NOT EXISTS skip_after_seconds INT,

  -- App-install metadata. Populated only when the ad promotes an app or game,
  -- which is what the post-roll carousel offers.
  ADD COLUMN IF NOT EXISTS app_name         TEXT,
  ADD COLUMN IF NOT EXISTS app_icon         TEXT,
  ADD COLUMN IF NOT EXISTS app_rating       NUMERIC(2,1) CHECK (app_rating BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS app_installs     TEXT,
  ADD COLUMN IF NOT EXISTS app_store_url    TEXT,
  ADD COLUMN IF NOT EXISTS play_store_url   TEXT,
  ADD COLUMN IF NOT EXISTS app_screenshots  JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE INDEX IF NOT EXISTS ad_creatives_format_idx
  ON public.ad_creatives (format, weight DESC) WHERE active;


-- ═════════════════════════════════════════════════════════════════════════════
-- SESSIONS — one row per watch attempt, complete or not
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ad_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_id          UUID NOT NULL REFERENCES public.ad_creatives(id) ON DELETE CASCADE,
  format         TEXT NOT NULL,
  -- Copied from the creative at serve time. A creative edited mid-watch must
  -- not change what this session is worth.
  duration_seconds INT NOT NULL,
  reward_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,

  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at       TIMESTAMPTZ,
  watched_ms     INT NOT NULL DEFAULT 0,

  status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'completed', 'abandoned', 'expired')),
  -- Set when a completed session actually paid out. A session can complete and
  -- still not pay — the daily ceiling, for instance.
  rewarded       BOOLEAN NOT NULL DEFAULT FALSE,
  -- Why it did not pay, when it did not.
  no_reward_reason TEXT,

  clicked        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_sessions_user_idx
  ON public.ad_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_sessions_open_idx
  ON public.ad_sessions (user_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS ad_sessions_creative_day_idx
  ON public.ad_sessions (user_id, ad_id, created_at DESC);

ALTER TABLE public.ad_sessions ENABLE ROW LEVEL SECURITY;

-- Read-only from the client. Every write goes through an RPC that validates the
-- timing — a client that could INSERT here could mint completed sessions.
DROP POLICY IF EXISTS ad_sessions_own ON public.ad_sessions;
CREATE POLICY ad_sessions_own ON public.ad_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());


-- ═════════════════════════════════════════════════════════════════════════════
-- DAILY PROGRESS AND STREAK
-- ═════════════════════════════════════════════════════════════════════════════

-- One row per user per day. `day` is a DATE in Africa/Lagos, not UTC: a user in
-- Lagos who watches an ad at 1am should be crediting that day, not the previous
-- one. Everything that says "today" in this file means Lagos time.
CREATE TABLE IF NOT EXISTS public.ad_daily_progress (
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day            DATE NOT NULL,
  watched        INT  NOT NULL DEFAULT 0,
  earned         NUMERIC(10,2) NOT NULL DEFAULT 0,
  quota_met_at   TIMESTAMPTZ,
  bonus_claimed  BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.ad_daily_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ad_daily_progress_own ON public.ad_daily_progress;
CREATE POLICY ad_daily_progress_own ON public.ad_daily_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.ad_streaks (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak    INT  NOT NULL DEFAULT 0,
  longest_streak    INT  NOT NULL DEFAULT 0,
  last_quota_day    DATE,
  freezes_used      INT  NOT NULL DEFAULT 0,
  freezes_month     DATE,
  total_ads_watched INT  NOT NULL DEFAULT 0,
  total_earned      NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_streaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ad_streaks_own ON public.ad_streaks;
CREATE POLICY ad_streaks_own ON public.ad_streaks
  FOR SELECT TO authenticated USING (user_id = auth.uid());


-- ═════════════════════════════════════════════════════════════════════════════
-- PREFERENCES AND SUPPRESSION
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ad_preferences (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Off means ads are served by weight alone, ignoring anything known about the
  -- user. It does not mean fewer ads, and the settings screen says so.
  personalised      BOOLEAN NOT NULL DEFAULT TRUE,
  sound_on          BOOLEAN NOT NULL DEFAULT FALSE,
  -- Video ads over mobile data are somebody's airtime. Default to Wi-Fi only.
  wifi_only_video   BOOLEAN NOT NULL DEFAULT TRUE,
  autoplay_next     BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_hour     INT     NOT NULL DEFAULT 19 CHECK (reminder_hour BETWEEN 0 AND 23),
  muted_categories  TEXT[]  NOT NULL DEFAULT '{}',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ad_preferences_own ON public.ad_preferences;
CREATE POLICY ad_preferences_own ON public.ad_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- "Don't show me this one again" — the reaction button on the player.
CREATE TABLE IF NOT EXISTS public.ad_suppressions (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_id      UUID NOT NULL REFERENCES public.ad_creatives(id) ON DELETE CASCADE,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ad_id)
);

ALTER TABLE public.ad_suppressions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ad_suppressions_own ON public.ad_suppressions;
CREATE POLICY ad_suppressions_own ON public.ad_suppressions
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.ad_reports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_id      UUID NOT NULL REFERENCES public.ad_creatives(id) ON DELETE CASCADE,
  reason     TEXT NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ad_reports_insert ON public.ad_reports;
CREATE POLICY ad_reports_insert ON public.ad_reports
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());


-- ═════════════════════════════════════════════════════════════════════════════
-- HELPERS
-- ═════════════════════════════════════════════════════════════════════════════

-- The app's day boundary. Every "today" in this file goes through here, so
-- there is one definition rather than one per function.
CREATE OR REPLACE FUNCTION public.ad_today()
RETURNS DATE
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT (now() AT TIME ZONE 'Africa/Lagos')::DATE;
$$;

CREATE OR REPLACE FUNCTION public.ad_reward_for(p_format TEXT)
RETURNS NUMERIC
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_format
           WHEN 'rewarded'     THEN c.rewarded_credits
           WHEN 'interstitial' THEN c.interstitial_credits
           WHEN 'banner'       THEN c.banner_credits
           ELSE 0
         END
    FROM public.ad_reward_config c WHERE c.id;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- DASHBOARD — everything the Rewards screen and the tracker modal render
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_ad_dashboard()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_today  DATE := public.ad_today();
  v_cfg    public.ad_reward_config;
  v_prog   public.ad_daily_progress;
  v_streak public.ad_streaks;
  v_next   TIMESTAMPTZ;
  v_week   JSONB;
  v_ladder JSONB;
  v_next_ms JSONB;
  v_watched INT;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  SELECT * INTO v_cfg FROM public.ad_reward_config WHERE id;
  SELECT * INTO v_prog FROM public.ad_daily_progress WHERE user_id = v_me AND day = v_today;
  SELECT * INTO v_streak FROM public.ad_streaks WHERE user_id = v_me;

  -- When the cooldown ends, so the button can show a countdown rather than
  -- failing on tap.
  SELECT MAX(ended_at) + make_interval(secs => v_cfg.cooldown_seconds)
    INTO v_next
    FROM public.ad_sessions
   WHERE user_id = v_me AND status = 'completed';

  -- Last seven days, oldest first — the little bar chart on the tracker.
  SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.day), '[]'::JSONB) INTO v_week
    FROM (
      SELECT g.day::DATE AS day,
             COALESCE(p.watched, 0) AS watched,
             COALESCE(p.earned, 0)  AS earned,
             (p.quota_met_at IS NOT NULL) AS quota_met
        FROM generate_series(v_today - 6, v_today, '1 day') AS g(day)
        LEFT JOIN public.ad_daily_progress p
               ON p.user_id = v_me AND p.day = g.day::DATE
    ) d;

  v_watched := COALESCE(v_prog.watched, 0);

  SELECT COALESCE(jsonb_agg(
           m.value || jsonb_build_object('reached', v_watched >= (m.value->>'at')::INT)
           ORDER BY (m.value->>'at')::INT), '[]'::JSONB)
    INTO v_ladder
    FROM jsonb_array_elements(v_cfg.daily_milestones) AS m(value);

  -- The rung the "N more to go" line counts down to. NULL once the day is
  -- fully cleared, which is how the UI knows to switch to its finished state.
  SELECT m.value INTO v_next_ms
    FROM jsonb_array_elements(v_cfg.daily_milestones) AS m(value)
   WHERE (m.value->>'at')::INT > v_watched
   ORDER BY (m.value->>'at')::INT
   LIMIT 1;

  RETURN jsonb_build_object(
    'today',            v_today,
    'watched_today',    COALESCE(v_prog.watched, 0),
    'earned_today',     COALESCE(v_prog.earned, 0),
    'daily_quota',      v_cfg.daily_quota,
    'quota_met',        v_prog.quota_met_at IS NOT NULL,
    'bonus_claimed',    COALESCE(v_prog.bonus_claimed, FALSE),
    -- The ladder, with each rung already marked reached/unreached so the UI
    -- renders the track without re-deriving the rule.
    'milestones',       v_ladder,
    'next_milestone',   v_next_ms,
    'max_ads_per_day',  v_cfg.max_ads_per_day,
    'remaining_today',  GREATEST(0, v_cfg.max_ads_per_day - COALESCE(v_prog.watched, 0)),
    'current_streak',   COALESCE(v_streak.current_streak, 0),
    'longest_streak',   COALESCE(v_streak.longest_streak, 0),
    'total_watched',    COALESCE(v_streak.total_ads_watched, 0),
    'total_earned',     COALESCE(v_streak.total_earned, 0),
    'freezes_left',     GREATEST(0, v_cfg.monthly_streak_freezes -
                          CASE WHEN v_streak.freezes_month = date_trunc('month', v_today)::DATE
                               THEN v_streak.freezes_used ELSE 0 END),
    'streak_milestones', v_cfg.streak_milestones,
    'cooldown_seconds', v_cfg.cooldown_seconds,
    'next_ad_at',       v_next,
    'reward_rewarded',  v_cfg.rewarded_credits,
    'reward_interstitial', v_cfg.interstitial_credits,
    'reward_banner',    v_cfg.banner_credits,
    'week',             v_week
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ad_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ad_dashboard() TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- SERVE — pick the next ad this user is allowed to see
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.next_ad(p_format TEXT DEFAULT 'rewarded')
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me    UUID := auth.uid();
  v_today DATE := public.ad_today();
  v_cfg   public.ad_reward_config;
  v_prefs public.ad_preferences;
  v_prog  public.ad_daily_progress;
  v_last  TIMESTAMPTZ;
  v_ad    public.ad_creatives;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  SELECT * INTO v_cfg FROM public.ad_reward_config WHERE id;
  SELECT * INTO v_prefs FROM public.ad_preferences WHERE user_id = v_me;
  SELECT * INTO v_prog  FROM public.ad_daily_progress WHERE user_id = v_me AND day = v_today;

  -- The three reasons there is nothing to serve are all worth distinguishing in
  -- the UI: one is "come back tomorrow", one is "wait 12 seconds", one is
  -- "we have run out of ads", and they need different screens.
  IF COALESCE(v_prog.watched, 0) >= v_cfg.max_ads_per_day THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'daily_limit');
  END IF;

  SELECT MAX(ended_at) INTO v_last
    FROM public.ad_sessions WHERE user_id = v_me AND status = 'completed';

  IF v_last IS NOT NULL
     AND v_last + make_interval(secs => v_cfg.cooldown_seconds) > now() THEN
    RETURN jsonb_build_object(
      'ok', FALSE, 'reason', 'cooldown',
      'ready_at', v_last + make_interval(secs => v_cfg.cooldown_seconds));
  END IF;

  SELECT c.* INTO v_ad
    FROM public.ad_creatives c
   WHERE c.active
     AND c.format = p_format
     AND c.starts_at <= now()
     AND (c.ends_at IS NULL OR c.ends_at > now())
     -- "Don't show me this again"
     AND NOT EXISTS (
       SELECT 1 FROM public.ad_suppressions s
        WHERE s.user_id = v_me AND s.ad_id = c.id)
     -- Muted category
     AND NOT (c.category = ANY (COALESCE(v_prefs.muted_categories, '{}')))
     -- Per-creative daily frequency cap: seeing the same advert five times in a
     -- row is what makes people uninstall.
     AND (
       SELECT COUNT(*) FROM public.ad_sessions s
        WHERE s.user_id = v_me AND s.ad_id = c.id
          AND (s.created_at AT TIME ZONE 'Africa/Lagos')::DATE = v_today
     ) < v_cfg.per_creative_daily_cap
     -- Role targeting, when the creative asks for it.
     AND (
       cardinality(c.target_roles) = 0
       OR EXISTS (
         SELECT 1 FROM public.users u
          WHERE u.id = v_me AND u.role::TEXT = ANY (c.target_roles))
     )
   -- Weight biases the draw; random() breaks ties and keeps a rotation.
   ORDER BY (c.weight * random()) DESC
   LIMIT 1;

  IF v_ad.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'no_inventory');
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'ad', jsonb_build_object(
      'id',                v_ad.id,
      'advertiser_name',   v_ad.advertiser_name,
      'advertiser_logo',   v_ad.advertiser_logo,
      'headline',          v_ad.headline,
      'body',              v_ad.body,
      'media_url',         v_ad.media_url,
      'media_type',        v_ad.media_type,
      'cta_label',         v_ad.cta_label,
      'cta_url',           v_ad.cta_url,
      'format',            v_ad.format,
      'category',          v_ad.category,
      'duration_seconds',  v_ad.duration_seconds,
      'skip_after_seconds', v_ad.skip_after_seconds,
      'app_name',          v_ad.app_name,
      'app_icon',          v_ad.app_icon,
      'app_rating',        v_ad.app_rating,
      'app_installs',      v_ad.app_installs,
      'app_store_url',     v_ad.app_store_url,
      'play_store_url',    v_ad.play_store_url,
      'app_screenshots',   v_ad.app_screenshots
    ),
    'reward', public.ad_reward_for(p_format)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.next_ad(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_ad(TEXT) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- SESSION LIFECYCLE
-- ═════════════════════════════════════════════════════════════════════════════

-- `started_at` is set by the DATABASE, from the database's clock. That single
-- fact is what makes the completion check unforgeable — a client cannot claim a
-- 30-second watch two seconds after starting, whatever it reports.
CREATE OR REPLACE FUNCTION public.start_ad_session(p_ad UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me UUID := auth.uid();
  v_ad public.ad_creatives;
  v_id UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  SELECT * INTO v_ad FROM public.ad_creatives WHERE id = p_ad AND active;
  IF v_ad.id IS NULL THEN RAISE EXCEPTION 'that ad is no longer available'; END IF;

  -- Abandon anything left open — the app was killed mid-ad. Leaving them open
  -- would let a user accumulate sessions and complete them later in a batch.
  UPDATE public.ad_sessions
     SET status = 'expired', ended_at = now()
   WHERE user_id = v_me AND status = 'open';

  INSERT INTO public.ad_sessions
    (user_id, ad_id, format, duration_seconds, reward_amount)
  VALUES
    (v_me, p_ad, v_ad.format, v_ad.duration_seconds, public.ad_reward_for(v_ad.format))
  RETURNING id INTO v_id;

  INSERT INTO public.ad_events (ad_id, user_id, kind) VALUES (p_ad, v_me, 'impression');

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_ad_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_ad_session(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.complete_ad_session(p_session UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_today    DATE := public.ad_today();
  v_cfg      public.ad_reward_config;
  v_s        public.ad_sessions;
  v_elapsed  NUMERIC;
  v_required NUMERIC;
  v_prog     public.ad_daily_progress;
  v_streak   public.ad_streaks;
  v_reward   NUMERIC := 0;
  v_bonus    NUMERIC := 0;
  v_ms_label TEXT;
  v_milestone NUMERIC := 0;
  v_quota_now BOOLEAN := FALSE;
  v_month    DATE;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  SELECT * INTO v_cfg FROM public.ad_reward_config WHERE id;

  -- Lock the session row: two taps of "claim" must not pay twice.
  SELECT * INTO v_s FROM public.ad_sessions
   WHERE id = p_session AND user_id = v_me FOR UPDATE;

  IF v_s.id IS NULL THEN RAISE EXCEPTION 'no such ad session'; END IF;
  IF v_s.status <> 'open' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'already_settled',
                              'rewarded', v_s.rewarded);
  END IF;

  -- The whole anti-fraud check, in one line: how long has it ACTUALLY been?
  v_elapsed  := EXTRACT(EPOCH FROM (now() - v_s.started_at));
  v_required := v_s.duration_seconds * v_cfg.completion_threshold;

  IF v_elapsed < v_required THEN
    UPDATE public.ad_sessions
       SET status = 'abandoned', ended_at = now(),
           watched_ms = (v_elapsed * 1000)::INT,
           no_reward_reason = 'too_short'
     WHERE id = p_session;
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'too_short',
                              'watched_seconds', round(v_elapsed),
                              'required_seconds', round(v_required));
  END IF;

  -- Daily ceiling. Checked again here, not only at serve time, because the
  -- ceiling could have been reached by another device since.
  SELECT * INTO v_prog FROM public.ad_daily_progress
   WHERE user_id = v_me AND day = v_today FOR UPDATE;

  IF COALESCE(v_prog.watched, 0) >= v_cfg.max_ads_per_day THEN
    UPDATE public.ad_sessions
       SET status = 'completed', ended_at = now(),
           watched_ms = (v_elapsed * 1000)::INT,
           rewarded = FALSE, no_reward_reason = 'daily_limit'
     WHERE id = p_session;
    RETURN jsonb_build_object('ok', TRUE, 'rewarded', FALSE, 'reason', 'daily_limit');
  END IF;

  v_reward := v_s.reward_amount;

  UPDATE public.ad_sessions
     SET status = 'completed', ended_at = now(),
         watched_ms = (v_elapsed * 1000)::INT, rewarded = TRUE
   WHERE id = p_session;

  INSERT INTO public.ad_daily_progress (user_id, day, watched, earned)
  VALUES (v_me, v_today, 1, v_reward)
  ON CONFLICT (user_id, day) DO UPDATE
    SET watched = public.ad_daily_progress.watched + 1,
        earned  = public.ad_daily_progress.earned + v_reward
  RETURNING * INTO v_prog;

  -- ── Did this ad land exactly on a ladder rung? ────────────────────────────
  -- `= v_prog.watched`, not `<=`: only the ad that CROSSES a rung pays it. A
  -- range check would re-pay every rung already passed on every subsequent ad.
  SELECT COALESCE(SUM((m.value->>'naira')::NUMERIC), 0),
         (SELECT m2.value->>'label'
            FROM jsonb_array_elements(v_cfg.daily_milestones) AS m2(value)
           WHERE (m2.value->>'at')::INT = v_prog.watched LIMIT 1)
    INTO v_bonus, v_ms_label
    FROM jsonb_array_elements(v_cfg.daily_milestones) AS m(value)
   WHERE (m.value->>'at')::INT = v_prog.watched;

  IF v_bonus > 0 THEN
    UPDATE public.ad_daily_progress SET earned = earned + v_bonus
     WHERE user_id = v_me AND day = v_today;
  END IF;

  -- ── Streak-qualifying quota cleared on this very ad? ──────────────────────
  IF v_prog.quota_met_at IS NULL AND v_prog.watched >= v_cfg.daily_quota THEN
    v_quota_now := TRUE;

    UPDATE public.ad_daily_progress
       SET quota_met_at = now(), bonus_claimed = TRUE
     WHERE user_id = v_me AND day = v_today;

    -- ── Streak ──────────────────────────────────────────────────────────────
    INSERT INTO public.ad_streaks (user_id) VALUES (v_me)
      ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_streak FROM public.ad_streaks WHERE user_id = v_me FOR UPDATE;

    v_month := date_trunc('month', v_today)::DATE;
    -- Freeze allowance resets each calendar month.
    IF v_streak.freezes_month IS DISTINCT FROM v_month THEN
      UPDATE public.ad_streaks SET freezes_month = v_month, freezes_used = 0
       WHERE user_id = v_me;
      v_streak.freezes_used := 0;
    END IF;

    IF v_streak.last_quota_day = v_today - 1 THEN
      -- Yesterday too: the streak continues.
      v_streak.current_streak := v_streak.current_streak + 1;
    ELSIF v_streak.last_quota_day = v_today THEN
      -- Already counted today; nothing to do.
      NULL;
    ELSIF v_streak.last_quota_day = v_today - 2
          AND v_streak.freezes_used < v_cfg.monthly_streak_freezes THEN
      -- Exactly one day missed, and a freeze is available. Spend it rather than
      -- resetting: a streak that dies on one bad day gets abandoned entirely.
      v_streak.current_streak := v_streak.current_streak + 1;
      UPDATE public.ad_streaks SET freezes_used = freezes_used + 1 WHERE user_id = v_me;
    ELSE
      v_streak.current_streak := 1;
    END IF;

    UPDATE public.ad_streaks
       SET current_streak = v_streak.current_streak,
           longest_streak = GREATEST(longest_streak, v_streak.current_streak),
           last_quota_day = v_today,
           updated_at     = now()
     WHERE user_id = v_me;

    -- Milestone payout, if this streak length has one.
    v_milestone := COALESCE(
      (v_cfg.streak_milestones ->> v_streak.current_streak::TEXT)::NUMERIC, 0);
    IF v_milestone > 0 THEN
      UPDATE public.ad_daily_progress SET earned = earned + v_milestone
       WHERE user_id = v_me AND day = v_today;
    END IF;
  END IF;

  -- Lifetime counters.
  INSERT INTO public.ad_streaks (user_id, total_ads_watched, total_earned)
  VALUES (v_me, 1, v_reward + v_bonus + v_milestone)
  ON CONFLICT (user_id) DO UPDATE
    SET total_ads_watched = public.ad_streaks.total_ads_watched + 1,
        total_earned      = public.ad_streaks.total_earned + v_reward + v_bonus + v_milestone;

  RETURN jsonb_build_object(
    'ok',            TRUE,
    'rewarded',      TRUE,
    'reward',        v_reward,
    'milestone_bonus', v_bonus,
    'milestone_label', v_ms_label,
    'streak_bonus',  v_milestone,
    'total_credited', v_reward + v_bonus + v_milestone,
    'quota_met_now', v_quota_now,
    'watched_today', v_prog.watched,
    'daily_quota',   v_cfg.daily_quota,
    'streak',        COALESCE(v_streak.current_streak, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_ad_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_ad_session(UUID) TO authenticated;


-- Closing the player early. Recorded rather than ignored, because an ad people
-- consistently abandon at four seconds is worth knowing about.
CREATE OR REPLACE FUNCTION public.abandon_ad_session(p_session UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.ad_sessions
     SET status = 'abandoned',
         ended_at = now(),
         watched_ms = (EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::INT,
         no_reward_reason = 'closed_early'
   WHERE id = p_session AND user_id = auth.uid() AND status = 'open';
$$;

REVOKE ALL ON FUNCTION public.abandon_ad_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abandon_ad_session(UUID) TO authenticated;


-- The post-roll carousel. Recorded as a click so the advertiser is billed and
-- so install attribution has something to match against.
CREATE OR REPLACE FUNCTION public.record_ad_click(p_ad UUID, p_session UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN; END IF;
  INSERT INTO public.ad_events (ad_id, user_id, kind) VALUES (p_ad, v_me, 'click');
  IF p_session IS NOT NULL THEN
    UPDATE public.ad_sessions SET clicked = TRUE
     WHERE id = p_session AND user_id = v_me;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ad_click(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_ad_click(UUID, UUID) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- PREFERENCES, SUPPRESSION, REPORTING
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_ad_preferences()
RETURNS public.ad_preferences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_me UUID := auth.uid(); v_row public.ad_preferences;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  INSERT INTO public.ad_preferences (user_id) VALUES (v_me)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_row FROM public.ad_preferences WHERE user_id = v_me;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ad_preferences() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ad_preferences() TO authenticated;


-- Every argument is nullable and NULL means "leave alone", so one screen can
-- flip one switch without having to send the whole object back.
CREATE OR REPLACE FUNCTION public.set_ad_preferences(
  p_personalised     BOOLEAN DEFAULT NULL,
  p_sound_on         BOOLEAN DEFAULT NULL,
  p_wifi_only_video  BOOLEAN DEFAULT NULL,
  p_autoplay_next    BOOLEAN DEFAULT NULL,
  p_reminder_enabled BOOLEAN DEFAULT NULL,
  p_reminder_hour    INT     DEFAULT NULL,
  p_muted_categories TEXT[]  DEFAULT NULL
)
RETURNS public.ad_preferences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_me UUID := auth.uid(); v_row public.ad_preferences;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  INSERT INTO public.ad_preferences (user_id) VALUES (v_me)
    ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.ad_preferences SET
    personalised     = COALESCE(p_personalised, personalised),
    sound_on         = COALESCE(p_sound_on, sound_on),
    wifi_only_video  = COALESCE(p_wifi_only_video, wifi_only_video),
    autoplay_next    = COALESCE(p_autoplay_next, autoplay_next),
    reminder_enabled = COALESCE(p_reminder_enabled, reminder_enabled),
    reminder_hour    = COALESCE(p_reminder_hour, reminder_hour),
    muted_categories = COALESCE(p_muted_categories, muted_categories),
    updated_at       = now()
  WHERE user_id = v_me
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_ad_preferences(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, INT, TEXT[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ad_preferences(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, INT, TEXT[])
  TO authenticated;


-- `p_scope = 'category'` mutes everything like it, not just this one creative.
-- That is the difference between "I have seen this enough" and "stop showing me
-- betting adverts", and conflating them is why hide buttons feel useless.
CREATE OR REPLACE FUNCTION public.suppress_ad(
  p_ad     UUID,
  p_scope  TEXT DEFAULT 'creative',
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_me UUID := auth.uid(); v_cat TEXT;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  INSERT INTO public.ad_suppressions (user_id, ad_id, reason)
  VALUES (v_me, p_ad, p_reason)
  ON CONFLICT (user_id, ad_id) DO UPDATE SET reason = EXCLUDED.reason;

  INSERT INTO public.ad_events (ad_id, user_id, kind) VALUES (p_ad, v_me, 'dismiss');

  IF p_scope = 'category' THEN
    SELECT category INTO v_cat FROM public.ad_creatives WHERE id = p_ad;
    IF v_cat IS NOT NULL THEN
      INSERT INTO public.ad_preferences (user_id, muted_categories)
      VALUES (v_me, ARRAY[v_cat])
      ON CONFLICT (user_id) DO UPDATE
        SET muted_categories = (
          SELECT ARRAY(SELECT DISTINCT unnest(
            public.ad_preferences.muted_categories || ARRAY[v_cat])));
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.suppress_ad(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suppress_ad(UUID, TEXT, TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION public.report_ad(p_ad UUID, p_reason TEXT, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.ad_reports (user_id, ad_id, reason, note)
  VALUES (auth.uid(), p_ad, p_reason, p_note);
$$;

REVOKE ALL ON FUNCTION public.report_ad(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_ad(UUID, TEXT, TEXT) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- HISTORY — the earnings ledger the Rewards screen lists
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.list_ad_history(p_limit INT DEFAULT 30, p_offset INT DEFAULT 0)
RETURNS TABLE (
  id UUID, created_at TIMESTAMPTZ, advertiser_name TEXT, advertiser_logo TEXT,
  headline TEXT, format TEXT, category TEXT,
  watched_ms INT, duration_seconds INT,
  status TEXT, rewarded BOOLEAN, reward_amount NUMERIC, no_reward_reason TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.created_at, c.advertiser_name, c.advertiser_logo,
         c.headline, s.format, c.category,
         s.watched_ms, s.duration_seconds,
         s.status, s.rewarded,
         CASE WHEN s.rewarded THEN s.reward_amount ELSE 0 END,
         s.no_reward_reason
    FROM public.ad_sessions s
    JOIN public.ad_creatives c ON c.id = s.ad_id
   WHERE s.user_id = auth.uid()
   ORDER BY s.created_at DESC
   LIMIT LEAST(p_limit, 100) OFFSET GREATEST(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.list_ad_history(INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_ad_history(INT, INT) TO authenticated;


-- The categories a user can mute, drawn from live inventory rather than a
-- hard-coded list — a muting screen that offers categories nobody advertises in
-- is noise.
CREATE OR REPLACE FUNCTION public.list_ad_categories()
RETURNS TABLE (category TEXT, n BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT category, COUNT(*)
    FROM public.ad_creatives
   WHERE active AND format <> 'feed'
   GROUP BY category
   ORDER BY COUNT(*) DESC;
$$;

REVOKE ALL ON FUNCTION public.list_ad_categories() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_ad_categories() TO authenticated;

COMMIT;
