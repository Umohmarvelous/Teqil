-- ═════════════════════════════════════════════════════════════════════════════
-- EMILGO / Teqil — the social feed (posts, replies, reposts, bookmarks, ads)
--
-- Run ONCE in Supabase → SQL Editor → Run, or via scripts/db.mjs. Idempotent
-- EXCEPT for the composite type at the top, which is dropped and recreated with
-- CASCADE on every run — that is deliberate, see the note there.
--
-- ── What this replaces ───────────────────────────────────────────────────────
-- app/(main)/feed.tsx used to GET /api/feed on the Express server. That route
-- does not exist (server/routes.ts has exactly two: /api/health and
-- /api/webhooks/scan-success), so the screen has always rendered "No articles
-- yet". This migration gives the feed something real to read.
--
-- ── Shape of the thing ───────────────────────────────────────────────────────
-- One table, `posts`, carries four different objects, distinguished by which
-- foreign key is set. This is Twitter's model and it is the right one, because
-- all four need identical counters, moderation, and ranking:
--
--   reply_to  set → a reply. Threads are the transitive closure of reply_to.
--   repost_of set → a bare repost. Body is empty; the UI renders the target.
--   quote_of  set → a quote post. Body is the commentary.
--   all null      → a top-level post.
--
-- A separate `reposts` table would need its own counters, its own ranking, and
-- its own union in every feed query, all to express a row that is already a post
-- with one column set.
--
-- ── Why counters are columns and not COUNT(*) ────────────────────────────────
-- Same reasoning as migration_follows.sql: every rendered card needs five
-- counts, and the posts people open most are exactly the ones where COUNT(*) is
-- most expensive. Triggers are the only writer, so they cannot drift the way
-- application-maintained counters do.
--
-- ── Why the reads are RPCs and not selects ───────────────────────────────────
-- `users` is not cross-readable — RLS lets each account read only its own row.
-- A feed is made almost entirely of OTHER people's rows, so hydration has to
-- happen inside SECURITY DEFINER functions that return only display-safe fields.
-- Never phone, email, payout or KYC data. (get_driver_public established this.)
--
-- ── No seed data ─────────────────────────────────────────────────────────────
-- Nothing here inserts a sample post or a sample advertiser. An empty feed is
-- the correct state for a product with no users yet; a fake one lies about it.
-- To add a real advertiser see the INSERT template at the bottom of this file.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─── The row every feed RPC returns ──────────────────────────────────────────
--
-- Six functions return post rows. Repeating a 33-column RETURNS TABLE in each
-- one is how those six drift apart. A composite type states it once.
--
-- DROP ... CASCADE removes every function that returns it, and this file
-- recreates all of them below — so re-running the migration is safe. It is the
-- only non-idempotent statement here, and it has to be, because a composite type
-- cannot be altered while functions depend on it.

DROP TYPE IF EXISTS public.feed_post_row CASCADE;

CREATE TYPE public.feed_post_row AS (
  id                    UUID,
  author_id             UUID,
  author_name           TEXT,
  author_username       TEXT,
  author_photo          TEXT,
  author_role           TEXT,
  author_rating         DOUBLE PRECISION,
  author_follower_count INTEGER,
  viewer_follows_author BOOLEAN,
  body                  TEXT,
  media                 JSONB,
  place                 TEXT,
  hashtags              TEXT[],
  reply_to              UUID,
  reply_to_username     TEXT,
  quote_of              UUID,
  quoted                JSONB,
  poll                  JSONB,
  like_count            INTEGER,
  reply_count           INTEGER,
  repost_count          INTEGER,
  bookmark_count        INTEGER,
  view_count            INTEGER,
  viewer_liked          BOOLEAN,
  viewer_bookmarked     BOOLEAN,
  viewer_reposted       BOOLEAN,
  reposter_id           UUID,
  reposter_name         TEXT,
  created_at            TIMESTAMPTZ,
  edited_at             TIMESTAMPTZ,
  is_own                BOOLEAN
);


-- ═════════════════════════════════════════════════════════════════════════════
-- TABLES
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.posts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body           TEXT NOT NULL DEFAULT '',
  -- [{ type:'image'|'video', url, thumb, width, height, duration, alt }]
  media          JSONB NOT NULL DEFAULT '[]'::JSONB,
  reply_to       UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  -- Denormalised thread root, so loading a conversation is one indexed read
  -- instead of walking reply_to upward once per level.
  root_id        UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  quote_of       UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  repost_of      UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  visibility     TEXT NOT NULL DEFAULT 'public'
                   CHECK (visibility IN ('public', 'followers')),
  place          TEXT,
  hashtags       TEXT[] NOT NULL DEFAULT '{}',
  mentions       UUID[] NOT NULL DEFAULT '{}',
  like_count     INTEGER NOT NULL DEFAULT 0,
  reply_count    INTEGER NOT NULL DEFAULT 0,
  repost_count   INTEGER NOT NULL DEFAULT 0,
  bookmark_count INTEGER NOT NULL DEFAULT 0,
  view_count     INTEGER NOT NULL DEFAULT 0,
  -- Soft delete: a hard DELETE would cascade away every reply in the thread,
  -- which reads to everyone else as though their own words were censored.
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at      TIMESTAMPTZ,
  -- A post is exactly one of: post, reply, quote, repost.
  CONSTRAINT posts_one_relation CHECK (
    (CASE WHEN reply_to  IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN quote_of  IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN repost_of IS NULL THEN 0 ELSE 1 END) <= 1
  ),
  -- A bare repost carries no words of its own; that is what makes it bare.
  CONSTRAINT posts_repost_is_empty CHECK (repost_of IS NULL OR body = ''),
  -- Everything else must say or show something.
  CONSTRAINT posts_not_empty CHECK (
    repost_of IS NOT NULL OR body <> '' OR jsonb_array_length(media) > 0
  )
);

-- The chronological feed and every profile grid.
CREATE INDEX IF NOT EXISTS posts_author_idx
  ON public.posts (author_id, created_at DESC) WHERE deleted_at IS NULL;

-- Top-level timeline scan, which is what both feeds start from.
CREATE INDEX IF NOT EXISTS posts_timeline_idx
  ON public.posts (created_at DESC)
  WHERE deleted_at IS NULL AND reply_to IS NULL;

