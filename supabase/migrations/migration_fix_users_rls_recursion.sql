-- migration_fix_users_rls_recursion.sql
--
-- `public.users` RLS was self-recursive, and any authenticated write to a
-- profile failed with:
--
--     infinite recursion detected in policy for relation "users"
--
-- ── The cause ───────────────────────────────────────────────────────────────
-- The policy `users: park owner read drivers` is a policy ON `users` whose
-- USING clause reads FROM `users`:
--
--     EXISTS (SELECT 1 FROM users me
--              WHERE me.id = auth.uid()
--                AND me.role = 'park_owner'
--                AND me.park_name = users.park_name
--                AND users.role = 'driver')
--
-- Evaluating it requires reading `users`, which requires evaluating it. Postgres
-- detects the loop and aborts rather than hanging, so the symptom is an error
-- rather than a stall — but the row is still unreachable.
--
-- It was found by a test asserting that a user cannot grant themselves
-- `is_admin`. The assertion passed, but for the wrong reason: the UPDATE was
-- refused by the recursion, not by the guard meant to refuse it. A test that
-- passes for the wrong reason is worth more than one that fails, and only if
-- you read the detail.
--
-- ── The fix ─────────────────────────────────────────────────────────────────
-- Move the lookup into a SECURITY DEFINER function. It runs as the owner, so
-- reading `users` inside it does not re-enter the policy, and the policy becomes
-- a plain function call. This is the standard remedy for recursive RLS and the
-- same shape `is_admin()` already uses.
--
-- The policy's INTENT is preserved exactly: a park owner may read the rows of
-- drivers at their own park, and nobody else gains anything.

BEGIN;

-- Reads `users` as the owner, so the policy that calls it does not recurse.
-- STABLE because it is called once per row scanned and the answer cannot change
-- inside a statement.
CREATE OR REPLACE FUNCTION public.my_park_name()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.park_name FROM public.users u
   WHERE u.id = auth.uid() AND u.role = 'park_owner';
$$;

REVOKE ALL ON FUNCTION public.my_park_name() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_park_name() TO authenticated;

DROP POLICY IF EXISTS "users: park owner read drivers" ON public.users;

CREATE POLICY "users: park owner read drivers" ON public.users
  FOR SELECT TO authenticated
  USING (
    users.role = 'driver'
    AND users.park_name IS NOT NULL
    -- NULL when the caller is not a park owner, and `= NULL` is never true, so
    -- this grants nothing to anyone else.
    AND users.park_name = public.my_park_name()
  );

COMMIT;
