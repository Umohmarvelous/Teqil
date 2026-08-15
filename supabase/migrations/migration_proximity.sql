-- ═════════════════════════════════════════════════════════════════════════════
-- EMILGO / Teqil — proximity (Phase 7)
--
-- Run ONCE in Supabase → SQL Editor → Run. Idempotent.
--
-- Three features, one table of live positions:
--   · find a driver / passenger near you
--   · Fastest Finger — a driver offers an immediate discounted ride and the
--     first nearby passengers to accept get it
--   · (filling stations come from Overpass, client-side — no table, no key)
--
-- ── Why there is no PostGIS here ─────────────────────────────────────────────
-- PostGIS is the right tool at national scale, but it is an extension to enable,
-- a geography column to maintain and a GiST index to keep. For "who is within
-- 5km of me" over a fleet this size, a bounding-box prefilter on a plain btree
-- index followed by an exact haversine on the survivors is the same answer for a
-- fraction of the operational surface. The prefilter is what makes it fast: it
-- turns a full scan into an index range, and the trigonometry then runs over
-- tens of rows, not millions.
--
-- If the fleet ever outgrows this, the migration path is additive: add a
-- geography column, backfill from lat/lng, swap the function body.
--
-- ── Why presence is its own table, not columns on users ──────────────────────
-- Position is written every few seconds while tracking and read constantly by
-- everyone nearby. Putting it on `users` would make the hottest write in the
-- system contend with the row that also holds identity, payout details and the
-- follower counters — and every presence UPDATE would bloat that row's version
-- chain. A narrow table keeps the churn off the identity row.
--
-- ── Privacy ─────────────────────────────────────────────────────────────────
-- A row here is only published when the user has location sharing on AND has
-- made themselves discoverable. The read RPC is SECURITY DEFINER and returns a
-- deliberately narrow column list — no phone, email, payout or KYC field. THAT
-- SELECT LIST IS THE ACCESS CONTROL, because SECURITY DEFINER bypasses RLS.
-- Adding a column there exposes it to every signed-in user in the country.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Presence ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT        NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  heading       DOUBLE PRECISION,
  accuracy      DOUBLE PRECISION,
  -- Discoverable at all. A driver between trips may be online but not looking
  -- for passengers, which is a different thing from being offline.
  is_available  BOOLEAN     NOT NULL DEFAULT true,
  -- Denormalised so the nearby list renders without a join back to users.
  full_name     TEXT,
  username      TEXT,
  profile_photo TEXT,
  driver_id     TEXT,
  vehicle_details TEXT,
  avg_rating    NUMERIC,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The bounding-box prefilter rides this. lat leads because a latitude band is
-- the more selective half of the box at Nigerian longitudes.
CREATE INDEX IF NOT EXISTS user_presence_bbox_idx
  ON public.user_presence (lat, lng);

-- Stale rows are excluded on every read, so the freshness check must be indexed.
CREATE INDEX IF NOT EXISTS user_presence_fresh_idx
  ON public.user_presence (updated_at DESC);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

-- You may only write your OWN position. Without this, an account could place
-- anyone anywhere on the map.
DROP POLICY IF EXISTS presence_upsert_own ON public.user_presence;
CREATE POLICY presence_upsert_own ON public.user_presence
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS presence_update_own ON public.user_presence;
CREATE POLICY presence_update_own ON public.user_presence
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS presence_delete_own ON public.user_presence;
CREATE POLICY presence_delete_own ON public.user_presence
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Deliberately NO select policy: reads go through find_nearby() below, which
-- controls both the radius and the columns. A blanket select here would let any
-- account download the position of every user in the country.

-- ─── Distance ────────────────────────────────────────────────────────────────

-- Great-circle distance in kilometres. IMMUTABLE so the planner can inline it.
CREATE OR REPLACE FUNCTION public.haversine_km(
  lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
  SELECT 6371.0 * 2 * asin(
    sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    )
  );
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

