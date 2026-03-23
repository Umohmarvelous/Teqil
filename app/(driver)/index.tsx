import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  Dimensions,
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
  withDelay,
  FadeInDown,
  FadeInUp,
  Easing,
  interpolate,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useAuthStore, useTripStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { TripsStorage } from "@/src/services/storage";
import {
  formatCoins,
  formatDate,
  formatNaira,
} from "@/src/utils/helpers";
import type { Trip } from "@/src/models/types";
import { useTranslation } from "react-i18next";

const { width: SCREEN_W } = Dimensions.get("window");
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ─── Floating Nav Bar ────────────────────────────────────────────────────────

interface NavItem {
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
}

const NAV_ITEMS: NavItem[] = [
  { icon: "home-outline", iconActive: "home", label: "Home", route: "/(driver)" },
  { icon: "add-circle-outline", iconActive: "add-circle", label: "New Trip", route: "/(driver)/create-trip" },
  { icon: "time-outline", iconActive: "time", label: "History", route: "/(driver)/history" },
  { icon: "notifications-outline", iconActive: "notifications", label: "Messages", route: "/(driver)/messages" },
];

function FloatingNavBar({ activeRoute }: { activeRoute: string }) {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  return (
    <View
      style={[
        styles.navBarWrapper,
        { bottom: (isWeb ? 20 : insets.bottom + 10) },
      ]}
    >
      <View style={styles.navBar}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeRoute === item.route;
          return (
            <NavBarItem
              key={item.route}
              item={item}
              isActive={isActive}
            />
          );
        })}
      </View>
    </View>
  );
}

