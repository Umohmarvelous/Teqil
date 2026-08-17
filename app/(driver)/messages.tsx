import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { BroadcastsStorage } from "@/src/services/storage";
import { triggerSyncNow } from "@/src/services/sync";
import { formatDateTime } from "@/src/utils/helpers";
import type { Broadcast } from "@/src/models/types";
import Animated from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Chat } from "@hugeicons/core-free-icons";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { Glass, IOSScreen, IOSBadge, useCollapsibleScroll } from "@/components/ios";
import Avatar from "@/components/Avatar";
import { useAuthStore } from "@/src/store/useStore";
import {
  useMessagesStore,
  type Conversation,
} from "@/src/store/useMessagesStore";


/**
 * One row per person who has messaged this driver.
 *
 * The screen used to render park broadcasts only, while its own empty state
 * promised "recent messages from passenger will appear here" — so a driver had
 * no way to reach a chat from their own tab. These rows come from the same
 * `useMessagesStore` the passenger side uses, which is what makes a reply
 * possible at all.
 */
function ChatRow({
  conv,
  cardBg,
  subTextColor,
}: {
  conv: Conversation;
  cardBg: string;
  subTextColor: string;
}) {
  const when = conv.last_message_at
    ? new Date(conv.last_message_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <Pressable
      style={styles.cardShadow}
      onPress={() =>
        router.push({
          pathname: "/direct-chat/[conversationId]",
          params: { conversationId: conv.id, driverName: conv.participant_name },
        })
      }
    >
      <Glass
        variant="regular"
        radius={16}
        style={styles.chatRow}
        fallbackIntensity={40}
        fallbackTint={cardBg}
      >
        <Avatar name={conv.participant_name || "Passenger"} photoUri={conv.participant_photo} size={44} />
        <View style={styles.messageContent}>
          <View style={styles.chatTopRow}>
            <Text style={styles.messageTitle} numberOfLines={1}>
              {conv.participant_name || "Passenger"}
            </Text>
            <Text style={[styles.messageTime, { marginTop: 0 }]}>{when}</Text>
          </View>
          <View style={styles.chatBottomRow}>
            <Text style={[styles.messageText, { color: subTextColor }]} numberOfLines={1}>
              {conv.last_message || "Tap to reply"}
            </Text>
            <IOSBadge count={conv.unread_count ?? 0} />
          </View>
        </View>
      </Glass>
    </Pressable>
  );
}

/**
 * Chats and announcements share one scroll view, so a driver sees everything
 * addressed to them in one place rather than having to remember which tab a
 * message arrived on. Chats sort above announcements because one expects a
 * reply and the other does not.
 */
type Row =
  | { kind: "header"; id: string; title: string }
  | { kind: "chat"; id: string; conv: Conversation }
  | { kind: "broadcast"; id: string; broadcast: Broadcast };

function MessageCard({ broadcast, cardBg }: { broadcast: Broadcast; cardBg: string }) {
  return (
    <View style={styles.cardShadow}>
      <Glass
        variant="regular"
        radius={16}
        style={styles.messageCard}
        fallbackIntensity={40}
        fallbackTint={cardBg}
      >
      <View style={styles.messageIconBg}>
        <Glass
          variant="clear"
          radius={12}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={25}
          fallbackTint={Colors.primaryLight}
        />
        <Ionicons name="megaphone" size={20} color={Colors.primary} />
      </View>
      <View style={styles.messageContent}>
        <Text style={styles.messageTitle}>Park Announcement</Text>
        <Text style={styles.messageText}>{broadcast.message}</Text>
        <Text style={styles.messageTime}>{formatDateTime(broadcast.created_at)}</Text>
      </View>
      </Glass>
    </View>
  );
}

