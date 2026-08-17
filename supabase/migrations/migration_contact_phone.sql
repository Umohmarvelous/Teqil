-- migration_contact_phone.sql
--
-- Lets one person call another from the chat screen, without publishing anyone's
-- phone number.
--
-- ── The problem ─────────────────────────────────────────────────────────────
-- A driver and a passenger who are arranging a trip need to talk. Chat is not
-- enough — a driver at a junction with the phone on a cradle is not going to
-- type. But `public.users.phone` must never become readable in bulk: a table of
-- Nigerian commercial-transport phone numbers is exactly what a scammer wants,
-- and RLS on `users` is not a substitute for not exposing the column at all.
--
-- ── The rule ────────────────────────────────────────────────────────────────
-- You may read one phone number, one at a time, and only if BOTH hold:
--
--   1. You already share a conversation with that person. Not "you looked them
--      up" — you have actually been introduced. Creating a conversation is
--      itself gated by `find_user_for_chat`, so this is a real relationship.
--   2. They have not turned sharing off. `share_phone` defaults to TRUE because
--      being callable is the point of the product for a driver, but a passenger
--      who does not want to be phoned can say so and it is honoured.
--
-- There is no bulk variant of this function, deliberately. Enumerating contacts
-- one round trip at a time is slow enough to be useless to a scraper and fast
-- enough for the one number a chat screen needs.
--
-- ── Why not number masking ──────────────────────────────────────────────────
-- Masked numbers (a proxy that connects both parties without revealing either)
-- are the better privacy answer and are what Bolt and Uber use. They also need a
-- telco account, per-minute billing and a provisioned pool of numbers. That is a
-- business decision, not a code one — see SETUP-KEYS.md. This migration is the
-- honest interim: consented, one-at-a-time disclosure.

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- COLUMNS
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS share_phone BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.users.share_phone IS
  'When false, get_contact_phone returns NULL for this user even to their own chat contacts.';


-- ═════════════════════════════════════════════════════════════════════════════
-- NORMALISATION
-- ═════════════════════════════════════════════════════════════════════════════

-- Nigerian numbers arrive in three shapes: 08031234567, 2348031234567 and
-- +2348031234567. `tel:` needs one canonical form or half the calls fail
-- silently, so everything is stored and returned as E.164.
--
-- IMMUTABLE so it can be used in an index or a generated column later.
CREATE OR REPLACE FUNCTION public.normalise_ng_phone(p_raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  d TEXT;
BEGIN
  IF p_raw IS NULL THEN RETURN NULL; END IF;

  -- Strip everything that is not a digit, but remember a leading +.
  d := regexp_replace(p_raw, '[^0-9]', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;

  -- 0803… → 234803…
  IF length(d) = 11 AND left(d, 1) = '0' THEN
    RETURN '+234' || substr(d, 2);
  END IF;

  -- 803… (someone dropped the leading zero)
  IF length(d) = 10 THEN
    RETURN '+234' || d;
  END IF;

  -- 234803… already
  IF length(d) = 13 AND left(d, 3) = '234' THEN
    RETURN '+' || d;
  END IF;

  -- Anything else is either an international number or a typo. Return it with a
  -- leading + rather than mangling it: a wrong guess is worse than a passthrough.
  RETURN '+' || d;
END;
$$;

REVOKE ALL ON FUNCTION public.normalise_ng_phone(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalise_ng_phone(TEXT) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- READ ONE CONTACT'S NUMBER
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_contact_phone(p_user UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me    UUID := auth.uid();
  v_phone TEXT;
BEGIN
  IF v_me IS NULL OR p_user IS NULL THEN RETURN NULL; END IF;

  -- Your own number needs no permission check.
  IF p_user = v_me THEN
    SELECT public.normalise_ng_phone(u.phone) INTO v_phone
      FROM public.users u WHERE u.id = v_me;
    RETURN v_phone;
  END IF;

  -- Condition 1: a shared conversation, in whichever direction it was started.
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
     WHERE (c.participant_id = v_me     AND c.passenger_id = p_user)
        OR (c.participant_id = p_user   AND c.passenger_id = v_me)
  ) THEN
    RETURN NULL;
  END IF;

  -- Condition 2: they still allow it. A blocked contact loses the number too —
  -- blocking someone and leaving them able to phone you is not blocking.
  SELECT public.normalise_ng_phone(u.phone) INTO v_phone
    FROM public.users u
   WHERE u.id = p_user
     AND u.share_phone
     AND NOT EXISTS (
       SELECT 1 FROM public.user_blocks b
        WHERE (b.blocker_id = p_user AND b.blocked_id = v_me)
           OR (b.blocker_id = v_me   AND b.blocked_id = p_user)
     );

  RETURN NULLIF(v_phone, '+');
END;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, which includes `anon`. Revoking
-- first is the only thing that actually narrows it.
REVOKE ALL ON FUNCTION public.get_contact_phone(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_contact_phone(UUID) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- WRITE YOUR OWN NUMBER
-- ═════════════════════════════════════════════════════════════════════════════

-- The app could UPDATE users directly under RLS, but routing it through an RPC
-- means the normalisation runs server-side. A client that forgets to normalise
-- would otherwise store a number that `tel:` cannot dial.
CREATE OR REPLACE FUNCTION public.set_my_phone(p_phone TEXT, p_share BOOLEAN DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me   UUID := auth.uid();
  v_norm TEXT;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  v_norm := public.normalise_ng_phone(p_phone);

  -- A Nigerian mobile number is +234 followed by 10 digits. Anything shorter is
  -- a mistype, and storing it guarantees a failed call later.
  IF v_norm IS NULL OR length(regexp_replace(v_norm, '[^0-9]', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'that does not look like a phone number';
  END IF;

  UPDATE public.users
     SET phone       = v_norm,
         share_phone = COALESCE(p_share, share_phone)
   WHERE id = v_me;

  RETURN v_norm;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_phone(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_phone(TEXT, BOOLEAN) TO authenticated;


-- Read your own number + preference back, so Settings can show the real stored
-- value rather than whatever the local cache last believed.
CREATE OR REPLACE FUNCTION public.get_my_phone()
RETURNS TABLE (phone TEXT, share_phone BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.normalise_ng_phone(u.phone), u.share_phone
    FROM public.users u
   WHERE u.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_phone() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_phone() TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- BACKFILL
-- ═════════════════════════════════════════════════════════════════════════════

-- Existing rows hold whatever the signup form captured. Normalising them once
-- means the Call button works for accounts created before this migration.
UPDATE public.users
   SET phone = public.normalise_ng_phone(phone)
 WHERE phone IS NOT NULL
   AND phone <> ''
   AND phone <> public.normalise_ng_phone(phone);

COMMIT;
