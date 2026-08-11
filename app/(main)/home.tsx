import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/src/store/useStore";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { TripsStorage, PassengersStorage } from "@/src/services/storage";
import { triggerSyncNow } from "@/src/services/sync";
import { formatDate } from "@/src/utils/helpers";
import type { Trip } from "@/src/models/types";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { CheckmarkCircle01Icon, ChevronRight, GiftIcon, History, Message01Icon, Message02Icon, Navigation01Icon,  Plus,  QrCodeIcon,  Share01Icon, Trophy, Warning,
 } from "@hugeicons/core-free-icons";
import { StatusBar } from "expo-status-bar";
import QuickTransferModal from "@/components/QuickTransferModal";
import ActionTile from "@/components/ActionTile";
import QRScannerModal from "@/components/QRScannerModal";
import QuickReceiveModal from "@/components/quickrecieveModal";
import { useMessagesStore } from "@/src/store/useMessagesStore";
import LocationPromptModal from "@/components/LocationPromptModal";
import ActiveTripBanner from "@/components/ActiveTripBanner";
import TripListener from "@/components/TripListener";
import { useProgramStore } from "@/src/store/useProgramStore";
import { parseDriverQR, toDriverPayload } from "@/src/utils/qr";
import { iosAlert } from "@/components/ios";


export interface HomeTabProps {
  /**
   * Height of the floating header and tab bar.
   *
   * These are CONTENT insets, not frame padding. The scroll view fills the
   * screen so content travels under the translucent chrome — which is the whole
   * point of the chrome being translucent. Padding the frame instead leaves the
   * glass with nothing behind it to sample, and it renders as a flat panel.
   */
  insetTop?: number;
  insetBottom?: number;
}

