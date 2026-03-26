import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform,
  Alert, TextInput, RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { TripsStorage, BroadcastsStorage, PassengersStorage } from "@/src/services/storage";
import { syncAll } from "@/src/services/sync";
import { generateId, formatNaira, coinsToNaira } from "@/src/utils/helpers";
import type { Trip } from "@/src/models/types";
import { useTranslation } from "react-i18next";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DashboardStats {
  activeTrips: number;
  totalDrivers: number;
  completionRate: number;
  totalEstimatedEarnings: number;
  totalTrips: number;
  completedTrips: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatTile({ icon, label, value, sub, accent, wide }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string;
  sub?: string; accent?: string; wide?: boolean;
}) {
  return (
    <View style={[styles.statTile, wide && styles.statTileWide]}>
      <View style={[styles.statIconBg, { backgroundColor: `${accent || Colors.primary}18` }]}>
        <Ionicons name={icon} size={22} color={accent || Colors.primary} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function ActiveTripItem({ trip }: { trip: Trip & { passengerCount: number } }) {
  return (
    <View style={styles.tripItem}>
      <View style={styles.tripDot} />
      <View style={styles.tripInfo}>
        <Text style={styles.tripRoute} numberOfLines={1}>{trip.origin} → {trip.destination}</Text>
        <View style={styles.tripMeta}>
          <Text style={styles.tripCode}>{trip.trip_code}</Text>
          <View style={styles.tripMetaSep} />
          <Ionicons name="people-outline" size={12} color={Colors.textSecondary} />
          <Text style={styles.tripMetaText}>{trip.passengerCount} passengers</Text>
        </View>
      </View>
      <View style={styles.livePill}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>Live</Text>
      </View>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ParkOwnerDashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const { t } = useTranslation();

  const [stats, setStats] = useState<DashboardStats>({
    activeTrips: 0, totalDrivers: 0, completionRate: 0,
    totalEstimatedEarnings: 0, totalTrips: 0, completedTrips: 0,
  });
  const [activeTrips, setActiveTrips] = useState<(Trip & { passengerCount: number })[]>([]);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const allTrips = await TripsStorage.getAll();
    const activeTripsList = allTrips.filter((t) => t.status === "active");
    const enriched = await Promise.all(
      activeTripsList.slice(0, 10).map(async (trip) => {
        const passengers = await PassengersStorage.getByTripId(trip.id);
        return { ...trip, passengerCount: passengers.length };
      })
    );

    const completedTrips = allTrips.filter((t) => t.status === "completed");
    const totalTrips = allTrips.length;
    const completionRate = totalTrips > 0 ? Math.round((completedTrips.length / totalTrips) * 100) : 0;

    let totalCoins = 0;
    for (const trip of completedTrips) {
      const passengers = await PassengersStorage.getByTripId(trip.id);
      totalCoins += 5 + passengers.length * 2;
    }

    const driverIds = new Set(allTrips.map((t) => t.driver_id));
    setActiveTrips(enriched);
    setStats({
      activeTrips: activeTripsList.length,
      totalDrivers: driverIds.size,
      completionRate,
      totalEstimatedEarnings: Math.round(coinsToNaira(totalCoins)),
      totalTrips,
      completedTrips: completedTrips.length,
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // ── Broadcast ─────────────────────────────────────────────────────────────────
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
        // Syncable defaults.
        synced: false,
        updated_at: new Date().toISOString(),
      });
      setBroadcastMsg("");

      // Push broadcast to Supabase immediately if online.
      if (user) {
        syncAll({ id: user.id, role: user.role, park_name: user.park_name }).catch(
          () => {/* offline – will retry */}
        );
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Sent!", "Your message has been broadcast to all drivers.");
    } catch {
      Alert.alert("Error", "Could not send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  // ── Logout ────────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out", style: "destructive",
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
  const parkName = user?.park_name || displayName;
  const parkLocation = user?.park_location || "Location not set";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} colors={[Colors.gold]} />
      }
    >
      {/* ── Hero ── */}
      <LinearGradient
        colors={["#1A1A2E", "#004E2C"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: topPadding + 16 }]}
      >
        <View style={styles.heroHeader}>
          <View style={styles.heroTextGroup}>
            <Text style={styles.heroLabel}>{t("parkOwner.dashboard")}</Text>
            <Text style={styles.heroName} numberOfLines={1}>{parkName}</Text>
          </View>
          <Pressable style={styles.avatarBtn} onPress={handleLogout}>
            <Ionicons name="person-circle" size={40} color="rgba(255,255,255,0.9)" />
          </Pressable>
        </View>
        <View style={styles.parkInfoRow}>
          <View style={styles.parkInfoPill}>
            <Ionicons name="location" size={14} color={Colors.gold} />
            <Text style={styles.parkInfoText} numberOfLines={1}>{parkLocation}</Text>
          </View>
          {stats.activeTrips > 0 && (
            <View style={styles.activePill}>
              <View style={styles.activeDot} />
              <Text style={styles.activeText}>{stats.activeTrips} active</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* ── Stats grid ── */}
      <View style={styles.statsGrid}>
        <StatTile icon="car-sport" label={t("parkOwner.activeTrips")} value={stats.activeTrips.toString()} sub={`${stats.totalTrips} total`} accent={Colors.primary} />
        <StatTile icon="people" label={t("parkOwner.totalDrivers")} value={stats.totalDrivers > 0 ? stats.totalDrivers.toString() : "—"} accent="#3B82F6" />
        <StatTile icon="checkmark-circle" label={t("parkOwner.completionRate")} value={stats.totalTrips > 0 ? `${stats.completionRate}%` : "—"} sub={stats.completedTrips > 0 ? `${stats.completedTrips} done` : undefined} accent={Colors.gold} />
        <StatTile icon="wallet" label="Revenue" value={stats.totalEstimatedEarnings > 0 ? formatNaira(stats.totalEstimatedEarnings) : "—"} sub="estimated" accent="#8B5CF6" />
      </View>

      {/* ── Active trips ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("parkOwner.activeTrips")}</Text>
          {stats.activeTrips > 0 && (
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{stats.activeTrips}</Text>
            </View>
          )}
        </View>

        {activeTrips.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="car-outline" size={36} color={Colors.border} />
            <Text style={styles.emptyText}>No active trips right now</Text>
            <Text style={styles.emptySubText}>Trips from your park drivers will appear here</Text>
          </View>
        ) : (
          <View style={styles.tripList}>
            {activeTrips.map((trip, idx) => (
              <View key={trip.id}>
                <ActiveTripItem trip={trip} />
                {idx < activeTrips.length - 1 && <View style={styles.tripDivider} />}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Broadcast ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("parkOwner.broadcast")}</Text>
          <Ionicons name="megaphone-outline" size={18} color={Colors.textSecondary} />
        </View>

        <View style={styles.broadcastCard}>
          <TextInput
            style={styles.broadcastInput}
            placeholder={t("parkOwner.broadcastPlaceholder")}
            placeholderTextColor={Colors.textTertiary}
            value={broadcastMsg}
            onChangeText={setBroadcastMsg}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={500}
          />
          {broadcastMsg.length > 0 && (
            <Text style={styles.charCount}>{broadcastMsg.length}/500</Text>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.broadcastBtn,
              !broadcastMsg.trim() && styles.broadcastBtnDisabled,
              isSending && styles.broadcastBtnLoading,
              pressed && broadcastMsg.trim() && styles.broadcastBtnPressed,
            ]}
            onPress={handleBroadcast}
            disabled={!broadcastMsg.trim() || isSending}
          >
            <Ionicons name={isSending ? "hourglass-outline" : "megaphone"} size={18} color={Colors.surface} />
            <Text style={styles.broadcastBtnText}>{isSending ? "Sending..." : t("parkOwner.send")}</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ height: 100 + (Platform.OS === "web" ? 34 : 0) }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: {},
  hero: { paddingHorizontal: 24, paddingBottom: 28 },
  heroHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  heroTextGroup: { flex: 1, paddingRight: 12 },
  heroLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 },
  heroName: { fontFamily: "Poppins_700Bold", fontSize: 22, color: Colors.surface, lineHeight: 30 },
  avatarBtn: { padding: 2 },
  parkInfoRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  parkInfoPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, flex: 1 },
  parkInfoText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.85)", flex: 1 },
  activePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#4ADE80" },
  activeText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.surface },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, padding: 24, paddingBottom: 8 },
  statTile: { width: "47%", backgroundColor: Colors.surface, borderRadius: 18, padding: 18, gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  statTileWide: { width: "100%" },
  statIconBg: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 22, color: Colors.text },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  statSub: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textTertiary, marginTop: -4 },
  section: { paddingHorizontal: 24, paddingTop: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 17, color: Colors.text, flex: 1 },
  sectionBadge: { backgroundColor: Colors.primaryLight, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  sectionBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary },
  emptyCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 32, alignItems: "center", gap: 8 },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 15, color: Colors.text, textAlign: "center" },
  emptySubText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },
  tripList: { backgroundColor: Colors.surface, borderRadius: 16, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  tripItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  tripDivider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 16 + 10 + 12 },
  tripDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary, flexShrink: 0 },
  tripInfo: { flex: 1 },
  tripRoute: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text, marginBottom: 4 },
  tripMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  tripCode: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, letterSpacing: 0.8 },
  tripMetaSep: { width: 3, height: 3, borderRadius: 2, backgroundColor: Colors.textTertiary },
  tripMetaText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FEF2F2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.error },
  liveText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: Colors.error },
  broadcastCard: { backgroundColor: Colors.surface, borderRadius: 18, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  broadcastInput: { fontFamily: "Poppins_400Regular", fontSize: 15, color: Colors.text, padding: 18, minHeight: 110, lineHeight: 24 },
  charCount: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textTertiary, textAlign: "right", paddingHorizontal: 18, paddingBottom: 8 },
  broadcastBtn: { backgroundColor: Colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  broadcastBtnDisabled: { backgroundColor: Colors.border },
  broadcastBtnLoading: { opacity: 0.7 },
  broadcastBtnPressed: { opacity: 0.9 },
  broadcastBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.surface },
});