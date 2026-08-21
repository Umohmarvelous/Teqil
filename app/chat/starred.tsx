// app/chat/starred.tsx
//
// Every message this user has starred, across every chat.
//
// ── Why it is a server query and not a filter over the cache ───────────────
// A star is a bookmark on a conversation you may not have opened on this device
// and may not have in memory. Filtering `useMessagesStore.messages` would show
// only the stars in chats that happen to be cached — which looks exactly like
// losing them.
//
// Tapping a row opens the chat. It does not yet scroll to the message: the
// thread loads oldest-first with a cap, and jumping to a star from two thousand
// messages back needs paging that does not exist. Opening the right chat is the
// honest half of that, and it is what the row promises.

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { StarIcon, Message02Icon } from "@hugeicons/core-free-icons";

import {
  IOSScreen,
  SwipeableRow,
  useCollapsibleScroll,
  useIOSTheme,
  IOSAppFont,
} from "@/components/ios";
import Avatar from "@/components/Avatar";
import { listStarred, toggleStar, type StarredRow } from "@/src/services/chat";
import { dayLabel } from "@/components/chat/ChatBubble";

function previewOf(row: StarredRow): string {
  if (row.text) return row.text;
  if (row.media_type === "image") return "📷 Photo";
  if (row.media_type === "video") return "🎥 Video";
  if (row.media_type === "file") return `📄 ${row.media_name || "Document"}`;
  if (row.audio_uri) return "🎤 Voice message";
  return "Message";
}

export default function StarredMessagesScreen() {
  const t = useIOSTheme();
  const scroll = useCollapsibleScroll();

  const [rows, setRows] = useState<StarredRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await listStarred();
    setRows(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const unstar = async (row: StarredRow) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Optimistic: the row is gone from a list whose whole subject is "starred",
    // so leaving it there while the RPC runs would read as the tap failing.
    setRows((r) => r.filter((x) => x.id !== row.id));
    await toggleStar(row.id);
  };

  return (
    <IOSScreen title="Starred" back scrollable={false} scroll={scroll} tabBarInset={false}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        {...scroll.scrollProps}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={t.tint}
            progressViewOffset={scroll.refreshOffset}
          />
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.centre}><ActivityIndicator color={t.tint} /></View>
          ) : (
            <View style={styles.centre}>
              <HugeiconsIcon icon={StarIcon} size={38} color={t.quaternaryLabel} />
              <Text style={[styles.emptyTitle, { color: t.label }]}>No starred messages</Text>
              <Text style={[styles.emptyText, { color: t.tertiaryLabel }]}>
                Long-press any message and choose Star to keep it here.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <SwipeableRow
            actions={[
              {
                key: "unstar",
                label: "Unstar",
                symbol: "star.slash.fill",
                color: t.systemOrange,
                onPress: () => unstar(item),
              },
            ]}
          >
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                router.push({
                  pathname: "/direct-chat/[conversationId]",
                  params: { conversationId: item.conversation_id, driverName: item.other_name ?? "Chat" },
                });
              }}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: t.separator, backgroundColor: pressed ? t.tertiarySystemFill : "transparent" },
              ]}
            >
              <Avatar name={item.other_name || "User"} photoUri={item.other_photo ?? undefined} size={42} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.topRow}>
                  <Text style={[styles.name, { color: t.label }]} numberOfLines={1}>
                    {item.other_name || "Chat"}
                  </Text>
                  <HugeiconsIcon icon={StarIcon} size={12} color={t.systemOrange} strokeWidth={2.4} />
                  <Text style={[styles.when, { color: t.tertiaryLabel }]}>{dayLabel(item.created_at)}</Text>
                </View>
                <Text style={[styles.preview, { color: t.secondaryLabel }]} numberOfLines={2}>
                  {previewOf(item)}
                </Text>
                <Text style={[styles.from, { color: t.tertiaryLabel }]} numberOfLines={1}>
                  <HugeiconsIcon icon={Message02Icon} size={10} color={t.tertiaryLabel} />
                  {"  "}
                  {item.sender_name || "Someone"}
                </Text>
              </View>
            </Pressable>
          </SwipeableRow>
        )}
      />
    </IOSScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { ...IOSAppFont.subheadline, fontFamily: "Poppins_600SemiBold", flexShrink: 1 },
  when: { ...IOSAppFont.caption2, marginLeft: "auto" },
  preview: { ...IOSAppFont.subheadline, marginTop: 2 },
  from: { ...IOSAppFont.caption2, marginTop: 3 },
  centre: { alignItems: "center", gap: 8, paddingTop: 90, paddingHorizontal: 44 },
  emptyTitle: { ...IOSAppFont.headline },
  emptyText: { ...IOSAppFont.subheadline, textAlign: "center", lineHeight: 20 },
});
