-- migration_ad_partners.sql
--
-- How an ad partner's creatives get into EMILGO.
--
-- ── The problem this solves ─────────────────────────────────────────────────
-- `migration_ad_rewards.sql` built the whole rewarded-ads machine: an auction,
-- targeting, frequency caps, anti-fraud, payouts, a streak. It serves from
-- `ad_creatives`. That table is EMPTY, so "Watch ads" correctly reports
-- `no_inventory` and the feature looks broken even though it works.
--
-- Filling it needs a person, not code, and there are exactly two honest routes:
--
--   1. DIRECT PARTNERS — you sell a slot to an advertiser and enter their
--      creative. Best rates, no revenue share, but it needs a sales motion and
--      somewhere to enter the row. That is what this migration adds.
--   2. AN AD NETWORK — AdMob, Meta Audience Network. Inventory arrives without
--      any sales effort and fills instantly, but the network takes a cut, needs
--      native SDK config and an approved account, and the creative is chosen by
--      them rather than by you. See SETUP-KEYS.md §6.
--
-- Most apps run both: the network as a floor, direct partners on top. Nothing
-- here forecloses adding a network later — a network ad is just another row
-- whose `media_url` happens to come from an SDK.
--
-- ── Why an admin flag rather than a separate dashboard ─────────────────────
-- A web dashboard is another deployment, another auth system and another thing
-- to secure, for a table that will hold tens of rows. An in-app console behind
-- a role flag is proportionate. The flag is on `public.users`, cannot be set by
-- a client, and is checked in the database rather than in the app — a client
-- that lies about being an admin still gets refused by RLS.

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- ADMIN FLAG
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- SECURITY DEFINER so it can read `users` regardless of the caller's own RLS,
-- and so policies can call it without recursing into the policy that protects
-- the row it is reading.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT u.is_admin FROM public.users u WHERE u.id = auth.uid()), FALSE);
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- The flag must never be self-grantable. `users` policies elsewhere allow a user
-- to update their own row, which would otherwise let anyone make themselves an
-- admin with one PATCH. This trigger refuses any change to the column that does
-- not come from the service role.
-- SECURITY INVOKER, deliberately, and this is the whole point of the function.
--
-- As SECURITY DEFINER it ran as the table owner, so `current_user` inside it was
-- `postgres` — never 'authenticated' — and the guard never fired. A user could
-- PATCH their own row and become an admin. The recursion fixed in
-- migration_fix_rls_recursion.sql had been masking it: the UPDATE was failing
-- for an unrelated reason, so the test asserting "user cannot self-grant admin"
-- passed while the hole was wide open.
--
-- Invoker rights mean `current_user` is the role PostgREST actually connected
-- as, which is the only thing that distinguishes a client from the server.
CREATE OR REPLACE FUNCTION public.guard_is_admin()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  -- Keyed off the DATABASE ROLE, not the JWT claims.
  --
  -- The claims are a transaction-local setting that outlives `RESET ROLE`, so a
  -- first attempt at this test keyed off them and blocked the service role
  -- itself the moment it ran in a session that had ever impersonated a user.
  -- `current_user` is what actually decides privilege: PostgREST connects as
  -- `authenticated` or `anon` for a client request, and as `service_role` (or
  -- postgres, for a migration) otherwise.
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     AND current_user IN ('authenticated', 'anon')
  THEN
    RAISE EXCEPTION 'is_admin cannot be changed from a client';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_is_admin ON public.users;
CREATE TRIGGER users_guard_is_admin
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_is_admin();


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTNERS
-- ═════════════════════════════════════════════════════════════════════════════

-- One row per advertiser, so several creatives share a name, a logo, a contact
-- and a budget rather than repeating them per creative.
CREATE TABLE IF NOT EXISTS public.ad_partners (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  handle         TEXT,
  logo_url       TEXT,
  contact_email  TEXT,
  contact_phone  TEXT,
  -- What they have paid in, in naira. Serving stops when spend reaches it.
  budget_naira   NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- What each impression bills the partner. This is the REVENUE side; what the
  -- user earns is `ad_reward_config`. The gap between them is the margin, and
  -- keeping them in separate tables is what stops one being silently tied to
  -- the other.
  cpm_naira      NUMERIC(10,2) NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_creatives
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.ad_partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ad_creatives_partner_idx ON public.ad_creatives (partner_id);

ALTER TABLE public.ad_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ad_partners_admin ON public.ad_partners;
CREATE POLICY ad_partners_admin ON public.ad_partners
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());


