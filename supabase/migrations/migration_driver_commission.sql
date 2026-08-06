-- ═════════════════════════════════════════════════════════════════════════════
-- EMILGO / Teqil — driver commission (₦ cut from the DRIVER's own pool)
--
-- Run ONCE in Supabase → SQL Editor → Run. Idempotent (CREATE OR REPLACE).
--
-- On each trip, a fixed ₦100 commission is taken from the DRIVER's pool for the
-- company — but ONLY if the driver's pool can afford it (never compulsory). A
-- passenger can't write the driver's pool_history (RLS = own row), so this
-- SECURITY DEFINER function does it server-side, safely:
--   • resolves the driver by UUID or driver_id code,
--   • is idempotent per trip (dedupe_key "<uid>:commission:<tripId>"),
--   • debits ONLY if the driver's pool balance >= the amount (else returns 0),
--   • records a negative `driver_commission` pool_history row (the existing
--     sync_pool_balance trigger keeps users.pool_balance in step).
-- Returns the amount actually charged (0 = skipped).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.charge_driver_commission(
  p_driver_id TEXT,
  p_trip_id   TEXT,
  p_amount    NUMERIC DEFAULT 100
) RETURNS NUMERIC AS $$
DECLARE
  v_uid     UUID;
  v_balance NUMERIC;
  v_key     TEXT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN 0; END IF;

  -- Resolve the driver's user id (accept a UUID or a driver_id code).
  SELECT u.id INTO v_uid
    FROM public.users u
   WHERE u.id::text = p_driver_id OR u.driver_id = p_driver_id
   LIMIT 1;
  IF v_uid IS NULL THEN RETURN 0; END IF;

  v_key := v_uid::text || ':commission:' || p_trip_id;

  -- Idempotency: already charged for this trip.
  IF EXISTS (SELECT 1 FROM public.pool_history WHERE dedupe_key = v_key) THEN
    RETURN 0;
  END IF;

  -- Optional: only if the driver's pool can actually afford it.
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
    FROM public.pool_history WHERE user_id = v_uid;
  IF v_balance < p_amount THEN RETURN 0; END IF;

  INSERT INTO public.pool_history (user_id, amount, kind, trip_id, dedupe_key)
  VALUES (v_uid, -p_amount, 'driver_commission', NULL, v_key);

  RETURN p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.charge_driver_commission(TEXT, TEXT, NUMERIC) TO authenticated;
