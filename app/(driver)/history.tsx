import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { TripsStorage } from "@/src/services/storage";
import { formatDate, formatCoins } from "@/src/utils/helpers";
import type { Trip } from "@/src/models/types";
import { useTranslation } from "react-i18next";

function TripCard({ trip }: { trip: Trip }) {
  return (
    <View style={styles.tripCard}>
      <View style={styles.tripCardHeader}>
        <View style={styles.tripCodeBadge}>
          <Text style={styles.tripCodeText}>{trip.trip_code}</Text>
        </View>
        <View style={[styles.statusBadge, trip.status === "completed" && styles.statusBadgeDone]}>
          <Text style={[styles.statusText, trip.status === "completed" && styles.statusTextDone]}>
            {trip.status === "completed" ? "Completed" : "Active"}
          </Text>
        </View>
      </View>

      <View style={styles.routeRow}>
        <View style={styles.routePoint}>
          <View style={styles.routeDotGreen} />
          <Text style={styles.routeText} numberOfLines={1}>{trip.origin}</Text>
        </View>
        <Ionicons name="arrow-down" size={14} color={Colors.textTertiary} style={styles.routeArrow} />
        <View style={styles.routePoint}>
          <View style={styles.routeDotRed} />
          <Text style={styles.routeText} numberOfLines={1}>{trip.destination}</Text>
        </View>
      </View>

      <View style={styles.tripCardFooter}>
        <View style={styles.footerItem}>
          <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.footerText}>{formatDate(trip.created_at)}</Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons name="people-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.footerText}>{trip.capacity} seats</Text>
        </View>
      </View>
    </View>
  );
}

export default function DriverHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    const data = await TripsStorage.getByDriverId(user.id);
    setTrips(data.reverse());
  };

  useEffect(() => { load(); }, [user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Text style={styles.headerTitle}>{t("history.title")}</Text>
        <Text style={styles.headerCount}>{trips.length} trips</Text>
      </View>

      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TripCard trip={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={trips.length > 0}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyTitle}>{t("history.noHistory")}</Text>
            <Text style={styles.emptySubtitle}>Your completed trips will show up here</Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 100 + (Platform.OS === "web" ? 34 : 0) }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
    color: Colors.text,
  },
  headerCount: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  listContent: { padding: 20, gap: 12 },
  tripCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },
  tripCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tripCodeBadge: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tripCodeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: Colors.text,
    letterSpacing: 2,
  },
  statusBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeDone: { backgroundColor: "#F0FDF4" },
  statusText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.primary,
  },
  statusTextDone: { color: "#16A34A" },
  routeRow: { gap: 6 },
  routePoint: { flexDirection: "row", alignItems: "center", gap: 10 },
  routeArrow: { marginLeft: 5 },
  routeDotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  routeDotRed: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error,
  },
  routeText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  tripCardFooter: {
    flexDirection: "row",
    gap: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 80,
    gap: 12,
    paddingHorizontal: 40,
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
});
