-- ═════════════════════════════════════════════════════════════════════════════
-- EMILGO / Teqil — make messaging actually work between two accounts
--
-- Run ONCE in Supabase → SQL Editor → Run. Idempotent.
--
-- Three things were broken, and together they meant a message could never reach
-- another device. The app looked fine because it is offline-first: everything
-- was written to AsyncStorage and the cloud write failed silently.
--
-- ── 1. `conversations` had RLS enabled and NO policies ───────────────────────
-- RLS with no policy denies everything. Every select returned empty and every
-- insert failed, for everyone, always. Supabase's own advisor flags this as
-- `rls_enabled_no_policy`. Policies are added below.
--
-- ── 2. `messages` was a different table than the app writes ──────────────────
-- It had (chat_id, sender_id, text, status, created_at) with a foreign key to a
-- `chats` table, while the app writes conversation_id, sender_name, sender_role,
-- audio_uri and read. So inserts failed on unknown columns — and voice notes
-- could never have synced, because there was nowhere to put the audio.
--
-- Both tables are EMPTY (verified before writing this), so the old `messages` is
-- renamed rather than dropped: nothing is lost, and the legacy shape is still
-- there if some other consumer turns out to want it.
--
-- ── 3. A conversation only described ONE of its two sides ────────────────────
-- The row stored `participant_*` (the driver) and a bare `passenger_id`. The
-- client always rendered `participant_*` as "the other person", so a DRIVER
-- opening their inbox saw a conversation with themselves — their own name, their
-- own photo. That is the whole of "drivers can't see messages sent to them".
--
-- The fix is to describe both sides and let the client pick the one that isn't
-- them. Denormalised on purpose: a conversation list must render without a join
-- back to `users`, which RLS makes unreadable across accounts anyway.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 0. Conversation ids are text, not UUIDs ─────────────────────────────────
--
-- The app derives a conversation id as `direct_` + the two user ids sorted:
--
--     direct_<uuid-a>_<uuid-b>
--
-- That is deliberate and worth keeping — both devices compute the SAME id
-- independently, so a conversation needs no coordination round trip to exist on
-- both sides. It is also not a UUID, and the column was `uuid`, so every insert
-- would have been rejected as malformed input even once the policies existed.
--
-- Message ids have the same shape problem: `generateId()` returns
-- `Date.now() + random`, which is not a UUID either. The new table below types
-- it TEXT accordingly.
--
-- Both tables are empty, so widening the type costs nothing.
--
-- ── The three dead schemas ───────────────────────────────────────────────────
-- This database accumulated THREE overlapping messaging designs, all empty and
-- none of them reachable by the app:
--
--   chats + messages(chat_id)   — the oldest; the app never queries `chats`
--   message (singular)          — field names match the app, but the app
--                                 queries `messages` (plural), so it was never
--                                 hit; RLS on, no policies either way
--   conversations               — the one the app does use
--
-- `message.conversation_id` is a UUID foreign key into conversations(id), which
-- makes the type change below impossible while it exists. The constraint is
-- dropped rather than the table: `message` is empty and unused, and dropping a
-- table is not reversible whereas re-adding a constraint is.
ALTER TABLE IF EXISTS public.message
  DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey;

ALTER TABLE public.conversations
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE TEXT USING id::TEXT;

-- ─── Conversations: describe both sides ──────────────────────────────────────

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS participant_username TEXT,
  ADD COLUMN IF NOT EXISTS passenger_name       TEXT,
  ADD COLUMN IF NOT EXISTS passenger_username   TEXT,
  ADD COLUMN IF NOT EXISTS passenger_photo      TEXT;

-- Both lookup directions are hot: "my conversations" runs on every inbox open.
CREATE INDEX IF NOT EXISTS conversations_participant_idx
  ON public.conversations (participant_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversations_passenger_idx
  ON public.conversations (passenger_id, last_message_at DESC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- You may only see and touch a conversation you are IN. Note this is the whole
-- reason messaging was dead: the table had RLS on and nothing here.
DROP POLICY IF EXISTS conversations_select_own ON public.conversations;
CREATE POLICY conversations_select_own ON public.conversations
  FOR SELECT TO authenticated
  USING (participant_id = auth.uid() OR passenger_id = auth.uid());

DROP POLICY IF EXISTS conversations_insert_own ON public.conversations;
CREATE POLICY conversations_insert_own ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (participant_id = auth.uid() OR passenger_id = auth.uid());

-- Either side may update it — last_message and unread_count are written by
-- whoever sent or read the most recent message.
DROP POLICY IF EXISTS conversations_update_own ON public.conversations;
CREATE POLICY conversations_update_own ON public.conversations
  FOR UPDATE TO authenticated
  USING (participant_id = auth.uid() OR passenger_id = auth.uid());

-- ─── Messages: match what the app actually writes ────────────────────────────

-- Keep the legacy table rather than dropping it. It is empty, but renaming is
-- reversible and dropping is not.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'chat_id'
  ) THEN
    ALTER TABLE public.messages RENAME TO messages_legacy_chats;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Denormalised so a bubble renders without reading `users`, which RLS blocks
  -- across accounts.
  sender_name     TEXT,
  sender_role     TEXT,
  text            TEXT,
  -- Voice notes. Nothing to put these in was why they could never sync.
  audio_uri       TEXT,
  read            BOOLEAN     NOT NULL DEFAULT false,
  status          TEXT        NOT NULL DEFAULT 'sent',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A message with neither text nor audio is not a message.
  CONSTRAINT messages_has_content CHECK (text IS NOT NULL OR audio_uri IS NOT NULL),
  CONSTRAINT messages_status_known CHECK (status IN ('sent', 'delivered', 'read'))
);

-- The thread query: every message in a conversation, oldest first.
CREATE INDEX IF NOT EXISTS messages_conversation_idx
  ON public.messages (conversation_id, created_at ASC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Membership is defined by the conversation, so every policy asks the same
-- question: is there a conversation with this id that I am part of?
DROP POLICY IF EXISTS messages_select_participant ON public.messages;
CREATE POLICY messages_select_participant ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.participant_id = auth.uid() OR c.passenger_id = auth.uid())
    )
  );

-- You may only send AS yourself, and only into a conversation you are in.
DROP POLICY IF EXISTS messages_insert_own ON public.messages;
CREATE POLICY messages_insert_own ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.participant_id = auth.uid() OR c.passenger_id = auth.uid())
    )
  );

-- The RECIPIENT marks a message read, so this deliberately is not limited to
-- the sender.
DROP POLICY IF EXISTS messages_update_participant ON public.messages;
CREATE POLICY messages_update_participant ON public.messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.participant_id = auth.uid() OR c.passenger_id = auth.uid())
    )
  );

-- Only your own messages can be deleted.
DROP POLICY IF EXISTS messages_delete_own ON public.messages;
CREATE POLICY messages_delete_own ON public.messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

-- ─── Realtime ────────────────────────────────────────────────────────────────
-- Without this, a reply only appears after a manual refresh.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;
