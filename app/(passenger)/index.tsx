/**
 * app/(passenger)/index.tsx
 *
 * Passenger dashboard — FirstBank-style layout.
 * - Dark navy/green header with account balance card
 * - Prominent "What do you want to do?" action buttons (Pay Fare, Find Trip, etc.)
 * - Recent trips below
 * - Quick transfer sheet accessible from dashboard
 */

import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  Animated,
  Modal,
  TextInput,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { PassengersStorage, TripsStorage } from "@/src/services/storage";
import { formatCoins, formatDate, formatNaira } from "@/src/utils/helpers";
import type { Trip } from "@/src/models/types";
import { useTranslation } from "react-i18next";

const { width: W } = Dimensions.get("window");

// ─── First‑Bank color palette ─────────────────────────────────────────────────
const FB = {
  navy: "#00205B",         // FirstBank deep navy
  navyDark: "#001440",
  green: "#009A43",        // Teqil/FirstBank green
  greenLight: "#B9F0D4",
  gold: "#F5A623",
  white: "#FFFFFF",
  offWhite: "#F4F6FA",
  cardBg: "#FFFFFF",
  textPrimary: "#0D1B3E",
  textSec: "#6B7280",
  border: "#E8ECF0",
  red: "#E02020",
};

// ─── Quick action tiles ───────────────────────────────────────────────────────
const ACTIONS = [
  { id: "pay",     icon: "send-outline" as const,         label: "Pay Fare",    color: FB.navy  },
  { id: "find",    icon: "search-outline" as const,       label: "Find Trip",   color: FB.green },
  { id: "history", icon: "time-outline" as const,         label: "History",     color: "#7C3AED" },
  { id: "qr",      icon: "qr-code-outline" as const,      label: "Scan QR",     color: "#D97706" },
  { id: "share",   icon: "share-social-outline" as const, label: "Share Trip",  color: "#0891B2" },
  { id: "sos",     icon: "warning-outline" as const,      label: "Emergency",   color: FB.red   },
] as const;

