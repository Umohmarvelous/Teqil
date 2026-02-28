import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  TextInput,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { TripsStorage, BroadcastsStorage } from "@/src/services/storage";
import { generateId } from "@/src/utils/helpers";
import type { Trip } from "@/src/models/types";
import { useTranslation } from "react-i18next";

function StatTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIconBg, { backgroundColor: `${accent || Colors.primary}18` }]}>
        <Ionicons name={icon} size={22} color={accent || Colors.primary} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ParkOwnerDashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const { t } = useTranslation();

  const [activeTrips, setActiveTrips] = useState<Trip[]>([]);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    TripsStorage.getAll().then((trips) => {
      const parkName = user?.park_name || "";
      const active = trips.filter((t) => t.status === "active");
      setActiveTrips(active.slice(0, 5));
    });
  }, []);

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSending(true);
    try {
      await BroadcastsStorage.save({
        id: generateId(),
        park_id: user?.id || "",
        message: broadcastMsg.trim(),
        created_at: new Date().toISOString(),
      });
      setBroadcastMsg("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Sent!", "Message has been sent to all drivers.");
    } finally {
      setIsSending(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          const { signOut } = await import("@/src/services/supabase");
          await signOut();
          logout();
          router.replace("/(auth)/welcome");
        },
      },
    ]);
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const displayName = user?.full_name || "Park Owner";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
    >
      <LinearGradient
        colors={["#1A1A2E", "#004E2C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: topPadding + 16 }]}
      >
        <View style={styles.heroHeader}>
          <View>
            <Text style={styles.heroGreeting}>Park Dashboard</Text>
            <Text style={styles.heroName}>{user?.park_name || displayName}</Text>
          </View>
          <Pressable onPress={handleLogout}>
            <Ionicons name="person-circle" size={40} color="rgba(255,255,255,0.9)" />
          </Pressable>
        </View>

        <View style={styles.parkInfoCard}>
          <Ionicons name="location" size={18} color={Colors.gold} />
          <Text style={styles.parkLocation} numberOfLines={1}>
            {user?.park_location || "Location not set"}
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.statsGrid}>
        <StatTile
          icon="car-sport"
          label={t("parkOwner.activeTrips")}
          value={activeTrips.length.toString()}
          accent={Colors.primary}
        />
        <StatTile
          icon="people"
          label={t("parkOwner.totalDrivers")}
          value="—"
          accent="#3B82F6"
        />
        <StatTile
          icon="checkmark-circle"
          label={t("parkOwner.completionRate")}
          value="—"
          accent={Colors.gold}
        />
        <StatTile
          icon="wallet"
          label="Revenue"
          value="—"
          accent="#8B5CF6"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("parkOwner.activeTrips")}</Text>
        {activeTrips.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="car-outline" size={36} color={Colors.border} />
            <Text style={styles.emptyText}>No active trips right now</Text>
          </View>
        ) : (
          <View style={styles.tripList}>
            {activeTrips.map((trip) => (
              <View key={trip.id} style={styles.tripItem}>
                <View style={styles.tripDot} />
                <View style={styles.tripInfo}>
                  <Text style={styles.tripRoute} numberOfLines={1}>
                    {trip.origin} → {trip.destination}
                  </Text>
                  <Text style={styles.tripCode}>{trip.trip_code}</Text>
                </View>
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>Live</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.broadcastSection}>
        <Text style={styles.sectionTitle}>{t("parkOwner.broadcast")}</Text>
        <View style={styles.broadcastCard}>
          <TextInput
            style={styles.broadcastInput}
            placeholder={t("parkOwner.broadcastPlaceholder")}
            placeholderTextColor={Colors.textTertiary}
            value={broadcastMsg}
            onChangeText={setBroadcastMsg}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <Pressable
            style={[styles.broadcastBtn, !broadcastMsg.trim() && styles.broadcastBtnDisabled, isSending && styles.broadcastBtnLoading]}
            onPress={handleBroadcast}
            disabled={!broadcastMsg.trim() || isSending}
          >
            <Ionicons name="megaphone" size={18} color={Colors.surface} />
            <Text style={styles.broadcastBtnText}>
              {isSending ? "Sending..." : t("parkOwner.send")}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={{ height: 100 + (Platform.OS === "web" ? 34 : 0) }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: {},
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  heroGreeting: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.65)",
  },
  heroName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: Colors.surface,
  },
  parkInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  parkLocation: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    flex: 1,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 24,
    paddingBottom: 8,
  },
  statTile: {
    width: "47%",
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 18,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statIconBg: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  section: { paddingHorizontal: 24, paddingTop: 8 },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 17,
    color: Colors.text,
    marginBottom: 14,
  },
  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    gap: 10,
  },
  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  tripList: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: "hidden",
  },
  tripItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 12,
  },
  tripDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  tripInfo: { flex: 1 },
  tripRoute: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  tripCode: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    letterSpacing: 1,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.error,
  },
  liveText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.error,
  },
  broadcastSection: { paddingHorizontal: 24, paddingTop: 24 },
  broadcastCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  broadcastInput: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: Colors.text,
    padding: 18,
    minHeight: 90,
    lineHeight: 24,
  },
  broadcastBtn: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  broadcastBtnDisabled: { backgroundColor: Colors.border },
  broadcastBtnLoading: { opacity: 0.7 },
  broadcastBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.surface,
  },
});
