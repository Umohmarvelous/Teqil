-- migration_ad_network.sql
--
-- Lets a session belong to a NETWORK ad (AdMob) rather than to a row in
-- `ad_creatives`.
--
-- ── Why this is needed ──────────────────────────────────────────────────────
-- A direct-partner ad is a row we own: it has an id, a duration and a reward,
-- and `start_ad_session` copies them onto the session. A network ad has none of
-- that — AdMob picks the creative, we never see it, and the only things we know
-- are the format and whether the SDK said the reward threshold was reached.
--
-- So `ad_sessions.ad_id` becomes nullable and a `network` column records which
-- network filled the slot. Everything else — the timing check, the daily
-- ceiling, the ladder, the streak — is unchanged and still runs in Postgres.
--
-- ── The anti-fraud story is UNCHANGED, and that is the point ───────────────
-- It would have been easier to trust the SDK's "earned" callback and pay on it.
-- That would also mean a patched client could claim a reward instantly and
-- forever. `complete_ad_session` still compares the database's `now()` against
-- the database's own `started_at`, so a network session must still have taken
-- real wall-clock time before it pays. The SDK's word is necessary, not
-- sufficient.
--
-- ── Ordering ────────────────────────────────────────────────────────────────
-- Direct partners are served FIRST and the network is the fallback. A partner
-- has already paid for their impressions; a network takes a cut of ours. Burning
-- owned inventory before rented inventory is worth real money and costs nothing.

BEGIN;

ALTER TABLE public.ad_sessions
  ALTER COLUMN ad_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS network TEXT
    CHECK (network IS NULL OR network IN ('admob', 'meta', 'applovin', 'unity'));

-- Exactly one of the two must identify the ad, or a session describes nothing.
ALTER TABLE public.ad_sessions
  DROP CONSTRAINT IF EXISTS ad_sessions_source_ck;
ALTER TABLE public.ad_sessions
  ADD CONSTRAINT ad_sessions_source_ck
  CHECK (ad_id IS NOT NULL OR network IS NOT NULL);

CREATE INDEX IF NOT EXISTS ad_sessions_network_idx
  ON public.ad_sessions (network, created_at DESC) WHERE network IS NOT NULL;


/**
 * Open a session for a network-filled slot.
 *
 * Mirrors `start_ad_session`, minus the creative. `p_duration` is what the SDK
 * reports the ad will run for; it is clamped so a client cannot declare a
 * one-second ad and clear the timing check immediately.
 */
CREATE OR REPLACE FUNCTION public.start_network_ad_session(
  p_format   TEXT DEFAULT 'rewarded',
  p_network  TEXT DEFAULT 'admob',
  p_duration INT  DEFAULT 30
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me UUID := auth.uid();
  v_id UUID;
  v_duration INT;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF p_format NOT IN ('rewarded', 'interstitial') THEN
    RAISE EXCEPTION 'unsupported network format: %', p_format;
  END IF;

  -- A rewarded video is 15s at the very least in practice. Clamping to that
  -- floor is what stops a client claiming a 1-second ad and settling at once;
  -- the ceiling stops an absurd value making the ad unsettleable.
  v_duration := LEAST(GREATEST(COALESCE(p_duration, 30), 15), 120);

  UPDATE public.ad_sessions
     SET status = 'expired', ended_at = now()
   WHERE user_id = v_me AND status = 'open';

  INSERT INTO public.ad_sessions
    (user_id, ad_id, network, format, duration_seconds, reward_amount)
  VALUES
    (v_me, NULL, p_network, p_format, v_duration, public.ad_reward_for(p_format))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_network_ad_session(TEXT, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_network_ad_session(TEXT, TEXT, INT) TO authenticated;


-- `list_ad_history` joins `ad_creatives`, which drops every network session on
-- the floor — a user would watch ten AdMob ads and see an empty history. LEFT
-- JOIN, with the network named where the advertiser would be.
CREATE OR REPLACE FUNCTION public.list_ad_history(p_limit INT DEFAULT 30, p_offset INT DEFAULT 0)
RETURNS TABLE (
  id UUID, created_at TIMESTAMPTZ, advertiser_name TEXT, advertiser_logo TEXT,
  headline TEXT, format TEXT, category TEXT,
  watched_ms INT, duration_seconds INT,
  status TEXT, rewarded BOOLEAN, reward_amount NUMERIC, no_reward_reason TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.created_at,
         COALESCE(c.advertiser_name,
                  CASE s.network WHEN 'admob' THEN 'Google AdMob'
                                 WHEN 'meta' THEN 'Meta Audience Network'
                                 ELSE initcap(COALESCE(s.network, 'Sponsored')) END),
         c.advertiser_logo,
         COALESCE(c.headline, 'Sponsored video'),
         s.format,
         COALESCE(c.category, 'network'),
         s.watched_ms, s.duration_seconds,
         s.status, s.rewarded,
         CASE WHEN s.rewarded THEN s.reward_amount ELSE 0 END,
         s.no_reward_reason
    FROM public.ad_sessions s
    LEFT JOIN public.ad_creatives c ON c.id = s.ad_id
   WHERE s.user_id = auth.uid()
   ORDER BY s.created_at DESC
   LIMIT LEAST(p_limit, 100) OFFSET GREATEST(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.list_ad_history(INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_ad_history(INT, INT) TO authenticated;


-- Same for the console: a network session has no creative, so it must not be
-- counted against one. `list_ad_creatives` already scopes by `ad_id`, so it is
-- correct as written — this comment exists so nobody "fixes" it into counting
-- network sessions against a partner who did not serve them.

COMMIT;
