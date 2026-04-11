/**
 * app/(driver)/index.tsx
 *
 * Driver dashboard — FirstBank-style layout.
 * - Deep navy/green header with coin balance card
 * - Prominent START TRIP button
 * - Earnings summary row
 * - Recent trips list
 * - Quick Transfer floating trigger
 */

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Dimensions,
  Modal,
  Animated,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { TripsStorage } from "@/src/services/storage";
import {
  formatCoins,
  formatNaira,
  coinsToNaira,
} from "@/src/utils/helpers";
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
};


// ─── Quick Receive Modal (driver's equivalent of quick transfer) ───────────────
function QuickReceiveModal({
  visible,
  onClose,
  driverId,
}: {
  visible: boolean;
  onClose: () => void;
  driverId?: string;
}) {
  const slideY = useRef(new Animated.Value(400)).current;
  const backdropOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, damping: 22, stiffness: 160, useNativeDriver: true }),
        Animated.timing(backdropOp, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: 400, duration: 240, useNativeDriver: true }),
        Animated.timing(backdropOp, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Animated.View style={[qr.backdrop, { opacity: backdropOp }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[qr.sheet, { transform: [{ translateY: slideY }] }]}>
        <View style={qr.handle} />
        <Text style={qr.title}>Receive Payment</Text>
        <Text style={qr.sub}>Share your Driver ID or QR code to receive fare</Text>

        <View style={qr.idBox}>
          <Text style={qr.idLabel}>Your Driver ID</Text>
          <Text style={qr.idValue}>{driverId || "—"}</Text>
        </View>

        <View style={qr.qrPlaceholder}>
          <Ionicons name="qr-code" size={80} color={FB.navy} />
          <Text style={qr.qrHint}>QR Code (tap to share)</Text>
        </View>

        <Pressable style={qr.closeBtn} onPress={onClose}>
          <Text style={qr.closeBtnText}>Done</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────
function StatPill({
  icon,
  label,
  value,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.statPill}>
      <View style={[styles.statIconBox, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}



// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DriverDashboard() {
  // const insets = useSafeAreaInsets();
  const { user, logout, isAuthenticated } = useAuthStore();
  const { t } = useTranslation();
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [receiveVisible, setReceiveVisible] = useState(false);

  // const topPadding = Platform.OS === "web" ? 67 : insets.top;
  // const displayName = user?.full_name?.split(" ")[0] || "Driver";
  const coins = user?.points_balance || 0;
  const completedTrips = recentTrips.filter((t) => t.status === "completed").length;

  useEffect(() => {
    if (!user?.id) return;
    TripsStorage.getByDriverId(user.id).then((trips) =>
      setRecentTrips(trips.slice(-5).reverse())
    );
  }, [user?.id]);

  const handleStartTrip = () => {
    if (!user?.profile_complete) {
      Alert.alert("Profile Required", "Complete your driver profile first.", [
        { text: "Complete Now", onPress: () => router.push("/(auth)/driver-profile") },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push("/(driver)/create-trip");
  };

  const handleQuickAction = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    switch (id) {
      case "create":  router.push("/(driver)/create-trip"); break;
      case "history": router.push("/(driver)/history"); break;
      case "profile": router.push("/(auth)/driver-profile"); break;
      case "msgs":    router.push("/(driver)/messages"); break;
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
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero]}  >


          {/* Balance card */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceCardInner}>
              <View>
                <Text style={styles.balanceLabel}>Coin Balance</Text>
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceValue}>
                    {balanceHidden ? "• • • • •" : formatCoins(coins)}
                  </Text>
                  <Pressable onPress={() => setBalanceHidden((v) => !v)} hitSlop={8}>
                    <Ionicons
                      name={balanceHidden ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color="rgba(255,255,255,0.6)"
                    />
                  </Pressable>
                </View>
                <Text style={styles.balanceEquiv}>
                  ≈ {formatNaira(coinsToNaira(coins))} value
                </Text>
              </View>
            </View>

            {/* Online indicator row */}
            <View style={styles.onlineRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Online · {isAuthenticated ? 'Quick Actions' : 'Quick Actions'} Ready to drive</Text>
            </View>
          </View>

          {/* Profile incomplete banner */}
          {!user?.profile_complete && (
            <Pressable
              style={styles.profileBanner}
              onPress={() => router.push("/(auth)/driver-profile")}
            >
              <Ionicons name="warning-outline" size={15} color={FB.gold} />
              <Text style={styles.profileBannerText}>
                Complete your profile to start trips
              </Text>
              <Ionicons name="chevron-forward" size={14} color={FB.gold} />
            </Pressable>
          )}
        </View>

        {/* ── Earnings summary strip ── */}
        <View style={styles.statsStrip}>
          <StatPill
            icon="checkmark-circle-outline"
            label="Trips"
            value={recentTrips.length.toString()}
            color={FB.green}
          />
          <View style={styles.statsDivider} />
          <StatPill
            icon="trophy-outline"
            label="Completed"
            value={completedTrips.toString()}
            color="#7C3AED"
          />
          <View style={styles.statsDivider} />
          <StatPill
            icon="wallet-outline"
            label="Earned"
            value={formatNaira(coinsToNaira(coins))}
            color={FB.gold}
          />
          <View style={styles.statsDivider} />
          <StatPill
            icon="star-outline"
            label="Rating"
            value={user?.avg_rating ? user.avg_rating.toFixed(1) : "—"}
            color="#0891B2"
          />
        </View>

        {/* ── START TRIP button ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>Ready to drive?</Text>
          <Pressable onPress={handleStartTrip} style={styles.startTripBtn}>
            <LinearGradient
              colors={[FB.green, "#007A3D"]}
              style={styles.startTripGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="navigate" size={24} color="#fff" />
              <Text style={styles.startTripText}>START TRIP</Text>
            </LinearGradient>
          </Pressable>
          <Text style={styles.startTripHint}>
            Create a trip and share the code with passengers
          </Text>
        </View>

        {/* ── Quick actions ──
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>Quick Actions</Text>
          <View style={styles.quickActionsRow}>
            {QUICK_ACTIONS.map((action) => {
              const scale = useRef(new Animated.Value(1)).current;
              return (
                <Animated.View key={action.id} style={[styles.quickTile, { transform: [{ scale }] }]}>
                  <Pressable
                    onPress={() => handleQuickAction(action.id)}
                    onPressIn={() => Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 50 }).start()}
                    onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start()}
                    style={styles.quickTileInner}
                  >
                    <View style={[styles.quickIconBox, { backgroundColor: action.color + "18" }]}>
                      <Ionicons name={action.icon} size={22} color={action.color} />
                    </View>
                    <Text style={styles.quickLabel}>{action.label}</Text>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </View>

        ── Recent trips ──
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>Recent Trips</Text>
            {recentTrips.length > 0 && (
              <Pressable onPress={() => router.push("/(driver)/history")}>
                <Text style={styles.seeAll}>See all</Text>
              </Pressable>
            )}
          </View>

          {recentTrips.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBox}>
                <Ionicons name="car-outline" size={28} color={FB.textSec} />
              </View>
              <Text style={styles.emptyText}>No trips yet</Text>
              <Text style={styles.emptySubText}>
                {`Tap "START TRIP" to create your first trip`}
              </Text>
            </View>
          ) : (
            recentTrips.map((trip, idx) => (
              <React.Fragment key={trip.id}>
                <TripRow trip={trip} index={idx} />
                {idx < recentTrips.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))
          )}
        </View>*/}
      </ScrollView> 

      {/* Quick Receive modal */}
      <QuickReceiveModal
        visible={receiveVisible}
        onClose={() => setReceiveVisible(false)}
        driverId={user?.driver_id}
      />
    </View>
  );
}

// ─── Quick Receive Sheet Styles ───────────────────────────────────────────────
const qr = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    zIndex: 1,
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 44,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 24,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 20,
  },
  title: { fontFamily: "Poppins_700Bold", fontSize: 20, color: FB.textPrimary },
  sub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: FB.textSec,
    marginTop: 4,
    marginBottom: 20,
  },
  idBox: {
    backgroundColor: FB.offWhite,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: FB.border,
  },
  idLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: FB.textSec,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  idValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: FB.navy,
    letterSpacing: 3,
  },
  qrPlaceholder: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 10,
  },
  qrHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: FB.textSec,
  },
  closeBtn: {
    backgroundColor: FB.navy,
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#fff" },
});

