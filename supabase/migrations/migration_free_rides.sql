-- ═════════════════════════════════════════════════════════════════════════════
-- EMILGO / Teqil — FREE RIDES (Phase B: reward offers + Phase C: free-will barter)
--
-- Run ONCE in Supabase → SQL Editor → Run. Idempotent.
--
-- Two distinct modes on ONE model (kept explicit so users always know which):
--   • mode = 'reward' — the driver is "TAKING an offer": sets requirements, NO
--     bargaining, passengers can only ACCEPT. Completing GPS-tracked free rides
--     earns the driver free fuel from the fuel pool (see migration_fuel_pool.sql).
--   • mode = 'barter' — the driver is "OPEN for an offer": a free-will exchange
--     (money/goods/services) that BOTH sides can bargain on (Elite passengers can
--     bargain even on 'reward' offers). Emilgo funds nothing here — it only holds
--     the agreement + receipt + consequence trail.
--
-- Free rides are PREMIUM-ONLY and GPS-tracked (compulsory) — enforced in the app.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.free_ride_offers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    mode             TEXT NOT NULL DEFAULT 'reward',   -- reward | barter
    duration_minutes INT  NOT NULL DEFAULT 30,         -- overage → passenger is charged
    max_passengers   INT  NOT NULL DEFAULT 1,
    claimed_count    INT  NOT NULL DEFAULT 0,
    requirements     TEXT,                              -- extra terms (accept-only)
    barter_terms     TEXT,                              -- what the driver wants (barter mode)
    origin           TEXT,
    destination      TEXT,
    status           TEXT NOT NULL DEFAULT 'open',      -- open | full | closed
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at       TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS free_ride_offers_status_idx ON public.free_ride_offers (status);
CREATE INDEX IF NOT EXISTS free_ride_offers_driver_idx ON public.free_ride_offers (driver_id);

CREATE TABLE IF NOT EXISTS public.free_ride_claims (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id     UUID NOT NULL REFERENCES public.free_ride_offers(id) ON DELETE CASCADE,
    driver_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    passenger_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'accepted',      -- accepted | in_progress | completed | cancelled | violated
    trip_id      TEXT,                                  -- GPS-tracked trip linkage
    fuel_awarded NUMERIC(12,2) DEFAULT 0,
    accepted_at  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX IF NOT EXISTS free_ride_claims_unique ON public.free_ride_claims (offer_id, passenger_id);

ALTER TABLE public.free_ride_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_ride_claims ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authed users read open offers"
    ON public.free_ride_offers FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Drivers manage their own offers (insert)"
    ON public.free_ride_offers FOR INSERT WITH CHECK (auth.uid() = driver_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Drivers manage their own offers (update)"
    ON public.free_ride_offers FOR UPDATE USING (auth.uid() = driver_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Parties read their own claims"
    ON public.free_ride_claims FOR SELECT USING (auth.uid() = passenger_id OR auth.uid() = driver_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Parties update their own claims"
    ON public.free_ride_claims FOR UPDATE USING (auth.uid() = passenger_id OR auth.uid() = driver_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Atomically claim a spot on an offer: only if it's open and not yet full. Bumps
-- claimed_count, flips the offer to 'full' at capacity, and inserts the claim.
-- Prevents two passengers over-filling the same slot. Returns the new claim id
-- (NULL if the offer is full/closed or the passenger already claimed it).
CREATE OR REPLACE FUNCTION public.claim_free_ride(p_offer_id UUID, p_passenger_id UUID)
RETURNS UUID AS $$
DECLARE
  v_offer   public.free_ride_offers%ROWTYPE;
  v_claim_id UUID;
BEGIN
  SELECT * INTO v_offer FROM public.free_ride_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND OR v_offer.status <> 'open' OR v_offer.claimed_count >= v_offer.max_passengers THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.free_ride_claims WHERE offer_id = p_offer_id AND passenger_id = p_passenger_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.free_ride_claims (offer_id, driver_id, passenger_id)
  VALUES (p_offer_id, v_offer.driver_id, p_passenger_id)
  RETURNING id INTO v_claim_id;

  UPDATE public.free_ride_offers
     SET claimed_count = claimed_count + 1,
         status = CASE WHEN claimed_count + 1 >= max_passengers THEN 'full' ELSE 'open' END
   WHERE id = p_offer_id;

  RETURN v_claim_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.claim_free_ride(UUID, UUID) TO authenticated;