export default function MessagesScreen() {
  const { t } = useTranslation();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const user = useAuthStore((s) => s.user);
  const conversations = useMessagesStore((s) => s.conversations);
  const loadConversations = useMessagesStore((s) => s.loadConversations);
  const subscribeToRealtime = useMessagesStore((s) => s.subscribeToRealtime);

  const load = useCallback(async () => {
    const data = await BroadcastsStorage.getAll();
    // Sort newest first
    const sorted = [...data].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    setBroadcasts(sorted);
    // 'driver' is not a guess here — this screen only exists inside the driver
    // route group, and the role decides which side of each conversation row is
    // "the other person".
    if (user?.id) await loadConversations(user.id, "driver");
  }, [user?.id, loadConversations]);

  useEffect(() => {
    load();
  }, [load]);

  // Without this a driver only saw a passenger's message after pulling to
  // refresh, which is indistinguishable from not receiving it.
  useEffect(() => {
    if (!user?.id) return;
    return subscribeToRealtime(user.id);
  }, [user?.id, subscribeToRealtime]);

  const onRefresh = async () => {
    setRefreshing(true);
    // Reload messages AND run a full cloud sync.
    await Promise.all([load(), triggerSyncNow()]);
    setRefreshing(false);
  };

  const rows = useMemo<Row[]>(() => {
    const chats = [...conversations].sort(
      (a, b) =>
        new Date(b.last_message_at || 0).getTime() -
        new Date(a.last_message_at || 0).getTime(),
    );
    const out: Row[] = [];
    if (chats.length) {
      out.push({ kind: "header", id: "h-chats", title: "Chats" });
      for (const c of chats) out.push({ kind: "chat", id: `c-${c.id}`, conv: c });
    }
    if (broadcasts.length) {
      out.push({ kind: "header", id: "h-broadcasts", title: "Park announcements" });
      for (const b of broadcasts) out.push({ kind: "broadcast", id: `b-${b.id}`, broadcast: b });
    }
    return out;
  }, [conversations, broadcasts]);

  const scroll = useCollapsibleScroll({ tabBar: true });
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? "rgba(255,255,255,0.08)" : "#FFFFFF";


  return (
    <IOSScreen title={t("driver.messages")} back scrollable={false} scroll={scroll}>
      <Animated.FlatList
        data={rows}
        keyExtractor={(item: Row) => item.id}
        renderItem={({ item }: { item: Row }) => {
          if (item.kind === "header") {
            return <Text style={[styles.sectionTitle, { color: subTextColor }]}>{item.title}</Text>;
          }
          if (item.kind === "chat") {
            return <ChatRow conv={item.conv} cardBg={cardBg} subTextColor={subTextColor} />;
          }
          return <MessageCard broadcast={item.broadcast} cardBg={cardBg} />;
        }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={rows.length > 0}
        {...scroll.scrollProps}
        contentContainerStyle={[styles.listContent, scroll.scrollProps.contentContainerStyle]}
        refreshControl={
          <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          progressViewOffset={scroll.contentInset}
          tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBg}>
              <HugeiconsIcon icon={Chat} size={60}  color={Colors.primary}/>
            </View>
            <Text style={[styles.emptyTitle,{color: Colors.primary}]}>No messages yet!</Text>
            <Text style={[styles.emptySubtitle, {color: subTextColor}]}>Passenger chats and park announcements will appear here</Text>
          </View>
        }
      />
    </IOSScreen>
  );
}

const styles = StyleSheet.create({
  // Header






  // List
  listContent: { paddingHorizontal: 20, gap: 12 },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 8,
  },

  // Chat row
  chatRow: {
    flexDirection: "row",
    borderRadius: 16,
    padding: 14,
    gap: 12,
    alignItems: "center",
  },
  chatTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  chatBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },

  // Message card
  // Glass clips, so the shadow has to sit on a wrapper outside it.
  cardShadow: {
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  messageCard: {
    flexDirection: "row",
    borderRadius: 16,
    padding: 16,
    gap: 14,
    alignItems: "flex-start",
  },
  messageIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  },
  messageContent: { flex: 1, gap: 4 },
  messageTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  messageText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  messageTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 4,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    flex: 1,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 16,
    color: Colors.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    // lineHeight: 10,
    paddingVertical: 15
  },
});