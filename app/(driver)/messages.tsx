import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  RefreshControl,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { BroadcastsStorage } from "@/src/services/storage";
import { formatDateTime } from "@/src/utils/helpers";
import type { Broadcast } from "@/src/models/types";
import { useTranslation } from "react-i18next";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Notification01Icon } from "@hugeicons/core-free-icons";
import { router } from "expo-router";
import { useSettingsStore } from "@/src/store/useSettingsStore";

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
    await load();
    setRefreshing(false);
  };

  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const tabBarBg = isDark ? Colors.background : Colors.textWhite;
  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "#E5E8EC";


  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>

      <View style={[styles.header, { paddingTop: topPadding + 16 }, {backgroundColor: tabBarBg, borderColor}]}>
        <Pressable style={styles.sideElement} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={{alignItems: 'center'}}>
          <Text style={styles.headerTitle}>{t("driver.messages")}</Text>
          <Text style={styles.headerSubtitle}>Messages from your park</Text>
        </View>
        <View style={styles.sideElement} />
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageCard broadcast={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={messages.length > 0}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBg}>
              <HugeiconsIcon icon={Notification01Icon} size={40}  color={Colors.textSecondary}/>
            </View>
            <Text style={styles.emptyTitle}>Opps....No messages yet!!</Text>
          </View>
        }
        ListFooterComponent={
          <View
            style={{
              height: 100 + (Platform.OS === "web" ? 34 : 0),
            }}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 , backgroundColor: Colors.border},




  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: "Inter-Black",
    fontSize: 19,
    color: Colors.text, 
  },
  headerSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  sideElement: {
    width: 40, // Fixed width ensures the left and right take up equal space
    alignItems: 'flex-start',
    justifyContent: 'center',
  },






  // List
  listContent: { flex:1, padding: 20, gap: 12 },

  // Message card
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
    flexShrink: 0,
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