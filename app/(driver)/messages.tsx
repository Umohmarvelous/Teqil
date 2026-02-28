import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { BroadcastsStorage } from "@/src/services/storage";
import { formatDateTime } from "@/src/utils/helpers";
import type { Broadcast } from "@/src/models/types";
import { useTranslation } from "react-i18next";

function MessageCard({ broadcast }: { broadcast: Broadcast }) {
  return (
    <View style={styles.messageCard}>
      <View style={styles.messageIconBg}>
        <Ionicons name="megaphone" size={20} color={Colors.primary} />
      </View>
      <View style={styles.messageContent}>
        <Text style={styles.messageTitle}>Park Announcement</Text>
        <Text style={styles.messageText}>{broadcast.message}</Text>
        <Text style={styles.messageTime}>{formatDateTime(broadcast.created_at)}</Text>
      </View>
    </View>
  );
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Broadcast[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const data = await BroadcastsStorage.getAll();
    setMessages(data);
  };

  useEffect(() => { load(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Text style={styles.headerTitle}>{t("driver.messages")}</Text>
        <Text style={styles.headerSubtitle}>Messages from your park</Text>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageCard broadcast={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!messages.length}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="notifications-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptySubtitle}>
              Your park owner will send announcements here
            </Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 100 + (Platform.OS === "web" ? 34 : 0) }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
    color: Colors.text,
  },
  headerSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  listContent: { padding: 20, gap: 12 },
  messageCard: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  messageIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
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
  emptyState: {
    alignItems: "center",
    paddingTop: 80,
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    color: Colors.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
});
