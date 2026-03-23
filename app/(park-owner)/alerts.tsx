import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  FlatList,
  RefreshControl,
  Pressable,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/src/utils/helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SosAlert {
  id: string;
  type: "sos" | "info";
  message: string;
  driverName: string;
  driverId: string;
  tripCode: string;
  time: string; // ISO string
  verified: boolean;
}

// ---------------------------------------------------------------------------
// Mock data – will be replaced by Supabase Realtime subscription
// ---------------------------------------------------------------------------

const MOCK_ALERTS: SosAlert[] = [
  {
    id: "1",
    type: "sos",
    message: "Driver pressed emergency button. Possible accident on route.",
    driverName: "Chukwuemeka Obi",
    driverId: "DRV-A3X9KL",
    tripCode: "T7NZ2Q",
    time: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    verified: false,
  },
  {
    id: "2",
    type: "sos",
    message: "SOS triggered — vehicle breakdown reported.",
    driverName: "Adaeze Nwosu",
    driverId: "DRV-BQ4PTW",
    tripCode: "M8RYLK",
    time: new Date(Date.now() - 17 * 60 * 1000).toISOString(),
    verified: false,
  },
  {
    id: "3",
    type: "info",
    message: "Driver reported road blocked by flooding.",
    driverName: "Tunde Fashola",
    driverId: "DRV-CJ2VMN",
    tripCode: "H4BQDS",
    time: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    verified: true,
  },
];

// ---------------------------------------------------------------------------
// FloatingNavbar placeholder (matches project pattern)
// ---------------------------------------------------------------------------

function FloatingNavbar() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.floatingNav,
        { bottom: Math.max(insets.bottom, 16) + (Platform.OS === "web" ? 34 : 0) },
      ]}
    >
      <View style={styles.floatingNavPill}>
        <Ionicons name="warning" size={16} color={Colors.error} />
        <Text style={styles.floatingNavText}>Emergency Alerts</Text>
        {/* Badge for unread SOS count — replace with real count later */}
        <View style={styles.floatingNavBadge}>
          <Text style={styles.floatingNavBadgeText}>
            {MOCK_ALERTS.filter((a) => !a.verified && a.type === "sos").length}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// AlertCard
// ---------------------------------------------------------------------------

