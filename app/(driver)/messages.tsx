import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
} from "react-native";
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
import { Glass, IOSScreen, useCollapsibleScroll } from "@/components/ios";


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
  const [messages, setMessages] = useState<Broadcast[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const data = await BroadcastsStorage.getAll();
    // Sort newest first
    const sorted = [...data].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    setMessages(sorted);
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    // Reload messages AND run a full cloud sync.
    await Promise.all([load(), triggerSyncNow()]);
    setRefreshing(false);
  };

  const scroll = useCollapsibleScroll({ tabBar: true });
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? "rgba(255,255,255,0.08)" : "#FFFFFF";


  return (
    <IOSScreen title={t("driver.messages")} back scrollable={false} scroll={scroll}>
      <Animated.FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageCard broadcast={item} cardBg={cardBg} />}
        showsVerticalScrollIndicator={false}
        scrollEnabled={messages.length > 0}
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
            <Text style={[styles.emptySubtitle, {color: subTextColor}]}>Recent messages from passenger will appear here</Text>
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