-- Thread load: every reply in a conversation, oldest first.
CREATE INDEX IF NOT EXISTS posts_root_idx
  ON public.posts (root_id, created_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS posts_reply_to_idx
  ON public.posts (reply_to, created_at) WHERE deleted_at IS NULL;

-- "Have I reposted this" and the repost fan-out.
CREATE INDEX IF NOT EXISTS posts_repost_of_idx
  ON public.posts (repost_of, author_id) WHERE deleted_at IS NULL;

-- Hashtag search and the trending roll-up.
CREATE INDEX IF NOT EXISTS posts_hashtags_idx
  ON public.posts USING GIN (hashtags);

-- Full-text search over post bodies.
CREATE INDEX IF NOT EXISTS posts_body_fts_idx
  ON public.posts USING GIN (to_tsvector('english', body));


-- One row per (post, user). The pair is the identity of a like, so it is the
-- primary key — same argument as follows.
CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_likes_user_idx
  ON public.post_likes (user_id, created_at DESC);


CREATE TABLE IF NOT EXISTS public.post_bookmarks (
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Free-text folder. Empty string is the default "Saved" collection.
  collection TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_bookmarks_user_idx
  ON public.post_bookmarks (user_id, created_at DESC);


-- Views are counted once per person, not once per scroll past. A PK on the pair
-- makes the insert idempotent, so the client can fire and forget.
CREATE TABLE IF NOT EXISTS public.post_views (
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);


-- "Not interested" / "hide this". Feeds the ranker as a negative signal.
CREATE TABLE IF NOT EXISTS public.post_hidden (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);


CREATE TABLE IF NOT EXISTS public.post_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'reviewed', 'actioned', 'dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One report per person per post. Repeat reports are noise, not signal.
  UNIQUE (post_id, reporter_id)
);


-- Blocking is mutual invisibility; muting is one-way silence. They are separate
-- tables because they answer different questions and only blocking is symmetric.
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS public.user_mutes (
  muter_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (muter_id, muted_id),
  CONSTRAINT user_mutes_no_self CHECK (muter_id <> muted_id)
);


-- Polls hang off a post rather than living in `media`, because votes are rows
-- that need their own uniqueness constraint and jsonb cannot enforce one.
CREATE TABLE IF NOT EXISTS public.post_polls (
  post_id  UUID PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  options  TEXT[] NOT NULL,
  ends_at  TIMESTAMPTZ NOT NULL,
  CONSTRAINT post_polls_size CHECK (
    array_length(options, 1) BETWEEN 2 AND 4
  )
);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  post_id    UUID NOT NULL REFERENCES public.post_polls(post_id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  choice     SMALLINT NOT NULL CHECK (choice >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One vote per person; the PK makes changing your mind an UPDATE, not a
  -- second ballot.
  PRIMARY KEY (post_id, user_id)
);


-- ─── Notifications ───────────────────────────────────────────────────────────
--
-- src/store/useNotificationsStore.ts synthesises notifications from local
-- conversations. That works for chat and cannot work for likes and follows,
-- which happen on someone else's device. This table is the server-side source.

CREATE TABLE IF NOT EXISTS public.social_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN
               ('like', 'reply', 'repost', 'quote', 'follow', 'mention')),
  post_id    UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Like → unlike → like must not produce three notifications. The unique key
-- turns a repeat into an UPDATE of created_at (see the trigger).
CREATE UNIQUE INDEX IF NOT EXISTS social_notifications_dedupe_idx
  ON public.social_notifications (user_id, actor_id, kind, COALESCE(post_id, user_id));

CREATE INDEX IF NOT EXISTS social_notifications_inbox_idx
  ON public.social_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS social_notifications_unread_idx
  ON public.social_notifications (user_id) WHERE read_at IS NULL;


-- ─── Advertising ─────────────────────────────────────────────────────────────
--
-- Promoted units sit inline in the feed. Creatives are inserted by whoever sells
-- the ad — never by the app, and never by this migration.

CREATE TABLE IF NOT EXISTS public.ad_creatives (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_name   TEXT NOT NULL,
  advertiser_handle TEXT,
  advertiser_logo   TEXT,
  headline          TEXT NOT NULL,
  body              TEXT NOT NULL DEFAULT '',
  media_url         TEXT,
  media_type        TEXT CHECK (media_type IN ('image', 'video')),
  cta_label         TEXT NOT NULL DEFAULT 'Learn more',
  cta_url           TEXT NOT NULL,
  -- Empty array means "everyone". Otherwise: driver / passenger / park_owner.
  target_roles      TEXT[] NOT NULL DEFAULT '{}',
  target_states     TEXT[] NOT NULL DEFAULT '{}',
  -- Higher weight wins more auctions. Ties broken randomly.
  weight            INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  daily_cap         INTEGER,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_creatives_live_idx
  ON public.ad_creatives (starts_at, ends_at) WHERE active;

CREATE TABLE IF NOT EXISTS public.ad_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id      UUID NOT NULL REFERENCES public.ad_creatives(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('impression', 'click', 'dismiss')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_events_ad_idx  ON public.ad_events (ad_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_events_user_idx ON public.ad_events (user_id, kind, created_at DESC);


-- ═════════════════════════════════════════════════════════════════════════════
-- COUNTERS — triggers are the only writer
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.posts_maintain_like_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSE
    UPDATE public.posts SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS post_likes_count ON public.post_likes;
CREATE TRIGGER post_likes_count
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.posts_maintain_like_count();


CREATE OR REPLACE FUNCTION public.posts_maintain_bookmark_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET bookmark_count = bookmark_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET bookmark_count = GREATEST(0, bookmark_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS post_bookmarks_count ON public.post_bookmarks;
CREATE TRIGGER post_bookmarks_count
  AFTER INSERT OR DELETE ON public.post_bookmarks
  FOR EACH ROW EXECUTE FUNCTION public.posts_maintain_bookmark_count();


CREATE OR REPLACE FUNCTION public.posts_maintain_view_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.posts SET view_count = view_count + 1 WHERE id = NEW.post_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS post_views_count ON public.post_views;
CREATE TRIGGER post_views_count
  AFTER INSERT ON public.post_views
  FOR EACH ROW EXECUTE FUNCTION public.posts_maintain_view_count();


-- Replies and reposts are posts, so their counters move on the posts table
-- itself. Soft delete has to decrement too, or a deleted reply keeps inflating
-- the count on the post it answered.
CREATE OR REPLACE FUNCTION public.posts_maintain_relation_counts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.reply_to IS NOT NULL THEN
      UPDATE public.posts SET reply_count = reply_count + 1 WHERE id = NEW.reply_to;
    END IF;
    IF NEW.repost_of IS NOT NULL THEN
      UPDATE public.posts SET repost_count = repost_count + 1 WHERE id = NEW.repost_of;
    END IF;
    IF NEW.quote_of IS NOT NULL THEN
      UPDATE public.posts SET repost_count = repost_count + 1 WHERE id = NEW.quote_of;
    END IF;

  ELSIF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF NEW.reply_to IS NOT NULL THEN
      UPDATE public.posts SET reply_count = GREATEST(0, reply_count - 1) WHERE id = NEW.reply_to;
    END IF;
    IF NEW.repost_of IS NOT NULL THEN
      UPDATE public.posts SET repost_count = GREATEST(0, repost_count - 1) WHERE id = NEW.repost_of;
    END IF;
    IF NEW.quote_of IS NOT NULL THEN
      UPDATE public.posts SET repost_count = GREATEST(0, repost_count - 1) WHERE id = NEW.quote_of;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.deleted_at IS NULL THEN
      IF OLD.reply_to IS NOT NULL THEN
        UPDATE public.posts SET reply_count = GREATEST(0, reply_count - 1) WHERE id = OLD.reply_to;
      END IF;
      IF OLD.repost_of IS NOT NULL THEN
        UPDATE public.posts SET repost_count = GREATEST(0, repost_count - 1) WHERE id = OLD.repost_of;
      END IF;
      IF OLD.quote_of IS NOT NULL THEN
        UPDATE public.posts SET repost_count = GREATEST(0, repost_count - 1) WHERE id = OLD.quote_of;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS posts_relation_counts ON public.posts;
CREATE TRIGGER posts_relation_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_maintain_relation_counts();


-- ═════════════════════════════════════════════════════════════════════════════
-- NOTIFICATION TRIGGERS
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_author UUID;
BEGIN
  SELECT author_id INTO v_author FROM public.posts WHERE id = NEW.post_id;
  -- Liking your own post is not news.
  IF v_author IS NULL OR v_author = NEW.user_id THEN RETURN NULL; END IF;

  INSERT INTO public.social_notifications (user_id, actor_id, kind, post_id)
  VALUES (v_author, NEW.user_id, 'like', NEW.post_id)
  ON CONFLICT (user_id, actor_id, kind, COALESCE(post_id, user_id))
  DO UPDATE SET created_at = now(), read_at = NULL;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS post_likes_notify ON public.post_likes;
CREATE TRIGGER post_likes_notify
  AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();


CREATE OR REPLACE FUNCTION public.notify_on_post()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_target UUID;
  v_author UUID;
  v_kind   TEXT;
  v_mention UUID;
BEGIN
  IF    NEW.reply_to  IS NOT NULL THEN v_target := NEW.reply_to;  v_kind := 'reply';
  ELSIF NEW.repost_of IS NOT NULL THEN v_target := NEW.repost_of; v_kind := 'repost';
  ELSIF NEW.quote_of  IS NOT NULL THEN v_target := NEW.quote_of;  v_kind := 'quote';
  END IF;

  IF v_target IS NOT NULL THEN
    SELECT author_id INTO v_author FROM public.posts WHERE id = v_target;
    IF v_author IS NOT NULL AND v_author <> NEW.author_id THEN
      INSERT INTO public.social_notifications (user_id, actor_id, kind, post_id)
      VALUES (v_author, NEW.author_id, v_kind, NEW.id)
      ON CONFLICT (user_id, actor_id, kind, COALESCE(post_id, user_id))
      DO UPDATE SET created_at = now(), read_at = NULL;
    END IF;
  END IF;

  FOREACH v_mention IN ARRAY NEW.mentions LOOP
    CONTINUE WHEN v_mention = NEW.author_id;
    INSERT INTO public.social_notifications (user_id, actor_id, kind, post_id)
    VALUES (v_mention, NEW.author_id, 'mention', NEW.id)
    ON CONFLICT (user_id, actor_id, kind, COALESCE(post_id, user_id))
    DO UPDATE SET created_at = now(), read_at = NULL;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS posts_notify ON public.posts;
CREATE TRIGGER posts_notify
  AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_post();


CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.social_notifications (user_id, actor_id, kind, post_id)
  VALUES (NEW.followee_id, NEW.follower_id, 'follow', NULL)
  ON CONFLICT (user_id, actor_id, kind, COALESCE(post_id, user_id))
  DO UPDATE SET created_at = now(), read_at = NULL;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS follows_notify ON public.follows;
CREATE TRIGGER follows_notify
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();


-- ═════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
--
-- Every table is locked. Reads happen through the SECURITY DEFINER RPCs below,
-- which is the only way to join `users` (not cross-readable) onto a feed.
-- Writes that are unambiguously "my own row" get a direct policy so the client
-- can use plain inserts where an RPC would add nothing.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.posts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_bookmarks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_views           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_hidden          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mutes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_polls           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_creatives         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_events            ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- posts: anyone signed in may read a live post; only the author may write one.
  DROP POLICY IF EXISTS posts_read       ON public.posts;
  DROP POLICY IF EXISTS posts_insert_own ON public.posts;
  DROP POLICY IF EXISTS posts_update_own ON public.posts;
  CREATE POLICY posts_read ON public.posts FOR SELECT TO authenticated
    USING (deleted_at IS NULL);
  CREATE POLICY posts_insert_own ON public.posts FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid());
  CREATE POLICY posts_update_own ON public.posts FOR UPDATE TO authenticated
    USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

  DROP POLICY IF EXISTS post_likes_rw ON public.post_likes;
  CREATE POLICY post_likes_rw ON public.post_likes FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

  DROP POLICY IF EXISTS post_bookmarks_rw ON public.post_bookmarks;
  CREATE POLICY post_bookmarks_rw ON public.post_bookmarks FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

  DROP POLICY IF EXISTS post_views_rw ON public.post_views;
  CREATE POLICY post_views_rw ON public.post_views FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

  DROP POLICY IF EXISTS post_hidden_rw ON public.post_hidden;
  CREATE POLICY post_hidden_rw ON public.post_hidden FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

  -- A reporter may file and may see what they filed; nobody else may read
  -- reports, because who reported whom is exactly the thing that gets people
  -- hurt if it leaks.
  DROP POLICY IF EXISTS post_reports_rw ON public.post_reports;
  CREATE POLICY post_reports_rw ON public.post_reports FOR ALL TO authenticated
    USING (reporter_id = auth.uid()) WITH CHECK (reporter_id = auth.uid());

  DROP POLICY IF EXISTS user_blocks_rw ON public.user_blocks;
  CREATE POLICY user_blocks_rw ON public.user_blocks FOR ALL TO authenticated
    USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

  DROP POLICY IF EXISTS user_mutes_rw ON public.user_mutes;
  CREATE POLICY user_mutes_rw ON public.user_mutes FOR ALL TO authenticated
    USING (muter_id = auth.uid()) WITH CHECK (muter_id = auth.uid());

  DROP POLICY IF EXISTS post_polls_read ON public.post_polls;
  DROP POLICY IF EXISTS post_polls_own  ON public.post_polls;
  CREATE POLICY post_polls_read ON public.post_polls FOR SELECT TO authenticated USING (TRUE);
  CREATE POLICY post_polls_own ON public.post_polls FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.author_id = auth.uid()
    ));

  DROP POLICY IF EXISTS poll_votes_rw ON public.poll_votes;
  CREATE POLICY poll_votes_rw ON public.poll_votes FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

  -- Notifications are readable and dismissible only by their recipient. Inserts
  -- come from triggers running as definer, so no INSERT policy is needed.
  DROP POLICY IF EXISTS social_notifications_read   ON public.social_notifications;
  DROP POLICY IF EXISTS social_notifications_update ON public.social_notifications;
  DROP POLICY IF EXISTS social_notifications_delete ON public.social_notifications;
  CREATE POLICY social_notifications_read ON public.social_notifications
    FOR SELECT TO authenticated USING (user_id = auth.uid());
  CREATE POLICY social_notifications_update ON public.social_notifications
    FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  CREATE POLICY social_notifications_delete ON public.social_notifications
    FOR DELETE TO authenticated USING (user_id = auth.uid());

  -- Creatives are served by RPC only. No client-side select: an advertiser's
  -- budget, caps and targeting are commercial terms, not feed content.
  -- Deliberately no policies at all — RLS with zero policies denies everything.

  -- Ad events: a client may record its own impressions and nothing else. It may
  -- never read them back, because the aggregate is what an advertiser pays for.
  DROP POLICY IF EXISTS ad_events_insert_own ON public.ad_events;
  CREATE POLICY ad_events_insert_own ON public.ad_events FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
END;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- HYDRATION — one place that knows how to turn ids into cards
-- ═════════════════════════════════════════════════════════════════════════════

-- Takes an ordered array of post ids and returns full cards in that same order.
-- Every feed function below is "pick ids, then call this", which means ranking
-- and rendering can change independently.
CREATE OR REPLACE FUNCTION public.hydrate_posts(p_viewer UUID, p_ids UUID[])
RETURNS SETOF public.feed_post_row
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT
    p.id,
    p.author_id,
    COALESCE(NULLIF(TRIM(a.full_name), ''), a.username, 'Emilgo user')::TEXT,
    a.username,
    a.profile_photo,
    a.role,
    a.avg_rating,
    a.follower_count,
    (f.follower_id IS NOT NULL),
    p.body,
    p.media,
    p.place,
    p.hashtags,
    p.reply_to,
    ra.username,
    p.quote_of,
    CASE WHEN q.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',              q.id,
      'body',            q.body,
      'media',           q.media,
      'created_at',      q.created_at,
      'author_id',       q.author_id,
      'author_name',     COALESCE(NULLIF(TRIM(qa.full_name), ''), qa.username, 'Emilgo user'),
      'author_username', qa.username,
      'author_photo',    qa.profile_photo
    ) END,
    CASE WHEN pp.post_id IS NULL THEN NULL ELSE jsonb_build_object(
      'options',   pp.options,
      'ends_at',   pp.ends_at,
      'my_choice', (SELECT v.choice FROM public.poll_votes v
                     WHERE v.post_id = p.id AND v.user_id = p_viewer),
      'tallies',   (SELECT COALESCE(jsonb_agg(t.n ORDER BY t.i), '[]'::JSONB)
                      FROM (
                        SELECT g.i,
                               (SELECT COUNT(*) FROM public.poll_votes v
                                 WHERE v.post_id = p.id AND v.choice = g.i) AS n
                          FROM generate_series(0, array_length(pp.options, 1) - 1) AS g(i)
                      ) t)
    ) END,
    p.like_count,
    p.reply_count,
    p.repost_count,
    p.bookmark_count,
    p.view_count,
    (l.user_id IS NOT NULL),
    (b.user_id IS NOT NULL),
    EXISTS (SELECT 1 FROM public.posts r
             WHERE r.repost_of = p.id AND r.author_id = p_viewer AND r.deleted_at IS NULL),
    NULL::UUID,
    NULL::TEXT,
    p.created_at,
    p.edited_at,
    (p.author_id = p_viewer)
  FROM unnest(p_ids) WITH ORDINALITY AS t(pid, ord)
  JOIN public.posts p        ON p.id = t.pid AND p.deleted_at IS NULL
  JOIN public.users a        ON a.id = p.author_id
  LEFT JOIN public.posts rp  ON rp.id = p.reply_to
  LEFT JOIN public.users ra  ON ra.id = rp.author_id
  LEFT JOIN public.posts q   ON q.id = p.quote_of AND q.deleted_at IS NULL
  LEFT JOIN public.users qa  ON qa.id = q.author_id
  LEFT JOIN public.post_polls pp ON pp.post_id = p.id
  LEFT JOIN public.post_likes l  ON l.post_id = p.id AND l.user_id = p_viewer
  LEFT JOIN public.post_bookmarks b ON b.post_id = p.id AND b.user_id = p_viewer
  LEFT JOIN public.follows f ON f.follower_id = p_viewer AND f.followee_id = p.author_id
  ORDER BY t.ord;
$$;


-- Everyone this viewer should never see: blocked either direction, or muted.
CREATE OR REPLACE FUNCTION public.feed_excluded_authors(p_viewer UUID)
RETURNS TABLE (uid UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT blocked_id FROM public.user_blocks WHERE blocker_id = p_viewer
  UNION
  SELECT blocker_id FROM public.user_blocks WHERE blocked_id = p_viewer
  UNION
  SELECT muted_id   FROM public.user_mutes  WHERE muter_id  = p_viewer;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- FEEDS
-- ═════════════════════════════════════════════════════════════════════════════

-- ── For You ──────────────────────────────────────────────────────────────────
--
-- Ranked, not chronological. The score is deliberately simple and legible:
--
--   engagement  ln(1 + weighted interactions)   replies count most, views least
--   affinity    +2.2 if you follow the author   a followed voice outranks a stranger
--   freshness   −(age in hours)/5               a day-old post loses ~4.8 points
--
-- ── Why OFFSET and not a keyset cursor ───────────────────────────────────────
-- Keyset pagination needs a value that does not change between pages. Every
-- input to this score changes continuously — a like on page 1 reorders page 3.
-- OFFSET over a bounded candidate window is honest about that; a cursor would
-- imply a stability that does not exist. The window is capped at 500 candidates
-- so the sort stays small no matter how large `posts` grows.
CREATE OR REPLACE FUNCTION public.feed_for_you(p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS SETOF public.feed_post_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_viewer UUID := auth.uid();
BEGIN
  IF v_viewer IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT * FROM public.hydrate_posts(v_viewer, ARRAY(
    SELECT p.id
      FROM (
        SELECT p2.id, p2.author_id, p2.created_at,
               p2.like_count, p2.reply_count, p2.repost_count, p2.view_count
          FROM public.posts p2
         WHERE p2.deleted_at IS NULL
           AND p2.reply_to IS NULL
           AND p2.created_at > now() - INTERVAL '30 days'
         ORDER BY p2.created_at DESC
         LIMIT 500
      ) p
     WHERE p.author_id NOT IN (SELECT uid FROM public.feed_excluded_authors(v_viewer))
       AND NOT EXISTS (SELECT 1 FROM public.post_hidden h
                        WHERE h.user_id = v_viewer AND h.post_id = p.id)
     ORDER BY
       ln(1 + p.reply_count * 4 + p.repost_count * 3
             + p.like_count * 2 + p.view_count * 0.2)
       + CASE WHEN EXISTS (SELECT 1 FROM public.follows f
                            WHERE f.follower_id = v_viewer
                              AND f.followee_id = p.author_id) THEN 2.2 ELSE 0 END
       - EXTRACT(EPOCH FROM (now() - p.created_at)) / 18000.0
       DESC,
       p.created_at DESC
     LIMIT  GREATEST(1, LEAST(p_limit, 50))
     OFFSET GREATEST(0, p_offset)
  ));
END;
$$;


-- ── Following ────────────────────────────────────────────────────────────────
--
-- Strictly chronological, including reposts by people you follow. Keyset on
-- created_at, because here the ordering key genuinely does not change.
CREATE OR REPLACE FUNCTION public.feed_following(
  p_limit  INT DEFAULT 20,
  p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.feed_post_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_viewer UUID := auth.uid();
BEGIN
  IF v_viewer IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT * FROM public.hydrate_posts(v_viewer, ARRAY(
    SELECT p.id
      FROM public.posts p
     WHERE p.deleted_at IS NULL
       AND p.reply_to IS NULL
       AND (p_before IS NULL OR p.created_at < p_before)
       AND (
         p.author_id = v_viewer
         OR EXISTS (SELECT 1 FROM public.follows f
                     WHERE f.follower_id = v_viewer AND f.followee_id = p.author_id)
       )
       AND p.author_id NOT IN (SELECT uid FROM public.feed_excluded_authors(v_viewer))
       AND NOT EXISTS (SELECT 1 FROM public.post_hidden h
                        WHERE h.user_id = v_viewer AND h.post_id = p.id)
     ORDER BY p.created_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 50))
  ));
END;
$$;


-- ── One post ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_post(p_post UUID)
RETURNS SETOF public.feed_post_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_viewer UUID := auth.uid();
BEGIN
  IF v_viewer IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.hydrate_posts(v_viewer, ARRAY[p_post]);
END;
$$;


-- ── A conversation ───────────────────────────────────────────────────────────
--
-- Returns the ancestor chain oldest-first, then the post, then its direct
-- replies newest-first — which is exactly the order the thread screen renders,
-- so the client never sorts.
CREATE OR REPLACE FUNCTION public.post_thread(p_post UUID, p_limit INT DEFAULT 50)
RETURNS SETOF public.feed_post_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_viewer UUID := auth.uid();
  v_ids    UUID[];
BEGIN
  IF v_viewer IS NULL THEN RETURN; END IF;

  WITH RECURSIVE up AS (
    SELECT id, reply_to, 0 AS depth FROM public.posts WHERE id = p_post
    UNION ALL
    SELECT p.id, p.reply_to, up.depth + 1
      FROM public.posts p JOIN up ON p.id = up.reply_to
     WHERE up.depth < 20   -- a malformed cycle must not spin forever
  )
  SELECT ARRAY(SELECT id FROM up ORDER BY depth DESC) INTO v_ids;

  v_ids := v_ids || ARRAY(
    SELECT r.id FROM public.posts r
     WHERE r.reply_to = p_post
       AND r.deleted_at IS NULL
       AND r.author_id NOT IN (SELECT uid FROM public.feed_excluded_authors(v_viewer))
     ORDER BY (r.like_count + r.reply_count) DESC, r.created_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 100))
  );

  RETURN QUERY SELECT * FROM public.hydrate_posts(v_viewer, v_ids);
