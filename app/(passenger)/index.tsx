// app/(passenger)/index.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { PassengersStorage, TripsStorage } from "@/src/services/storage";
import type { Trip } from "@/src/models/types";
import { useTranslation } from "react-i18next";
import { FB } from "@/constants/fbPalette";

// Import separated components
import ActionTile from "@/components/ActionTile";
import TripRow from "@/components/TripRow";
import QuickTransferModal from "@/components/QuickTransferModal";
import BalanceCard from "@/components/BalanceCard";

// Define actions
const ACTIONS = [
  { id: "pay",     icon: "send-outline" as const,         label: "Pay Fare",    color: FB.navy  },
  { id: "find",    icon: "search-outline" as const,       label: "Find Trip",   color: FB.green },
  { id: "history", icon: "time-outline" as const,         label: "History",     color: "#7C3AED" },
  { id: "qr",      icon: "qr-code-outline" as const,      label: "Scan QR",     color: "#D97706" },
  { id: "share",   icon: "share-social-outline" as const, label: "Share Trip",  color: "#0891B2" },
  { id: "sos",     icon: "warning-outline" as const,      label: "Emergency",   color: FB.red   },
];

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
    const loadTrips = async () => {
      try {
        const passengers = await PassengersStorage.getByUserId(user.id);
        if (!passengers) return;
        const trips = await Promise.all(
          passengers.slice(-5).map(async (p) => {
            const all = await TripsStorage.getAll();
            return all.find((t) => t.id === p.trip_id);
          })
        );
        setRecentTrips(trips.filter(Boolean).reverse() as Trip[]);
      } catch (error) {
        console.warn("Failed to load recent trips:", error);
        setRecentTrips([]);
      }
    };
    loadTrips();
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
        {/* Hero Header */}
        <LinearGradient
          colors={[FB.navy, FB.navyDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: topPadding + 14 }]}
        >
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

          <BalanceCard
            coins={coins}
            balanceHidden={balanceHidden}
            onToggleHide={() => setBalanceHidden(v => !v)}
            onQuickTransferPress={() => setQuickTransferVisible(true)}
          />
        </LinearGradient>

        {/* Actions Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>What do you want to do?</Text>
          <View style={styles.actionsGrid}>
            {ACTIONS.map((action) => (
              <ActionTile
                key={action.id}
                icon={action.icon}
                label={action.label}
                color={action.color}
                onPress={() => handleAction(action.id)}
              />
            ))}
          </View>
        </View>

        {/* Recent Trips */}
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
              {`  Tap "Find Trip" above to join your first trip`}
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

        {/* Promo Banner */}
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

      <QuickTransferModal
        visible={quickTransferVisible}
        onClose={() => setQuickTransferVisible(false)}
      />
    </View>
  );
}

// Main dashboard styles (only what remains)
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: FB.offWhite },
  scroll: { flex: 1 },
  scrollContent: { gap: 0 },

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
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  divider: { height: 1, backgroundColor: FB.border },

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
})