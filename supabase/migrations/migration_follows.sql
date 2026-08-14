-- ═════════════════════════════════════════════════════════════════════════════
-- EMILGO / Teqil — the social graph (Phase 6: followers / following)
--
-- Run ONCE in Supabase → SQL Editor → Run. Idempotent.
--
-- Passengers follow drivers so a driver's regulars can see when they're running,
-- and so a driver's standing is visible before you get in the vehicle.
--
-- ── Why a composite primary key, not an id + unique index ────────────────────
-- The pair IS the identity of a follow. Making (follower_id, followee_id) the
-- primary key gives the uniqueness constraint and the "does A follow B" lookup
-- from one index, and makes a duplicate follow a no-op rather than a second row
-- (ON CONFLICT DO NOTHING). A surrogate id would buy nothing and cost a second
-- index on a table that only ever grows.
--
-- ── Why counters are denormalised onto users ─────────────────────────────────
-- Every profile view needs both counts. `SELECT count(*)` against a follow table
-- is O(followers) per view, and popular drivers are exactly the profiles people
-- open most, so the cost lands where the traffic is. Two integer columns kept by
-- a trigger make it O(1), and the trigger is the only writer so they cannot
-- drift the way application-maintained counters do.
--
-- ── Why the reads are RPCs and not selects ───────────────────────────────────
-- `users` is not cross-readable: RLS lets each account read only its own row
-- (same reason get_driver_public exists). A follower list is entirely made of
-- OTHER people's rows, so it has to come from SECURITY DEFINER functions that
-- return only public, display-safe fields — never phone, email or payout data.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  -- Following yourself is always a bug, never a feature.
  CONSTRAINT follows_no_self CHECK (follower_id <> followee_id)
);

-- "Who follows X", newest first — the follower list query.
CREATE INDEX IF NOT EXISTS follows_followee_idx
  ON public.follows (followee_id, created_at DESC);

-- "Who does X follow", newest first — the following list query.
-- The primary key already leads with follower_id, but it orders by followee_id;
-- this one orders by time, which is what the list actually renders.
CREATE INDEX IF NOT EXISTS follows_follower_idx
  ON public.follows (follower_id, created_at DESC);

-- ─── Counters ────────────────────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS follower_count  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.follows_maintain_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.users SET follower_count  = follower_count  + 1 WHERE id = NEW.followee_id;
    UPDATE public.users SET following_count = following_count + 1 WHERE id = NEW.follower_id;
  ELSIF TG_OP = 'DELETE' THEN
    -- GREATEST(...,0) so a manual row deletion can never drive a count negative
    -- and leave the UI rendering "-1 followers" forever.
    UPDATE public.users SET follower_count  = GREATEST(follower_count  - 1, 0) WHERE id = OLD.followee_id;
    UPDATE public.users SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS follows_counts ON public.follows;
CREATE TRIGGER follows_counts
  AFTER INSERT OR DELETE ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.follows_maintain_counts();

-- Backfill, so applying this to a database that somehow already has rows lands
-- on correct numbers rather than zeros.
UPDATE public.users u SET
  follower_count  = COALESCE((SELECT count(*) FROM public.follows f WHERE f.followee_id = u.id), 0),
  following_count = COALESCE((SELECT count(*) FROM public.follows f WHERE f.follower_id = u.id), 0);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- The graph is public to signed-in users: you can see who follows whom. What is
-- NOT public is anything about those users beyond their display fields, which is
-- enforced by `users` RLS and the RPCs below, not here.
DROP POLICY IF EXISTS follows_select ON public.follows;
CREATE POLICY follows_select ON public.follows
  FOR SELECT TO authenticated USING (true);

-- You may only create and destroy your OWN follows. Without this an account
-- could make anyone appear to follow anyone.
DROP POLICY IF EXISTS follows_insert_own ON public.follows;
CREATE POLICY follows_insert_own ON public.follows
  FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid());

DROP POLICY IF EXISTS follows_delete_own ON public.follows;
CREATE POLICY follows_delete_own ON public.follows
  FOR DELETE TO authenticated USING (follower_id = auth.uid());

