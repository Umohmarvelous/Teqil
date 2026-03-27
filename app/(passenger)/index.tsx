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

// ---------------------------------------------------------------------------
// FloatingNavBar
// ---------------------------------------------------------------------------
interface NavItem {
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
  isActive: boolean;
}

function FloatingNavBar({ activeTab }: { activeTab: "home" | "find" | "history" }) {
  // const insets = useSafeAreaInsets();
  // const { t } = useTranslation();

  const scaleHome = useRef(new Animated.Value(1)).current;
  const scaleFind = useRef(new Animated.Value(1)).current;
  const scaleHistory = useRef(new Animated.Value(1)).current;

  // const navItems: NavItem[] = [
  //   {
  //     icon: "home-outline",
  //     iconActive: "home",
  //     label: t("driver.dashboard"),
  //     route: "/(passenger)",
  //     isActive: activeTab === "home",
  //   },
  //   {
  //     icon: "search-outline",
  //     iconActive: "search",
  //     label: t("passenger.findTrip").replace("FIND ", "Find "),
  //     route: "/(passenger)/find-trip",
  //     isActive: activeTab === "find",
  //   },
  //   {
  //     icon: "time-outline",
  //     iconActive: "time",
  //     label: t("history.title"),
  //     route: "/(passenger)/history",
  //     isActive: activeTab === "history",
  //   },
  // ];

  const scales = [scaleHome, scaleFind, scaleHistory];

  const handlePress = (item: NavItem, idx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(scales[idx], { toValue: 0.88, duration: 90, useNativeDriver: true }),
      Animated.spring(scales[idx], { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
    if (!item.isActive) router.push(item.route as any);
  };

  return (
    // <View style={[navStyles.wrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}>
    //   <View style={navStyles.bar}>
    //     {navItems.map((item, idx) => (
    //       <Animated.View key={item.route} style={{ transform: [{ scale: scales[idx] }], flex: 1 }}>
    //         <Pressable
    //           style={navStyles.navItem}
    //           onPress={() => handlePress(item, idx)}
    //         >
    //           <View style={[navStyles.iconWrap, item.isActive && navStyles.iconWrapActive]}>
    //             <Ionicons
    //               name={item.isActive ? item.iconActive : item.icon}
    //               size={22}
    //               color={item.isActive ? Colors.surface : Colors.textSecondary}
    //             />
    //           </View>
    //           <Text style={[navStyles.navLabel, item.isActive && navStyles.navLabelActive]}>
    //             {item.label}
    //           </Text>
    //         </Pressable>
    //       </Animated.View>
    //     ))}
    //   </View>
    // </View>
    <></>
  );
}

const navStyles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: "transparent",
    pointerEvents: "box-none",
  },
  bar: {
    flexDirection: "row",
    backgroundColor: "#1A1A1A",
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    gap: 4,
  },
  iconWrap: {
    width: 44,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  navLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  navLabelActive: {
    color: Colors.primary,
    fontFamily: "Poppins_600SemiBold",
  },
});

