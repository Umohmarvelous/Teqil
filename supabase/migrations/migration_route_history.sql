-- migration_route_history.sql
--
-- Recorded GPS routes ("saved route history").
--
-- Distinct from `saved_routes`, which is a passenger's *bookmarked* origin→dest
-- pairs for quick re-booking. This table stores what actually happened: the
-- sampled polyline, distance, duration and speed profile of a tracked ride,
-- for both paid trips and free rides.
--
-- `gps_validated` is computed by a trigger from the stored metrics, never
-- written by the client — free-ride fuel redemption depends on it, so a client
-- must not be able to assert it.

CREATE TABLE IF NOT EXISTS public.route_history (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Which side of the ride recorded this track, and why.
    role             TEXT NOT NULL DEFAULT 'passenger'
                       CHECK (role IN ('driver', 'passenger')),
    context          TEXT NOT NULL DEFAULT 'trip'
                       CHECK (context IN ('trip', 'free_ride')),

    -- Optional links. A free ride may have no trip row; an ad-hoc live trip may
    -- have no persisted trip either, hence both are nullable and unconstrained.
    trip_id          UUID,
    claim_id         UUID,

    started_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    ended_at         TIMESTAMPTZ,

    distance_km      DOUBLE PRECISION NOT NULL DEFAULT 0,
    duration_seconds INTEGER          NOT NULL DEFAULT 0,
    avg_speed_kmh    DOUBLE PRECISION NOT NULL DEFAULT 0,
    max_speed_kmh    DOUBLE PRECISION NOT NULL DEFAULT 0,
    fare             DOUBLE PRECISION NOT NULL DEFAULT 0,

    origin_lat       DOUBLE PRECISION,
    origin_lng       DOUBLE PRECISION,
    origin_label     TEXT,
    dest_lat         DOUBLE PRECISION,
    dest_lng         DOUBLE PRECISION,
    dest_label       TEXT,

    -- Douglas–Peucker-simplified polyline: [{ "latitude": n, "longitude": n }, …]
    path             JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Number of accepted GPS fixes before simplification.
    point_count      INTEGER NOT NULL DEFAULT 0,

    gps_validated    BOOLEAN NOT NULL DEFAULT FALSE,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS route_history_user_started_idx
    ON public.route_history (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS route_history_claim_idx
    ON public.route_history (claim_id) WHERE claim_id IS NOT NULL;

-- ── GPS validation ───────────────────────────────────────────────────────────
-- A track counts as GPS-validated only if it looks like a real journey:
-- enough accepted fixes, real ground covered, real elapsed time, and an average
-- speed inside a plausible road-vehicle band.

CREATE OR REPLACE FUNCTION public.route_is_gps_valid(
    p_distance_km      DOUBLE PRECISION,
    p_duration_seconds INTEGER,
    p_point_count      INTEGER,
    p_avg_speed_kmh    DOUBLE PRECISION
) RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(p_point_count, 0)      >= 10
       AND COALESCE(p_distance_km, 0)      >= 0.3
       AND COALESCE(p_duration_seconds, 0) >= 60
       AND COALESCE(p_avg_speed_kmh, 0)    BETWEEN 1 AND 120;
$$;

CREATE OR REPLACE FUNCTION public.route_history_set_validated()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.gps_validated := public.route_is_gps_valid(
        NEW.distance_km,
        NEW.duration_seconds,
        NEW.point_count,
        NEW.avg_speed_kmh
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS route_history_validate ON public.route_history;
CREATE TRIGGER route_history_validate
    BEFORE INSERT OR UPDATE ON public.route_history
    FOR EACH ROW EXECUTE FUNCTION public.route_history_set_validated();

-- ── RLS: a track belongs to the user who recorded it ─────────────────────────

ALTER TABLE public.route_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "route_history owner select" ON public.route_history;
CREATE POLICY "route_history owner select"
    ON public.route_history FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "route_history owner insert" ON public.route_history;
CREATE POLICY "route_history owner insert"
    ON public.route_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "route_history owner update" ON public.route_history;
CREATE POLICY "route_history owner update"
    ON public.route_history FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "route_history owner delete" ON public.route_history;
CREATE POLICY "route_history owner delete"
    ON public.route_history FOR DELETE
    USING (auth.uid() = user_id);
