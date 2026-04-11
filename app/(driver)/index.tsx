import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import {
  formatCoins,
  formatNaira,
  coinsToNaira,
} from "@/src/utils/helpers";
// import { useTranslation } from "react-i18next";





export default function DriverDashboard() {
  // const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuthStore();
  // const { t } = useTranslation();
  // const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [balanceHidden, setBalanceHidden] = useState(false);

  // const topPadding = Platform.OS === "web" ? 67 : insets.top;
  // const displayName = user?.full_name?.split(" ")[0] || "Driver";
  const coins = user?.points_balance || 0;


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
              <Ionicons name="warning-outline" size={15} color={Colors.gold} />
              <Text style={styles.profileBannerText}>
                Complete your profile to start trips
              </Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.gold} />
            </Pressable>
          )}
        </View>

        {/* ── START TRIP button ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>Ready to drive?</Text>
          <Pressable onPress={handleStartTrip} style={styles.startTripBtn}>
            <LinearGradient
              colors={[Colors.primary, "#007A3D"]}
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
      </ScrollView> 
    </View>
  );
}


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
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#fff" },

  // Balance
  balanceCard: {
    backgroundColor: Colors.primaryDarker,
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
    color: Colors.gold,
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
    color: Colors.gold,
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
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.textSecondary },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary },
  statsDivider: { width: 1, height: 32, backgroundColor: Colors.border },

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
    color: Colors.textSecondary,
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  seeAll: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.primary },

  // Start trip
  startTripBtn: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: Colors.primary,
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
    color: Colors.textSecondary,
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
    color: Colors.textSecondary,
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
  tripRoute: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary },
  tripDate: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  tripStatusPill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  pillActive: { backgroundColor: Colors.gold + "20" },
  pillDone: { backgroundColor: "#F0FDF4" },
  pillText: { fontFamily: "Poppins_500Medium", fontSize: 11 },
  pillTextActive: { color: Colors.gold },
  pillTextDone: { color: "#16A34A" },
  divider: { height: 1, backgroundColor: Colors.border },

  // Empty
  emptyState: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.textSecondary },
  emptySubText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});