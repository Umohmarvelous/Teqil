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
import { useAuthStore } from "@/src/store/useStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { TripsStorage, PassengersStorage } from "@/src/services/storage";
import { formatDate } from "@/src/utils/helpers";
import { Colors } from "@/constants/colors";
import SearchBar from "@/components/SearchBar";
import Avatar from "@/components/Avatar";
import type { Trip } from "@/src/models/types";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Car02Icon, CheckmarkCircle01Icon, Menu02Icon, Navigation01Icon,  ShieldCheck } from "@hugeicons/core-free-icons";
import { StatusBar } from "expo-status-bar";
import QuickTransferModal from "@/components/QuickTransferModal";
import ActionTile from "@/components/ActionTile";
import { Ionicons } from "@expo/vector-icons";



interface HomeTabProps {
  onOpenSidebar: () => void;
}

// const GREETINGS = ["Good morning", "Good afternoon", "Good evening"];
// function getGreeting() {
//   const h = new Date().getHours();
//   if (h < 12) return GREETINGS[0];
//   if (h < 18) return GREETINGS[1];
//   return GREETINGS[2];
// }

export default function HomeTab({ onOpenSidebar }: HomeTabProps) {
  const insets = useSafeAreaInsets();
  // const { user } = useAuthStore();
  const { theme } = useSettingsStore();
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { isAuthenticated, user } = useAuthStore();


  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : Colors.border;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  const [quickTransferVisible, setQuickTransferVisible] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  // const coins = user?.points_balance || 0;

  // Define actions
  const ACTIONS = [
  
    { id: "pay", icon: "swap-horizontal-outline" as const, label: "Pay", color: textColor },
    { id: "find", icon: "search-outline" as const, label: "Find Trip",   color: textColor },
    { id: "qr", icon: "qr-code-outline" as const, label: "Scan QR",      color: textColor },
    { id: "share", icon: "share-social-outline" as const, label: "Share Trip",  color: textColor },
    { id: "sos", icon: "warning-outline" as const, label: "Emergency",   color: textColor   },
  ];

  const handleAction = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    switch (id) {
      case "pay":
        setQuickTransferVisible(true)
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
      <StatusBar style={isDark ? 'light' : 'dark'}  />

      {/* Header */}
      <View style={[styles.header,  { backgroundColor: cardBg }]}>
        <View style={[styles.headerImage, { paddingTop: topPadding + 2 }]}>

          {/* Logo Image – now pressable to refresh */}
          <Pressable onPress={onOpenSidebar} style={styles.menuBtn}>
            <HugeiconsIcon icon={Menu02Icon} size={22} color={ textColor } />
          </Pressable>
          <Pressable onPress={onRefresh} style={styles.logoBtn}>
            <Image
              source={isDark ? require("@/assets/images/Logo_with_transparent_background.png") : require("@/assets/images/Black_logo_with_white_background.png")}
              style={styles.photoImg} 
              resizeMode="cover"
              width={130}
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
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 12}]}
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



        {/* Role-specific shortcuts */}
        <Text style={[styles.sectionTitle, { color: textColor }]}>{isAuthenticated ? 'Quick Actions' : 'Quick Actions'}
        </Text>


          {isAuthenticated || user?.role === "driver" ?  (
          <>
            {/* <Text>Hey...</Text> */}
          </>
        ) : (
            <View style={[styles.card, styles.iconsContainer, { backgroundColor: cardBg, borderColor }]} >
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
        )}


        {user?.role === "driver" && (
          <>
              <View style={[styles.card, { backgroundColor: cardBg, borderColor }]} >
              {/* <View style={[styles.iconsContainer]}>
                {ACTIONS.map((action) => (
                  <ActionTile
                    key={action.id}
                    icon={action.icon}
                    label={action.label}
                    color={action.color}
                    onPress={() => handleAction(action.id)}
                  />
                ))}
              </View> */}
              <View style={styles.shortcutRow}>
                {[
                  { icon: "add-circle-outline", label: "New Trip", onPress: () => handleQuickAction() },
                  { icon: "megaphone-outline", label: "Messages", route: "/(driver)/messages" },
                  { icon: "time-outline", label: "History", route: "/(driver)/history", },
                  { icon: "person-outline", label: "Profile", onPress: () => handleQuickAction() },
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
                    <View style={[styles.shortcutIcon,]}>
                      <Ionicons name={item.icon as any} size={30} color={ textColor }/>
                    </View>
                    <Text style={[styles.shortcutLabel, { color: textColor }]}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}


        {/* <View >
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
        </View> */}
        

        {user?.role === "passenger" && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]} >
            
            <View style={[styles.iconsContainer]}>
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
                  <View style={[styles.shortcutIcon,]}>
                    <HugeiconsIcon icon={item.icon as any} size={20} color={textColor} />
                  </View>
                  <Text style={[styles.shortcutLabel, { color: textColor }]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {/* </View> */}



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
                      icon={trip.status === "completed" ? CheckmarkCircle01Icon : Navigation01Icon}
                      size={18}
                      color={trip.status === "completed" ? Colors.primary : Colors.gold}
                    />
                  </View>
                  <View style={styles.tripInfo}>
                    <Text style={[styles.tripRoute, { color: textColor }]} numberOfLines={1}>
                      {trip.origin} → {trip.destination}
                    </Text>
                    <Text style={[styles.tripDate, { color: subTextColor }]}>
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

        {
        /* Empty state */}
        {recentTrips.length === 0 && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor, alignItems: "center", paddingVertical: 32 }]}>
            <HugeiconsIcon icon={Car02Icon} size={40} color={Colors.primary} />
            <Text style={[styles.emptyText, { color: textColor }]}>
              No trips yet
            </Text>
            <Text style={[styles.emptySub, { color: textColor }]}>
              {user?.role === "driver"
                ? "Tap 'Start Trip' to create your first trip"
                : "Tap 'Find Trip' to join a trip"}
            </Text>
          </View>
        )}


        
        <View style={styles.promoBanner}>
          <View
            style={[styles.promoGradient, {backgroundColor: cardBg}]}  >
            <HugeiconsIcon icon={ShieldCheck} size={36} color={Colors.primary} />
            <View style={styles.promoText}>
              <Text style={[styles.promoTitle, {color: textColor}]}>Travel Safe, Always</Text>
              <Text style={[styles.promoSub, {color: textColor}]}>
                Add emergency contacts before joining a trip
              </Text>
            </View>
          </View>
        </View>
          
      </ScrollView>

      <QuickTransferModal
        visible={quickTransferVisible}
        onClose={() => setQuickTransferVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    gap: 10,
    paddingHorizontal: 27,
    paddingBottom: 10,
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
    marginVertical:15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchWrap: { zIndex: 100, flexDirection:'row', },
  scrollContent: { paddingHorizontal: 20, paddingTop: 15, gap: 15 },
  iconsContainer: {
    flexDirection: 'row', 
    alignContent: 'center', 
    justifyContent: 'space-between', 
    gap: 12, 
    flex:1,
    flexWrap: 'wrap',
  },

  card: {
    justifyContent: 'space-between', 
    borderRadius: 30,
    paddingHorizontal: 18,
    paddingVertical: 18,
    paddingBottom: 18,
    borderWidth: 1,
    gap: 20,
    borderColor: Colors.gold,
  },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, marginBottom: 5 },
  shortcutRow: { flexDirection: "row", justifyContent: "space-between" },
  shortcut: { alignItems: "center", gap: 1, flex: 1 },
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
  promoBanner: {  borderRadius: 30, overflow: "hidden" },
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