END;
$$;


-- ── A profile grid ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_user_posts(
  p_user   UUID,
  p_tab    TEXT DEFAULT 'posts',   -- posts | replies | media | likes
  p_limit  INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS SETOF public.feed_post_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_viewer UUID := auth.uid();
BEGIN
  IF v_viewer IS NULL THEN RETURN; END IF;

  IF p_tab = 'likes' THEN
    -- Only your own likes are yours to show. Someone else's are private.
    IF p_user <> v_viewer THEN RETURN; END IF;
    RETURN QUERY SELECT * FROM public.hydrate_posts(v_viewer, ARRAY(
      SELECT l.post_id FROM public.post_likes l
        JOIN public.posts p ON p.id = l.post_id AND p.deleted_at IS NULL
       WHERE l.user_id = p_user
       ORDER BY l.created_at DESC
       LIMIT GREATEST(1, LEAST(p_limit, 50)) OFFSET GREATEST(0, p_offset)
    ));
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM public.hydrate_posts(v_viewer, ARRAY(
    SELECT p.id FROM public.posts p
     WHERE p.author_id = p_user
       AND p.deleted_at IS NULL
       AND CASE p_tab
             WHEN 'replies' THEN p.reply_to IS NOT NULL
             WHEN 'media'   THEN jsonb_array_length(p.media) > 0
             ELSE p.reply_to IS NULL
           END
     ORDER BY p.created_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 50)) OFFSET GREATEST(0, p_offset)
  ));