function NavBarItem({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const scale = useSharedValue(1);
  const indicatorOpacity = useSharedValue(isActive ? 1 : 0);
  const labelOpacity = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    indicatorOpacity.value = withTiming(isActive ? 1 : 0, { duration: 200 });
    labelOpacity.value = withTiming(isActive ? 1 : 0, { duration: 200 });
  }, [isActive]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: indicatorOpacity.value,
    transform: [
      { scaleX: interpolate(indicatorOpacity.value, [0, 1], [0.4, 1]) },
    ],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
  }));

  const handlePress = () => {
    scale.value = withSequence(
      withTiming(0.85, { duration: 80 }),
      withSpring(1, { damping: 12 })
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!isActive) router.push(item.route as any);
  };

  return (
    <Animated.View style={[styles.navItem, containerStyle]}>
      <Pressable onPress={handlePress} style={styles.navItemPressable}>
        <Animated.View style={[styles.navIndicator, indicatorStyle]} />
        <Ionicons
          name={isActive ? item.iconActive : item.icon}
          size={24}
          color={isActive ? Colors.primary : "#555"}
        />
        <Animated.Text
          style={[styles.navLabel, { color: isActive ? Colors.primary : "#555" }, labelStyle]}
        >
          {item.label}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  accent,
  delay,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accent: string;
  delay: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify().damping(14)}
      style={[styles.statCard]}
    >
      <View style={[styles.statIconRing, { borderColor: accent + "30" }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

// ─── Trip Row ─────────────────────────────────────────────────────────────────

function TripRow({ trip, index }: { trip: Trip; index: number }) {
  const isDone = trip.status === "completed";

  return (
    <Animated.View
      entering={FadeInDown.delay(400 + index * 80).springify().damping(16)}
      style={styles.tripRow}
    >
      <View style={[styles.tripStatusDot, { backgroundColor: isDone ? Colors.primary : Colors.gold }]} />
      <View style={styles.tripInfo}>
        <Text style={styles.tripRoute} numberOfLines={1}>
          {trip.origin} → {trip.destination}
        </Text>
        <Text style={styles.tripDate}>{formatDate(trip.created_at)}</Text>
      </View>
      <View style={[styles.statusPill, isDone ? styles.statusPillDone : styles.statusPillActive]}>
        <Text style={[styles.statusPillText, isDone ? styles.statusTextDone : styles.statusTextActive]}>
          {isDone ? "Done" : "Active"}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DriverDashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const { t } = useTranslation();
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Animations
  const startBtnScale = useSharedValue(1);
  const startBtnGlow = useSharedValue(0);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    // Pulse animation on START button
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 900, easing: Easing.inOut(Easing.sine) }),
        withTiming(1.0, { duration: 900, easing: Easing.inOut(Easing.sine) })
      ),
      -1,
      false
    );
    startBtnGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200 }),
        withTiming(0.3, { duration: 1200 })
      ),
      -1,
      false
    );
  }, []);

  useEffect(() => {
    if (user?.id) {
      setIsLoading(true);
      TripsStorage.getByDriverId(user.id)
        .then((trips) => {
          setRecentTrips(trips.slice(-5).reverse());
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [user?.id]);

  const completedCount = recentTrips.filter((t) => t.status === "completed").length;
  const totalCoins = user?.points_balance || 0;
  const displayName = user?.full_name?.split(" ")[0] || "Driver";
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const handleStartTrip = () => {
    if (!user?.profile_complete) {
      Alert.alert("Profile Required", "Please complete your profile first.");
      return;
    }
    startBtnScale.value = withSequence(
      withTiming(0.93, { duration: 100 }),
      withSpring(1, { damping: 10 })
    );
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

  const startBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: startBtnScale.value * pulseScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: startBtnGlow.value * 0.55,
  }));

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topPad + 8, paddingBottom: 140 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <Animated.View
          entering={FadeInDown.delay(0).springify().damping(14)}
          style={styles.header}
        >
          <View>
            <Text style={styles.greetSmall}>{t("driver.dashboard") === "Dashboard" ? "Good day," : t("driver.dashboard")}</Text>
            <Text style={styles.greetName}>{displayName}</Text>
          </View>
          <Pressable onPress={handleLogout} style={styles.avatarBtn}>
            <Ionicons name="person-circle" size={42} color={Colors.primary} />
          </Pressable>
        </Animated.View>

        {/* ── Driver ID + Online Pill ── */}
        <Animated.View
          entering={FadeInDown.delay(60).springify().damping(14)}
          style={styles.pillRow}
        >
          {user?.driver_id && (
            <View style={styles.driverIdPill}>
              <Ionicons name="id-card-outline" size={13} color={Colors.gold} />
              <Text style={styles.driverIdText}>{user.driver_id}</Text>
            </View>
          )}
          <View style={styles.onlinePill}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>{t("driver.online")}</Text>
          </View>
        </Animated.View>

        {/* ── Coin Card ── */}
        <Animated.View entering={FadeInDown.delay(120).springify().damping(14)}>
          <LinearGradient
            colors={["#0D2A14", "#143D1E", "#0A2010"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.coinCard}
          >
            <View style={styles.coinCardLeft}>
              <Text style={styles.coinCardLabel}>{t("driver.coinBalance")}</Text>
              <Text style={styles.coinCardValue}>{formatCoins(totalCoins)}</Text>
              <Text style={styles.coinCardNaira}>
                ≈ {formatNaira(totalCoins * 0.7)} value
              </Text>
            </View>
            <View style={styles.coinIconWrap}>
              <Ionicons name="star" size={40} color={Colors.gold} />
              <Text style={styles.coinIconLabel}>COINS</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ── Stats Row ── */}
        <View style={styles.statsRow}>
          <StatCard
            icon="checkmark-circle"
            label="Trips Done"
            value={completedCount.toString()}
            accent={Colors.primary}
            delay={200}
          />
          <StatCard
            icon="star"
            label="Avg Rating"
            value={user?.avg_rating ? user.avg_rating.toFixed(1) : "—"}
            accent={Colors.gold}
            delay={260}
          />
          <StatCard
            icon="wallet"
            label="Total Earned"
            value={formatNaira(totalCoins * 0.7)}
            accent="#60A5FA"
            delay={320}
          />
        </View>

        {/* ── START TRIP Button ── */}
        <Animated.View
          entering={FadeInUp.delay(200).springify().damping(12)}
          style={styles.startSection}
        >
          {/* Glow halo behind button */}
          <Animated.View style={[styles.startBtnGlow, glowStyle]} />

          <AnimatedPressable
            style={[styles.startBtn, startBtnStyle]}
            onPress={handleStartTrip}
          >
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.6, y: 1 }}
              style={styles.startBtnGradient}
            >
              <Ionicons name="navigate" size={28} color="#fff" />
              <Text style={styles.startBtnText}>{t("driver.startTrip")}</Text>
            </LinearGradient>
          </AnimatedPressable>
          <Text style={styles.startHint}>Tap to create a new trip and earn coins</Text>
        </Animated.View>

        {/* ── Profile Banner ── */}
        {!user?.profile_complete && (
          <Animated.View entering={FadeInDown.delay(350).springify()}>
            <Pressable
              style={styles.profileBanner}
              onPress={() => router.push("/(auth)/driver-profile")}
            >
              <Ionicons name="warning" size={18} color={Colors.warning} />
              <Text style={styles.profileBannerText}>
                {t("driver.completeProfile")}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.warning} />
            </Pressable>
          </Animated.View>
        )}

        {/* ── Recent Trips ── */}
        <Animated.View entering={FadeInDown.delay(380).springify().damping(14)}>
          <Text style={styles.sectionTitle}>{t("driver.recentTrips")}</Text>
        </Animated.View>

        {isLoading ? (
          <Animated.View entering={FadeInDown.delay(420).springify()} style={styles.loadingBox}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={styles.loadingText}>Loading trips…</Text>
          </Animated.View>
        ) : recentTrips.length === 0 ? (
          <Animated.View entering={FadeInDown.delay(420).springify()} style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="car-outline" size={38} color="#333" />
            </View>
            <Text style={styles.emptyTitle}>{t("driver.noTrips")}</Text>
          </Animated.View>
        ) : (
          <View style={styles.tripList}>
            {recentTrips.map((trip, i) => (
              <TripRow key={trip.id} trip={trip} index={i} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Floating Nav Bar ── */}
      <FloatingNavBar activeRoute="/(driver)" />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 16,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  greetSmall: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#666",
  },
  greetName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 26,
    color: "#F0F0F0",
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  avatarBtn: {
    padding: 2,
  },

  // Pills row
  pillRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: -4,
  },
  driverIdPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#1A1A1A",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.gold + "30",
  },
  driverIdText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.gold,
    letterSpacing: 1.2,
  },
  onlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1A1A1A",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#4ADE80",
  },
  onlineText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "#4ADE80",
  },

  // Coin Card
  coinCard: {
    borderRadius: 20,
    padding: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: Colors.primary + "20",
  },
  coinCardLeft: {
    gap: 2,
  },
  coinCardLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  coinCardValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 30,
    color: "#F0F0F0",
    letterSpacing: -0.5,
  },
  coinCardNaira: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.gold,
    marginTop: 2,
  },
  coinIconWrap: {
    alignItems: "center",
    gap: 4,
  },
  coinIconLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9,
    color: Colors.gold,
    letterSpacing: 2,
  },

  // Stats
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#141414",
    borderRadius: 16,
    padding: 14,
    gap: 8,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "#222",
  },
  statIconRing: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: "#F0F0F0",
  },
  statLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  // Start Button
  startSection: {
    alignItems: "center",
    position: "relative",
    paddingVertical: 8,
  },
  startBtnGlow: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: Colors.primary,
    top: "50%",
    marginTop: -80,
    zIndex: 0,
    // blur via shadow
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 60,
    elevation: 0,
  },
  startBtn: {
    width: 190,
    borderRadius: 32,
    overflow: "hidden",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 14,
    zIndex: 1,
  },
  startBtnGradient: {
    paddingVertical: 22,
    alignItems: "center",
    gap: 8,
  },
  startBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: "#fff",
    letterSpacing: 1.5,
  },
  startHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#444",
    marginTop: 12,
    textAlign: "center",
    zIndex: 1,
  },

  // Profile banner
  profileBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.goldLight || "#FEF6E7",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.gold + "50",
  },
  profileBannerText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "#92400E",
  },

  // Recent trips
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 17,
    color: "#D0D0D0",
    marginTop: 4,
    marginBottom: -4,
  },
  tripList: {
    backgroundColor: "#111",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1E1E1E",
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1A1A1A",
    gap: 12,
  },
  tripStatusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    flexShrink: 0,
  },
  tripInfo: {
    flex: 1,
  },
  tripRoute: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: "#D8D8D8",
  },
  tripDate: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "#555",
    marginTop: 2,
  },
  statusPill: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillDone: {
    backgroundColor: Colors.primary + "18",
  },
  statusPillActive: {
    backgroundColor: Colors.gold + "18",
  },
  statusPillText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
  },
  statusTextDone: {
    color: Colors.primary,
  },
  statusTextActive: {
    color: Colors.gold,
  },

  // Empty / loading
  emptyState: {
    alignItems: "center",
    paddingVertical: 44,
    backgroundColor: "#111",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1E1E1E",
    gap: 12,
  },
  emptyIconWrap: {
    width: 70,
    height: 70,
    borderRadius: 20,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#444",
    textAlign: "center",
    paddingHorizontal: 24,
  },
  loadingBox: {
    alignItems: "center",
    paddingVertical: 44,
    gap: 12,
  },
  loadingText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#444",
  },

  // Floating Nav Bar
  navBarWrapper: {
    position: "absolute",
    left: 20,
    right: 20,
    alignItems: "center",
  },
  navBar: {
    flexDirection: "row",
    backgroundColor: "#141414",
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#252525",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
    gap: 4,
    width: "100%",
    maxWidth: 380,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
  },
  navItemPressable: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 3,
    width: "100%",
  },
  navIndicator: {
    position: "absolute",
    top: 0,
    left: "15%",
    right: "15%",
    height: 2.5,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  navLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10,
    letterSpacing: 0.2,
  },
});