-- ─── Publish my position ─────────────────────────────────────────────────────
--
-- Takes the user from auth.uid() rather than a parameter, so a caller cannot
-- publish a position on someone else's behalf even if the policy above changed.

CREATE OR REPLACE FUNCTION public.publish_presence(
  p_lat          DOUBLE PRECISION,
  p_lng          DOUBLE PRECISION,
  p_is_available BOOLEAN DEFAULT true,
  p_heading      DOUBLE PRECISION DEFAULT NULL,
  p_accuracy     DOUBLE PRECISION DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  INSERT INTO public.user_presence AS p (
    user_id, role, lat, lng, heading, accuracy, is_available,
    full_name, username, profile_photo, driver_id, vehicle_details, avg_rating,
    updated_at
  )
  SELECT
    v_me, u.role::TEXT, p_lat, p_lng, p_heading, p_accuracy, p_is_available,
    u.full_name, u.username, u.profile_photo, u.driver_id, u.vehicle_details,
    u.avg_rating, now()
  FROM public.users u
  WHERE u.id = v_me
  ON CONFLICT (user_id) DO UPDATE SET
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    heading = EXCLUDED.heading,
    accuracy = EXCLUDED.accuracy,
    is_available = EXCLUDED.is_available,
    -- Refresh the denormalised display fields too: a driver who changes their
    -- photo should not keep showing the old one to everyone nearby.
    full_name = EXCLUDED.full_name,
    username = EXCLUDED.username,
    profile_photo = EXCLUDED.profile_photo,
    driver_id = EXCLUDED.driver_id,
    vehicle_details = EXCLUDED.vehicle_details,
    avg_rating = EXCLUDED.avg_rating,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

/** Stop being discoverable. Called on sign-out and when sharing is turned off. */
CREATE OR REPLACE FUNCTION public.withdraw_presence()
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.user_presence WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Find people near me ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.find_nearby(
  p_lat       DOUBLE PRECISION,
  p_lng       DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION DEFAULT 5,
  p_role      TEXT DEFAULT NULL,
  p_limit     INTEGER DEFAULT 40
)
RETURNS TABLE (
  user_id         UUID,
  role            TEXT,
  full_name       TEXT,
  username        TEXT,
  profile_photo   TEXT,
  driver_id       TEXT,
  vehicle_details TEXT,
  avg_rating      NUMERIC,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  heading         DOUBLE PRECISION,
  distance_km     DOUBLE PRECISION,
  updated_at      TIMESTAMPTZ
) AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_radius DOUBLE PRECISION := LEAST(GREATEST(p_radius_km, 0.1), 50);
  -- One degree of latitude is ~111km everywhere. One degree of longitude
  -- shrinks with latitude, hence the cos() term — without it the box is far too
  -- wide near the equator and the prefilter stops helping.
  v_dlat   DOUBLE PRECISION;
  v_dlng   DOUBLE PRECISION;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  v_dlat := v_radius / 111.0;
  v_dlng := v_radius / (111.0 * GREATEST(cos(radians(p_lat)), 0.01));

  RETURN QUERY
    SELECT
      p.user_id, p.role, p.full_name, p.username, p.profile_photo,
      p.driver_id, p.vehicle_details, p.avg_rating,
      p.lat, p.lng, p.heading,
      public.haversine_km(p_lat, p_lng, p.lat, p.lng) AS distance_km,
      p.updated_at
    FROM public.user_presence p
    WHERE p.user_id <> v_me
      AND p.is_available
      -- A position older than 10 minutes is a ghost: the person has closed the
      -- app or lost signal, and showing them as "nearby" sends someone walking
      -- toward nobody.
      AND p.updated_at > now() - INTERVAL '10 minutes'
      AND (p_role IS NULL OR p.role = p_role)
      -- Bounding box first, so the trigonometry only runs on candidates.
      AND p.lat BETWEEN p_lat - v_dlat AND p_lat + v_dlat
      AND p.lng BETWEEN p_lng - v_dlng AND p_lng + v_dlng
      AND public.haversine_km(p_lat, p_lng, p.lat, p.lng) <= v_radius
    ORDER BY distance_km ASC
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Fastest Finger ──────────────────────────────────────────────────────────
--
-- A driver posts a discounted seat for immediate travel. Nearby passengers see
-- it and the first to accept get the seats. It expires on its own.

CREATE TABLE IF NOT EXISTS public.fastest_finger_offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  origin          TEXT NOT NULL,
  destination     TEXT NOT NULL,
  base_fare       INTEGER NOT NULL,
  discounted_fare INTEGER NOT NULL,
  seats           INTEGER NOT NULL DEFAULT 1,
  seats_taken     INTEGER NOT NULL DEFAULT 0,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ff_seats_sane    CHECK (seats > 0 AND seats_taken >= 0 AND seats_taken <= seats),
  -- The whole proposition is that it is cheaper. Enforce it rather than trusting
  -- the client not to post a "discount" that costs more.
  CONSTRAINT ff_discount_real CHECK (discounted_fare > 0 AND discounted_fare <= base_fare),
  CONSTRAINT ff_status_known  CHECK (status IN ('open', 'filled', 'cancelled', 'expired'))
);

