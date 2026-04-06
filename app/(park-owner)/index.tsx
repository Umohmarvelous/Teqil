/**
 * app/(park-owner)/index.tsx
 *
 * Park Owner dashboard — FirstBank-style layout.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  TextInput,
  RefreshControl,
  Animated,
  Modal,
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

const FB = {
  navy: "#00205B",
  navyDark: "#001440",
  green: "#009A43",
  greenLight: "#B9F0D4",
  gold: "#F5A623",
  offWhite: "#F4F6FA",
  textPrimary: "#0D1B3E",
  textSec: "#6B7280",
  border: "#E8ECF0",
  surface: "#FFFFFF",
  red: "#E02020",
};

interface DashboardStats {
  activeTrips: number;
  totalDrivers: number;
  completionRate: number;
  totalEstimatedEarnings: number;
  totalTrips: number;
  completedTrips: number;
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconBox, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

// ─── Active trip item ─────────────────────────────────────────────────────────
function ActiveTripItem({ trip }: { trip: Trip & { passengerCount: number } }) {
  return (
    <View style={styles.tripItem}>
      <View style={styles.tripDot} />
      <View style={styles.tripInfo}>
        <Text style={styles.tripRoute} numberOfLines={1}>
          {trip.origin} → {trip.destination}
        </Text>
        <View style={styles.tripMeta}>
          <Text style={styles.tripCode}>{trip.trip_code}</Text>
          <View style={styles.tripMetaSep} />
          <Ionicons name="people-outline" size={12} color={FB.textSec} />
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

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ParkOwnerDashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const { t } = useTranslation();

  const [stats, setStats] = useState<DashboardStats>({
    activeTrips: 0,
    totalDrivers: 0,
    completionRate: 0,
    totalEstimatedEarnings: 0,
    totalTrips: 0,
    completedTrips: 0,
  });
  const [activeTrips, setActiveTrips] = useState<(Trip & { passengerCount: number })[]>([]);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const displayName = user?.full_name || "Park Owner";
  const parkName = user?.park_name || displayName;
  const parkLocation = user?.park_location || "Location not set";

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
    const completionRate =
      totalTrips > 0 ? Math.round((completedTrips.length / totalTrips) * 100) : 0;

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
        synced: false,
        updated_at: new Date().toISOString(),
      });
      setBroadcastMsg("");
      if (user) {
        syncAll({ id: user.id, role: user.role, park_name: user.park_name }).catch(() => {});
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Sent!", "Message broadcast to all drivers.");
    } catch {
      Alert.alert("Error", "Could not send. Try again.");
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

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: Math.max(insets.bottom, 24) + 100 },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={FB.green}
        />
      }
    >
      {/* ── Hero ── */}
      <LinearGradient
        colors={[FB.navy, FB.navyDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: topPadding + 14 }]}
      >
        {/* Top bar */}
        <View style={styles.heroTopBar}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.heroLabel}>Park Dashboard</Text>
            <Text style={styles.heroName} numberOfLines={1}>{parkName}</Text>
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={12} color={FB.gold} />
              <Text style={styles.locationText} numberOfLines={1}>{parkLocation}</Text>
            </View>
          </View>
          <Pressable onPress={handleLogout} style={styles.avatarBtn}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={20} color="#fff" />
            </View>
          </Pressable>
        </View>

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{stats.activeTrips}</Text>
              <Text style={styles.summaryLabel}>Active Trips</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{stats.totalDrivers}</Text>
              <Text style={styles.summaryLabel}>Drivers</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: FB.gold }]}>
                {balanceHidden
                  ? "•••"
                  : stats.completionRate > 0
                  ? `${stats.completionRate}%`
                  : "—"}
              </Text>
              <Text style={styles.summaryLabel}>Completion</Text>
            </View>
          </View>
          <View style={styles.summaryFooter}>
            <Text style={styles.revenueLabel}>Est. Revenue</Text>
            <View style={styles.revenueRow}>
              <Text style={styles.revenueValue}>
                {balanceHidden
                  ? "• • • • •"
                  : stats.totalEstimatedEarnings > 0
                  ? formatNaira(stats.totalEstimatedEarnings)
                  : "₦0"}
              </Text>
              <Pressable onPress={() => setBalanceHidden((v) => !v)} hitSlop={8}>
                <Ionicons
                  name={balanceHidden ? "eye-off-outline" : "eye-outline"}
                  size={16}
                  color="rgba(255,255,255,0.5)"
                />
              </Pressable>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* ── Quick action tiles ── */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>Park Management</Text>
        <View style={styles.quickGrid}>
          {[
            { label: "Drivers",  icon: "people-outline" as const,       color: FB.green,  route: "/(park-owner)/drivers" },
            { label: "Alerts",   icon: "warning-outline" as const,       color: FB.red,    route: "/(park-owner)/alerts" },
            { label: "Broadcast",icon: "megaphone-outline" as const,     color: "#7C3AED", route: null },
            { label: "Reports",  icon: "bar-chart-outline" as const,     color: "#0891B2", route: null },
          ].map((item) => {
            const scale = useRef(new Animated.Value(1)).current;
            return (
              <Animated.View key={item.label} style={[styles.quickTile, { transform: [{ scale }] }]}>
                <Pressable
                  onPressIn={() => Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 50 }).start()}
                  onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start()}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (item.route) router.push(item.route as any);
                    else Alert.alert("Coming Soon", `${item.label} feature coming soon.`);
                  }}
                  style={styles.quickTileInner}
                >
                  <View style={[styles.quickIconBox, { backgroundColor: item.color + "18" }]}>
                    <Ionicons name={item.icon} size={22} color={item.color} />
                  </View>
                  <Text style={styles.quickLabel}>{item.label}</Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </View>

      {/* ── Active trips ── */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>Active Trips</Text>
          {stats.activeTrips > 0 && (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>{stats.activeTrips}</Text>
            </View>
          )}
        </View>

        {activeTrips.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBox}>
              <Ionicons name="car-outline" size={28} color={FB.textSec} />
            </View>
            <Text style={styles.emptyText}>No active trips</Text>
            <Text style={styles.emptySubText}>
              Trips from your park drivers will appear here
            </Text>
          </View>
        ) : (
          <View style={styles.tripList}>
            {activeTrips.map((trip, idx) => (
              <View key={trip.id}>
                <ActiveTripItem trip={trip} />
                {idx < activeTrips.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Broadcast ── */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>Broadcast Message</Text>
          <Ionicons name="megaphone-outline" size={16} color={FB.textSec} />
        </View>

        <View style={styles.broadcastCard}>
          <TextInput
            style={styles.broadcastInput}
            placeholder="Write a message to all drivers..."
            placeholderTextColor={FB.textSec}
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
            style={[
              styles.broadcastBtn,
              !broadcastMsg.trim() && styles.broadcastBtnDisabled,
            ]}
            onPress={handleBroadcast}
            disabled={!broadcastMsg.trim() || isSending}
          >
            <LinearGradient
              colors={broadcastMsg.trim() ? [FB.green, "#007A3D"] : [FB.border, FB.border]}
              style={styles.broadcastBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons
                name={isSending ? "hourglass-outline" : "megaphone"}
                size={16}
                color={broadcastMsg.trim() ? "#fff" : FB.textSec}
              />
              <Text style={[styles.broadcastBtnText, !broadcastMsg.trim() && styles.broadcastBtnTextDisabled]}>
                {isSending ? "Sending..." : "Send to All Drivers"}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: FB.offWhite },
  scrollContent: {},

  // Hero
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  heroLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  heroName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: "#fff",
    lineHeight: 28,
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  locationText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    flex: 1,
  },
  avatarBtn: {},
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Summary card
  summaryCard: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryDivider: { width: 1, height: 36, backgroundColor: "rgba(255,255,255,0.15)" },
  summaryValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: "#fff",
  },
  summaryLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.55)",
    marginTop: 2,
  },
  summaryFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  revenueLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  revenueRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  revenueValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: "#fff",
  },

  // Section card
  sectionCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 20,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionHeading: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: FB.textPrimary,
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  activeBadge: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  activeBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: FB.red,
  },

  // Quick grid
  quickGrid: { flexDirection: "row", gap: 10 },
  quickTile: { flex: 1 },
  quickTileInner: { alignItems: "center", gap: 8 },
  quickIconBox: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: FB.textPrimary,
    textAlign: "center",
  },

  // Trip list
  tripList: { gap: 0 },
  tripItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  tripDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: FB.green,
    flexShrink: 0,
  },
  tripInfo: { flex: 1 },
  tripRoute: { fontFamily: "Poppins_500Medium", fontSize: 14, color: FB.textPrimary },
  tripMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  tripCode: { fontFamily: "Poppins_400Regular", fontSize: 12, color: FB.textSec, letterSpacing: 0.8 },
  tripMetaSep: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: FB.textSec },
  tripMetaText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: FB.textSec },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: FB.red },
  liveText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: FB.red },
  divider: { height: 1, backgroundColor: FB.border },

  // Empty
  emptyState: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: FB.offWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: FB.textPrimary },
  emptySubText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: FB.textSec,
    textAlign: "center",
    lineHeight: 20,
  },

  // Broadcast
  broadcastCard: {
    backgroundColor: FB.offWhite,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: FB.border,
  },
  broadcastInput: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: FB.textPrimary,
    padding: 16,
    minHeight: 100,
    lineHeight: 22,
  },
  charCount: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: FB.textSec,
    textAlign: "right",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  broadcastBtn: { overflow: "hidden" },
  broadcastBtnDisabled: {},
  broadcastBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
  },
  broadcastBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  broadcastBtnTextDisabled: { color: FB.textSec },

  // Stat card (unused in this layout but kept for reuse)
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    alignItems: "flex-start",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  statIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 18, color: FB.textPrimary },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: FB.textSec },
  statSub: { fontFamily: "Poppins_400Regular", fontSize: 11, color: FB.textSec, marginTop: -2 },
});