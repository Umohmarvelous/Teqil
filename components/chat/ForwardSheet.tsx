// components/chat/ForwardSheet.tsx
//
// Pick the chats to forward into. Multi-select, searchable, with a send button
// that names what it is about to do.
//
// ── Why the fan-out is server-side ─────────────────────────────────────────
// The sheet collects ids and calls `chat_forward` once. Copying on the client
// would mean N inserts the app has to keep consistent, and every copy would need
// the `forwarded` flag set by hand — a flag that must never be forgotten,
// because a forwarded message that claims to be original is a lie about who
// said something.

import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput, ScrollView, ActivityIndicator } from "react-native";
import * as Haptics from "expo-haptics";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Search01Icon, CheckmarkCircle02Icon, SentIcon, Cancel01Icon } from "@hugeicons/core-free-icons";

import { IOSSheet, useIOSTheme, IOSAppFont, iosAlert } from "@/components/ios";
import Avatar from "@/components/Avatar";
import { useMessagesStore, type Conversation } from "@/src/store/useMessagesStore";

export interface ForwardSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Messages to forward. Order is preserved by the RPC, oldest first. */
  messageIds: string[];
  /** Don't offer to forward a message back into the chat it came from. */
  excludeConversationId?: string;
  onDone?: (count: number) => void;
}

export function ForwardSheet({
  visible, onClose, messageIds, excludeConversationId, onDone,
}: ForwardSheetProps) {
  const t = useIOSTheme();
  const conversations = useMessagesStore((s) => s.conversations);
  const forwardMessages = useMessagesStore((s) => s.forwardMessages);

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, "");
    return conversations
      .filter((c) => c.id !== excludeConversationId)
      .filter((c) =>
        !q ||
        [c.participant_name, c.participant_username, c.participant_driver_id]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      );
  }, [conversations, query, excludeConversationId]);

  const toggle = (c: Conversation) => {
    Haptics.selectionAsync();
    setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]));
  };

  const send = async () => {
    if (!picked.length || sending) return;
    setSending(true);
    try {
      const n = await forwardMessages(messageIds, picked);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone?.(n);
      setPicked([]);
      setQuery("");
      onClose();
    } catch (e: any) {
      iosAlert("Could not forward", e?.message ?? "Please try again.");
    } finally {
      setSending(false);
    }
  };

  const noun = messageIds.length === 1 ? "message" : `${messageIds.length} messages`;

  return (
    <IOSSheet
      visible={visible}
      onClose={onClose}
      detents={[0.7, "large"]}
      title={`Forward ${noun}`}
      showGrabber
      dismissible
      contentStyle={{ paddingHorizontal: 0 }}
    >
      <View style={[styles.searchRow, { backgroundColor: t.tertiarySystemFill }]}>
        <HugeiconsIcon icon={Search01Icon} size={17} color={t.tertiaryLabel} />
        <TextInput
          style={[styles.search, { color: t.label }]}
          placeholder="Search chats"
          placeholderTextColor={t.tertiaryLabel}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query ? (
          <Pressable hitSlop={8} onPress={() => setQuery("")}>
            <HugeiconsIcon icon={Cancel01Icon} size={15} color={t.tertiaryLabel} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {list.length === 0 ? (
          <Text style={[styles.empty, { color: t.tertiaryLabel }]}>
            {query ? `No chat matches “${query.trim()}”.` : "You have no other chats to forward to yet."}
          </Text>
        ) : null}

        {list.map((c) => {
          const on = picked.includes(c.id);
          return (
            <Pressable
              key={c.id}
              onPress={() => toggle(c)}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: t.separator },
                pressed && { backgroundColor: t.tertiarySystemFill },
              ]}
            >
              <Avatar name={c.participant_name || "User"} photoUri={c.participant_photo} size={42} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.name, { color: t.label }]} numberOfLines={1}>
                  {c.participant_name || "User"}
                </Text>
                {c.participant_username ? (
                  <Text style={[styles.meta, { color: t.tertiaryLabel }]} numberOfLines={1}>
                    @{c.participant_username}
                  </Text>
                ) : null}
              </View>
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={22}
                color={on ? t.tint : t.quaternaryLabel}
                strokeWidth={2}
              />
            </Pressable>
          );
        })}
      </ScrollView>

      {/* The button names the count, so nobody forwards to nine chats thinking
          they picked one. */}
      <Pressable
        onPress={send}
        disabled={!picked.length || sending}
        style={[
          styles.send,
          { backgroundColor: picked.length ? t.tint : t.tertiarySystemFill, opacity: sending ? 0.7 : 1 },
        ]}
      >
        {sending ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <HugeiconsIcon icon={SentIcon} size={18} color={picked.length ? "#fff" : t.tertiaryLabel} />
            <Text style={[styles.sendText, { color: picked.length ? "#fff" : t.tertiaryLabel }]}>
              {picked.length ? `Send to ${picked.length} chat${picked.length > 1 ? "s" : ""}` : "Select a chat"}
            </Text>
          </>
        )}
      </Pressable>
    </IOSSheet>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 20, marginBottom: 8,
    paddingHorizontal: 12, height: 38, borderRadius: 10,
  },
  search: { flex: 1, ...IOSAppFont.subheadline, padding: 0 },
  list: { flex: 1 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { ...IOSAppFont.subheadline, fontFamily: "Poppins_500Medium" },
  meta: { ...IOSAppFont.caption1 },
  empty: { ...IOSAppFont.subheadline, textAlign: "center", paddingHorizontal: 40, paddingVertical: 40, lineHeight: 20 },
  send: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginHorizontal: 20, marginTop: 10, marginBottom: 6,
    height: 50, borderRadius: 14,
  },
  sendText: { ...IOSAppFont.headline },
});

export default ForwardSheet;
