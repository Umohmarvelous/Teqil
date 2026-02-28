import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { PassengersStorage, TripsStorage } from "@/src/services/storage";
import { formatDate } from "@/src/utils/helpers";
import type { Trip } from "@/src/models/types";
import { useTranslation } from "react-i18next";

export default function PassengerHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    const passengers = await PassengersStorage.getByUserId(user.id);
    const allTrips = await TripsStorage.getAll();
    const userTrips = passengers
      .map((p) => allTrips.find((t) => t.id === p.trip_id))
      .filter(Boolean) as Trip[];
    setTrips(userTrips.reverse());
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
        renderItem={({ item }) => (
          <View style={styles.tripCard}>
            <View style={styles.tripCardHeader}>
              <View style={styles.codeBadge}>
                <Text style={styles.codeText}>{item.trip_code}</Text>
              </View>
              <View style={[styles.statusBadge, item.status === "completed" && styles.statusDone]}>
                <Text style={[styles.statusText, item.status === "completed" && styles.statusTextDone]}>
                  {item.status === "completed" ? "Completed" : "Active"}
                </Text>
              </View>
            </View>

            <View style={styles.routeBlock}>
              <View style={styles.routeItem}>
                <View style={styles.dotGreen} />
                <Text style={styles.routeText} numberOfLines={1}>{item.origin}</Text>
              </View>
              <View style={styles.routeSep} />
              <View style={styles.routeItem}>
                <View style={styles.dotRed} />
                <Text style={styles.routeText} numberOfLines={1}>{item.destination}</Text>
              </View>
            </View>

            <View style={styles.footer}>
              <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.footerText}>{formatDate(item.created_at)}</Text>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!trips.length}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyTitle}>{t("history.noHistory")}</Text>
            <Text style={styles.emptySubtitle}>Your past trips will show up here</Text>
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
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  tripCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  codeBadge: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  codeText: {
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
  statusDone: { backgroundColor: "#F0FDF4" },
  statusText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.primary,
  },
  statusTextDone: { color: "#16A34A" },
  routeBlock: { gap: 6 },
  routeItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  routeSep: {
    width: 2,
    height: 12,
    backgroundColor: Colors.border,
    marginLeft: 5,
  },
  dotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  dotRed: {
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
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
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