-- ─── Write RPCs ──────────────────────────────────────────────────────────────
--
-- These take the follower from auth.uid() rather than a parameter, so the caller
-- cannot name someone else as the follower even if the policy above were ever
-- relaxed. Both are idempotent: following twice, or unfollowing someone you
-- don't follow, succeeds and changes nothing.

CREATE OR REPLACE FUNCTION public.follow_user(p_followee UUID)
RETURNS INTEGER AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF v_me = p_followee THEN
    RAISE EXCEPTION 'You cannot follow yourself';
  END IF;

  INSERT INTO public.follows (follower_id, followee_id)
  VALUES (v_me, p_followee)
  ON CONFLICT DO NOTHING;

  RETURN (SELECT follower_count FROM public.users WHERE id = p_followee);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.unfollow_user(p_followee UUID)
RETURNS INTEGER AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  DELETE FROM public.follows
  WHERE follower_id = v_me AND followee_id = p_followee;

  RETURN (SELECT follower_count FROM public.users WHERE id = p_followee);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Read RPCs ───────────────────────────────────────────────────────────────

-- Everything a profile header needs, in one round trip.
CREATE OR REPLACE FUNCTION public.get_follow_stats(p_user UUID)
RETURNS TABLE (
  followers    INTEGER,
  following    INTEGER,
  is_following BOOLEAN,
  follows_me   BOOLEAN
) AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  RETURN QUERY
    SELECT
      u.follower_count,
      u.following_count,
      EXISTS (SELECT 1 FROM public.follows f
               WHERE f.follower_id = v_me AND f.followee_id = p_user),
      EXISTS (SELECT 1 FROM public.follows f
               WHERE f.follower_id = p_user AND f.followee_id = v_me)
    FROM public.users u
    WHERE u.id = p_user;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Display-safe columns only. Deliberately no phone, email, payout or KYC field:
-- SECURITY DEFINER bypasses RLS, so this select list IS the access control.
--
-- `is_following` is computed per row so the list can render a working follow
-- button without a second query per person.
CREATE OR REPLACE FUNCTION public.list_followers(
  p_user   UUID,
  p_limit  INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id            UUID,
  full_name     TEXT,
  username      TEXT,
  profile_photo TEXT,
  role          TEXT,
  driver_id     TEXT,
  avg_rating    NUMERIC,
  followed_at   TIMESTAMPTZ,
  is_following  BOOLEAN
) AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  RETURN QUERY
    SELECT
      u.id, u.full_name, u.username, u.profile_photo, u.role::TEXT,
      u.driver_id, u.avg_rating, f.created_at,
      EXISTS (SELECT 1 FROM public.follows m
               WHERE m.follower_id = v_me AND m.followee_id = u.id)
    FROM public.follows f
    JOIN public.users u ON u.id = f.follower_id
    WHERE f.followee_id = p_user
    ORDER BY f.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.list_following(
  p_user   UUID,
  p_limit  INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id            UUID,
  full_name     TEXT,
  username      TEXT,
  profile_photo TEXT,
  role          TEXT,
  driver_id     TEXT,
  avg_rating    NUMERIC,
  followed_at   TIMESTAMPTZ,
  is_following  BOOLEAN
) AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  RETURN QUERY
    SELECT
      u.id, u.full_name, u.username, u.profile_photo, u.role::TEXT,
      u.driver_id, u.avg_rating, f.created_at,
      EXISTS (SELECT 1 FROM public.follows m
               WHERE m.follower_id = v_me AND m.followee_id = u.id)
    FROM public.follows f
    JOIN public.users u ON u.id = f.followee_id
    WHERE f.follower_id = p_user
    ORDER BY f.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- Signed-in accounts only. Anonymous callers get nothing, so the graph is not
-- scrapeable without an account.

GRANT EXECUTE ON FUNCTION public.follow_user(UUID)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfollow_user(UUID)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_follow_stats(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_followers(UUID, INTEGER, INTEGER)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_following(UUID, INTEGER, INTEGER)   TO authenticated;