// ---------------------------------------------------------------------------
// Animated Card wrapper
// ---------------------------------------------------------------------------
function FadeSlideCard({
  delay,
  children,
  style,
}: {
  delay: number;
  children: React.ReactNode;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 480,
        delay,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay,
        tension: 60,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// TripRow
// ---------------------------------------------------------------------------
function TripRow({ trip }: { trip: Trip }) {
  return (
    <View style={styles.tripRow}>
      <View style={styles.tripIconWrap}>
        <Ionicons name="navigate-circle" size={22} color={Colors.primary} />
      </View>
      <View style={styles.tripInfo}>
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
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------
export default function PassengerDashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const { t } = useTranslation();
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);

  // Find Trip button press scale
  const findBtnScale = useRef(new Animated.Value(1)).current;

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

  const handleFindTrip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Animated.sequence([
      Animated.timing(findBtnScale, { toValue: 0.94, duration: 100, useNativeDriver: true }),
      Animated.spring(findBtnScale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
    router.push("/(passenger)/find-trip");
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const displayName = user?.full_name || "Passenger";
  const coins = user?.points_balance || 0;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* ── Hero Section ── */}
        <FadeSlideCard delay={0}>
          <LinearGradient
            colors={["#0D1A0D", "#0D2B14", "#00521E"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, { paddingTop: topPadding + 16 }]}
          >
            {/* Decorative circles */}
            <View style={styles.decCircle1} />
            <View style={styles.decCircle2} />

            <View style={styles.heroHeader}>
              <View>
                <Text style={styles.heroGreeting}>Hello,</Text>
                <Text style={styles.heroName}>{displayName.split(" ")[0]}</Text>
              </View>
              <Pressable style={styles.avatarBtn} onPress={handleLogout}>
                <View style={styles.avatarCircle}>
                  {/* <Text style={styles.avatarInitial}>
                    {displayName.charAt(0).toUpperCase()}
                  </Text> */}
                  <Ionicons name="person" size={25} color= "rgba(46 156 99 / 0.5)" />
                </View>
              </Pressable>
            </View>

            {/* Coin card */}
            <View style={styles.coinCard}>
              <View>
                <Text style={styles.coinLabel}>{t("passenger.coinBalance")}</Text>
                <Text style={styles.coinValue}>{formatCoins(coins)}</Text>
                <Text style={styles.coinSub}>Available for rewards</Text>
              </View>
              <View style={styles.coinIconWrap}>
                <Ionicons name="star" size={30} color={Colors.gold} />
                <View style={styles.coinGlow} />
              </View>
            </View>
          </LinearGradient>
        </FadeSlideCard>

        {/* ── Find Trip CTA ── */}
        <FadeSlideCard delay={120} style={styles.findSection}>
          <Animated.View style={{ transform: [{ scale: findBtnScale }] }}>
            <Pressable onPress={handleFindTrip} style={styles.findBtn}>
              <LinearGradient
                colors={[Colors.primary, Colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.findBtnGradient}
              >
                <View style={styles.findBtnIconCircle}>
                  <Ionicons name="search" size={26} color={Colors.primary} />
                </View>
                <View>
                  <Text style={styles.findBtnText}>{t("passenger.findTrip")}</Text>
                  <Text style={styles.findBtnHint}>Enter trip code to join</Text>
                </View>
                <Ionicons name="arrow-forward-circle" size={28} color="rgba(255,255,255,0.7)" />
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </FadeSlideCard>

        {/* ── Quick Tips ── */}
        <FadeSlideCard delay={220} style={styles.tipsRow}>
          <View style={styles.tipCard}>
            <View style={[styles.tipIconWrap, { backgroundColor: "#0D2B14" }]}>
              <Ionicons name="shield-checkmark" size={22} color={Colors.primary} />
            </View>
            <View style={styles.tipText}>
              <Text style={styles.tipTitle}>Stay safe</Text>
              <Text style={styles.tipDesc}>Share trips with family</Text>
            </View>
          </View>
          <View style={styles.tipCard}>
            <View style={[styles.tipIconWrap, { backgroundColor: "#2A1E00" }]}>
              <Ionicons name="location" size={22} color={Colors.gold} />
            </View>
            <View style={styles.tipText}>
              <Text style={styles.tipTitle}>Live tracking</Text>
              <Text style={styles.tipDesc}>Know where you are</Text>
            </View>
          </View>
        </FadeSlideCard>

        {/* ── Recent Trips ── */}
        <FadeSlideCard delay={320} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Trips</Text>
            {recentTrips.length > 0 && (
              <Pressable onPress={() => router.push("/(passenger)/history")}>
                <Text style={styles.sectionLink}>See all</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.tripsCard}>
            {recentTrips.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="car-outline" size={32} color={Colors.textSecondary} />
                </View>
                <Text style={styles.emptyText}>
                  No trips yet.{"\n"}Find a trip to get started!
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
        </FadeSlideCard>

        {/* Bottom space for floating nav */}
        <View style={{ height: 110 + (Platform.OS === "web" ? 34 : 0) }} />
      </ScrollView>

      {/* ── Floating Nav ── */}
      <FloatingNavBar activeTab="home" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 30,
  },

  // ── Hero ──
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    overflow: "hidden",
    marginHorizontal: 10,
    marginTop: 10,
    borderRadius: 30,
  },
  decCircle1: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(0,166,81,0.06)",
    top: -60,
    right: -60,
  },
  decCircle2: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(0,166,81,0.04)",
    bottom: -40,
    left: -30,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  heroGreeting: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
  },
  heroName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    color: Colors.surface,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  avatarBtn: {
    marginTop: 2,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,166,81,0.25)",
    borderWidth: .5,
    borderColor: "rgba(0,166,81,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.primary,
  },
  coinCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  coinLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    marginBottom: 4,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  coinValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    color: Colors.surface,
    letterSpacing: -0.5,
  },
  coinSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.gold,
    marginTop: 2,
  },
  coinIconWrap: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  coinGlow: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(245,166,35,0.15)",
  },

  // ── Find Trip ──
  findSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  findBtn: {
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  findBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 20,
    gap: 16,
  },
  findBtnIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  findBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: Colors.surface,
    letterSpacing: 0.5,
    flex: 1,
  },
  findBtnHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },

  // ── Tips ──
  tipsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  tipCard: {
    flex: 1,
    backgroundColor: "#141414",
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tipIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tipText: {
    flex: 1,
  },
  tipTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.surface,
  },
  tipDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },

  // ── Recent Trips ──
  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 17,
    color: Colors.surface,
  },
  sectionLink: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.primary,
  },
  tripsCard: {
    backgroundColor: "#141414",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  tripIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(0,166,81,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  tripInfo: {
    flex: 1,
  },
  tripRouteText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.surface,
  },
  tripRouteDate: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusPill: {
    backgroundColor: "rgba(0,166,81,0.15)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillDone: {
    backgroundColor: "rgba(22,163,74,0.15)",
  },
  statusPillText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: Colors.primary,
  },
  statusPillTextDone: {
    color: "#4ADE80",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginHorizontal: 16,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: "#1E1E1E",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 21,
  },
});