END;
$$;


-- ── Bookmarks ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_bookmarks(
  p_collection TEXT DEFAULT NULL,
  p_limit      INT DEFAULT 20,
  p_offset     INT DEFAULT 0
)
RETURNS SETOF public.feed_post_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_viewer UUID := auth.uid();
BEGIN
  IF v_viewer IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.hydrate_posts(v_viewer, ARRAY(
    SELECT b.post_id FROM public.post_bookmarks b
      JOIN public.posts p ON p.id = b.post_id AND p.deleted_at IS NULL
     WHERE b.user_id = v_viewer
       AND (p_collection IS NULL OR b.collection = p_collection)
     ORDER BY b.created_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 50)) OFFSET GREATEST(0, p_offset)
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.list_bookmark_collections()
RETURNS TABLE (collection TEXT, n BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT b.collection, COUNT(*)
    FROM public.post_bookmarks b
   WHERE b.user_id = auth.uid()
   GROUP BY b.collection
   ORDER BY COUNT(*) DESC;
$$;


-- ── Search and discovery ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_posts(
  p_q      TEXT,
  p_limit  INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS SETOF public.feed_post_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_viewer UUID := auth.uid();
  v_q      TEXT := TRIM(COALESCE(p_q, ''));
BEGIN
  IF v_viewer IS NULL OR v_q = '' THEN RETURN; END IF;

  RETURN QUERY SELECT * FROM public.hydrate_posts(v_viewer, ARRAY(
    SELECT p.id FROM public.posts p
     WHERE p.deleted_at IS NULL
       AND (
         to_tsvector('english', p.body) @@ plainto_tsquery('english', v_q)
         OR p.body ILIKE '%' || v_q || '%'
         OR LOWER(LTRIM(v_q, '#')) = ANY (p.hashtags)
       )
       AND p.author_id NOT IN (SELECT uid FROM public.feed_excluded_authors(v_viewer))
     ORDER BY p.created_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 50)) OFFSET GREATEST(0, p_offset)
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.posts_by_hashtag(
  p_tag    TEXT,
  p_limit  INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS SETOF public.feed_post_row
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_viewer UUID := auth.uid();
BEGIN
  IF v_viewer IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.hydrate_posts(v_viewer, ARRAY(
    SELECT p.id FROM public.posts p
     WHERE p.deleted_at IS NULL
       AND LOWER(LTRIM(COALESCE(p_tag, ''), '#')) = ANY (p.hashtags)
       AND p.author_id NOT IN (SELECT uid FROM public.feed_excluded_authors(v_viewer))
     ORDER BY (p.like_count + p.reply_count * 2) DESC, p.created_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 50)) OFFSET GREATEST(0, p_offset)
  ));
END;
$$;

-- Trending is "used a lot recently", weighted toward the last day. Nothing to
-- show until people actually post — which is correct, not a bug.
CREATE OR REPLACE FUNCTION public.trending_hashtags(p_limit INT DEFAULT 10)
RETURNS TABLE (tag TEXT, posts BIGINT, engagement BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.tag,
         COUNT(*)::BIGINT,
         SUM(p.like_count + p.reply_count * 2 + p.repost_count * 2)::BIGINT
    FROM public.posts p, unnest(p.hashtags) AS t(tag)
   WHERE p.deleted_at IS NULL
     AND p.created_at > now() - INTERVAL '7 days'
   GROUP BY t.tag
   ORDER BY SUM(p.like_count + p.reply_count * 2 + p.repost_count * 2) DESC,
            COUNT(*) DESC
   LIMIT GREATEST(1, LEAST(p_limit, 25));
$$;

-- People to follow: most-followed accounts the viewer does not already follow.
CREATE OR REPLACE FUNCTION public.suggested_accounts(p_limit INT DEFAULT 5)
RETURNS TABLE (
  id UUID, full_name TEXT, username TEXT, profile_photo TEXT,
  role TEXT, avg_rating DOUBLE PRECISION, follower_count INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id,
         COALESCE(NULLIF(TRIM(u.full_name), ''), u.username, 'Emilgo user')::TEXT,
         u.username, u.profile_photo, u.role, u.avg_rating, u.follower_count
    FROM public.users u
   WHERE u.id <> auth.uid()
     AND u.id NOT IN (SELECT uid FROM public.feed_excluded_authors(auth.uid()))
     AND NOT EXISTS (SELECT 1 FROM public.follows f
                      WHERE f.follower_id = auth.uid() AND f.followee_id = u.id)
   ORDER BY u.follower_count DESC NULLS LAST, u.avg_rating DESC NULLS LAST
   LIMIT GREATEST(1, LEAST(p_limit, 20));
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- WRITES
-- ═════════════════════════════════════════════════════════════════════════════

-- Hashtags and mentions are extracted server-side. Doing it on the client means
-- two clients can disagree about what a hashtag is, and the index is built from
-- whichever one wrote last.
CREATE OR REPLACE FUNCTION public.extract_hashtags(p_body TEXT)
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE SET search_path = pg_temp AS $$
  SELECT COALESCE(
    ARRAY(SELECT DISTINCT LOWER(m[1])
            FROM regexp_matches(COALESCE(p_body, ''), '#([A-Za-z0-9_]{1,50})', 'g') AS m),
    '{}'
  );
$$;

CREATE OR REPLACE FUNCTION public.create_post(
  p_body       TEXT DEFAULT '',
  p_media      JSONB DEFAULT '[]'::JSONB,
  p_reply_to   UUID DEFAULT NULL,
  p_quote_of   UUID DEFAULT NULL,
  p_place      TEXT DEFAULT NULL,
  p_visibility TEXT DEFAULT 'public',
  p_poll       JSONB DEFAULT NULL   -- {options:[...], hours:int}
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_author   UUID := auth.uid();
  v_id       UUID;
  v_root     UUID;
  v_mentions UUID[];
  v_body     TEXT := TRIM(COALESCE(p_body, ''));
BEGIN
  IF v_author IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF LENGTH(v_body) > 2000 THEN RAISE EXCEPTION 'post too long'; END IF;
  IF jsonb_array_length(COALESCE(p_media, '[]'::JSONB)) > 4 THEN
    RAISE EXCEPTION 'at most 4 attachments';
  END IF;

  -- Replying across a block must fail here, not render and silently vanish.
  -- The check is symmetric because blocking is: it is no more coherent to reply
  -- to someone you blocked than to someone who blocked you, and a one-way check
  -- lets the blocker keep talking at a thread they claim not to want to see.
  IF p_reply_to IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.posts p
        JOIN public.user_blocks b
          ON (b.blocker_id = p.author_id AND b.blocked_id = v_author)
          OR (b.blocker_id = v_author AND b.blocked_id = p.author_id)
       WHERE p.id = p_reply_to
    ) THEN
      RAISE EXCEPTION 'you cannot reply to this post';
    END IF;
    SELECT COALESCE(root_id, id) INTO v_root FROM public.posts WHERE id = p_reply_to;
  END IF;

  SELECT COALESCE(ARRAY_AGG(u.id), '{}') INTO v_mentions
    FROM (
      SELECT DISTINCT LOWER(m[1]) AS handle
        FROM regexp_matches(v_body, '@([A-Za-z0-9_.]{2,32})', 'g') AS m
    ) h
    JOIN public.users u ON LOWER(u.username) = h.handle;

  INSERT INTO public.posts (
    author_id, body, media, reply_to, root_id, quote_of, place, visibility,
    hashtags, mentions
  ) VALUES (
    v_author, v_body, COALESCE(p_media, '[]'::JSONB), p_reply_to, v_root,
    p_quote_of, NULLIF(TRIM(COALESCE(p_place, '')), ''),
    CASE WHEN p_visibility IN ('public', 'followers') THEN p_visibility ELSE 'public' END,
    public.extract_hashtags(v_body), v_mentions
  ) RETURNING id INTO v_id;

  IF p_poll IS NOT NULL AND jsonb_array_length(p_poll -> 'options') >= 2 THEN
    INSERT INTO public.post_polls (post_id, options, ends_at)
    VALUES (
      v_id,
      ARRAY(SELECT jsonb_array_elements_text(p_poll -> 'options')),
      now() + (COALESCE((p_poll ->> 'hours')::INT, 24) || ' hours')::INTERVAL
    );
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_post(p_post UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n INT;
BEGIN
  UPDATE public.posts
     SET deleted_at = now()
   WHERE id = p_post AND author_id = auth.uid() AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.edit_post(p_post UUID, p_body TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n INT; v_body TEXT := TRIM(COALESCE(p_body, ''));
BEGIN
  IF LENGTH(v_body) > 2000 THEN RAISE EXCEPTION 'post too long'; END IF;
  UPDATE public.posts
     SET body = v_body, hashtags = public.extract_hashtags(v_body), edited_at = now()
   WHERE id = p_post AND author_id = auth.uid() AND deleted_at IS NULL
     -- A bare repost has no body to edit, and the CHECK would reject one.
     AND repost_of IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;


-- Returns the authoritative count so the optimistic UI is corrected in the same
-- round trip rather than by a refetch — same contract as follow_user.
CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post UUID)
RETURNS TABLE (liked BOOLEAN, n INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user UUID := auth.uid(); v_liked BOOLEAN;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  DELETE FROM public.post_likes WHERE post_id = p_post AND user_id = v_user;
  IF FOUND THEN
    v_liked := FALSE;
  ELSE
    INSERT INTO public.post_likes (post_id, user_id) VALUES (p_post, v_user);
    v_liked := TRUE;
  END IF;

  RETURN QUERY
    SELECT v_liked, p.like_count FROM public.posts p WHERE p.id = p_post;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_bookmark(p_post UUID, p_collection TEXT DEFAULT '')
RETURNS TABLE (bookmarked BOOLEAN, n INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user UUID := auth.uid(); v_on BOOLEAN;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  DELETE FROM public.post_bookmarks WHERE post_id = p_post AND user_id = v_user;
  IF FOUND THEN
    v_on := FALSE;
  ELSE
    INSERT INTO public.post_bookmarks (post_id, user_id, collection)
    VALUES (p_post, v_user, COALESCE(p_collection, ''));
    v_on := TRUE;
  END IF;

  RETURN QUERY
    SELECT v_on, p.bookmark_count FROM public.posts p WHERE p.id = p_post;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_repost(p_post UUID)
RETURNS TABLE (reposted BOOLEAN, n INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user UUID := auth.uid(); v_on BOOLEAN;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  -- Hard delete, unlike a normal post: a repost has no replies hanging off it,
  -- so nothing is orphaned, and un-reposting should leave no trace.
  DELETE FROM public.posts
   WHERE repost_of = p_post AND author_id = v_user AND deleted_at IS NULL;
  IF FOUND THEN
    v_on := FALSE;
  ELSE
    INSERT INTO public.posts (author_id, body, repost_of) VALUES (v_user, '', p_post);
    v_on := TRUE;
  END IF;

  RETURN QUERY
    SELECT v_on, p.repost_count FROM public.posts p WHERE p.id = p_post;
END;
$$;

CREATE OR REPLACE FUNCTION public.vote_poll(p_post UUID, p_choice SMALLINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user UUID := auth.uid(); v_opts TEXT[]; v_ends TIMESTAMPTZ;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  SELECT options, ends_at INTO v_opts, v_ends FROM public.post_polls WHERE post_id = p_post;
  IF v_opts IS NULL THEN RAISE EXCEPTION 'no poll on that post'; END IF;
  IF now() > v_ends THEN RAISE EXCEPTION 'poll has closed'; END IF;
  IF p_choice < 0 OR p_choice >= array_length(v_opts, 1) THEN
    RAISE EXCEPTION 'no such option';
  END IF;

  INSERT INTO public.poll_votes (post_id, user_id, choice)
  VALUES (p_post, v_user, p_choice)
  ON CONFLICT (post_id, user_id) DO UPDATE SET choice = EXCLUDED.choice;

  RETURN jsonb_build_object(
    'my_choice', p_choice,
    'tallies', (SELECT COALESCE(jsonb_agg(t.n ORDER BY t.i), '[]'::JSONB)
                  FROM (SELECT g.i,
                               (SELECT COUNT(*) FROM public.poll_votes v
                                 WHERE v.post_id = p_post AND v.choice = g.i) AS n
                          FROM generate_series(0, array_length(v_opts, 1) - 1) AS g(i)) t)
  );
END;
$$;


-- Fire-and-forget from the viewport tracker. Idempotent by primary key, so
-- scrolling the same post past twice costs one row and one increment.
CREATE OR REPLACE FUNCTION public.mark_posts_viewed(p_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL OR p_ids IS NULL THEN RETURN; END IF;
  INSERT INTO public.post_views (post_id, user_id)
  SELECT DISTINCT t.pid, v_user
    FROM unnest(p_ids) AS t(pid)
    JOIN public.posts p ON p.id = t.pid AND p.author_id <> v_user
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.hide_post(p_post UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.post_hidden (user_id, post_id)
  VALUES (auth.uid(), p_post) ON CONFLICT DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.report_post(
  p_post   UUID,
  p_reason TEXT,
  p_note   TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.post_reports (post_id, reporter_id, reason, note)
  VALUES (p_post, auth.uid(), p_reason, p_note)
  ON CONFLICT (post_id, reporter_id) DO UPDATE
    SET reason = EXCLUDED.reason, note = EXCLUDED.note, created_at = now();
$$;

-- Blocking is not just hiding: it removes the follow edge in both directions,
-- because leaving it would keep feeding them your posts through the graph.
CREATE OR REPLACE FUNCTION public.block_user(p_user UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL OR p_user = v_me THEN RETURN; END IF;
  INSERT INTO public.user_blocks (blocker_id, blocked_id)
  VALUES (v_me, p_user) ON CONFLICT DO NOTHING;
  DELETE FROM public.follows
   WHERE (follower_id = v_me AND followee_id = p_user)
      OR (follower_id = p_user AND followee_id = v_me);
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_user(p_user UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM public.user_blocks WHERE blocker_id = auth.uid() AND blocked_id = p_user;
$$;

CREATE OR REPLACE FUNCTION public.mute_user(p_user UUID, p_on BOOLEAN DEFAULT TRUE)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL OR p_user = v_me THEN RETURN; END IF;
  IF p_on THEN
    INSERT INTO public.user_mutes (muter_id, muted_id)
    VALUES (v_me, p_user) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_mutes WHERE muter_id = v_me AND muted_id = p_user;
  END IF;
END;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.list_notifications(
  p_limit  INT DEFAULT 30,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID, kind TEXT, created_at TIMESTAMPTZ, read_at TIMESTAMPTZ,
  actor_id UUID, actor_name TEXT, actor_username TEXT, actor_photo TEXT,
  post_id UUID, post_excerpt TEXT, post_media JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT n.id, n.kind, n.created_at, n.read_at,
         n.actor_id,
         COALESCE(NULLIF(TRIM(a.full_name), ''), a.username, 'Emilgo user')::TEXT,
         a.username, a.profile_photo,
         n.post_id,
         LEFT(COALESCE(p.body, ''), 140),
         COALESCE(p.media, '[]'::JSONB)
    FROM public.social_notifications n
    LEFT JOIN public.users a ON a.id = n.actor_id
    LEFT JOIN public.posts p ON p.id = n.post_id AND p.deleted_at IS NULL
   WHERE n.user_id = auth.uid()
     AND (n.actor_id IS NULL
          OR n.actor_id NOT IN (SELECT uid FROM public.feed_excluded_authors(auth.uid())))
   ORDER BY n.created_at DESC
   LIMIT GREATEST(1, LEAST(p_limit, 100)) OFFSET GREATEST(0, p_offset);
$$;

CREATE OR REPLACE FUNCTION public.unread_notification_count()
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COUNT(*)::INTEGER FROM public.social_notifications
   WHERE user_id = auth.uid() AND read_at IS NULL;
$$;

-- NULL marks everything read — the "you opened the tab" case.
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids UUID[] DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n INT;
BEGIN
  UPDATE public.social_notifications
     SET read_at = now()
   WHERE user_id = auth.uid()
     AND read_at IS NULL
     AND (p_ids IS NULL OR id = ANY (p_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- ADS
-- ═════════════════════════════════════════════════════════════════════════════

-- Weighted-random selection among live, on-target, uncapped creatives the viewer
-- has not dismissed in the last week.
--
-- `-ln(random()) / weight` is the exponential-race trick: ordering by it ascending
-- picks each row with probability proportional to its weight, in one pass, with
-- no running totals. A weight-3 creative wins three times as often as weight-1.
CREATE OR REPLACE FUNCTION public.serve_feed_ads(p_limit INT DEFAULT 3)
RETURNS TABLE (
  id UUID, advertiser_name TEXT, advertiser_handle TEXT, advertiser_logo TEXT,
  headline TEXT, body TEXT, media_url TEXT, media_type TEXT,
  cta_label TEXT, cta_url TEXT
)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, c.advertiser_name, c.advertiser_handle, c.advertiser_logo,
         c.headline, c.body, c.media_url, c.media_type, c.cta_label, c.cta_url
    FROM public.ad_creatives c
    JOIN public.users u ON u.id = auth.uid()
   WHERE c.active
     AND c.starts_at <= now()
     AND (c.ends_at IS NULL OR c.ends_at > now())
     AND (cardinality(c.target_roles) = 0 OR u.role = ANY (c.target_roles))
     AND NOT EXISTS (
       SELECT 1 FROM public.ad_events e
        WHERE e.ad_id = c.id AND e.user_id = auth.uid() AND e.kind = 'dismiss'
          AND e.created_at > now() - INTERVAL '7 days'
     )
     AND (c.daily_cap IS NULL OR (
       SELECT COUNT(*) FROM public.ad_events e
        WHERE e.ad_id = c.id AND e.kind = 'impression'
          AND e.created_at > date_trunc('day', now())
     ) < c.daily_cap)
   ORDER BY -ln(random()) / c.weight
   LIMIT GREATEST(1, LEAST(p_limit, 10));
$$;

CREATE OR REPLACE FUNCTION public.record_ad_event(p_ad UUID, p_kind TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.ad_events (ad_id, user_id, kind)
  SELECT p_ad, auth.uid(), p_kind
   WHERE p_kind IN ('impression', 'click', 'dismiss');
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- GRANTS
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, which includes
-- the `anon` role. A SECURITY DEFINER function reachable by anon is a hole
-- regardless of what it does with auth.uid(). Revoke first, then grant.
-- (This is the finding migration_harden_definer.sql fixed for the RPCs that
-- came before; these are written that way from the start.)
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::REGPROCEDURE AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'hydrate_posts', 'feed_excluded_authors', 'feed_for_you', 'feed_following',
         'get_post', 'post_thread', 'list_user_posts', 'list_bookmarks',
         'list_bookmark_collections', 'search_posts', 'posts_by_hashtag',
         'trending_hashtags', 'suggested_accounts', 'extract_hashtags',
         'create_post', 'delete_post', 'edit_post', 'toggle_post_like',
         'toggle_bookmark', 'toggle_repost', 'vote_poll', 'mark_posts_viewed',
         'hide_post', 'report_post', 'block_user', 'unblock_user', 'mute_user',
         'list_notifications', 'unread_notification_count', 'mark_notifications_read',
         'serve_feed_ads', 'record_ad_event'
       )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END;
$$;

-- hydrate_posts and feed_excluded_authors take a viewer id as an argument rather
-- than reading auth.uid(), so a signed-in user could pass someone else's id and
-- read their like/bookmark state. They are internals of the feed functions, not
-- API. Lock them to the definer role only.
REVOKE ALL ON FUNCTION public.hydrate_posts(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.feed_excluded_authors(UUID) FROM PUBLIC, anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- STORAGE — where post photos and videos live
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-media', 'post-media', TRUE, 52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic',
        'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE
  SET public = TRUE,
      file_size_limit = 52428800,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  DROP POLICY IF EXISTS post_media_read   ON storage.objects;
  DROP POLICY IF EXISTS post_media_write  ON storage.objects;
  DROP POLICY IF EXISTS post_media_delete ON storage.objects;

  -- Public read: the bucket serves image URLs straight into <Image>, and a
  -- signed URL per attachment per render would be a round trip per thumbnail.
  CREATE POLICY post_media_read ON storage.objects
    FOR SELECT USING (bucket_id = 'post-media');

  -- Writes are namespaced by uploader: the first path segment must be your own
  -- uid, so nobody can overwrite anyone else's media.
  CREATE POLICY post_media_write ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'post-media'
                AND (storage.foldername(name))[1] = auth.uid()::TEXT);

  CREATE POLICY post_media_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'post-media'
           AND (storage.foldername(name))[1] = auth.uid()::TEXT);
END;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- REALTIME
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'posts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
       AND tablename = 'social_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.social_notifications;
  END IF;
END;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- Adding a real advertiser
--
-- Nothing above inserts one. Until a row exists here the feed shows no ads at
-- all, which is the honest state. Run this from the SQL editor when a campaign
-- is actually sold:
--
--   INSERT INTO public.ad_creatives (
--     advertiser_name, advertiser_handle, advertiser_logo,
--     headline, body, media_url, media_type,
--     cta_label, cta_url, target_roles, weight, daily_cap, ends_at
--   ) VALUES (
--     'Your Advertiser', 'youradvertiser', 'https://…/logo.png',
--     'Headline shown in bold', 'One or two lines of body copy.',
--     'https://…/creative.jpg', 'image',
--     'Shop now', 'https://…', ARRAY['passenger'], 3, 5000,
--     now() + INTERVAL '30 days'
--   );
--
-- Delivery is verifiable without leaving SQL:
--   SELECT kind, COUNT(*) FROM ad_events WHERE ad_id = '…' GROUP BY kind;
-- ═════════════════════════════════════════════════════════════════════════════
