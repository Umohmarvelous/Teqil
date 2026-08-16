-- ═════════════════════════════════════════════════════════════════════════════
-- EMILGO / Teqil — start a chat from a username or an ID
--
-- Run ONCE in Supabase → SQL Editor → Run. Idempotent.
--
-- A passenger should be able to type "@ada" or "DRV-A1B2C3" and message that
-- person; a driver should be able to do the same to reach a passenger.
--
-- ── Why this needs an RPC at all ─────────────────────────────────────────────
-- `public.users` is not cross-readable: RLS lets an account read only its own
-- row. So the obvious client query —
--
--     supabase.from('users').select(...).eq('driver_id', x)
--
-- returns NOTHING for anyone else's row, no matter how the client spells it.
-- (That is exactly what the messages store was doing, which is why lookup by ID
-- could only ever have worked against the caller's own account.) Resolution has
-- to happen in a SECURITY DEFINER function, and the SELECT LIST IN THAT
-- FUNCTION IS THE ACCESS CONTROL — definer rights bypass RLS, so every column
-- named here becomes visible to every signed-in user. No phone, no email, no
-- payout or KYC field.
--
-- ── Why two functions ────────────────────────────────────────────────────────
-- `find_user_for_chat` resolves ONE exact handle — the "I know who I want"
-- case, used when the user submits. `search_users_for_chat` returns ranked
-- partial matches for type-ahead. Splitting them keeps the exact path
-- unambiguous: a prefix search that happens to return one row is not the same
-- as an exact match, and silently opening a chat with "whoever ranked first"
-- is how you message the wrong person.
--
-- ── Prefix, not substring ────────────────────────────────────────────────────
-- Search matches a PREFIX (`ada%`), not a substring (`%ada%`). Substring search
-- over a user table is a directory-scraping primitive: two characters would
-- enumerate a large share of the user base. A prefix means you must broadly
-- know the handle already, which is the actual use case.
-- ═════════════════════════════════════════════════════════════════════════════

-- Case-insensitive username lookups need an index that matches the comparison,
-- or every search is a sequential scan over users.
CREATE INDEX IF NOT EXISTS users_username_lower_idx
  ON public.users (lower(username))
  WHERE username IS NOT NULL;

-- ─── Exact resolution ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.find_user_for_chat(p_handle TEXT)
RETURNS TABLE (
  id              UUID,
  full_name       TEXT,
  username        TEXT,
  role            TEXT,
  driver_id       TEXT,
  profile_photo   TEXT,
  vehicle_details TEXT,
  park_name       TEXT,
  avg_rating      NUMERIC
) AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_handle TEXT := btrim(COALESCE(p_handle, ''));
  v_bare   TEXT;
  v_drv    TEXT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF v_handle = '' THEN
    RETURN;
  END IF;

  -- "@ada" and "ada" are the same handle.
  v_bare := ltrim(v_handle, '@');
  -- "a1b2c3", "drv a1b2c3" and "DRV-A1B2C3" are the same driver ID.
  v_drv  := 'DRV-' || upper(regexp_replace(replace(v_bare, ' ', '-'), '^DRV-?', '', 'i'));

  RETURN QUERY
    SELECT u.id, u.full_name, u.username, u.role::TEXT, u.driver_id,
           u.profile_photo, u.vehicle_details, u.park_name, u.avg_rating
    FROM public.users u
    -- Messaging yourself is always a mistake, never a feature.
    WHERE u.id <> v_me
      AND (
        lower(u.username) = lower(v_bare)
        OR upper(u.driver_id) = upper(v_handle)
        OR upper(u.driver_id) = v_drv
      )
    -- A username match beats an ID match when a handle could be read as either.
    ORDER BY (lower(u.username) = lower(v_bare)) DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ─── Type-ahead ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.search_users_for_chat(
  p_query TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id              UUID,
  full_name       TEXT,
  username        TEXT,
  role            TEXT,
  driver_id       TEXT,
  profile_photo   TEXT,
  vehicle_details TEXT,
  avg_rating      NUMERIC
) AS $$
DECLARE
  v_me   UUID := auth.uid();
  v_q    TEXT := btrim(COALESCE(p_query, ''));
  v_bare TEXT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  v_bare := ltrim(v_q, '@');

  -- One character matches too much of the table to be a search; it is a scrape.
  IF length(v_bare) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT u.id, u.full_name, u.username, u.role::TEXT, u.driver_id,
           u.profile_photo, u.vehicle_details, u.avg_rating
    FROM public.users u
    WHERE u.id <> v_me
      AND (
        lower(u.username)  LIKE lower(v_bare) || '%'
        OR upper(u.driver_id) LIKE upper(v_bare) || '%'
        OR lower(u.full_name) LIKE lower(v_bare) || '%'
      )
    ORDER BY
      (lower(u.username) = lower(v_bare)) DESC,
      (lower(u.username) LIKE lower(v_bare) || '%') DESC,
      u.full_name ASC
    LIMIT LEAST(GREATEST(p_limit, 1), 25);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- REVOKE before GRANT: Postgres gives EXECUTE to PUBLIC by default, so without
-- the revoke the grant widens nothing and `anon` can enumerate handles.

REVOKE ALL ON FUNCTION public.find_user_for_chat(TEXT)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_users_for_chat(TEXT, INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.find_user_for_chat(TEXT)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_users_for_chat(TEXT, INTEGER) TO authenticated;
