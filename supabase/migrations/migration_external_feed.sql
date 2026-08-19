-- migration_external_feed.sql
--
-- Real outside content in the For You feed.
--
-- ── What is actually possible, stated plainly ───────────────────────────────
-- The brief was "fetch posts from Reddit, Twitter, Instagram, Facebook". Three
-- of those four cannot be done, and it is worth writing down why so nobody
-- spends a week rediscovering it:
--
--   • TWITTER/X  — reading timelines needs a paid tier. There has been no free
--                  read access since 2023. Basic is ~$100/month for 10k tweets.
--   • INSTAGRAM  — the Graph API returns only media belonging to a business
--                  account YOU own and have connected. There is no endpoint for
--                  "posts from Instagram" in general. Scraping is a ToS breach
--                  and gets the app's IPs blocked.
--   • FACEBOOK   — same shape: Pages API, your own Pages only.
--   • REDDIT     — free, but the old `.json` endpoint now returns 403 to
--                  datacenter traffic. It needs a registered OAuth app (free,
--                  about two minutes). Supported here; see SETUP-KEYS.
--
-- What works today with NO credentials at all is RSS, and every major Nigerian
-- newsroom publishes one. That is what this ships with, and it is genuinely
-- better content for this audience than a generic Twitter firehose: Punch,
-- Vanguard, Premium Times and Nairametrics all carry fuel, transport and road
-- news that a driver or passenger actually wants.
--
-- ── Why a separate table and not `posts` ───────────────────────────────────
-- An ingested article is not a post somebody here wrote, and putting it in
-- `posts` would mean inventing an author. Every row here carries its real
-- source and links out to it. Users can bookmark and share them; they cannot
-- reply to them, because a reply would have to go back to Reddit or to a
-- newspaper, and it cannot.

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- SOURCES — an allowlist, managed by an admin
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.feed_sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL CHECK (kind IN ('rss', 'reddit')),
  name         TEXT NOT NULL,
  -- An RSS feed URL, or a subreddit name for `reddit`.
  url          TEXT NOT NULL UNIQUE,
  icon_url     TEXT,
  category     TEXT NOT NULL DEFAULT 'news',
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  -- Higher sorts sooner when two items land in the same minute.
  weight       INTEGER NOT NULL DEFAULT 1,
  last_fetched TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feed_sources ENABLE ROW LEVEL SECURITY;

-- Readable by anyone signed in — the client needs the list to know what to
-- fetch. Writable only by an admin, which is what makes it an ALLOWLIST: a
-- client cannot introduce a source and then ingest whatever it likes.
DROP POLICY IF EXISTS feed_sources_read ON public.feed_sources;
CREATE POLICY feed_sources_read ON public.feed_sources
  FOR SELECT TO authenticated USING (active);

DROP POLICY IF EXISTS feed_sources_admin ON public.feed_sources;
CREATE POLICY feed_sources_admin ON public.feed_sources
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());


-- ═════════════════════════════════════════════════════════════════════════════
-- ITEMS
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.external_posts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id    UUID NOT NULL REFERENCES public.feed_sources(id) ON DELETE CASCADE,
  -- The canonical link. UNIQUE is the entire deduplication strategy: every
  -- device ingesting the same feed converges on one row instead of N copies.
  url          TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  image_url    TEXT,
  author       TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  ingested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Counters, maintained by triggers exactly like `posts`.
  bookmark_count INTEGER NOT NULL DEFAULT 0,
  view_count     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS external_posts_timeline_idx
  ON public.external_posts (published_at DESC);

ALTER TABLE public.external_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS external_posts_read ON public.external_posts;
CREATE POLICY external_posts_read ON public.external_posts
  FOR SELECT TO authenticated USING (TRUE);


-- Saving an outside article works the same as saving a post.
CREATE TABLE IF NOT EXISTS public.external_bookmarks (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_id UUID NOT NULL REFERENCES public.external_posts(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, external_id)
);

ALTER TABLE public.external_bookmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_bookmarks_own ON public.external_bookmarks;
CREATE POLICY external_bookmarks_own ON public.external_bookmarks
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.external_maintain_bookmarks()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.external_posts SET bookmark_count = bookmark_count + 1
     WHERE id = NEW.external_id;
  ELSE
    UPDATE public.external_posts SET bookmark_count = GREATEST(0, bookmark_count - 1)
     WHERE id = OLD.external_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS external_bookmarks_count ON public.external_bookmarks;
CREATE TRIGGER external_bookmarks_count
  AFTER INSERT OR DELETE ON public.external_bookmarks
  FOR EACH ROW EXECUTE FUNCTION public.external_maintain_bookmarks();


-- ═════════════════════════════════════════════════════════════════════════════
-- INGEST
-- ═════════════════════════════════════════════════════════════════════════════

