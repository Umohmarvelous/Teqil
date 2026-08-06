-- ═════════════════════════════════════════════════════════════════════════════
-- EMILGO / Teqil — FUEL REWARD POOL (Phase A of the fuel-partnership / free-ride)
--
-- Run ONCE in Supabase → SQL Editor → Run. Idempotent.
--
-- A GLOBAL, shared ledger of real ₦ that funds drivers' free-fuel rewards:
--   • credited by the 60% "station share" of every premium payment (premium_share),
--   • debited when a driver redeems free fuel for a qualifying free ride
--     (fuel_redemption),
--   • the sum is the spendable pool.
--
-- HARD RULE (why Emilgo/the station can never lose money): free fuel can never be
-- redeemed beyond the realized pool. redeem_fuel() enforces this atomically under
-- an advisory lock, so concurrent driver redemptions can't overdraw the shared pool.
--
-- NOTE: in production, premium_share is credited by the Paystack webhook AFTER the
-- charge is verified (server-trusted). The app-side insert here is the scaffold path.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fuel_pool_history (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL, -- premium payer or redeeming driver
    amount     NUMERIC(12,2) NOT NULL,   -- + premium share in / - fuel redemption out
    kind       TEXT NOT NULL,            -- premium_share | fuel_redemption | adjustment
    trip_id    TEXT,                     -- set on redemptions
    station_id TEXT,                     -- partner station (for later per-station settlement)
    dedupe_key TEXT,                     -- "apply once" key
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS fuel_pool_dedupe_uidx ON public.fuel_pool_history (dedupe_key);
CREATE INDEX IF NOT EXISTS fuel_pool_kind_idx ON public.fuel_pool_history (kind);

ALTER TABLE public.fuel_pool_history ENABLE ROW LEVEL SECURITY;

-- It's a shared pool: any signed-in user may READ it. Direct INSERT is limited to
-- one's OWN positive premium_share; redemptions go only through redeem_fuel().
DO $$ BEGIN
  CREATE POLICY "Authed users read the fuel pool"
    ON public.fuel_pool_history FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users credit their own premium share"
    ON public.fuel_pool_history FOR INSERT
    WITH CHECK (auth.uid() = user_id AND kind = 'premium_share' AND amount > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Global pool balance (SECURITY DEFINER so a signed-in client can read the sum).
CREATE OR REPLACE FUNCTION public.fuel_pool_balance()
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM public.fuel_pool_history;
$$ LANGUAGE sql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.fuel_pool_balance() TO authenticated;

-- Atomic redemption: debit the global pool for a driver's free fuel ONLY if the
-- pool can cover it. Idempotent per trip. Returns the amount redeemed (0 if the
-- pool is short or this trip was already redeemed).
CREATE OR REPLACE FUNCTION public.redeem_fuel(p_driver_id UUID, p_amount NUMERIC, p_trip_id TEXT)
RETURNS NUMERIC AS $$
DECLARE
  v_balance NUMERIC;
  v_key     TEXT := 'redeem:' || p_trip_id;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN 0; END IF;

  -- Serialize redemptions so concurrent draws can't overdraw the shared pool.
  PERFORM pg_advisory_xact_lock(hashtext('emilgo_fuel_pool'));

  IF EXISTS (SELECT 1 FROM public.fuel_pool_history WHERE dedupe_key = v_key) THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance FROM public.fuel_pool_history;
  IF v_balance < p_amount THEN
    RETURN 0; -- pool can't cover it → no free fuel; the driver is paid normally
  END IF;

  INSERT INTO public.fuel_pool_history (user_id, amount, kind, trip_id, dedupe_key)
  VALUES (p_driver_id, -p_amount, 'fuel_redemption', p_trip_id, v_key);

  RETURN p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.redeem_fuel(UUID, NUMERIC, TEXT) TO authenticated;
