import React, { useEffect, useState, useCallback } from "react";
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
import { TripsStorage, PassengersStorage } from "@/src/services/storage";
import { formatDate, formatDuration, formatCoins, formatNaira, coinsToNaira } from "@/src/utils/helpers";
import type { Trip } from "@/src/models/types";
import { useTranslation } from "react-i18next";

type FilterTab = "all" | "active" | "completed";

interface TripWithPassengerCount extends Trip {
  passengerCount: number;
  estimatedCoins: number;
}

function StatSummary({
  totalTrips,
  completedTrips,
  totalCoins,
}: {
  totalTrips: number;
  completedTrips: number;
  totalCoins: number;
}) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryValue}>{totalTrips}</Text>
        <Text style={styles.summaryLabel}>Total Trips</Text>
      </View>
      <View style={[styles.summaryCard, styles.summaryCardMiddle]}>
        <Text style={styles.summaryValue}>{completedTrips}</Text>
        <Text style={styles.summaryLabel}>Completed</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={[styles.summaryValue, { color: Colors.gold }]}>
          {formatNaira(Math.round(coinsToNaira(totalCoins)))}
        </Text>
        <Text style={styles.summaryLabel}>Est. Earned</Text>
      </View>
    </View>
  );
}

function FilterTabs({
  active,
  onChange,
  counts,
}: {
  active: FilterTab;
  onChange: (f: FilterTab) => void;
  counts: Record<FilterTab, number>;
}) {
  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
  ];
  return (
    <View style={styles.filterRow}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          style={[styles.filterTab, active === tab.key && styles.filterTabActive]}
          onPress={() => onChange(tab.key)}
        >
          <Text
            style={[
              styles.filterTabText,
              active === tab.key && styles.filterTabTextActive,
            ]}
          >
            {tab.label}
          </Text>
          {counts[tab.key] > 0 && (
            <View
              style={[
                styles.filterBadge,
                active === tab.key && styles.filterBadgeActive,
              ]}
            >
              <Text
                style={[
                  styles.filterBadgeText,
                  active === tab.key && styles.filterBadgeTextActive,
                ]}
              >
                {counts[tab.key]}
              </Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

function TripCard({ trip }: { trip: TripWithPassengerCount }) {
  const isActive = trip.status === "active";

  const durationSeconds = trip.end_time
    ? (new Date(trip.end_time).getTime() - new Date(trip.start_time).getTime()) / 1000
    : null;

  return (
    <View style={styles.tripCard}>
      {/* Header row */}
      <View style={styles.tripCardHeader}>
        <View style={styles.tripCodeBadge}>
          <Ionicons name="barcode-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.tripCodeText}>{trip.trip_code}</Text>
        </View>
        <View style={[styles.statusBadge, isActive ? styles.statusBadgeLive : styles.statusBadgeDone]}>
          {isActive && <View style={styles.liveDot} />}
          <Text style={[styles.statusText, isActive ? styles.statusTextLive : styles.statusTextDone]}>
            {isActive ? "Live" : "Completed"}
          </Text>
        </View>
      </View>

      {/* Route */}
      <View style={styles.routeRow}>
        <View style={styles.routeIndicator}>
          <View style={styles.routeDotGreen} />
          <View style={styles.routeLineSegment} />
          <View style={styles.routeDotRed} />
        </View>
        <View style={styles.routeLabels}>
          <View style={styles.routeLabelRow}>
            <Text style={styles.routeDirectionLabel}>From</Text>
            <Text style={styles.routeValue} numberOfLines={1}>{trip.origin}</Text>
          </View>
          <View style={[styles.routeLabelRow, { marginTop: 8 }]}>
            <Text style={styles.routeDirectionLabel}>To</Text>
            <Text style={styles.routeValue} numberOfLines={1}>{trip.destination}</Text>
          </View>
        </View>
      </View>

      {/* Footer stats */}
      <View style={styles.tripCardFooter}>
        <View style={styles.footerItem}>
          <Ionicons name="calendar-outline" size={13} color={Colors.textTertiary} />
          <Text style={styles.footerText}>{formatDate(trip.created_at)}</Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons name="people-outline" size={13} color={Colors.textTertiary} />
          <Text style={styles.footerText}>
            {trip.passengerCount}/{trip.capacity}
          </Text>
        </View>
        {durationSeconds !== null && durationSeconds > 0 && (
          <View style={styles.footerItem}>
            <Ionicons name="time-outline" size={13} color={Colors.textTertiary} />
            <Text style={styles.footerText}>{formatDuration(durationSeconds)}</Text>
          </View>
        )}
        {trip.status === "completed" && trip.estimatedCoins > 0 && (
          <View style={[styles.footerItem, styles.footerEarnings]}>
            <Ionicons name="star" size={13} color={Colors.gold} />
            <Text style={styles.footerEarningsText}>
              {formatCoins(trip.estimatedCoins)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function EmptyState({ filter }: { filter: FilterTab }) {
  const messages: Record<FilterTab, { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }> = {
    all: {
      icon: "time-outline",
      title: "No trips yet",
      sub: "Your completed and active trips will appear here",
    },
    active: {
      icon: "navigate-circle-outline",
      title: "No active trips",
      sub: "Start a trip from the dashboard to see it here",
    },
    completed: {
      icon: "checkmark-circle-outline",
      title: "No completed trips",
      sub: "Finished trips will be shown here",
    },
  };
  const msg = messages[filter];
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconBg}>
        <Ionicons name={msg.icon} size={40} color={Colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{msg.title}</Text>
      <Text style={styles.emptySubtitle}>{msg.sub}</Text>
    </View>
  );
}

export default function DriverHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { t } = useTranslation();

  const [allTrips, setAllTrips] = useState<TripWithPassengerCount[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const raw = await TripsStorage.getByDriverId(user.id);
    const sorted = [...raw].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const enriched: TripWithPassengerCount[] = await Promise.all(
      sorted.map(async (trip) => {
        const passengers = await PassengersStorage.getByTripId(trip.id);
        // Estimate coins: 5 base + 1 per passenger + bonus for completion
        const durationSeconds = trip.end_time
          ? (new Date(trip.end_time).getTime() - new Date(trip.start_time).getTime()) / 1000
          : 0;
        const durationMinutes = Math.floor(durationSeconds / 60);
        const estimatedCoins =
          trip.status === "completed"
            ? Math.round(5 + passengers.length * 2 + Math.floor(durationMinutes / 30))
            : 0;
        return { ...trip, passengerCount: passengers.length, estimatedCoins };
      })
    );
    setAllTrips(enriched);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = allTrips.filter((t) => {
    if (filter === "all") return true;
    if (filter === "active") return t.status === "active";
    return t.status === "completed";
  });

  const counts: Record<FilterTab, number> = {
    all: allTrips.length,
    active: allTrips.filter((t) => t.status === "active").length,
    completed: allTrips.filter((t) => t.status === "completed").length,
  };

  const totalCoins = allTrips.reduce((sum, t) => sum + t.estimatedCoins, 0);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Text style={styles.headerTitle}>{t("history.title")}</Text>
        <Text style={styles.headerSubtitle}>
          {allTrips.length} {allTrips.length === 1 ? "trip" : "trips"} total
        </Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TripCard trip={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        ListHeaderComponent={
          <>
            {allTrips.length > 0 && (
              <StatSummary
                totalTrips={allTrips.length}
                completedTrips={counts.completed}
                totalCoins={totalCoins}
              />
            )}
            <FilterTabs active={filter} onChange={setFilter} counts={counts} />
          </>
        }
        ListEmptyComponent={<EmptyState filter={filter} />}
        ListFooterComponent={
          <View style={{ height: 100 + (Platform.OS === "web" ? 34 : 0) }} />
        }
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
  headerSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Summary cards
  summaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryCardMiddle: {
    borderWidth: 1.5,
    borderColor: Colors.primaryLight,
  },
  summaryValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  summaryLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },

  // Filter tabs
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  filterTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterTabText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  filterTabTextActive: {
    color: Colors.surface,
  },
  filterBadge: {
    backgroundColor: Colors.borderLight,
    borderRadius: 10,
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    alignItems: "center",
  },
  filterBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  filterBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  filterBadgeTextActive: {
    color: Colors.surface,
  },

  listContent: { padding: 20, gap: 12 },

  // Trip card
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
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tripCodeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: Colors.text,
    letterSpacing: 1.5,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusBadgeLive: {
    backgroundColor: Colors.primaryLight,
  },
  statusBadgeDone: {
    backgroundColor: "#F0FDF4",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  statusText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  statusTextLive: { color: Colors.primary },
  statusTextDone: { color: "#16A34A" },

  // Route
  routeRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "stretch",
  },
  routeIndicator: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 4,
    gap: 0,
    width: 14,
  },
  routeDotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.primaryLight,
  },
  routeLineSegment: {
    width: 2,
    flex: 1,
    minHeight: 16,
    backgroundColor: Colors.border,
    marginVertical: 3,
  },
  routeDotRed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.error,
    borderWidth: 2,
    borderColor: "#FEE2E2",
  },
  routeLabels: { flex: 1 },
  routeLabelRow: {
    flexDirection: "column",
    gap: 1,
  },
  routeDirectionLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: Colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  routeValue: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.text,
  },

  // Footer
  tripCardFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  footerText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  footerEarnings: {
    marginLeft: "auto" as any,
    backgroundColor: Colors.goldLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  footerEarningsText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#92400E",
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyIconBg: {
    width: 88,
    height: 88,
    borderRadius: 28,
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