// ─── Quick Transfer Modal ─────────────────────────────────────────────────────
function QuickTransferModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const slideY = useRef(new Animated.Value(400)).current;
  const backdropOp = useRef(new Animated.Value(0)).current;
  const [driverRef, setDriverRef] = useState("");
  const [amount, setAmount] = useState("");

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

  const handleSend = () => {
    if (!driverRef.trim() || !amount || parseFloat(amount) < 50) {
      Alert.alert("Invalid", "Enter a driver ID/code and amount ≥ ₦50.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Transfer Sent!", `₦${amount} sent to ${driverRef}`);
    setDriverRef("");
    setAmount("");
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Animated.View style={[qt.backdrop, { opacity: backdropOp }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[qt.sheet, { transform: [{ translateY: slideY }] }]}>
        <View style={qt.handle} />
        <Text style={qt.title}>Quick Transfer</Text>
        <Text style={qt.sub}>Send fare to a driver instantly</Text>

        <View style={qt.fieldWrap}>
          <Text style={qt.label}>Driver ID / Trip Code</Text>
          <View style={qt.inputRow}>
            <Ionicons name="id-card-outline" size={18} color={FB.navy} />
            <TextInput
              style={qt.input}
              placeholder="e.g. DRV-A3X9KL or ABC123"
              placeholderTextColor={FB.textSec}
              value={driverRef}
              onChangeText={setDriverRef}
              autoCapitalize="characters"
            />
          </View>
        </View>

        <View style={qt.fieldWrap}>
          <Text style={qt.label}>Amount (₦)</Text>
          <View style={qt.inputRow}>
            <Text style={qt.nairaSymbol}>₦</Text>
            <TextInput
              style={qt.input}
              placeholder="0.00"
              placeholderTextColor={FB.textSec}
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Quick amounts */}
        <View style={qt.quickRow}>
          {[500, 1000, 2000, 5000].map((v) => (
            <Pressable
              key={v}
              style={[qt.quickChip, amount === v.toString() && qt.quickChipActive]}
              onPress={() => { setAmount(v.toString()); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={[qt.quickChipText, amount === v.toString() && qt.quickChipTextActive]}>
                ₦{v.toLocaleString()}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={qt.actions}>
          <Pressable
            style={qt.scanBtn}
            onPress={() => { onClose(); router.push("/(auth)/pay-fare"); }}
          >
            <Ionicons name="qr-code-outline" size={18} color={FB.navy} />
            <Text style={qt.scanBtnText}>Scan QR</Text>
          </Pressable>
          <Pressable style={qt.sendBtn} onPress={handleSend}>
            <LinearGradient colors={[FB.green, "#007A3D"]} style={qt.sendBtnGradient}>
              <Ionicons name="send" size={16} color="#fff" />
              <Text style={qt.sendBtnText}>Send</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Action tile ──────────────────────────────────────────────────────────────
function ActionTile({
  action,
  onPress,
}: {
  action: (typeof ACTIONS)[number];
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={[styles.actionTile, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 50 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start()}
        style={styles.actionTileInner}
      >
        <View style={[styles.actionIconWrap, { backgroundColor: action.color + "18" }]}>
          <Ionicons name={action.icon} size={22} color={action.color} />
        </View>
        <Text style={styles.actionLabel}>{action.label}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Trip row ──────────────────────────────────────────────────────────────────
function TripRow({ trip }: { trip: Trip }) {
  return (
    <View style={styles.tripRow}>
      <View style={[styles.tripIconBox, { backgroundColor: FB.green + "15" }]}>
        <Ionicons name="navigate-circle-outline" size={20} color={FB.green} />
      </View>
      <View style={styles.tripInfo}>
        <Text style={styles.tripRoute} numberOfLines={1}>
          {trip.origin} → {trip.destination}
        </Text>
        <Text style={styles.tripDate}>{formatDate(trip.created_at)}</Text>
      </View>
      <View style={[styles.tripStatusPill, trip.status === "completed" ? styles.pillDone : styles.pillActive]}>
        <Text style={[styles.pillText, trip.status === "completed" ? styles.pillTextDone : styles.pillTextActive]}>
          {trip.status === "completed" ? "Done" : "Active"}
        </Text>
      </View>
    </View>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function PassengerDashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const { t } = useTranslation();
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [quickTransferVisible, setQuickTransferVisible] = useState(false);

  const displayName = user?.full_name || "Passenger";
  const firstName = displayName.split(" ")[0];
  const coins = user?.points_balance || 0;
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    if (!user?.id) return;
    PassengersStorage.getByUserId(user.id).then(async (passengers) => {
      const trips = await Promise.all(
        passengers.slice(-5).map(async (p) => {
          const all = await TripsStorage.getAll();
          return all.find((t) => t.id === p.trip_id);
        })
      );
      setRecentTrips(trips.filter(Boolean).reverse() as Trip[]);
    });
  }, [user?.id]);

  const handleAction = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    switch (id) {
      case "pay":
        router.push("/(auth)/pay-fare");
        break;
      case "find":
        router.push("/(passenger)/find-trip");
        break;
      case "history":
        router.push("/(passenger)/history");
        break;
      case "qr":
        router.push("/(auth)/pay-fare");
        break;
      case "share":
        Alert.alert("Share Trip", "Share your live trip link with family or friends from the live trip screen.");
        break;
      case "sos":
        Alert.alert("Emergency SOS", "SOS is available during a live trip. Start or join a trip to activate it.");
        break;
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
          { paddingBottom: Math.max(insets.bottom, 24) + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header / Hero card (FirstBank-style) ── */}
        <LinearGradient
          colors={[FB.navy, FB.navyDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: topPadding + 14 }]}
        >
          {/* Top bar */}
          <View style={styles.heroTopBar}>
            <View>
              <Text style={styles.heroGreet}>Good day,</Text>
              <Text style={styles.heroName}>{firstName}</Text>
            </View>
            <View style={styles.heroTopRight}>
              <Pressable
                style={styles.notifBtn}
                onPress={() => setQuickTransferVisible(true)}
              >
                <Ionicons name="swap-horizontal-outline" size={20} color="#fff" />
              </Pressable>
              <Pressable onPress={handleLogout} style={styles.avatarBtn}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitial}>
                    {firstName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>

          {/* Balance card */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceCardInner}>
              <View style={styles.balanceLeft}>
                <Text style={styles.balanceLabel}>Coin Balance</Text>
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceValue}>
                    {balanceHidden ? "• • • • •" : formatCoins(coins)}
                  </Text>
                  <Pressable
                    onPress={() => setBalanceHidden((v) => !v)}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={balanceHidden ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color="rgba(255,255,255,0.6)"
                    />
                  </Pressable>
                </View>
                <Text style={styles.balanceEquiv}>
                  ≈ {formatNaira(coins * 0.7)} value
                </Text>
              </View>
              <View style={styles.balanceCoinIcon}>
                <Ionicons name="star" size={34} color={FB.gold} />
              </View>
            </View>

            {/* Quick send row */}
            <Pressable
              style={styles.quickSendRow}
              onPress={() => setQuickTransferVisible(true)}
            >
              <Ionicons name="send-outline" size={14} color={FB.greenLight} />
              <Text style={styles.quickSendText}>Quick Transfer</Text>
              <Ionicons name="chevron-forward" size={14} color={FB.greenLight} />
            </Pressable>
          </View>
        </LinearGradient>

        {/* ── "What do you want to do?" section ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>What do you want to do?</Text>
          <View style={styles.actionsGrid}>
            {ACTIONS.map((action) => (
              <ActionTile
                key={action.id}
                action={action}
                onPress={() => handleAction(action.id)}
              />
            ))}
          </View>
        </View>

        {/* ── Recent trips ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>Recent Trips</Text>
            {recentTrips.length > 0 && (
              <Pressable onPress={() => router.push("/(passenger)/history")}>
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
                Tap "Find Trip" above to join your first trip
              </Text>
            </View>
          ) : (
            recentTrips.map((trip, idx) => (
              <React.Fragment key={trip.id}>
                <TripRow trip={trip} />
                {idx < recentTrips.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))
          )}
        </View>

        {/* ── Promo / info banner ── */}
        <View style={styles.promoBanner}>
          <LinearGradient
            colors={[FB.green, "#007A3D"]}
            style={styles.promoGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={styles.promoText}>
              <Text style={styles.promoTitle}>Travel Safe, Always</Text>
              <Text style={styles.promoSub}>
                Add emergency contacts before joining a trip
              </Text>
            </View>
            <Ionicons name="shield-checkmark" size={36} color="rgba(255,255,255,0.4)" />
          </LinearGradient>
        </View>
      </ScrollView>

      {/* Quick Transfer Modal */}
      <QuickTransferModal
        visible={quickTransferVisible}
        onClose={() => setQuickTransferVisible(false)}
      />
    </View>
  );
}

// ─── Quick Transfer Sheet Styles ──────────────────────────────────────────────
const qt = StyleSheet.create({
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
    paddingBottom: 40,
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
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: FB.textPrimary,
  },
  sub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: FB.textSec,
    marginTop: 4,
    marginBottom: 20,
  },
  fieldWrap: { marginBottom: 14 },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: FB.textSec,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: FB.offWhite,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
    borderWidth: 1,
    borderColor: FB.border,
  },
  nairaSymbol: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: FB.navy,
  },
  input: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: FB.textPrimary,
  },
  quickRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  quickChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: FB.offWhite,
    borderWidth: 1,
    borderColor: FB.border,
    alignItems: "center",
  },
  quickChipActive: { backgroundColor: FB.navy, borderColor: FB.navy },
  quickChipText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: FB.textSec },
  quickChipTextActive: { color: "#fff" },
  actions: { flexDirection: "row", gap: 12 },
  scanBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: FB.navy,
    backgroundColor: "transparent",
  },
  scanBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: FB.navy },
  sendBtn: { flex: 2, height: 52, borderRadius: 14, overflow: "hidden" },
  sendBtnGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sendBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#fff" },
});