CREATE INDEX IF NOT EXISTS ff_open_bbox_idx
  ON public.fastest_finger_offers (lat, lng)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS ff_driver_idx
  ON public.fastest_finger_offers (driver_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.fastest_finger_claims (
  offer_id     UUID NOT NULL REFERENCES public.fastest_finger_offers(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One seat per passenger per offer: the pair is the identity of the claim, so
  -- a double-tap cannot take two seats.
  PRIMARY KEY (offer_id, passenger_id)
);

ALTER TABLE public.fastest_finger_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fastest_finger_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ff_select ON public.fastest_finger_offers;
CREATE POLICY ff_select ON public.fastest_finger_offers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS ff_insert_own ON public.fastest_finger_offers;
CREATE POLICY ff_insert_own ON public.fastest_finger_offers
  FOR INSERT TO authenticated WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS ff_update_own ON public.fastest_finger_offers;
CREATE POLICY ff_update_own ON public.fastest_finger_offers
  FOR UPDATE TO authenticated USING (driver_id = auth.uid());

DROP POLICY IF EXISTS ff_claims_select ON public.fastest_finger_claims;
CREATE POLICY ff_claims_select ON public.fastest_finger_claims
  FOR SELECT TO authenticated
  USING (
    passenger_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.fastest_finger_offers o
                WHERE o.id = offer_id AND o.driver_id = auth.uid())
  );

-- Offers near me, newest-cheapest first, excluding my own and anything expired.
CREATE OR REPLACE FUNCTION public.find_fastest_finger(
  p_lat       DOUBLE PRECISION,
  p_lng       DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION DEFAULT 5,
  p_limit     INTEGER DEFAULT 30
)
RETURNS TABLE (
  id              UUID,
  driver_id       UUID,
  driver_name     TEXT,
  driver_photo    TEXT,
  driver_rating   NUMERIC,
  vehicle_details TEXT,
  origin          TEXT,
  destination     TEXT,
  base_fare       INTEGER,
  discounted_fare INTEGER,
  seats_left      INTEGER,
  distance_km     DOUBLE PRECISION,
  expires_at      TIMESTAMPTZ,
  claimed_by_me   BOOLEAN
) AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_radius DOUBLE PRECISION := LEAST(GREATEST(p_radius_km, 0.1), 50);
  v_dlat   DOUBLE PRECISION;
  v_dlng   DOUBLE PRECISION;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  v_dlat := v_radius / 111.0;
  v_dlng := v_radius / (111.0 * GREATEST(cos(radians(p_lat)), 0.01));

  RETURN QUERY
    SELECT
      o.id, o.driver_id, u.full_name, u.profile_photo, u.avg_rating,
      u.vehicle_details, o.origin, o.destination, o.base_fare, o.discounted_fare,
      (o.seats - o.seats_taken) AS seats_left,
      public.haversine_km(p_lat, p_lng, o.lat, o.lng) AS distance_km,
      o.expires_at,
      EXISTS (SELECT 1 FROM public.fastest_finger_claims c
               WHERE c.offer_id = o.id AND c.passenger_id = v_me) AS claimed_by_me
    FROM public.fastest_finger_offers o
    JOIN public.users u ON u.id = o.driver_id
    WHERE o.status = 'open'
      AND o.expires_at > now()
      AND o.seats_taken < o.seats
      AND o.driver_id <> v_me
      AND o.lat BETWEEN p_lat - v_dlat AND p_lat + v_dlat
      AND o.lng BETWEEN p_lng - v_dlng AND p_lng + v_dlng
      AND public.haversine_km(p_lat, p_lng, o.lat, o.lng) <= v_radius
    ORDER BY o.discounted_fare ASC, distance_km ASC
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Take a seat. First come, first served.
--
-- ── Why the seat count is claimed in the UPDATE ──────────────────────────────
-- The obvious implementation reads seats_taken, compares it, then writes. Two
-- passengers tapping at the same moment both read the same value and both write
-- it, and one seat is sold twice — the classic lost update, and it is MORE
-- likely here than usual because the whole feature is designed to make people
-- tap simultaneously.
--
-- The single UPDATE with the guard in its WHERE clause is atomic: Postgres locks
-- the row, the second transaction re-evaluates the predicate against the
-- committed value, and it simply matches no rows. No advisory lock, no retry.
CREATE OR REPLACE FUNCTION public.claim_fastest_finger(p_offer UUID)
RETURNS TABLE (ok BOOLEAN, reason TEXT, seats_left INTEGER) AS $$
DECLARE
  v_me    UUID := auth.uid();
  v_taken INTEGER;
  v_seats INTEGER;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  -- Idempotent: claiming twice returns the existing claim rather than an error,
  -- so a double-tap or a retry after a dropped response is harmless.
  IF EXISTS (SELECT 1 FROM public.fastest_finger_claims
              WHERE offer_id = p_offer AND passenger_id = v_me) THEN
    SELECT o.seats - o.seats_taken INTO v_taken
      FROM public.fastest_finger_offers o WHERE o.id = p_offer;
    RETURN QUERY SELECT true, 'already_claimed'::TEXT, COALESCE(v_taken, 0);
    RETURN;
  END IF;

  UPDATE public.fastest_finger_offers o
     SET seats_taken = o.seats_taken + 1,
         status = CASE WHEN o.seats_taken + 1 >= o.seats THEN 'filled' ELSE o.status END
   WHERE o.id = p_offer
     AND o.status = 'open'
     AND o.expires_at > now()
     AND o.seats_taken < o.seats
     AND o.driver_id <> v_me
  RETURNING o.seats_taken, o.seats INTO v_taken, v_seats;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'unavailable'::TEXT, 0;
    RETURN;
  END IF;

  INSERT INTO public.fastest_finger_claims (offer_id, passenger_id)
  VALUES (p_offer, v_me);

  RETURN QUERY SELECT true, 'claimed'::TEXT, (v_seats - v_taken);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Housekeeping: mark past-due offers expired so the driver's own list is honest.
-- Cheap enough to call opportunistically from the client on load.
CREATE OR REPLACE FUNCTION public.expire_fastest_finger()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.fastest_finger_offers
     SET status = 'expired'
   WHERE status = 'open' AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- Signed-in accounts only, so positions are not scrapeable without an account.

GRANT EXECUTE ON FUNCTION public.publish_presence(DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_presence()                                                                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_nearby(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_fastest_finger(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_fastest_finger(UUID)                                                                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_fastest_finger()                                                                          TO authenticated;
