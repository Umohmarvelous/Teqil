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
import { Car02Icon, CheckmarkCircle01Icon, ChevronRight, History, Message01Icon, Message02Icon, Navigation01Icon,  Plus,  QrCodeIcon,  Search,  Share01Icon,  ShieldCheck, Wallet01Icon, Warning } from "@hugeicons/core-free-icons";
import { StatusBar } from "expo-status-bar";
import QuickTransferModal from "@/components/QuickTransferModal";
import ActionTile from "@/components/ActionTile";
import QRScannerModal from "@/components/QRScannerModal";
import QuickReceiveModal from "@/components/quickrecieveModal";
import { useMessagesStore } from "@/src/store/useMessagesStore";




export default function HomeTab() {
  const { theme } = useSettingsStore();
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuthStore();

  const { conversations } = useMessagesStore();
  const userUnreadCount = conversations
    .filter(c => {
      if (user?.role === "driver") {
        return c.participant_id === user.id || c.participant_driver_id === user.driver_id;
      } else if (user?.role === "passenger") {
        return c.participant_role === "driver" || c.participant_id === user.id;
      }
      return false;
    })
    .reduce((sum, c) => sum + c.unread_count, 0);

  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : Colors.border;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  const [quickTransferVisible, setQuickTransferVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [receiveVisible, setReceiveVisible] = useState(false);
  // const [createTrip, setCreateTrip]= useState(false)


  const handleQRScan = useCallback((data: string) => {
    // QR codes from drivers contain their driver ID or trip code
    // Format expected: "TEQIL:DRV-XXXXXX" or "TEQIL:TRIPCODE"
    const parsed = data.replace("TEQIL:", "").trim();
    // setDriverRef(parsed);
    Alert.alert("QR Scanned Successfully ", ` ${parsed}`);
  }, []);




  // Define actions
  const MINIACTIONS = [
    { id: "pay", icon: Wallet01Icon , label: "Pay", color: textColor },
    { id: "qr", icon: QrCodeIcon , label: "Scan QR",      color: textColor },
    { id: "share", icon: Share01Icon , label: "Share Trip",  color: textColor },
  ] ;
  const PASSENGERSACTIONSBUTTON = [
    { id: "find", icon: Search , label: "Find Trip",   color: textColor },
    { id: "history", icon: History, label: "History", color: textColor },
    { id: "sos", icon: Warning, label: "Emergency", color: textColor },
    
  ] ;
  const DRIVERSACTIONSBUTTON = [
    { id: "add", icon: Plus, label: "New Trip", color: textColor},
    { id: "megaphone", icon: Message01Icon, label: "Messages", color: textColor},
    { id: "time", icon: History, label: "History", color: textColor},
    { id: "scan", icon: QrCodeIcon, label: "Scan Code", color: textColor},
  ] ;


  const handleAction = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    switch (id) {
      case "pay":
        setQuickTransferVisible(true)
        break;
      case "find":
        router.push("/(passenger)/find-trip");
        break;
      case "qr":
        setScannerVisible(true)
        break;
      case "history":
        router.push("/(passenger)/history");
        break;
      case "share":
        Alert.alert("Share Trip", "Share your live trip link with family or friends from the live trip screen.");
        break;
      case "sos":
        Alert.alert("Emergency SOS", "SOS is available during a live trip. Start or join a trip to activate it.");
        break;

      // Driver's Actions
      case "add":
        // handleQuickAction()
        // createTrip()
        router.push("/(driver)/create-trip");
        break;
      case "megaphone":
        router.push ("/(driver)/messages");
        break;
        case "time":
        router.push ("/(driver)/history");
        break;
        case "scan":
        setReceiveVisible(true);
          // router.push ("/(auth)/driver-profile");
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
    // setCreateTrip(true)
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
      // router.push("/(driver)/create-trip");
    } 
    // else if (role === "passenger") {
    //   router.push("/(passenger)/find-trip");
    // } else if (role === "park_owner") {
    //   Alert.alert("Broadcast", "Go to the Park Owner dashboard to send broadcasts.");
    // }
  };

  // const quickActionLabel =
  //   user?.role === "driver"
  //     ? "Start Trip"
  //     : user?.role === "passenger"
  //     ? "Find Trip"
  //       : "Broadcast";

  
  return (
    <View style={[styles.root, styles.header, { backgroundColor: bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'}  />

      {/* Header */}
    
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
        <View style={ [styles.card, styles.shortcutRow, { backgroundColor: cardBg, borderColor }]}>
        <Text style={[styles.sectionTitle, { color: textColor }]}>{!user ? 'Quick Transfer' : 'Quick Actions'}
        </Text>
          {!(user?.role === "driver" && "passenger")  && (
            <>
              {/* <Text>Not a User!</Text> */}
              <View style={ styles.shortcut}>
                {MINIACTIONS.map((action) => (
                  <View key={action.id}>
                    <ActionTile
                        icon={action.icon as any}
                        label={action.label}
                        color={action.color}
                        onPress={() => handleAction(action.id)}
                        />
                  </View>
                ))}
              </View>
            </>
          )}

          {user?.role === "passenger" && (
            <View style={[styles.shortcut]}>
              {/* <Text>is passenger</Text> */}
              {PASSENGERSACTIONSBUTTON.map((action) => (
                <View key={action.id}>
                  <ActionTile
                    icon={action.icon as any}
                    label={action.label}
                    color={action.color}
                    onPress={() => handleAction(action.id)}
                  />
                </View>
              ))}
            </View>
          )}
          {user?.role === "driver" && (
            <>
              {/* <Text>is Driver</Text> */}
              <View style={styles.shortcut}>
                {DRIVERSACTIONSBUTTON.map((action) => (
                  <View key={action.id} >
                    <ActionTile
                      icon={action.icon as any}
                      label={action.label}
                      color={action.color}
                      onPress={() => handleAction(action.id)}
                    />
                  </View>
                ))}
              </View>
            </>
          )}
          
        </View>


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

        {/* {user?.role === "passenger" && (
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
                { icon: "search", label: "Find Trip", route: "/(passenger)/find-trip" },
                { icon: "time", label: "History", route: "/(passenger)/history" },
                { icon: "send", label: "Pay Fare", route: "/(auth)/pay-fare" },
                { icon: "shield-checkmark", label: "Safety", onPress: () => Alert.alert("Safety", "SOS is available during a live trip.") },
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
        )} */}
        {/* </View> */}


        {userUnreadCount > 0 && (
          <Pressable
            style={[styles.card, { backgroundColor: cardBg, borderColor }]}
            onPress={() => {
              // Navigate to messages tab
              // You may need to pass a setActiveTab function from parent or use navigation
              // Since HomeTab doesn't have direct tab navigation, you can emit an event or use a context.
              // For simplicity, we'll use a prop from parent (you'll need to pass setActiveTab down).
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ backgroundColor: Colors.primaryLight, padding: 12, borderRadius: 20 }}>
                <HugeiconsIcon icon={Message02Icon} size={24} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: textColor }]}>New Messages</Text>
                <Text style={{ color: subTextColor }}>You have {userUnreadCount} unread message{userUnreadCount > 1 ? 's' : ''}</Text>
              </View>
              <HugeiconsIcon icon={ChevronRight} size={20} color={subTextColor} />
            </View>
          </Pressable>
        )}


        {/* Recent trips */}
        {recentTrips.length > 0 && (
          <View style={[styles.card, {paddingHorizontal: 20}, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Recent Trips
            </Text>
            
            {recentTrips.map((trip, idx) => (
              <View key={trip.id}>
                <View style={styles.tripRow}>
                  <View
                    style={[
                      styles.tripIcon]}
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


        
        <View style={[styles.promoBanner]}>
          <View
            style={[styles.promoGradient, styles.card, {backgroundColor: cardBg, borderColor}]}  >
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

      <QRScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScan={handleQRScan}
      />

      {/* Quick Receive modal */}
      <QuickReceiveModal
        visible={receiveVisible}
        onClose={() => setReceiveVisible(false)}
        driverId={user?.driver_id}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    gap: 10,
    paddingHorizontal: 0,
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
  searchWrap: { zIndex: 100, flexDirection:'row', 

  },
  scrollContent: { 
    paddingHorizontal: 15,
    paddingTop: 15, 
    gap: 15, 
  },

  card: {
    justifyContent: 'space-between', 
    borderRadius: 30,
    // paddingHorizontal: 18,
    paddingVertical: 18,
    paddingBottom: 18,
    // borderWidth: 1,
    gap: 20,
  },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, marginTop: 10, marginBottom: 0 },
  shortcutRow: { flexDirection: "column", justifyContent: "space-between", flex: 1, padding: 30 },
  shortcut: { alignItems: "center", gap: 20, flex: 1, flexDirection: "row", justifyContent:'space-between', flexWrap:'wrap'  },
  shortcutIcon: { width: 60, height: 60, borderRadius: 15, gap: 5, alignItems: "center", justifyContent: "center" },
  shortcutLabel: { fontFamily: "Poppins_500Medium", fontSize: 10, textAlign: "center", color: "#000", },
  tripRow: { flexDirection: "row", alignItems: "center", gap: 12,  },
  tripIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tripInfo: { flex: 1 },
  tripRoute: { fontFamily: "Poppins_500Medium", fontSize: 13 },
  tripDate: { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 2 },
  tripStatus: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  tripStatusText: { fontFamily: "Poppins_500Medium", fontSize: 11 },
  divider: { height: 1, marginHorizontal: -18 },
  emptyText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, marginTop: 10 },
  emptySub: { fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", marginTop: 4, lineHeight: 20 },
  promoBanner: {
    borderRadius: 30,
    overflow: "hidden", 
  },
  promoGradient: {
    flexDirection: "row",
    alignItems: "center",    paddingHorizontal: 20

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