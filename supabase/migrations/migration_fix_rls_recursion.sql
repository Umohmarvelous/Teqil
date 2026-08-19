-- migration_fix_rls_recursion.sql
--
-- Breaks a four-way RLS recursion between `users`, `passengers` and `trips`.
--
-- ── The cycle ───────────────────────────────────────────────────────────────
-- Each of these is a policy ON one table whose USING clause READS another:
--
--     users       →  passengers, trips     ("driver read for trip")
--     passengers  →  trips, users          ("park owner read")
--     passengers  →  trips                 ("driver read on own trip")
--     trips       →  passengers            ("passenger read joined")
--     trips       →  users                 ("park owner read park trips")
--
-- So reading `users` evaluates a policy that reads `passengers`, whose policy
-- reads `users`. Postgres detects the loop and raises
--
--     infinite recursion detected in policy for relation "…"
--
-- rather than hanging — so the symptom is a hard error on ordinary operations,
-- including any authenticated write to a profile row.
--
-- ── The fix ─────────────────────────────────────────────────────────────────
-- Every cross-table lookup moves into a SECURITY DEFINER function. Those run as
-- the owner, so the read inside does not re-enter the policy, and each policy
-- becomes a single function call with no table reference of its own. This is the
-- standard remedy, and the same shape `is_admin()` and `my_park_name()` use.
--
-- ── What changes for users ──────────────────────────────────────────────────
-- Nothing. Every policy keeps its exact meaning: a driver may read passengers on
-- their own trips, a passenger may read trips they joined and the drivers of
-- those trips, and a park owner may read the drivers at their park and those
-- drivers' trips and passengers. Only the mechanism changes.
--
-- Each helper is STABLE (called once per row scanned, cannot change mid
-- statement) and is revoked from `anon` — none of this is public data.

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- HELPERS
-- ═════════════════════════════════════════════════════════════════════════════

/** Is the caller a passenger on a trip driven by `p_driver`? */
CREATE OR REPLACE FUNCTION public.shares_trip_with_driver(p_driver UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.passengers p
      JOIN public.trips t ON t.id = p.trip_id
     WHERE p.user_id = auth.uid() AND t.driver_id = p_driver
  );
$$;

/** Does the caller drive this trip? */
CREATE OR REPLACE FUNCTION public.drives_trip(p_trip UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips t WHERE t.id = p_trip AND t.driver_id = auth.uid()
  );
$$;

/** Has the caller joined this trip as a passenger? */
CREATE OR REPLACE FUNCTION public.joined_trip(p_trip UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.passengers p WHERE p.trip_id = p_trip AND p.user_id = auth.uid()
  );
$$;

/** Is `p_driver` a driver at the caller's own park? */
CREATE OR REPLACE FUNCTION public.driver_in_my_park(p_driver UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.users owner_row
      JOIN public.users driver_row
        ON driver_row.park_name = owner_row.park_name
       AND driver_row.role = 'driver'
     WHERE owner_row.id = auth.uid()
       AND owner_row.role = 'park_owner'
       AND owner_row.park_name IS NOT NULL
       AND driver_row.id = p_driver
  );
$$;

/** Is this trip driven by someone at the caller's own park? */
CREATE OR REPLACE FUNCTION public.trip_in_my_park(p_trip UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.trips t
      JOIN public.users driver_row ON driver_row.id = t.driver_id
      JOIN public.users owner_row
        ON owner_row.park_name = driver_row.park_name
       AND owner_row.role = 'park_owner'
     WHERE t.id = p_trip
       AND owner_row.id = auth.uid()
       AND driver_row.park_name IS NOT NULL
  );
$$;

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'shares_trip_with_driver(uuid)',
    'drives_trip(uuid)',
    'joined_trip(uuid)',
    'driver_in_my_park(uuid)',
    'trip_in_my_park(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- POLICIES — same meaning, no table reads
-- ═════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "users: driver read for trip" ON public.users;
CREATE POLICY "users: driver read for trip" ON public.users
  FOR SELECT TO authenticated
  USING (public.shares_trip_with_driver(users.id));

DROP POLICY IF EXISTS "passengers: driver read on own trip" ON public.passengers;
CREATE POLICY "passengers: driver read on own trip" ON public.passengers
  FOR SELECT TO authenticated
  USING (public.drives_trip(passengers.trip_id));

DROP POLICY IF EXISTS "passengers: park owner read" ON public.passengers;
CREATE POLICY "passengers: park owner read" ON public.passengers
  FOR SELECT TO authenticated
  USING (public.trip_in_my_park(passengers.trip_id));

DROP POLICY IF EXISTS "trips: passenger read joined" ON public.trips;
CREATE POLICY "trips: passenger read joined" ON public.trips
  FOR SELECT TO authenticated
  USING (public.joined_trip(trips.id));

DROP POLICY IF EXISTS "trips: park owner read park trips" ON public.trips;
CREATE POLICY "trips: park owner read park trips" ON public.trips
  FOR SELECT TO authenticated
  USING (public.driver_in_my_park(trips.driver_id));

COMMIT;
