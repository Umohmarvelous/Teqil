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
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { TripsStorage, PassengersStorage } from "@/src/services/storage";
import { formatDate, formatNaira, coinsToNaira, formatCoins } from "@/src/utils/helpers";
import { Colors } from "@/constants/colors";
import SearchBar from "@/components/SearchBar";
import Avatar from "@/components/Avatar";
import type { Trip } from "@/src/models/types";

interface HomeTabProps {
  onOpenSidebar: () => void;
}

const GREETINGS = ["Good morning", "Good afternoon", "Good evening"];
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return GREETINGS[0];
  if (h < 18) return GREETINGS[1];
  return GREETINGS[2];
}

export default function HomeTab({ onOpenSidebar }: HomeTabProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { theme } = useSettingsStore();
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);

  const isDark = theme === "dark";
  const bg = isDark ? "#0D1117" : "#F4F6FA";
  const cardBg = isDark ? "#161B22" : "#FFFFFF";
  const textColor = isDark ? "#F0F0F0" : "#0D1B3E";
  const subColor = isDark ? "#6B7280" : "#9CA3AF";
  const borderColor = isDark ? "rgba(255,255,255,0.06)" : "#E8ECF0";

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const firstName = (user?.full_name || "User").split(" ")[0];
  const coins = user?.points_balance || 0;

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      if (user.role === "driver") {
        const trips = await TripsStorage.getByDriverId(user.id);
        setRecentTrips(trips.slice(-5).reverse());
      } else if (user.role === "passenger") {
        const passengers = await PassengersStorage.getByUserId(user.id);
        const all = await TripsStorage.getAll();
        const trips = passengers
          .map((p) => all.find((t) => t.id === p.trip_id))
          .filter(Boolean)
          .slice(-5)
          .reverse() as Trip[];
        setRecentTrips(trips);
      }
    };
    load();
  }, [user?.id]);

  const handleQuickAction = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const role = user?.role;
    if (role === "driver") {
      if (!user?.profile_complete) {
        Alert.alert("Profile Required", "Complete your driver profile first.", [
          { text: "Complete Now", onPress: () => router.push("/(auth)/driver-profile") },
          { text: "Cancel", style: "cancel" },
        ]);
        return;
      }
      router.push("/(driver)/create-trip");
    } else if (role === "passenger") {
      router.push("/(passenger)/find-trip");
    } else if (role === "park_owner") {
      Alert.alert("Broadcast", "Go to the Park Owner dashboard to send broadcasts.");
    }
  };

  const quickActionLabel =
    user?.role === "driver"
      ? "Start Trip"
      : user?.role === "passenger"
      ? "Find Trip"
      : "Broadcast";

  const quickActionIcon: keyof typeof Ionicons.glyphMap =
    user?.role === "driver"
      ? "navigate"
      : user?.role === "passenger"
      ? "search"
      : "megaphone";

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Header */}
      <View
        // colors={isDark ? ["#009A43", "#009A43"] : ["#009A43", "#009A43"]}
        style={[styles.header, { paddingTop: topPadding + 22 }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={onOpenSidebar} style={styles.menuBtn}>
            <Ionicons name="menu" size={22} color="#fff" />
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={styles.greetText}>{getGreeting()},</Text>
            <Text style={styles.nameText}>{firstName}</Text>
          </View>

          <Avatar
            name={user?.full_name || "U"}
            photoUri={user?.profile_photo}
            size={38}
          />
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <SearchBar isDark={false} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Balance card */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.balanceRow}>
            <View>
              <Text style={[styles.balanceLabel, { color: subColor }]}>
                Coin Balance
              </Text>
              <Text style={[styles.balanceValue, { color: textColor }]}>
                {formatCoins(coins)}
              </Text>
              <Text style={[styles.balanceEquiv, { color: Colors.gold }]}>
                ≈ {formatNaira(coinsToNaira(coins))}
              </Text>
            </View>
          
          </View>

          {/* Quick action */}
          <Pressable onPress={handleQuickAction} style={styles.quickActionBtn}>
            {/* <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              style={styles.quickActionGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            > */}
              <Ionicons name={quickActionIcon} size={20} color="#fff" />
              <Text style={styles.quickActionText}>{quickActionLabel}</Text>
            {/* </LinearGradient> */}
          </Pressable>
        </View>

        {/* Role-specific shortcuts */}
        {user?.role === "driver" && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Driver Actions
            </Text>
            <View style={styles.shortcutRow}>
              {[
                { icon: "add-circle-outline" as const, label: "New Trip", route: "/(driver)/create-trip" },
                { icon: "time-outline" as const, label: "History", route: "/(driver)/history" },
                { icon: "megaphone-outline" as const, label: "Messages", route: "/(driver)/messages" },
                { icon: "person-outline" as const, label: "Profile", route: "/(auth)/driver-profile" },
               //  { icon: "person-outline" as const, label: "Profile", route: "/app/(driver)" },

      //             if (user.role === "driver") {
      //     // router.replace(user.profile_complete ? "/(driver)" : "/(auth)/driver-profile");
      //     router.replace("/(main)");
      //   } else if (user.role === "passenger") {
      //     router.replace("/(main)");
      //   } else if (user.role === "park_owner") {
      //     router.replace("/(main)");
      //   } else {
      //     router.replace("/(auth)/login");
      //   }
      //   return;
      // }
              ].map((item) => (
                <Pressable
                  key={item.label}
                  style={styles.shortcut}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(item.route as any);
                  }}
                >
                  <View style={[styles.shortcutIcon, { backgroundColor: Colors.primaryLight }]}>
                    <Ionicons name={item.icon} size={20} color={Colors.primary} />
                  </View>
                  <Text style={[styles.shortcutLabel, { color: subColor }]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {user?.role === "passenger" && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Passenger Actions
            </Text>
            <View style={styles.shortcutRow}>
              {[
                { icon: "search-outline" as const, label: "Find Trip", route: "/(passenger)/find-trip" },
                { icon: "time-outline" as const, label: "History", route: "/(passenger)/history" },
                { icon: "send-outline" as const, label: "Pay Fare", route: "/(auth)/pay-fare" },
                { icon: "shield-checkmark-outline" as const, label: "Safety", onPress: () => Alert.alert("Safety", "SOS is available during a live trip.") },
              ].map((item) => (
                <Pressable
                  key={item.label}
                  style={styles.shortcut}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (item.onPress) { item.onPress(); return; }
                    if (item.route) router.push(item.route as any);
                  }}
                >
                  <View style={[styles.shortcutIcon, { backgroundColor: Colors.primaryLight }]}>
                    <Ionicons name={item.icon} size={20} color={Colors.primary} />
                  </View>
                  <Text style={[styles.shortcutLabel, { color: subColor }]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Recent trips */}
        {recentTrips.length > 0 && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Recent Trips
            </Text>
            {recentTrips.map((trip, idx) => (
              <View key={trip.id}>
                <View style={styles.tripRow}>
                  <View
                    style={[
                      styles.tripIcon,
                      {
                        backgroundColor:
                          trip.status === "completed"
                            ? Colors.primaryLight
                            : Colors.goldLight,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        trip.status === "completed"
                          ? "checkmark-circle-outline"
                          : "navigate-outline"
                      }
                      size={18}
                      color={
                        trip.status === "completed" ? Colors.primary : Colors.gold
                      }
                    />
                  </View>
                  <View style={styles.tripInfo}>
                    <Text style={[styles.tripRoute, { color: textColor }]} numberOfLines={1}>
                      {trip.origin} → {trip.destination}
                    </Text>
                    <Text style={[styles.tripDate, { color: subColor }]}>
                      {formatDate(trip.created_at)} · {trip.trip_code}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.tripStatus,
                      {
                        backgroundColor:
                          trip.status === "completed" ? "#F0FDF4" : Colors.goldLight,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tripStatusText,
                        {
                          color:
                            trip.status === "completed" ? "#16A34A" : "#92400E",
                        },
                      ]}
                    >
                      {trip.status === "completed" ? "Done" : "Active"}
                    </Text>
                  </View>
                </View>
                {idx < recentTrips.length - 1 && (
                  <View style={[styles.divider, { backgroundColor: borderColor }]} />
                )}
              </View>
            ))}
          </View>
        )}

        {/* Empty state */}
        {recentTrips.length === 0 && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor, alignItems: "center", paddingVertical: 32 }]}>
            <Ionicons name="car-outline" size={40} color={subColor} />
            <Text style={[styles.emptyText, { color: subColor }]}>
              No trips yet
            </Text>
            <Text style={[styles.emptySub, { color: subColor }]}>
              {user?.role === "driver"
                ? "Tap 'Start Trip' to create your first trip"
                : "Tap 'Find Trip' to join a trip"}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: Colors.primary
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1 },
  greetText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
  },
  nameText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: "#fff",
    lineHeight: 26,
  },
  searchWrap: { zIndex: 100 },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  card: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  balanceLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  balanceValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
    letterSpacing: -0.5,
  },
  balanceEquiv: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  coinIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.goldLight,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionBtn: {
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  quickActionGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
  },
  quickActionText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: "#fff",
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    marginBottom: 14,
  },
  shortcutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  shortcut: {
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  shortcutIcon: {
    width: 50,
    height: 50,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    textAlign: "center",
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  tripIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tripInfo: { flex: 1 },
  tripRoute: { fontFamily: "Poppins_500Medium", fontSize: 13 },
  tripDate: { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 2 },
  tripStatus: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  tripStatusText: { fontFamily: "Poppins_500Medium", fontSize: 11 },
  divider: { height: 1, marginHorizontal: -18 },
  emptyText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    marginTop: 10,
  },
  emptySub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 20,
  },
});