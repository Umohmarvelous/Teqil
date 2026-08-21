-- supabase/tests/test_chat_features.sql
--
-- Proves the chat layer behaves the way a messenger has to: unread is per
-- viewer, mute/pin/wallpaper are one-sided, delete-for-me hides for one person
-- only, delete-for-everyone is sender-only and time-boxed, and nobody can edit
-- anybody else's words.
--
-- Usage: node ./.dbq.mjs -f supabase/tests/test_chat_features.sql
--
-- Everything runs as a real authenticated user with RLS on, inside a
-- transaction that is rolled back — the live database is unchanged.

BEGIN;

CREATE TEMP TABLE t (step text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t TO authenticated, anon;

DO $$
DECLARE
  A UUID; B UUID;
  conv   TEXT := 'test_conv_chat_features';
  m1     TEXT := 'test_msg_1';   -- A -> B
  m2     TEXT := 'test_msg_2';   -- B -> A
  m3     TEXT := 'test_msg_3';   -- A -> B, media
  m_old  TEXT := 'test_msg_old'; -- A -> B, 3 days ago
  conv2  TEXT := 'test_conv_two';
  v_n    INT;
  v_bool BOOLEAN;
  v_txt  TEXT;
  v_ts   TIMESTAMPTZ;
BEGIN
  SELECT id INTO A FROM public.users ORDER BY created_at LIMIT 1;
  SELECT id INTO B FROM public.users WHERE id <> A ORDER BY created_at LIMIT 1;
  IF A IS NULL OR B IS NULL THEN
    INSERT INTO t VALUES ('need two users in public.users', false, 'sign up twice first');
    RETURN;
  END IF;

  -- ── Fixtures, as the table owner (bypasses RLS on purpose) ──────────────
  INSERT INTO public.conversations (id, type, participant_id, participant_name,
                                    participant_role, passenger_id, passenger_name,
                                    last_message, last_message_at, unread_count)
  VALUES (conv, 'direct', A, 'User A', 'driver', B, 'User B', '', now(), 0),
         (conv2,'direct', A, 'User A', 'driver', B, 'User B', '', now(), 0);

  INSERT INTO public.messages (id, conversation_id, sender_id, sender_name, text,
                               read, status, created_at)
  VALUES (m_old, conv, A, 'User A', 'three days ago', false, 'sent', now() - interval '3 days'),
         (m1,    conv, A, 'User A', 'hello from A',   false, 'sent', now() - interval '10 minutes'),
         (m2,    conv, B, 'User B', 'hello from B',   false, 'sent', now() - interval '5 minutes');

  INSERT INTO public.messages (id, conversation_id, sender_id, sender_name,
                               media_url, media_type, media_name, read, status, created_at)
  VALUES (m3, conv, A, 'User A', conv || '/photo.jpg', 'image', 'photo.jpg', false, 'sent', now() - interval '4 minutes');

  -- ═══════════════════════════════════════════════════════════════════════
  -- As A
  -- ═══════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', A, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. The trigger keeps the preview honest
  SELECT last_message INTO v_txt FROM public.conversations WHERE id = conv;
  INSERT INTO t VALUES ('insert trigger bumped the conversation preview',
    v_txt = '📷 Photo', v_txt);

  -- 2. The inbox resolves "the other person" for the caller
  SELECT other_name INTO v_txt FROM public.chat_list_conversations() WHERE id = conv;
  INSERT INTO t VALUES ('A sees the conversation as being with B', v_txt = 'User B', v_txt);

  -- 3. Unread is per viewer. A has one unread (m2, from B).
  SELECT unread_count INTO v_n FROM public.chat_list_conversations() WHERE id = conv;
  INSERT INTO t VALUES ('A has exactly 1 unread (only B''s message counts)', v_n = 1, v_n::text);

  -- 4. Reading marks only the OTHER side's messages
  PERFORM public.chat_mark_read(conv);
  SELECT count(*) INTO v_n FROM public.messages WHERE conversation_id = conv AND read;
  INSERT INTO t VALUES ('mark_read touched 1 message, not the whole thread', v_n = 1, v_n::text);
  SELECT read INTO v_bool FROM public.messages WHERE id = m1;
  INSERT INTO t VALUES ('A''s own outgoing message is still unread', v_bool = false, v_bool::text);

  SELECT unread_count INTO v_n FROM public.chat_list_conversations() WHERE id = conv;
  INSERT INTO t VALUES ('A''s unread is now 0', v_n = 0, v_n::text);

  -- 5. Mute / pin / wallpaper are one-sided
  PERFORM public.chat_set_prefs(conv, p_muted_until := now() + interval '8 hours',
                                p_pinned := true, p_wallpaper := 'sunset');
  SELECT pinned INTO v_bool FROM public.chat_list_conversations() WHERE id = conv;
  INSERT INTO t VALUES ('A pinned the chat', v_bool, NULL);
  SELECT wallpaper INTO v_txt FROM public.chat_list_conversations() WHERE id = conv;
  INSERT INTO t VALUES ('A''s wallpaper is stored', v_txt = 'sunset', v_txt);

  -- A second call that sets only the wallpaper must not clear the mute
  PERFORM public.chat_set_prefs(conv, p_wallpaper := 'plain');
  SELECT muted_until INTO v_ts FROM public.chat_list_conversations() WHERE id = conv;
  INSERT INTO t VALUES ('setting only the wallpaper left the mute alone',
    v_ts IS NOT NULL, v_ts::text);

  PERFORM public.chat_set_prefs(conv, p_clear_mute := true);
  SELECT muted_until INTO v_ts FROM public.chat_list_conversations() WHERE id = conv;
  INSERT INTO t VALUES ('unmute clears it explicitly', v_ts IS NULL, NULL);

  -- 6. Starring is per user
  v_bool := public.chat_toggle_star(m2);
  INSERT INTO t VALUES ('star on returns true', v_bool, NULL);
  SELECT count(*) INTO v_n FROM public.chat_list_starred();
  INSERT INTO t VALUES ('A has 1 starred message', v_n = 1, v_n::text);
  SELECT starred INTO v_bool FROM public.chat_list_messages(conv) WHERE id = m2;
  INSERT INTO t VALUES ('the message reads back as starred', v_bool, NULL);

  -- 7. Mark unread again
  PERFORM public.chat_mark_unread(conv);
  SELECT unread_count INTO v_n FROM public.chat_list_conversations() WHERE id = conv;
  INSERT INTO t VALUES ('mark_unread restores exactly 1, not the whole history',
    v_n = 1, v_n::text);
  PERFORM public.chat_mark_read(conv);

  -- 8. Media gallery
  SELECT count(*) INTO v_n FROM public.chat_conversation_media(conv, 'media');
  INSERT INTO t VALUES ('the gallery finds the one image', v_n = 1, v_n::text);
  SELECT count(*) INTO v_n FROM public.chat_conversation_media(conv, 'docs');
  INSERT INTO t VALUES ('no documents in this chat', v_n = 0, v_n::text);

  -- 9. Search
  SELECT count(*) INTO v_n FROM public.chat_search_messages('hello', conv);
  INSERT INTO t VALUES ('search finds both "hello" messages', v_n = 2, v_n::text);
  SELECT count(*) INTO v_n FROM public.chat_search_messages('nothing-matches-this', conv);
  INSERT INTO t VALUES ('search returns nothing for a miss', v_n = 0, v_n::text);

  -- 10. Editing is sender-only and time-boxed
  PERFORM public.chat_edit_message(m1, 'hello from A (edited)');
  SELECT text INTO v_txt FROM public.messages WHERE id = m1;
  INSERT INTO t VALUES ('A edited A''s own message', v_txt LIKE '%(edited)', v_txt);

  BEGIN
    PERFORM public.chat_edit_message(m2, 'I never said this');
    INSERT INTO t VALUES ('A CANNOT edit B''s message', false, 'the edit went through');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t VALUES ('A cannot edit B''s message', true, SQLERRM);
  END;

  BEGIN
    PERFORM public.chat_edit_message(m_old, 'rewriting history');
    INSERT INTO t VALUES ('the edit window is enforced', false, 'a 3-day-old edit went through');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t VALUES ('the edit window is enforced', true, SQLERRM);
  END;

  -- 11. The RLS hole is closed: a direct UPDATE on B's row must change nothing
  UPDATE public.messages SET text = 'tampered' WHERE id = m2;
  SELECT text INTO v_txt FROM public.messages WHERE id = m2;
  INSERT INTO t VALUES ('a raw UPDATE on the other side''s message is refused by RLS',
    v_txt = 'hello from B', v_txt);

  -- 12. Delete for everyone: sender-only, within the window
  SELECT public.chat_delete_for_everyone(ARRAY[m2]) INTO v_n;
  INSERT INTO t VALUES ('A cannot delete-for-everyone B''s message', v_n = 0, v_n::text);

  SELECT public.chat_delete_for_everyone(ARRAY[m_old]) INTO v_n;
  INSERT INTO t VALUES ('a 3-day-old message is outside the delete window', v_n = 0, v_n::text);

  SELECT public.chat_delete_for_everyone(ARRAY[m3]) INTO v_n;
  INSERT INTO t VALUES ('A deletes A''s own recent message for everyone', v_n = 1, v_n::text);
  SELECT media_url INTO v_txt FROM public.messages WHERE id = m3;
  INSERT INTO t VALUES ('the deleted message kept no content', v_txt IS NULL, v_txt);
  SELECT count(*) INTO v_n FROM public.chat_conversation_media(conv, 'media');
  INSERT INTO t VALUES ('it left the media gallery too', v_n = 0, v_n::text);

  -- 13. Delete for me hides it for A only
  SELECT public.chat_delete_for_me(ARRAY[m1]) INTO v_n;
  INSERT INTO t VALUES ('delete-for-me recorded', v_n = 1, v_n::text);
  SELECT count(*) INTO v_n FROM public.chat_list_messages(conv) WHERE id = m1;
  INSERT INTO t VALUES ('A no longer sees it', v_n = 0, v_n::text);

  -- 14. Forward
  SELECT public.chat_forward(ARRAY[m2], ARRAY[conv2]) INTO v_n;
  INSERT INTO t VALUES ('forwarded 1 message', v_n = 1, v_n::text);
  SELECT count(*) INTO v_n FROM public.chat_list_messages(conv2)
   WHERE forwarded AND text = 'hello from B';
  INSERT INTO t VALUES ('the copy landed, flagged as forwarded and sent by A', v_n = 1, v_n::text);

  -- 15. Clear chat is one-sided
  PERFORM public.chat_clear_history(conv);
  SELECT count(*) INTO v_n FROM public.chat_list_messages(conv);
  INSERT INTO t VALUES ('A''s copy of the thread is empty', v_n = 0, v_n::text);

  -- ═══════════════════════════════════════════════════════════════════════
  -- As B
  -- ═══════════════════════════════════════════════════════════════════════
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', B, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM public.chat_list_messages(conv);
  INSERT INTO t VALUES ('B still has the thread after A cleared theirs', v_n > 0, v_n::text);

  SELECT count(*) INTO v_n FROM public.chat_list_messages(conv) WHERE id = m1;
  INSERT INTO t VALUES ('B still sees the message A deleted for themselves', v_n = 1, v_n::text);

  SELECT count(*) INTO v_n FROM public.chat_list_messages(conv)
   WHERE id = m3 AND deleted_for_everyone;
  INSERT INTO t VALUES ('B sees the delete-for-everyone tombstone', v_n = 1, v_n::text);

  SELECT pinned INTO v_bool FROM public.chat_list_conversations() WHERE id = conv;
  INSERT INTO t VALUES ('A''s pin did not pin it for B', v_bool = false, v_bool::text);
  SELECT wallpaper INTO v_txt FROM public.chat_list_conversations() WHERE id = conv;
  INSERT INTO t VALUES ('A''s wallpaper is not B''s wallpaper', v_txt IS NULL, v_txt);

  SELECT count(*) INTO v_n FROM public.chat_list_starred();
  INSERT INTO t VALUES ('A''s star is not B''s star', v_n = 0, v_n::text);

  SELECT other_name INTO v_txt FROM public.chat_list_conversations() WHERE id = conv;
  INSERT INTO t VALUES ('B sees the conversation as being with A', v_txt = 'User A', v_txt);

  -- B's unread: A's messages after B's (never-set) last_read_at, minus the
  -- tombstone. m_old and m1 remain.
  SELECT unread_count INTO v_n FROM public.chat_list_conversations() WHERE id = conv;
  INSERT INTO t VALUES ('B''s unread counts only A''s live messages', v_n = 2, v_n::text);

  RESET ROLE;
END $$;

SELECT
  CASE WHEN ok THEN 'PASS' ELSE '**FAIL**' END AS result,
  step,
  detail
FROM t;

SELECT count(*) FILTER (WHERE ok) || '/' || count(*) AS score FROM t;

ROLLBACK;
