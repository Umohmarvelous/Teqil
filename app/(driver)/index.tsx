import React, { useEffect, useRef } from "react";
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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { TripsStorage } from "@/src/services/storage";
import { formatCoins, formatDate, formatNaira } from "@/src/utils/helpers";
import type { Trip } from "@/src/models/types";
import { useTranslation } from "react-i18next";

function StatCard({
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
    <View style={styles.statCard}>
      <View style={[styles.statIconBg, { backgroundColor: accent ? `${accent}18` : Colors.primaryLight }]}>
        <Ionicons name={icon} size={20} color={accent || Colors.primary} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TripRow({ trip }: { trip: Trip }) {
  return (
    <View style={styles.tripRow}>
      <View style={styles.tripDot} />
      <View style={styles.tripInfo}>
        <Text style={styles.tripRoute} numberOfLines={1}>
          {trip.origin} → {trip.destination}
        </Text>
        <Text style={styles.tripDate}>{formatDate(trip.created_at)}</Text>
      </View>
      <View style={[styles.tripStatusBadge, trip.status === "completed" && styles.tripStatusDone]}>
        <Text style={[styles.tripStatusText, trip.status === "completed" && styles.tripStatusTextDone]}>
          {trip.status === "completed" ? "Done" : "Active"}
        </Text>
      </View>
    </View>
  );
}

export default function DriverDashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const { t } = useTranslation();
  const [recentTrips, setRecentTrips] = React.useState<Trip[]>([]);

  const pulseScale = useSharedValue(1);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 900 }),
        withTiming(1, { duration: 900 })
      ),
      -1,
      false
    );
  }, []);

  useEffect(() => {
    if (user?.id) {
      TripsStorage.getByDriverId(user.id).then((trips) => {
        setRecentTrips(trips.slice(-5).reverse());
      });
    }
  }, [user?.id]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const handleStartTrip = () => {
    if (!user?.profile_complete) {
      Alert.alert("Profile Required", "Please complete your profile first.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push("/(driver)/create-trip");
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
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
  const coins = user?.points_balance || 0;
  const displayName = user?.full_name || "Driver";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
    >
      <LinearGradient
        colors={[Colors.primaryDark, Colors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroSection, { paddingTop: topPadding + 16 }]}
      >
        <View style={styles.heroHeader}>
          <View>
            <Text style={styles.heroGreeting}>Good day,</Text>
            <Text style={styles.heroName}>{displayName.split(" ")[0]}</Text>
          </View>
          <Pressable style={styles.avatarBtn} onPress={handleLogout}>
            <Ionicons name="person-circle" size={40} color="rgba(255,255,255,0.9)" />
          </Pressable>
        </View>

        <View style={styles.driverIdRow}>
          <View style={styles.driverIdPill}>
            <Ionicons name="id-card-outline" size={14} color={Colors.gold} />
            <Text style={styles.driverIdText}>{user?.driver_id || "Pending"}</Text>
          </View>
          <View style={styles.onlinePill}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>{t("driver.online")}</Text>
          </View>
        </View>

        <View style={styles.coinCard}>
          <View>
            <Text style={styles.coinLabel}>{t("driver.coinBalance")}</Text>
            <Text style={styles.coinValue}>{formatCoins(coins)}</Text>
            <Text style={styles.coinNaira}>{formatNaira(coins * 0.7)} value</Text>
          </View>
          <Ionicons name="star" size={36} color={Colors.gold} />
        </View>
      </LinearGradient>

      <View style={styles.statsRow}>
        <StatCard icon="checkmark-circle" label="Trips Done" value={recentTrips.filter((t) => t.status === "completed").length.toString()} />
        <StatCard icon="star" label="Avg Rating" value={user?.avg_rating ? user.avg_rating.toFixed(1) : "—"} accent={Colors.gold} />
        <StatCard icon="wallet" label="Total Earned" value={formatNaira(coins * 0.7)} accent={Colors.primary} />
      </View>

      <View style={styles.startSection}>
        <Animated.View style={pulseStyle}>
          <Pressable style={styles.startBtn} onPress={handleStartTrip}>
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.startBtnGradient}
            >
              <Ionicons name="navigate" size={28} color={Colors.surface} />
              <Text style={styles.startBtnText}>{t("driver.startTrip")}</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
        <Text style={styles.startHint}>Tap to create a new trip and earn coins</Text>
      </View>

      {!user?.profile_complete && (
        <Pressable
          style={styles.profileBanner}
          onPress={() => router.push("/(auth)/driver-profile")}
        >
          <Ionicons name="warning" size={20} color={Colors.warning} />
          <Text style={styles.profileBannerText}>{t("driver.completeProfile")}</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.warning} />
        </Pressable>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("driver.recentTrips")}</Text>
        {recentTrips.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="car-outline" size={40} color={Colors.border} />
            <Text style={styles.emptyText}>{t("driver.noTrips")}</Text>
          </View>
        ) : (
          <View style={styles.tripsList}>
            {recentTrips.map((trip) => (
              <TripRow key={trip.id} trip={trip} />
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
  heroSection: {
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
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
  },
  heroName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 26,
    color: Colors.surface,
    lineHeight: 34,
  },
  avatarBtn: { padding: 2 },
  driverIdRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  driverIdPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  driverIdText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.gold,
    letterSpacing: 1,
  },
  onlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ADE80",
  },
  onlineText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.surface,
  },
  coinCard: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 18,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  coinLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    marginBottom: 4,
  },
  coinValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    color: Colors.surface,
  },
  coinNaira: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.gold,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 8,
  },
  statIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  startSection: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  startBtn: {
    width: 200,
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  startBtnGradient: {
    paddingVertical: 20,
    alignItems: "center",
    gap: 8,
  },
  startBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.surface,
    letterSpacing: 1,
  },
  startHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 10,
    textAlign: "center",
  },
  profileBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.goldLight,
    marginHorizontal: 24,
    marginTop: 8,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  profileBannerText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "#92400E",
  },
  section: { paddingHorizontal: 24, paddingTop: 24 },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 17,
    color: Colors.text,
    marginBottom: 14,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 16,
  },
  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 20,
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
  tripDate: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  tripStatusBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tripStatusDone: { backgroundColor: "#F0FDF4" },
  tripStatusText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.primary,
  },
  tripStatusTextDone: { color: Colors.primary },
});