function AlertCard({
  alert,
  onVerify,
}: {
  alert: SosAlert;
  onVerify: (id: string) => void;
}) {
  const { t } = useTranslation();
  const isSos = alert.type === "sos";

  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isSos && !alert.verified) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.03,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [isSos, alert.verified]);

  return (
    <Animated.View
      style={[
        styles.alertCard,
        isSos && styles.alertCardSos,
        alert.verified && styles.alertCardVerified,
        isSos && !alert.verified && { transform: [{ scale: pulseAnim }] },
      ]}
    >
      {/* Header row: icon + driver name + badge */}
      <View style={styles.alertHeader}>
        <View style={[styles.alertIconBg, isSos ? styles.alertIconBgSos : styles.alertIconBgInfo]}>
          <Ionicons
            name={isSos ? "warning" : "information-circle"}
            size={22}
            color={isSos ? Colors.error : Colors.info}
          />
        </View>

        <View style={styles.alertMeta}>
          <Text style={styles.alertDriverName} numberOfLines={1}>
            {alert.driverName}
          </Text>
          <Text style={styles.alertDriverId}>{alert.driverId}</Text>
        </View>

        {alert.verified ? (
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
            <Text style={styles.verifiedBadgeText}>
              {t("parkOwner.verified")}
            </Text>
          </View>
        ) : (
          <View style={[styles.statusBadge, isSos ? styles.sosBadge : styles.infoBadge]}>
            <Text style={[styles.statusBadgeText, isSos ? styles.sosBadgeText : styles.infoBadgeText]}>
              {isSos ? t("parkOwner.sos") : t("parkOwner.info")}
            </Text>
          </View>
        )}
      </View>

      {/* Trip code row */}
      <View style={styles.tripCodeRow}>
        <Ionicons name="car-outline" size={14} color={Colors.textSecondary} />
        <Text style={styles.tripCodeLabel}>{t("parkOwner.tripCode")}: </Text>
        <Text style={styles.tripCodeValue}>{alert.tripCode}</Text>
      </View>

      {/* Message */}
      <Text style={styles.alertMessage}>{alert.message}</Text>

      {/* Footer: time + verify button */}
      <View style={styles.alertFooter}>
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={13} color={Colors.textTertiary} />
          <Text style={styles.alertTime}>{formatDateTime(alert.time)}</Text>
        </View>

        {!alert.verified && (
          <Pressable
            style={({ pressed }) => [
              styles.verifyBtn,
              pressed && styles.verifyBtnPressed,
            ]}
            onPress={() => onVerify(alert.id)}
          >
            <Ionicons name="shield-checkmark-outline" size={14} color={Colors.primary} />
            <Text style={styles.verifyBtnText}>{t("parkOwner.verifyDriver")}</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<SosAlert[]>(MOCK_ALERTS);
  const [refreshing, setRefreshing] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  // Simulate a refresh – replace with real Supabase fetch later
  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setRefreshing(false);
  };

  // Verify handler – console.log for now; hook up to Supabase later
  const handleVerify = (id: string) => {
    console.log("[AlertsScreen] Verify driver for alert id:", id);
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, verified: true } : a))
    );
  };

  const unverifiedSosCount = alerts.filter(
    (a) => a.type === "sos" && !a.verified
  ).length;

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <View>
          <Text style={styles.headerTitle}>{t("parkOwner.emergencyAlerts")}</Text>
          <Text style={styles.headerSubtitle}>
            {unverifiedSosCount > 0
              ? `${unverifiedSosCount} unverified SOS alert${unverifiedSosCount > 1 ? "s" : ""}`
              : t("parkOwner.noAlerts")}
          </Text>
        </View>

        {/* Realtime placeholder chip */}
        <View style={styles.realtimeChip}>
          <View style={styles.realtimeDot} />
          <Text style={styles.realtimeText}>Live</Text>
        </View>
      </View>

      {/* ── Supabase Realtime placeholder banner ── */}
      <View style={styles.realtimeBanner}>
        <Ionicons name="information-circle-outline" size={15} color={Colors.info} />
        <Text style={styles.realtimeBannerText}>
          Real-time alerts via Supabase will be connected in the next step.
        </Text>
      </View>

      {/* ── List ── */}
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AlertCard alert={item} onVerify={handleVerify} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!alerts.length}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="shield-checkmark" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>{t("parkOwner.noAlerts")}</Text>
            <Text style={styles.emptySubtitle}>
              Emergency alerts from drivers will appear here in real time.
            </Text>
          </View>
        }
        ListFooterComponent={
          <View style={{ height: 120 + (Platform.OS === "web" ? 34 : 0) }} />
        }
      />

      {/* ── Floating navbar ── */}
      <FloatingNavbar />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    paddingHorizontal: 24,
    paddingBottom: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  headerSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  realtimeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F0FDF4",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  realtimeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  realtimeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: Colors.primary,
  },

  // Realtime banner
  realtimeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  realtimeBannerText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#1E40AF",
    lineHeight: 18,
  },

  // List
  listContent: { padding: 20, paddingTop: 14, gap: 14 },

  // Alert card
  alertCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 18,
    gap: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  alertCardSos: {
    backgroundColor: "#FFF5F5",
    borderColor: "#FECACA",
  },
  alertCardVerified: {
    opacity: 0.75,
  },

  // Card header
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  alertIconBg: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  alertIconBgSos: { backgroundColor: "#FEE2E2" },
  alertIconBgInfo: { backgroundColor: "#EFF6FF" },

  alertMeta: { flex: 1 },
  alertDriverName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  alertDriverId: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
    letterSpacing: 0.8,
    marginTop: 1,
  },

  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sosBadge: { backgroundColor: "#FEE2E2" },
  infoBadge: { backgroundColor: "#EFF6FF" },
  statusBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    letterSpacing: 1,
  },
  sosBadgeText: { color: Colors.error },
  infoBadgeText: { color: Colors.info },

  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  verifiedBadgeText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: "#16A34A",
  },

  // Trip code
  tripCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  tripCodeLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  tripCodeValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: Colors.text,
    letterSpacing: 1.5,
  },

  // Message
  alertMessage: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  // Footer
  alertFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  alertTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
  },
  verifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  verifyBtnPressed: { opacity: 0.75 },
  verifyBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.primary,
  },

  // Empty state
  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    gap: 14,
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    color: Colors.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },

  // Floating navbar
  floatingNav: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    pointerEvents: "none",
  },
  floatingNavPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: Colors.surface,
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingVertical: 11,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  floatingNavText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  floatingNavBadge: {
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  floatingNavBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: Colors.surface,
  },
});