-- ═════════════════════════════════════════════════════════════════════════════
-- CREATIVE MANAGEMENT
-- ═════════════════════════════════════════════════════════════════════════════

-- Serving reads `ad_creatives` through SECURITY DEFINER functions, so the table
-- itself needs no read policy for ordinary users. Admins get full access so the
-- console can list and edit.
ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ad_creatives_admin ON public.ad_creatives;
CREATE POLICY ad_creatives_admin ON public.ad_creatives
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());


/**
 * Create or update one creative.
 *
 * A single upsert rather than separate create/update RPCs: the console edits a
 * form and saves it, and having one entry point means the validation below
 * cannot be bypassed by calling the "other" one.
 */
CREATE OR REPLACE FUNCTION public.upsert_ad_creative(
  p_id               UUID    DEFAULT NULL,
  p_partner          UUID    DEFAULT NULL,
  p_advertiser_name  TEXT    DEFAULT NULL,
  p_headline         TEXT    DEFAULT NULL,
  p_body             TEXT    DEFAULT '',
  p_media_url        TEXT    DEFAULT NULL,
  p_media_type       TEXT    DEFAULT NULL,
  p_cta_label        TEXT    DEFAULT 'Learn more',
  p_cta_url          TEXT    DEFAULT NULL,
  p_format           TEXT    DEFAULT 'rewarded',
  p_duration_seconds INT     DEFAULT 15,
  p_skip_after       INT     DEFAULT NULL,
  p_category         TEXT    DEFAULT 'general',
  p_target_roles     TEXT[]  DEFAULT '{}',
  p_weight           INT     DEFAULT 1,
  p_daily_cap        INT     DEFAULT NULL,
  p_active           BOOLEAN DEFAULT TRUE,
  p_ends_at          TIMESTAMPTZ DEFAULT NULL,
  p_app_name         TEXT    DEFAULT NULL,
  p_app_icon         TEXT    DEFAULT NULL,
  p_app_rating       NUMERIC DEFAULT NULL,
  p_app_installs     TEXT    DEFAULT NULL,
  p_app_store_url    TEXT    DEFAULT NULL,
  p_play_store_url   TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- A creative with no destination is an advert that cannot be clicked, and a
  -- rewarded one with no media is a blank screen someone is paid to stare at.
  IF COALESCE(btrim(p_headline), '') = '' THEN
    RAISE EXCEPTION 'a headline is required';
  END IF;
  IF COALESCE(btrim(p_cta_url), '') = '' THEN
    RAISE EXCEPTION 'a destination URL is required';
  END IF;
  IF p_format IN ('rewarded', 'interstitial') AND COALESCE(btrim(p_media_url), '') = '' THEN
    RAISE EXCEPTION 'a % ad needs media', p_format;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.ad_creatives (
      partner_id, advertiser_name, advertiser_handle, advertiser_logo,
      headline, body, media_url, media_type, cta_label, cta_url,
      format, duration_seconds, skip_after_seconds, category,
      target_roles, weight, daily_cap, active, ends_at,
      app_name, app_icon, app_rating, app_installs, app_store_url, play_store_url
    )
    SELECT
      p_partner,
      COALESCE(p_advertiser_name, pt.name, 'Advertiser'),
      pt.handle, pt.logo_url,
      p_headline, COALESCE(p_body, ''), p_media_url, p_media_type,
      COALESCE(p_cta_label, 'Learn more'), p_cta_url,
      p_format, p_duration_seconds, p_skip_after, p_category,
      COALESCE(p_target_roles, '{}'), GREATEST(COALESCE(p_weight, 1), 1),
      p_daily_cap, COALESCE(p_active, TRUE), p_ends_at,
      p_app_name, p_app_icon, p_app_rating, p_app_installs,
      p_app_store_url, p_play_store_url
    FROM (SELECT 1) AS one
    LEFT JOIN public.ad_partners pt ON pt.id = p_partner
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ad_creatives SET
      partner_id         = COALESCE(p_partner, partner_id),
      advertiser_name    = COALESCE(p_advertiser_name, advertiser_name),
      headline           = p_headline,
      body               = COALESCE(p_body, ''),
      media_url          = p_media_url,
      media_type         = p_media_type,
      cta_label          = COALESCE(p_cta_label, 'Learn more'),
      cta_url            = p_cta_url,
      format             = p_format,
      duration_seconds   = p_duration_seconds,
      skip_after_seconds = p_skip_after,
      category           = p_category,
      target_roles       = COALESCE(p_target_roles, '{}'),
      weight             = GREATEST(COALESCE(p_weight, 1), 1),
      daily_cap          = p_daily_cap,
      active             = COALESCE(p_active, TRUE),
      ends_at            = p_ends_at,
      app_name           = p_app_name,
      app_icon           = p_app_icon,
      app_rating         = p_app_rating,
      app_installs       = p_app_installs,
      app_store_url      = p_app_store_url,
      play_store_url     = p_play_store_url
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_ad_creative FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_ad_creative TO authenticated;


/**
 * The console's list: every creative with its live performance.
 *
 * Impressions and clicks come from `ad_events`, which is the same table billing
 * reads, so the number an advertiser is quoted and the number shown here cannot
 * drift apart.
 */
CREATE OR REPLACE FUNCTION public.list_ad_creatives(p_include_inactive BOOLEAN DEFAULT TRUE)
RETURNS TABLE (
  id UUID, partner_id UUID, partner_name TEXT,
  advertiser_name TEXT, headline TEXT, body TEXT,
  media_url TEXT, media_type TEXT, cta_label TEXT, cta_url TEXT,
  format TEXT, category TEXT, duration_seconds INT, skip_after_seconds INT,
  target_roles TEXT[], weight INT, daily_cap INT, active BOOLEAN,
  starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
  app_name TEXT, app_icon TEXT, app_rating NUMERIC,
  app_installs TEXT, app_store_url TEXT, play_store_url TEXT,
  impressions BIGINT, clicks BIGINT, completions BIGINT, spend_naira NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT c.id, c.partner_id, pt.name,
         c.advertiser_name, c.headline, c.body,
         c.media_url, c.media_type, c.cta_label, c.cta_url,
         c.format, c.category, c.duration_seconds, c.skip_after_seconds,
         c.target_roles, c.weight, c.daily_cap, c.active,
         c.starts_at, c.ends_at,
         c.app_name, c.app_icon, c.app_rating,
         c.app_installs, c.app_store_url, c.play_store_url,
         COALESCE(ev.impressions, 0),
         COALESCE(ev.clicks, 0),
         COALESCE(se.completions, 0),
         ROUND(COALESCE(ev.impressions, 0) * COALESCE(pt.cpm_naira, 0) / 1000.0, 2)
    FROM public.ad_creatives c
    LEFT JOIN public.ad_partners pt ON pt.id = c.partner_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE kind = 'impression') AS impressions,
             COUNT(*) FILTER (WHERE kind = 'click')      AS clicks
        FROM public.ad_events e WHERE e.ad_id = c.id
    ) ev ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS completions
        FROM public.ad_sessions s WHERE s.ad_id = c.id AND s.status = 'completed'
    ) se ON TRUE
   WHERE p_include_inactive OR c.active
   ORDER BY c.active DESC, c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_ad_creatives(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_ad_creatives(BOOLEAN) TO authenticated;


CREATE OR REPLACE FUNCTION public.set_ad_creative_active(p_id UUID, p_active BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  UPDATE public.ad_creatives SET active = p_active WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_ad_creative_active(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ad_creative_active(UUID, BOOLEAN) TO authenticated;


CREATE OR REPLACE FUNCTION public.upsert_ad_partner(
  p_id     UUID DEFAULT NULL,
  p_name   TEXT DEFAULT NULL,
  p_handle TEXT DEFAULT NULL,
  p_logo   TEXT DEFAULT NULL,
  p_email  TEXT DEFAULT NULL,
  p_phone  TEXT DEFAULT NULL,
  p_budget NUMERIC DEFAULT 0,
  p_cpm    NUMERIC DEFAULT 0,
  p_active BOOLEAN DEFAULT TRUE,
  p_notes  TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  IF COALESCE(btrim(p_name), '') = '' THEN RAISE EXCEPTION 'a partner name is required'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.ad_partners (name, handle, logo_url, contact_email, contact_phone,
                                    budget_naira, cpm_naira, active, notes)
    VALUES (p_name, p_handle, p_logo, p_email, p_phone,
            COALESCE(p_budget, 0), COALESCE(p_cpm, 0), COALESCE(p_active, TRUE), p_notes)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ad_partners SET
      name = p_name, handle = p_handle, logo_url = p_logo,
      contact_email = p_email, contact_phone = p_phone,
      budget_naira = COALESCE(p_budget, budget_naira),
      cpm_naira = COALESCE(p_cpm, cpm_naira),
      active = COALESCE(p_active, active), notes = p_notes
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_ad_partner FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_ad_partner TO authenticated;


CREATE OR REPLACE FUNCTION public.list_ad_partners()
RETURNS TABLE (
  id UUID, name TEXT, handle TEXT, logo_url TEXT,
  contact_email TEXT, contact_phone TEXT,
  budget_naira NUMERIC, cpm_naira NUMERIC, active BOOLEAN, notes TEXT,
  creatives BIGINT, impressions BIGINT, spend_naira NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.handle, p.logo_url,
         p.contact_email, p.contact_phone,
         p.budget_naira, p.cpm_naira, p.active, p.notes,
         COALESCE(agg.creatives, 0),
         COALESCE(agg.impressions, 0),
         ROUND(COALESCE(agg.impressions, 0) * p.cpm_naira / 1000.0, 2)
    FROM public.ad_partners p
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT c.id) AS creatives,
             COUNT(e.id) FILTER (WHERE e.kind = 'impression') AS impressions
        FROM public.ad_creatives c
        LEFT JOIN public.ad_events e ON e.ad_id = c.id
       WHERE c.partner_id = p.id
    ) agg ON TRUE
   ORDER BY p.active DESC, p.name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_ad_partners() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_ad_partners() TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- BUDGET ENFORCEMENT
-- ═════════════════════════════════════════════════════════════════════════════

-- A partner whose spend has reached their budget stops being served. Without
-- this, serving would keep billing past what they paid for, which is the fastest
-- way to lose an advertiser.
CREATE OR REPLACE FUNCTION public.partner_has_budget(p_partner UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_partner IS NULL THEN TRUE          -- house ad, nothing to bill
    ELSE COALESCE((
      SELECT p.active
             AND (p.budget_naira <= 0         -- 0 means uncapped
                  OR p.budget_naira > (
                    SELECT COUNT(*) * p.cpm_naira / 1000.0
                      FROM public.ad_events e
                      JOIN public.ad_creatives c ON c.id = e.ad_id
                     WHERE c.partner_id = p.id AND e.kind = 'impression'
                  ))
        FROM public.ad_partners p WHERE p.id = p_partner
    ), FALSE)
  END;
$$;

REVOKE ALL ON FUNCTION public.partner_has_budget(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_has_budget(UUID) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- SERVING, WITH BUDGETS
-- ═════════════════════════════════════════════════════════════════════════════

-- `next_ad` is redefined here rather than edited in migration_ad_rewards.sql so
-- that migration stays applicable on its own. The only change is the added
-- `partner_has_budget` predicate: a partner who has spent their budget stops
-- being served, and a house ad (no partner) is always in budget.
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
     AND public.partner_has_budget(c.partner_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.ad_suppressions s
        WHERE s.user_id = v_me AND s.ad_id = c.id)
     AND NOT (c.category = ANY (COALESCE(v_prefs.muted_categories, '{}')))
     AND (
       SELECT COUNT(*) FROM public.ad_sessions s
        WHERE s.user_id = v_me AND s.ad_id = c.id
          AND (s.created_at AT TIME ZONE 'Africa/Lagos')::DATE = v_today
     ) < v_cfg.per_creative_daily_cap
     AND (
       cardinality(c.target_roles) = 0
       OR EXISTS (
         SELECT 1 FROM public.users u
          WHERE u.id = v_me AND u.role::TEXT = ANY (c.target_roles))
     )
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

COMMIT;