/**
 * Take a batch of items parsed on the device and store the new ones.
 *
 * ── Why a client may write here at all ────────────────────────────────────
 * There is no cron and no server worker, so the fetch happens on a phone during
 * pull-to-refresh. That is only safe because `p_source` must already be in the
 * admin-managed allowlist: a client cannot invent a source, so the worst it can
 * do is submit rubbish attributed to a source that is already trusted. The
 * UNIQUE url makes the write idempotent, so a hundred phones refreshing at once
 * produce one row each, not a hundred.
 *
 * Moving this to a scheduled Edge Function later changes nothing above the RPC.
 */
CREATE OR REPLACE FUNCTION public.ingest_external_posts(
  p_source UUID,
  p_items  JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_item  JSONB;
  v_added INTEGER := 0;
  v_ok    BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  SELECT active INTO v_ok FROM public.feed_sources WHERE id = p_source;
  IF NOT COALESCE(v_ok, FALSE) THEN
    RAISE EXCEPTION 'unknown or inactive source';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::JSONB))
  LOOP
    CONTINUE WHEN COALESCE(btrim(v_item ->> 'url'), '') = ''
              OR COALESCE(btrim(v_item ->> 'title'), '') = '';

    -- Anything dated in the future would sit permanently at the top of a
    -- reverse-chronological feed, and some newsroom feeds do publish ahead.
    INSERT INTO public.external_posts
      (source_id, url, title, summary, image_url, author, published_at)
    VALUES (
      p_source,
      btrim(v_item ->> 'url'),
      left(btrim(v_item ->> 'title'), 300),
      left(COALESCE(v_item ->> 'summary', ''), 600),
      NULLIF(btrim(COALESCE(v_item ->> 'image', '')), ''),
      NULLIF(btrim(COALESCE(v_item ->> 'author', '')), ''),
      LEAST(COALESCE((v_item ->> 'published')::TIMESTAMPTZ, now()), now())
    )
    ON CONFLICT (url) DO NOTHING;

    IF FOUND THEN v_added := v_added + 1; END IF;
  END LOOP;

  UPDATE public.feed_sources SET last_fetched = now() WHERE id = p_source;
  RETURN v_added;
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_external_posts(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingest_external_posts(UUID, JSONB) TO authenticated;


CREATE OR REPLACE FUNCTION public.list_external_posts(
  p_limit  INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID, url TEXT, title TEXT, summary TEXT, image_url TEXT,
  author TEXT, published_at TIMESTAMPTZ,
  source_name TEXT, source_icon TEXT, source_kind TEXT, category TEXT,
  bookmark_count INTEGER, viewer_bookmarked BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT e.id, e.url, e.title, e.summary, e.image_url,
         e.author, e.published_at,
         s.name, s.icon_url, s.kind, s.category,
         e.bookmark_count,
         EXISTS (SELECT 1 FROM public.external_bookmarks b
                  WHERE b.external_id = e.id AND b.user_id = auth.uid())
    FROM public.external_posts e
    JOIN public.feed_sources s ON s.id = e.source_id
   WHERE s.active
   ORDER BY e.published_at DESC
   LIMIT LEAST(p_limit, 50) OFFSET GREATEST(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.list_external_posts(INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_external_posts(INT, INT) TO authenticated;


CREATE OR REPLACE FUNCTION public.toggle_external_bookmark(p_id UUID)
RETURNS TABLE (bookmarked BOOLEAN, n INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_me UUID := auth.uid(); v_on BOOLEAN;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  DELETE FROM public.external_bookmarks
   WHERE user_id = v_me AND external_id = p_id;

  IF FOUND THEN
    v_on := FALSE;
  ELSE
    INSERT INTO public.external_bookmarks (user_id, external_id) VALUES (v_me, p_id);
    v_on := TRUE;
  END IF;

  RETURN QUERY
    SELECT v_on, e.bookmark_count FROM public.external_posts e WHERE e.id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_external_bookmark(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_external_bookmark(UUID) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- SEED — real, working, credential-free sources
-- ═════════════════════════════════════════════════════════════════════════════
--
-- These are not placeholders. Each was fetched and confirmed to return HTTP 200
-- with real items while writing this migration, and each carries fuel,
-- transport and economy coverage relevant to a Nigerian road-transport
-- audience. They need no API key of any kind.
--
-- Punch is deliberately listed on its canonical https://punchng.com/feed/ — the
-- www host 301-redirects, and not every RSS client follows redirects.

INSERT INTO public.feed_sources (kind, name, url, category, weight) VALUES
  ('rss', 'Premium Times', 'https://www.premiumtimesng.com/feed',  'news',    3),
  ('rss', 'Vanguard',      'https://www.vanguardngr.com/feed/',    'news',    2),
  ('rss', 'Nairametrics',  'https://nairametrics.com/feed/',       'economy', 3),
  ('rss', 'Punch',         'https://punchng.com/feed/',            'news',    2)
ON CONFLICT (url) DO NOTHING;

COMMIT;