// ─── Main Styles ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1,},
  scroll: { flex: 1 },
  scrollContent: { gap: 0 },

  // Hero
  hero: {

    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  heroGreet: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
  },
  heroName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: "#fff",
    lineHeight: 30,
  },
  heroTopRight: { flexDirection: "row", alignItems: "center", gap: 8 },

  notifBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBtn: {},
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: FB.green,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#fff" },

  // Balance
  balanceCard: {
    backgroundColor: Colors.primaryDarker,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 12,
  },
  balanceCardInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  balanceLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  balanceValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 26,
    color: "#fff",
    letterSpacing: -0.5,
  },
  balanceEquiv: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: FB.gold,
    marginTop: 4,
  },
  onlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ADE80",
  },
  onlineText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
  },
  profileBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245,166,35,0.12)",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.25)",
  },
  profileBannerText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: FB.gold,
  },

  // Stats strip
  statsStrip: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  statPill: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 },
  statIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 14, color: FB.textPrimary },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 10, color: FB.textSec },
  statsDivider: { width: 1, height: 32, backgroundColor: FB.border },

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
  seeAll: { fontFamily: "Poppins_500Medium", fontSize: 13, color: FB.green },

  // Start trip
  startTripBtn: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: FB.green,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  startTripGradient: {
    height: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  startTripText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "#fff",
    letterSpacing: 2,
  },
  startTripHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: FB.textSec,
    textAlign: "center",
    marginTop: 10,
  },

  // Quick actions
  quickActionsRow: { flexDirection: "row", gap: 10 },
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

  // Trip rows
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  tripIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tripInfo: { flex: 1 },
  tripRoute: { fontFamily: "Poppins_500Medium", fontSize: 14, color: FB.textPrimary },
  tripDate: { fontFamily: "Poppins_400Regular", fontSize: 11, color: FB.textSec, marginTop: 2 },
  tripStatusPill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  pillActive: { backgroundColor: FB.gold + "20" },
  pillDone: { backgroundColor: "#F0FDF4" },
  pillText: { fontFamily: "Poppins_500Medium", fontSize: 11 },
  pillTextActive: { color: FB.gold },
  pillTextDone: { color: "#16A34A" },
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
});