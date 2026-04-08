import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  Image,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { TripsStorage, PassengersStorage } from "@/src/services/storage";
import { formatDate } from "@/src/utils/helpers";
import { Colors } from "@/constants/colors";
import SearchBar from "@/components/SearchBar";
import Avatar from "@/components/Avatar";
import type { Trip } from "@/src/models/types";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Car02Icon, Menu02Icon } from "@hugeicons/core-free-icons";

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
  const { user, updateUser } = useAuthStore();
  const { theme } = useSettingsStore();
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const isDark = theme === "dark";
  const bg = isDark ? "#000" : Colors.surfaceSecondary;
  const cardBg = isDark ? "#161B22" : "#FFFFFF";
  const textColor = isDark ? Colors.textInverse : Colors.text;
  const subColor = isDark ? "#9CA3AF" : "#000";
  const borderColor = isDark ? "rgba(255,255,255,0.06)" : "#E8ECF0";

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const coins = user?.points_balance || 0;

  const loadTrips = useCallback(async () => {
    if (!user?.id) return;
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
  }, [user?.id, user?.role]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTrips();
    setRefreshing(false);
  }, [loadTrips]);

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

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerImage, { paddingTop: topPadding + 2 }]}>

          {/* Logo Image – now pressable to refresh */}
          <Pressable onPress={onOpenSidebar} style={styles.menuBtn}>
            <HugeiconsIcon icon={Menu02Icon} size={22} color={"#fff"} />
          </Pressable>
          <Pressable onPress={onRefresh} style={styles.logoBtn}>
            <Image
              source={require("@/assets/images/Black_logo_with_black_background_linkedIn00000024.png")}
              style={styles.photoImg} 
              resizeMode="contain"
            />
          </Pressable>

          <Pressable
            onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(main)/profile")
              }}>
              <Avatar
                name={user?.full_name || "U"}
                photoUri={user?.profile_photo}
                size={38}
              />
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <SearchBar isDark={false} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* Balance card (commented out in original, but we keep it optionally) */}
        {/* ... */}

        {/* Role-specific shortcuts */}
        {user?.role === "driver" && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Driver Actions
            </Text>
            <View style={styles.shortcutRow}>
              {[
                { icon: "add-circle-outline", label: "New Trip", route: "/(driver)/create-trip" },
                { icon: "time-outline", label: "History", route: "/(driver)/history" },
                { icon: "megaphone-outline", label: "Messages", route: "/(driver)/messages" },
                { icon: "person-outline", label: "Profile", route: "/(auth)/driver-profile" },
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
                    <HugeiconsIcon icon={item.icon as any} size={20} color={Colors.primary} />
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
                { icon: "search-outline", label: "Find Trip", route: "/(passenger)/find-trip" },
                { icon: "time-outline", label: "History", route: "/(passenger)/history" },
                { icon: "send-outline", label: "Pay Fare", route: "/(auth)/pay-fare" },
                { icon: "shield-checkmark-outline", label: "Safety", onPress: () => Alert.alert("Safety", "SOS is available during a live trip.") },
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
                    <HugeiconsIcon icon={item.icon as any} size={20} color={Colors.primary} />
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
                    <HugeiconsIcon
                      icon={trip.status === "completed" ? "checkmark-circle-outline" : "navigate-outline"}
                      size={18}
                      color={trip.status === "completed" ? Colors.primary : Colors.gold}
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
            <HugeiconsIcon icon={Car02Icon} size={40} color={subColor} />
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
    gap: 19,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'column',
  },
  headerImage: {
    alignItems: "center",
    justifyContent: 'space-between',
    flexDirection: 'row',
  },
  photoImg: {
    width: 50,
    height: 50,
    alignSelf: 'center',
  },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  logoBtn: {
    width: 40,
    height: 40,
    marginVertical:30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchWrap: { zIndex: 100 },
  scrollContent: { paddingHorizontal: 34, paddingTop: 24, gap: 14 },
  card: {
    borderRadius: 30,
    paddingHorizontal: 48,
    paddingTop: 48,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, marginBottom: 14 },
  shortcutRow: { flexDirection: "row", justifyContent: "space-between" },
  shortcut: { alignItems: "center", gap: 6, flex: 1 },
  shortcutIcon: { width: 50, height: 50, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  shortcutLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, textAlign: "center" },
  tripRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  tripIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tripInfo: { flex: 1 },
  tripRoute: { fontFamily: "Poppins_500Medium", fontSize: 13 },
  tripDate: { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 2 },
  tripStatus: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  tripStatusText: { fontFamily: "Poppins_500Medium", fontSize: 11 },
  divider: { height: 1, marginHorizontal: -18 },
  emptyText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, marginTop: 10 },
  emptySub: { fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", marginTop: 4, lineHeight: 20 },
});