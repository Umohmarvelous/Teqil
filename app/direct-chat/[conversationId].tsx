// app/direct-chat/[conversationId].tsx
//
// The chat route. Nine screens push here: find-driver (×2), driver-search,
// (driver)/messages, nearby (×2), the messages tab (×3) and a notification tap.
//
// ── What this file used to be, and why that mattered ───────────────────────
// A second, standalone chat screen. It rendered `components/MessageBubble.tsx`
// — last touched in May — on a flat background, and imported nothing from the
// messages tab despite the comments over there claiming it did. So the doodle
// wallpaper, grouped bubbles with tails, voice notes, reply quoting and the
// contact card all went into `messages.tsx`, and the screen users actually
// opened by tapping a conversation never received any of it.
//
// It is now a ROUTE, not a screen: it resolves the conversation id in the URL
// to a conversation and hands off to `components/chat/ChatScreen`, the single
// implementation both entry points share. There is nothing here left to drift.
//
// ── Resolving the id ───────────────────────────────────────────────────────
// The store is the fast path — arriving from the messages list means the
// conversation is already loaded and the chat paints immediately. A cold start
// from a push notification has an empty store, so `loadConversations` runs and
// we look again. Only if BOTH miss do we fall back to the route params, which
// carry enough to render a usable header while the rest catches up.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import { ChatScreen } from "@/components/chat/ChatScreen";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useMessagesStore, type Conversation } from "@/src/store/useMessagesStore";
import { useIOSTheme } from "@/components/ios";

/**
 * How far in from the left edge counts as an edge swipe.
 *
 * 28pt, matching iOS's own interactive-pop region. Wider starts stealing
 * horizontal drags from the message list; narrower is unhittable with a thumb.
 */
const EDGE_WIDTH = 28;
/** Travel before the gesture commits. Short enough to feel light, long enough
 *  that a stray thumb-graze while typing does not close the thread. */
const CLOSE_DISTANCE = 70;

export default function DirectChatRoute() {
  const { conversationId, driverName, driverId } = useLocalSearchParams<{
    conversationId: string;
    driverName?: string;
    driverId?: string;
  }>();
  const chatId = conversationId ?? "";

  const t = useIOSTheme();
  const isDark = useSettingsStore((s) => s.theme) === "dark";
  const user = useAuthStore((s) => s.user);

  const conversations = useMessagesStore((s) => s.conversations);
  const loadConversations = useMessagesStore((s) => s.loadConversations);

  const [tried, setTried] = useState(false);

  const conversation = useMemo(
    () => conversations.find((c) => c.id === chatId) ?? null,
    [conversations, chatId],
  );

  // Only fetch when the store genuinely does not have it. Re-fetching on every
  // open would put a network round trip in front of a screen that was ready.
  useEffect(() => {
    if (conversation || tried || !user?.id) return;
    let alive = true;
    loadConversations(user.id, (user.role === "driver" ? "driver" : "passenger"))
      .catch(() => {})
      .finally(() => {
        if (alive) setTried(true);
      });
    return () => {
      alive = false;
    };
  }, [conversation, tried, user?.id, user?.role, loadConversations]);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(main)/messages");
  }, []);

  // Swipe in from the left edge to close, the way every messaging app on the
  // platform behaves. `activeOffsetX` means the gesture only claims the touch
  // once it is clearly horizontal, so vertical scrolling in the message list is
  // untouched; `failOffsetY` releases it outright on a mostly-vertical drag.
  const edgeSwipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(12)
        .failOffsetY([-14, 14])
        .onBegin((e) => {
          // Anything starting away from the edge is the list's, not ours.
          if (e.x > EDGE_WIDTH) return;
        })
        .onEnd((e) => {
          if (e.absoluteX - e.translationX <= EDGE_WIDTH && e.translationX > CLOSE_DISTANCE) {
            runOnJS(close)();
          }
        }),
    [close],
  );

  // Enough to render a correct header while the real row arrives. Built from
  // the params the caller already passed rather than from placeholders, so the
  // name in the header is right on the very first frame.
  const fallback: Conversation | null = useMemo(() => {
    if (!chatId) return null;
    return {
      id: chatId,
      participant_id: "",
      participant_name: driverName || "Chat",
      participant_role: "driver",
      participant_driver_id: driverId || undefined,
      last_message: "",
      last_message_at: new Date().toISOString(),
      unread_count: 0,
    };
  }, [chatId, driverName, driverId]);

  const active = conversation ?? (tried ? fallback : null);

  if (!active) {
    return (
      <View style={[styles.centre, { backgroundColor: t.systemGroupedBackground }]}>
        <ActivityIndicator color={t.tint} size="large" />
      </View>
    );
  }

  if (!chatId) {
    return (
      <View style={[styles.centre, { backgroundColor: t.systemGroupedBackground }]}>
        <Text style={{ color: t.secondaryLabel }}>That conversation no longer exists.</Text>
      </View>
    );
  }

  return (
    <GestureDetector gesture={edgeSwipe}>
      <View style={styles.flex}>
        <ChatScreen conversation={active} onBack={close} isDark={isDark} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
});
