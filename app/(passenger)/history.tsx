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

interface TripCardProps {
  trip: Trip;
}

function TripCard({ trip }: TripCardProps) {
  const isCompleted = trip.status === "completed";

  return (
    <View style={styles.tripCard}>
      {/* Header row: code badge + status badge */}
      <View style={styles.tripCardHeader}>
        <View style={styles.codeBadge}>
          <Ionicons
            name="barcode-outline"
            size={13}
            color={Colors.textSecondary}
            style={{ marginRight: 4 }}
          />
          <Text style={styles.codeText}>{trip.trip_code}</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            isCompleted ? styles.statusDone : styles.statusActive,
          ]}
        >
          <View
            style={[
              styles.statusDot,
              isCompleted ? styles.statusDotDone : styles.statusDotActive,
            ]}
          />
          <Text
            style={[
              styles.statusText,
              isCompleted ? styles.statusTextDone : styles.statusTextActive,
            ]}
          >
            {isCompleted ? "Completed" : "Active"}
          </Text>
        </View>
      </View>

      {/* Route */}
      <View style={styles.routeBlock}>
        <View style={styles.routeItem}>
          <View style={styles.dotGreen} />
          <Text style={styles.routeText} numberOfLines={1}>
            {trip.origin}
          </Text>
        </View>
        <View style={styles.routeSep} />
        <View style={styles.routeItem}>
          <View style={styles.dotRed} />
          <Text style={styles.routeText} numberOfLines={1}>
            {trip.destination}
          </Text>
        </View>
      </View>

      {/* Footer: date + driver name */}
      <View style={styles.footer}>
        <View style={styles.footerItem}>
          <Ionicons
            name="calendar-outline"
            size={13}
            color={Colors.textSecondary}
          />
          <Text style={styles.footerText}>{formatDate(trip.created_at)}</Text>
        </View>

        {trip.driver?.full_name ? (
          <View style={styles.footerItem}>
            <Ionicons
              name="person-outline"
              size={13}
              color={Colors.textSecondary}
            />
            <Text style={styles.footerText} numberOfLines={1}>
              {trip.driver.full_name}
            </Text>
          </View>
        ) : trip.driver_id ? (
          <View style={styles.footerItem}>
            <Ionicons
              name="person-outline"
              size={13}
              color={Colors.textSecondary}
            />
            <Text style={[styles.footerText, { color: Colors.textTertiary }]}>
              Driver on record
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

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

    // Most recent first
    setTrips(userTrips.reverse());
  };

  useEffect(() => {
    load();
  }, [user?.id]);

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
        <Text style={styles.headerCount}>
          {trips.length} {trips.length === 1 ? "trip" : "trips"}
        </Text>
      </View>

      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TripCard trip={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!trips.length}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons
                name="time-outline"
                size={40}
                color={Colors.primary}
              />
            </View>
            <Text style={styles.emptyTitle}>{t("history.noHistory")}</Text>
            <Text style={styles.emptySubtitle}>
              Trips you join will appear here
            </Text>
          </View>
        }
        ListFooterComponent={
          <View
            style={{ height: 100 + (Platform.OS === "web" ? 34 : 0) }}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── Header ──────────────────────────────────────────────
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

  // ── List ────────────────────────────────────────────────
  listContent: {
    padding: 20,
    gap: 12,
  },

  // ── Trip Card ───────────────────────────────────────────
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

  // Code badge
  codeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  codeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: Colors.text,
    letterSpacing: 1.5,
  },

  // Status badge
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusActive: {
    backgroundColor: Colors.primaryLight,
  },
  statusDone: {
    backgroundColor: "#F0FDF4",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotActive: {
    backgroundColor: Colors.primary,
  },
  statusDotDone: {
    backgroundColor: "#16A34A",
  },
  statusText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
  },
  statusTextActive: {
    color: Colors.primary,
  },
  statusTextDone: {
    color: "#16A34A",
  },

  // Route
  routeBlock: {
    gap: 6,
  },
  routeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  routeSep: {
    width: 2,
    height: 12,
    backgroundColor: Colors.border,
    marginLeft: 5,
  },
  dotGreen: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: Colors.primary,
  },
  dotRed: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: Colors.error,
  },
  routeText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    flexWrap: "wrap",
  },
  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
  },
  footerText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },

  // ── Empty State ─────────────────────────────────────────
  emptyState: {
    alignItems: "center",
    paddingTop: 80,
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
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