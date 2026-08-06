-- ═════════════════════════════════════════════════════════════════════════════
-- EMILGO / Teqil — public driver lookup for the QR pay / verify flow
--
-- Run ONCE in Supabase → SQL Editor → Run. Idempotent (CREATE OR REPLACE).
--
-- WHY: the `users` table is not cross-readable — RLS lets each account read only
-- its OWN row. So when a PASSENGER scans a DRIVER's QR, a direct
--   supabase.from('users').select('*').eq('id', driver_id)
-- returns 0 rows and the app showed "Driver not found".
--
-- This mirrors the existing get_user_by_username() pattern: a SECURITY DEFINER
-- function that returns ONLY the public, display-safe fields a passenger needs
-- to see and pay a driver. It deliberately does NOT return bank/payout details —
-- the actual transfer runs server-side with the service-role key.
--
-- NOTE: the mobile app already renders the driver from the scanned QR payload,
-- so it works WITHOUT this migration. Applying it just lets the pay screen show
-- the driver's freshest rating/photo (and confirm the driver still exists).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_driver_public(p_driver_id TEXT)
RETURNS TABLE (
  id UUID,
  driver_id TEXT,
  full_name TEXT,
  vehicle_details TEXT,
  avg_rating NUMERIC,
  profile_photo TEXT
) AS $$
BEGIN
  RETURN QUERY
    SELECT u.id, u.driver_id, u.full_name, u.vehicle_details, u.avg_rating, u.profile_photo
    FROM public.users u
    WHERE (u.id::text = p_driver_id OR u.driver_id = p_driver_id)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only signed-in passengers/drivers may resolve a driver (not anonymous).
GRANT EXECUTE ON FUNCTION public.get_driver_public(TEXT) TO authenticated;