export default function HomeTab({ insetTop = 0, insetBottom = 0 }: HomeTabProps) {
  const { theme } = useSettingsStore();
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuthStore();

  const { programStatus, hydrateFromUser } = useProgramStore();
  const enrolled = programStatus === "eligible" || programStatus === "enrolled";
  useEffect(() => {
    hydrateFromUser(user);
  }, [user, hydrateFromUser]);



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
  // const bg = isDark ? Colors.background : Colors.border;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;

  const cardBg = isDark ? "rgba(255,255,255,0.08)" : "#FFFFFF";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  const tabBarBg = isDark ? Colors.background : Colors.textWhite;

  const [quickTransferVisible, setQuickTransferVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [receiveVisible, setReceiveVisible] = useState(false);


  const handleQRScan = useCallback((data: string) => {
    const parsed = parseDriverQR(data);
    if (!parsed) {
      iosAlert("Unknown QR Code", "This QR code isn't a valid Emilgo driver code.");
      return;
    }
    setScannerVisible(false);
    router.push({
      pathname: "/(passenger)/payment",
      params: {
        driver_id: parsed.driver_id,
        subaccount_code: parsed.subaccount_code ?? "",
        driver_payload: toDriverPayload(parsed),
      },
    });
  }, []);


  // Define actions
  const PASSENGERSACTIONSBUTTON = [
    { id: "qr", icon: QrCodeIcon, label: "Scan code", color: Colors.textWhite },
    { id: "share", icon: Share01Icon, label: "Share Trip", color: Colors.textWhite },
    
    { id: "history", icon: History, label: "History", color: Colors.textWhite },
    { id: "sos", icon: Warning, label: "Emergency Contact", color: Colors.textWhite },
  ] ;
  const DRIVERSACTIONSBUTTON = [
    { id: "add", icon: Plus, label: "New Trip", color: Colors.textWhite},
    { id: "scan", icon: QrCodeIcon, label: "Get Code", color: Colors.textWhite},
    { id: "megaphone", icon: Message01Icon, label: "Messages", color: Colors.textWhite},
    { id: "time", icon: History, label: "History", color: Colors.textWhite},
  ] ;


  const handleAction = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    switch (id) {
      case "qr":
        setScannerVisible(true)
        break;
      case "share":
        iosAlert("Share Trip", "Share your live trip link with family or friends from the live trip screen.");
        break;
      case "history":
        router.push("/(passenger)/history");
        break;
      case "sos":
        iosAlert("Emergency SOS", "SOS is available during a live trip. Start or join a trip to activate it.");
        break;

      // Driver's Actions
      case "add":
        router.push("/(driver)/create-trip");
        break;
        case "scan":
          router.push ("/(driver)/qr-receive");
          break;
      case "megaphone":
        router.push ("/(driver)/messages");
        break;
      case "time":
        router.push ("/(driver)/history");
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
    // Pull-to-refresh reloads this screen AND runs a full cloud sync.
    await Promise.all([loadTrips(), triggerSyncNow()]);
    setRefreshing(false);
  }, [loadTrips]);

  return (
    <View style={[styles.root, { backgroundColor: tabBarBg } ]}>
      <StatusBar style={isDark ? 'light' : 'dark'}  />


      {/* Header */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insetTop + 25, paddingBottom: insetBottom + 12 },
        ]}
        showsVerticalScrollIndicator={false}
        scrollIndicatorInsets={{ top: insetTop, bottom: insetBottom }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            // Keeps the spinner clear of the floating header.
            progressViewOffset={insetTop}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        <TripListener />
        <ActiveTripBanner />

        {/* Role-specific shortcuts */}
        <View style={[styles.shortcutRow, isDark ? { backgroundColor: 'transparent', borderColor} : {
          backgroundColor: 'transparent' } ]}>
        <Text style={[styles.sectionTitle, { color: textColor }]}>{!user ? 'Quick Transfer' : 'Quick Actions'}</Text>

          {(!user || user?.role === "passenger") && (
            <View style={[styles.shortcut]}>
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
              <View style={styles.shortcut}>
                {DRIVERSACTIONSBUTTON.map((action) => (
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
        </View>


        {/* Loyalty Program entry */}
        <Pressable
          style={[styles.card, styles.promoGradient, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
            router.push("/program");
          }}
        >
          <View style={styles.loyaltyIconChip}>
            <HugeiconsIcon icon={enrolled ? Trophy : GiftIcon} size={40} color={Colors.textSecondary} />
          </View>
          <View style={styles.promoText}>
            <Text style={[styles.promoTitle, { color: textColor }]}>Loyalty Program</Text>
            <Text style={[styles.promoSub, { color: subTextColor }]}>
              {enrolled ? "You're in the program ✓" : "Join the rewards program"}
            </Text>
          </View>
          <HugeiconsIcon icon={ChevronRight} size={20} color={subTextColor} />
        </Pressable>


        {userUnreadCount > 0 && (
          <Pressable
            style={[styles.card, { backgroundColor: cardBg, borderColor }]}
            onPress={() => router.navigate("/messages")}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12,     paddingHorizontal: 18,
 }}>
              <View style={{ padding: 12, borderRadius: 20 }}>
                <HugeiconsIcon icon={Message02Icon} size={24} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: textColor }]}>New Messages</Text>
                <Text style={{ color: 'red' }}>You have {userUnreadCount} unread message{userUnreadCount > 1 ? 's' : ''}</Text>
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
          <View style={[styles.card, { alignItems: "center", paddingVertical: 32 }]}>
            <HugeiconsIcon icon={Warning} size={40} color={Colors.warning} />
            <View style={{alignItems:'center'}}>
              <Text style={[styles.emptyText, { color: Colors.warning }]}>
                No trips yet
              </Text>
              <Text style={[styles.emptySub, { color: textColor }]}>
                {user?.role === "driver"
                  ? "Tap 'Start Trip' to create your first trip"
                  : "Tap 'Find Trip' to join a trip"}
              </Text>
            </View>
          </View>
        )}


        
        {/* <View style={[styles.promoBanner]}>
          <View
            style={[styles.promoGradient, styles.card, 
            {backgroundColor: cardBg, borderColor}
            ]} >
            <HugeiconsIcon icon={ShieldCheck} size={36} color={Colors.textWhite} />
            <View style={styles.promoText}>
              <Text style={[styles.promoTitle, {color: textColor}]}>Travel Safe, Always</Text>
              <Text style={[styles.promoSub, {color: textColor}]}>
                Add emergency contacts before joining a trip
              </Text>
            </View>
          </View>
        </View> */}

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

      <LocationPromptModal />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchWrap: { 
    zIndex: 100,
    flexDirection: 'row', 
  },
  scrollContent: {
    paddingHorizontal: 8,
    gap: 15,
  },
  card: {
    justifyContent: 'space-between', 
    borderRadius: 25,
    paddingVertical: 18,
    gap: 20,
  },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, marginBottom: 0 },
  shortcutRow: {
    justifyContent: 'space-between',
    borderRadius: 30, 
    paddingVertical: 15,
    gap: 20,
    flexDirection: "column",
    flex: 1,
    paddingHorizontal: 14,
  },
  shortcut: { alignItems: "flex-start", gap: 30, flex: 1, flexDirection: "row", justifyContent:'space-between', flexWrap:'wrap',
  },
  shortcutIcon: { width: 60, height: 60, borderRadius: 15, gap: 5, alignItems: "center", justifyContent: "center" },
  shortcutLabel: { fontFamily: "Poppins_500Medium", fontSize: 10, textAlign: "center", color: "#000", },
  tripRow: { flexDirection: "row", alignItems: "center", gap: 12,  },
  tripIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tripInfo: { flex: 1 },
  tripRoute: { fontFamily: "Poppins_500Medium", fontSize: 13 },
  tripDate: { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 2 },
  tripStatus: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  tripStatusText: { fontFamily: "Poppins_500Medium", fontSize: 11 },
  divider: { height: .4, marginHorizontal: -18 },
  emptyText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, marginTop: 10 },
  emptySub: { fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", marginTop: 4, lineHeight: 20 },
  promoBanner: {
    borderRadius: 30,
    overflow: "hidden", 
  },
  promoGradient: {
    flexDirection: "row",
    alignItems: "center",    paddingHorizontal: 20, 

  },
  loyaltyIconChip: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
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