-- ═════════════════════════════════════════════════════════════════════════════
-- EMILGO / Teqil — hardening for the SECURITY DEFINER functions (Phases 6 & 7)
--
-- Applied 2026-08-15. Idempotent. Run AFTER migration_follows.sql and
-- migration_proximity.sql.
--
-- Both findings came from Supabase's own security advisor
-- (https://supabase.com/docs/guides/database/database-advisors), and both are
-- real rather than cosmetic:
--
-- ── 1. Mutable search_path ───────────────────────────────────────────────────
-- A SECURITY DEFINER function executes with the OWNER's privileges. If its
-- search_path is resolved at call time, anyone who can create objects in a
-- schema earlier on that path can shadow a table or function the body
-- references — and their object is then used with the owner's rights. Pinning
-- the path removes the substitution.
--
-- ── 2. anon could execute them ───────────────────────────────────────────────
-- Postgres grants EXECUTE on a new function to PUBLIC by default, so the
-- original `GRANT ... TO authenticated` granted nothing new: `anon` already had
-- it. Every body does check `auth.uid() IS NULL` and raise, so the door was
-- bolted from the inside — but `find_nearby` exists specifically so positions
-- are not scrapeable without an account, and resting that guarantee on a
-- runtime check is one refactor away from being wrong. REVOKE makes the grant
-- match the intent.
--
-- Note the ordering: REVOKE must come before GRANT, or the GRANT is undone.
--
-- The advisor also flags ~20 PRE-EXISTING functions from earlier migrations for
-- the same search_path issue, plus one SECURITY DEFINER view
-- (`v_active_park_trips`). Those are deliberately NOT touched here — see
-- SETUP-KEYS.md / HANDOFF.md for that backlog.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── Pin search_path ─────────────────────────────────────────────────────────

ALTER FUNCTION public.haversine_km(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) SET search_path = public, pg_temp;
ALTER FUNCTION public.publish_presence(DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, DOUBLE PRECISION, DOUBLE PRECISION) SET search_path = public, pg_temp;
ALTER FUNCTION public.withdraw_presence() SET search_path = public, pg_temp;
ALTER FUNCTION public.find_nearby(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION public.find_fastest_finger(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION public.claim_fastest_finger(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.expire_fastest_finger() SET search_path = public, pg_temp;

ALTER FUNCTION public.follow_user(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.unfollow_user(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_follow_stats(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.list_followers(UUID, INTEGER, INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION public.list_following(UUID, INTEGER, INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION public.follows_maintain_counts() SET search_path = public, pg_temp;

-- ─── Signed-in callers only ──────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.publish_presence(DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_presence() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_nearby(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_fastest_finger(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_fastest_finger(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expire_fastest_finger() FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.follow_user(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unfollow_user(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_follow_stats(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_followers(UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_following(UUID, INTEGER, INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.publish_presence(DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_presence() TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_nearby(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_fastest_finger(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_fastest_finger(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_fastest_finger() TO authenticated;

GRANT EXECUTE ON FUNCTION public.follow_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfollow_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_follow_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_followers(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_following(UUID, INTEGER, INTEGER) TO authenticated;
