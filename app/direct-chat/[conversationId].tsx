// app/direct-chat/[conversationId].tsx
//
// A one-to-one thread between a passenger and a driver.
//
// The screen owns the message list rather than pushing it into a store: a chat
// thread is read by exactly one screen at a time, and the realtime channel is
// already scoped to this conversation. Anything the rest of the app needs about
// unread state comes from useMessagesStore, which is a different concern.
//
// Sends are optimistic. The row is painted the instant it's typed, then
// reconciled when the server confirms; a failed send stays visible as 'queued'
// rather than vanishing, so nobody loses what they wrote.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";

import { Glass } from "@/components/ios";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import {
  useChatSubscription,
  useMessageActions,
  fetchMessages,
  markThreadRead,
} from "@/src/hooks/useChatManager";
import { haptics } from "@/src/utils/haptics";
import { Colors } from "@/constants/colors";
import { Message } from "@/src/types/chat";
import { MessageBubble } from "@/components/MessageBubble";

export default function DirectChatScreen() {
  const { conversationId, driverName } = useLocalSearchParams<{
    conversationId: string;
    driverName?: string;
  }>();
  const chatId = conversationId ?? "";

  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";

  const bg = isDark ? Colors.background : Colors.border;
  const barBg = isDark ? Colors.primaryDarker : Colors.textWhite;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const inputBg = isDark ? "rgba(255,255,255,0.07)" : "#FFFFFF";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E5E8EC";

  const { sendMessage } = useMessageActions();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<Message>>(null);

  // ── Loading and realtime ──────────────────────────────────────────────────

  useEffect(() => {
    if (!chatId) {
      setLoading(false);
      return;
    }
    let alive = true;
    fetchMessages(chatId).then((rows) => {
      if (!alive) return;
      setMessages(rows);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [chatId]);

  useEffect(() => {
    if (chatId && user?.id) markThreadRead(chatId, user.id);
  }, [chatId, user?.id]);

  const upsert = useCallback((incoming: Message) => {
    setMessages((prev) => {
      const at = prev.findIndex((m) => m.id === incoming.id);
      if (at === -1) return [...prev, incoming];
      const next = [...prev];
      next[at] = incoming;
      return next;
    });
  }, []);

  useChatSubscription(chatId, user?.id ?? "", { onInsert: upsert, onUpdate: upsert });

  // ── Sending ───────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || !user?.id || !chatId) return;

    haptics.tap();
    setDraft("");

    const { optimistic, confirmed } = sendMessage(chatId, user.id, text);
    setMessages((prev) => [...prev, optimistic]);

    confirmed.then((row) => {
      if (!row) return; // stays 'queued' and visible
      // Swap the temp row for the server's, keeping its place in the list.
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? row : m)));
    });
  }, [chatId, draft, sendMessage, user?.id]);

  // The list is inverted so it opens at the newest message and grows upward,
  // which means it wants the data newest-first.
  const ordered = React.useMemo(() => [...messages].reverse(), [messages]);

  const canSend = draft.trim().length > 0;

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: borderColor }]}>
        <Glass
          variant="regular"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={90}
          fallbackTint={barBg}
        />
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.headerSide}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={26} color={textColor} />
        </Pressable>

        <View style={styles.headerCentre}>
          <Text numberOfLines={1} style={[styles.headerTitle, { color: textColor }]}>
            {driverName || "Chat"}
          </Text>
        </View>

        <View style={styles.headerSide} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 54}
      >
        {loading ? (
          <View style={styles.centre}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={ordered}
            inverted
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageBubble message={item} isMe={item.sender_id === user?.id} isDark={isDark} />
            )}
            contentContainerStyle={styles.listContent}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={10}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: subTextColor }]}>
                  No messages yet. Say hello.
                </Text>
              </View>
            }
          />
        )}

        {/* Composer */}
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Glass
            variant="regular"
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            fallbackIntensity={90}
            fallbackTint={barBg}
          />
          <View style={styles.composerRow}>
            <View style={styles.field}>
              <Glass
                variant="clear"
                radius={22}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
                fallbackIntensity={25}
                fallbackTint={inputBg}
              />
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Message"
                placeholderTextColor={subTextColor}
                style={[styles.input, { color: textColor }]}
                multiline
                maxLength={1000}
              />
            </View>

            <Pressable
              onPress={handleSend}
              disabled={!canSend}
              style={styles.sendBtn}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: !canSend }}
            >
              <Glass
                variant="regular"
                tint={Colors.primary}
                interactive
                radius={20}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
                fallbackIntensity={40}
                fallbackTint={Colors.primary}
              />
              {/* Dimming the icon rather than the button: opacity on a glass
                  surface's ancestor renders the effect wrong. */}
              <Ionicons name="arrow-up" size={20} color="#FFFFFF" style={!canSend && styles.dim} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  headerSide: { width: 44, alignItems: "center", justifyContent: "center" },
  headerCentre: { flex: 1, alignItems: "center" },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 17 },

  listContent: { paddingHorizontal: 12, paddingVertical: 12 },
  empty: { alignItems: "center", paddingTop: 60, transform: [{ scaleY: -1 }] },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 14 },

  composer: { paddingTop: 8, paddingHorizontal: 10, overflow: "hidden" },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  field: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    overflow: "hidden",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  input: { fontFamily: "Poppins_400Regular", fontSize: 15, maxHeight: 100, padding: 0 },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  dim: { opacity: 0.45 },
});