// ─── Main Styles ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: FB.offWhite },
  scroll: { flex: 1 },
  scrollContent: { gap: 0 },

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
  heroTopRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  notifBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBtn: {},
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: FB.green,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#fff" },

  // Balance card
  balanceCard: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  balanceCardInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  balanceLeft: { gap: 4 },
  balanceLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
    marginTop: 2,
  },
  balanceCoinIcon: { alignItems: "center", justifyContent: "center" },
  quickSendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  quickSendText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: FB.greenLight,
    flex: 1,
  },

  // What do you want to do section
  sectionCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 16,
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
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  seeAll: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: FB.green,
  },

  // Actions grid — 3 columns
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  actionTile: {
    width: (W - 32 - 36 - 24) / 3, // 3 cols, 16px margin each side, 12px gap
  },
  actionTileInner: { alignItems: "center", gap: 8 },
  actionIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: FB.textPrimary,
    textAlign: "center",
    lineHeight: 16,
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
  tripRoute: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: FB.textPrimary,
  },
  tripDate: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: FB.textSec,
    marginTop: 2,
  },
  tripStatusPill: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillActive: { backgroundColor: FB.green + "15" },
  pillDone: { backgroundColor: "#F0FDF4" },
  pillText: { fontFamily: "Poppins_500Medium", fontSize: 11 },
  pillTextActive: { color: FB.green },
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

  // Promo banner
  promoBanner: { marginHorizontal: 16, marginTop: 16, borderRadius: 18, overflow: "hidden" },
  promoGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    gap: 16,
  },
  promoText: { flex: 1 },
  promoTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#fff" },
  promoSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    lineHeight: 18,
    marginTop: 2,
  },
});