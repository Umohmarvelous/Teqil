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
import { Colors } from "@/constants/colors";
import { PassengersStorage, TripsStorage } from "@/src/services/storage";
import { formatCoins, formatDate } from "@/src/utils/helpers";
import type { Trip } from "@/src/models/types";
import { useTranslation } from "react-i18next";

export default function PassengerDashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const { t } = useTranslation();
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    PassengersStorage.getByUserId(user.id).then(async (passengers) => {
      const trips = await Promise.all(
        passengers.slice(-4).map(async (p) => {
          const all = await TripsStorage.getAll();
          return all.find((t) => t.id === p.trip_id);
        })
      );
      setRecentTrips(trips.filter(Boolean).reverse() as Trip[]);
    });
  }, [user?.id]);

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
  const displayName = user?.full_name || "Passenger";
  const coins = user?.points_balance || 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
    >
      <LinearGradient
        colors={["#004E2C", Colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: topPadding + 16 }]}
      >
        <View style={styles.heroHeader}>
          <View>
            <Text style={styles.heroGreeting}>Hello,</Text>
            <Text style={styles.heroName}>{displayName.split(" ")[0]}</Text>
          </View>
          <Pressable onPress={handleLogout}>
            <Ionicons name="person-circle" size={40} color="rgba(255,255,255,0.9)" />
          </Pressable>
        </View>

        <View style={styles.coinCard}>
          <View>
            <Text style={styles.coinLabel}>{t("passenger.coinBalance")}</Text>
            <Text style={styles.coinValue}>{formatCoins(coins)}</Text>
          </View>
          <Ionicons name="star" size={34} color={Colors.gold} />
        </View>
      </LinearGradient>

      <View style={styles.mainAction}>
        <Pressable
          style={styles.findTripBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            router.push("/(passenger)/find-trip");
          }}
        >
          <LinearGradient
            colors={[Colors.primary, Colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.findTripGradient}
          >
            <Ionicons name="search" size={28} color={Colors.surface} />
            <Text style={styles.findTripText}>{t("passenger.findTrip")}</Text>
            <Text style={styles.findTripHint}>Enter trip code to join</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <View style={styles.quickTips}>
        <View style={styles.tipCard}>
          <Ionicons name="shield-checkmark" size={24} color={Colors.primary} />
          <View style={styles.tipText}>
            <Text style={styles.tipTitle}>Stay safe</Text>
            <Text style={styles.tipDesc}>Share trips with family</Text>
          </View>
        </View>
        <View style={styles.tipCard}>
          <Ionicons name="location" size={24} color={Colors.gold} />
          <View style={styles.tipText}>
            <Text style={styles.tipTitle}>Live tracking</Text>
            <Text style={styles.tipDesc}>Know where you are</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Trips</Text>
        {recentTrips.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="car-outline" size={40} color={Colors.border} />
            <Text style={styles.emptyText}>No trips yet. Find a trip to get started!</Text>
          </View>
        ) : (
          <View style={styles.tripsList}>
            {recentTrips.map((trip) => (
              <View key={trip.id} style={styles.tripRow}>
                <View style={styles.tripRouteDot} />
                <View style={styles.tripRouteInfo}>
                  <Text style={styles.tripRouteText} numberOfLines={1}>
                    {trip.origin} → {trip.destination}
                  </Text>
                  <Text style={styles.tripRouteDate}>{formatDate(trip.created_at)}</Text>
                </View>
                <View style={[styles.statusPill, trip.status === "completed" && styles.statusPillDone]}>
                  <Text style={[styles.statusPillText, trip.status === "completed" && styles.statusPillTextDone]}>
                    {trip.status === "completed" ? "Done" : "Active"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
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
    marginBottom: 20,
  },
  heroGreeting: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
  },
  heroName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 26,
    color: Colors.surface,
    lineHeight: 34,
  },
  coinCard: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 18,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  coinLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    marginBottom: 4,
  },
  coinValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 26,
    color: Colors.surface,
  },
  mainAction: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
  },
  findTripBtn: {
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  findTripGradient: {
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  findTripText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: Colors.surface,
    letterSpacing: 1,
  },
  findTripHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
  },
  quickTips: {
    flexDirection: "row",
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 12,
  },
  tipCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  tipText: { flex: 1 },
  tipTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  tipDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  section: { paddingHorizontal: 24, paddingTop: 20 },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 17,
    color: Colors.text,
    marginBottom: 14,
  },
  emptyState: {
    alignItems: "center",
    padding: 32,
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 16,
  },
  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  tripsList: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: "hidden",
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 12,
  },
  tripRouteDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  tripRouteInfo: { flex: 1 },
  tripRouteText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  tripRouteDate: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusPill: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillDone: { backgroundColor: "#F0FDF4" },
  statusPillText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.primary,
  },
  statusPillTextDone: { color: "#16A34A" },
});
