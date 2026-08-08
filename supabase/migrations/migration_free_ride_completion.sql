-- migration_free_ride_completion.sql
--
-- Completing a free ride, atomically and server-authoritatively.
--
-- The rule this enforces: a driver earns free fuel only for a ride that the GPS
-- record actually backs. `route_history.gps_validated` is set by a trigger from
-- the recorded metrics, so neither party can assert it — and this function is
-- the only path that turns it into a payout.
--
-- Returns JSONB so the app can explain honestly what happened:
--   { ok, reason, mode, gps_validated, fuel_awarded, already }
--
-- Depends on: migration_free_rides.sql, migration_fuel_pool.sql,
--             migration_route_history.sql.

CREATE OR REPLACE FUNCTION public.complete_free_ride(
    p_claim_id UUID,
    p_route_id UUID,
    p_amount   NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_claim     public.free_ride_claims%ROWTYPE;
    v_route     public.route_history%ROWTYPE;
    v_mode      TEXT;
    v_caller    UUID := auth.uid();
    v_fuel      NUMERIC := 0;
BEGIN
    SELECT * INTO v_claim
      FROM public.free_ride_claims
     WHERE id = p_claim_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'claim_not_found');
    END IF;

    -- Only the two parties to the ride may complete it.
    IF v_caller IS NULL OR v_caller NOT IN (v_claim.driver_id, v_claim.passenger_id) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
    END IF;

    -- Idempotent: a second call reports the original outcome rather than paying twice.
    IF v_claim.status = 'completed' THEN
        RETURN jsonb_build_object(
            'ok', true,
            'already', true,
            'reason', 'already_completed',
            'fuel_awarded', COALESCE(v_claim.fuel_awarded, 0)
        );
    END IF;

    IF v_claim.status IN ('cancelled', 'violated') THEN
        RETURN jsonb_build_object('ok', false, 'reason', v_claim.status);
    END IF;

    SELECT mode INTO v_mode
      FROM public.free_ride_offers
     WHERE id = v_claim.offer_id;

    -- The GPS track must exist, belong to this claim, and have been recorded by
    -- one of the two parties.
    SELECT * INTO v_route
      FROM public.route_history
     WHERE id = p_route_id;

    IF NOT FOUND
       OR v_route.claim_id IS DISTINCT FROM p_claim_id
       OR v_route.user_id NOT IN (v_claim.driver_id, v_claim.passenger_id) THEN
        RETURN jsonb_build_object(
            'ok', false,
            'reason', 'route_mismatch',
            'mode', v_mode,
            'gps_validated', false,
            'fuel_awarded', 0
        );
    END IF;

    -- Reward rides draw fuel; barter rides are a free-will exchange Emilgo
    -- doesn't fund. Either way an unvalidated track earns nothing.
    IF v_mode = 'reward' AND v_route.gps_validated THEN
        v_fuel := public.redeem_fuel(v_claim.driver_id, p_amount, p_claim_id::TEXT);
    END IF;

    UPDATE public.free_ride_claims
       SET status       = 'completed',
           trip_id      = p_route_id::TEXT,
           fuel_awarded = v_fuel,
           completed_at = timezone('utc', now())
     WHERE id = p_claim_id;

    RETURN jsonb_build_object(
        'ok', true,
        'already', false,
        'reason', CASE
            WHEN v_mode <> 'reward'          THEN 'barter_no_fuel'
            WHEN NOT v_route.gps_validated   THEN 'not_gps_validated'
            WHEN v_fuel = 0                  THEN 'pool_empty'
            ELSE 'paid'
        END,
        'mode', v_mode,
        'gps_validated', v_route.gps_validated,
        'fuel_awarded', v_fuel
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_free_ride(UUID, UUID, NUMERIC) TO authenticated;
