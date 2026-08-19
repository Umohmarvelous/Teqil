import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
} from "react-native";
import Animated from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { Glass, IOSScreen, useCollapsibleScroll } from "@/components/ios";
import { TripsStorage, PassengersStorage } from "@/src/services/storage";
import { triggerSyncNow } from "@/src/services/sync";
import { formatDate, formatDuration, formatCoins, formatNaira, coinsToNaira, } from "@/src/utils/helpers";
import type { Trip } from "@/src/models/types";
import { useTranslation } from "react-i18next";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { BarcodeScanIcon, Calendar, Star, Tick, Tick02Icon, Tick03Icon, Time01Icon } from "@hugeicons/core-free-icons";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useActivityFeed } from "@/src/hooks/useActivityFeed";
import ActivityFeed from "@/components/ActivityFeed";


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

  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const cardBg = isDark ? Colors.overlay : Colors.border;
  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "#E5E8EC";

  return (
    <View style={[styles.summaryRow, { backgroundColor: 'transparent' }]}>
      <Glass
        variant="regular"
        radius={14}
        style={[styles.summaryCard, { borderColor }]}
        fallbackIntensity={35}
        // fallbackTint={'transparent'}
      >
        <Text style={[styles.summaryValue, {color: textColor}]}>{totalTrips}</Text>
        <Text style={[styles.summaryLabel, {color: textColor}]}>Total Trips</Text>
      </Glass>
      <Glass
        variant="regular"
        radius={14}
        style={[styles.summaryCard, styles.summaryCardMiddle]}
        fallbackIntensity={35}
        fallbackTint={'transparent'}
      >
        <Text style={[styles.summaryValue, {color: textColor}]}>{completedTrips}</Text>
        <Text style={[styles.summaryLabel, {color: textColor}]}>Completed</Text>
      </Glass>
      <Glass
        variant="regular"
        radius={14}
        style={styles.summaryCard}
        fallbackIntensity={35}
        fallbackTint={'transparent'}
      >
        <Text style={[styles.summaryValue, { color: textColor }]}>
          {formatNaira(Math.round(coinsToNaira(totalCoins)))}
        </Text>
        <Text style={[styles.summaryLabel, {color: textColor}]}>Est. Earned</Text>
      </Glass>
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
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const textColor = isDark ? Colors.textWhite : Colors.text;

  const isActive = trip.status === "active";

  const durationSeconds = trip.end_time
    ? (new Date(trip.end_time).getTime() - new Date(trip.start_time).getTime()) / 1000
    : null;

  return (
    <Glass
      variant="regular"
      style={styles.tripCard}
      fallbackIntensity={35}
      fallbackTint={'transparent'}
    >
      {/* Header row */}
      <View style={styles.tripCardHeader}>
        <View style={[styles.tripCodeBadge ]}>
          <Glass
            variant="clear"
            radius={8}
            // style={StyleSheet.absoluteFill}
            pointerEvents="none"
            fallbackIntensity={20}
            fallbackTint={Colors.surfaceSecondary}
          />
          <HugeiconsIcon icon={BarcodeScanIcon} size={14} color={textColor} />
          <Text style={[styles.tripCodeText, {color: textColor}]}>{trip.trip_code}</Text>
        </View>
        <View style={styles.statusBadge}>
          <Glass
            variant="clear"
            radius={8}
            // style={StyleSheet.absoluteFill}
            pointerEvents="none"
            fallbackTint={'transparent'}
          />
          {isActive && <View style={styles.liveDot} />}
          {/* <View style={{borderWidth: 1, borderColor: Colors.primary, borderRadius: 70, padding: 1}}>
            <HugeiconsIcon icon={Tick02Icon} size={15} color={Colors.primary} />
          </View> */}
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
          <HugeiconsIcon icon={Calendar} size={13} color={Colors.textTertiary} />
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
            <HugeiconsIcon icon={Time01Icon} size={13} color={Colors.textTertiary} />
            <Text style={styles.footerText}>{formatDuration(durationSeconds)}</Text>
          </View>
        )}
        {trip.status === "completed" && trip.estimatedCoins > 0 && (
          <View style={[styles.footerItem, styles.footerEarnings]}>
            <HugeiconsIcon icon={Star} size={13} color={Colors.gold} />
            <Text style={styles.footerEarningsText}>
              {formatCoins(trip.estimatedCoins)}
            </Text>
          </View>
        )}
      </View>
    </Glass>
  );
}

function EmptyState({ filter }: { filter: FilterTab }) {
  const messages: Record<FilterTab, { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }> = {
    all: {
      icon: "time",
      title: "No trips yet",
      sub: "Your completed and active trips will appear here",
    },
    active: {
      icon: "navigate-circle",
      title: "No active trips",
      sub: "Start a trip to view it here",
    },
    completed: {
      icon: "checkmark-circle",
      title: "No completed trips",
      sub: "All successful trips will appear here",
    },
  };
  const msg = messages[filter];
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconBg}>
        <Ionicons name={msg.icon} size={80} color={Colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{msg.title}</Text>
      <Text style={styles.emptySubtitle}>{msg.sub}</Text>
    </View>
  );
}

export default function DriverHistoryScreen() {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const scroll = useCollapsibleScroll();

  const [allTrips, setAllTrips] = useState<TripWithPassengerCount[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [refreshing, setRefreshing] = useState(false);

  // Unified history: payments (with receipts), achievements and watched ads,
  // shown above the trips list. Trips have their own rich cards below.
  const nonTripActivity = useActivityFeed().filter((a) => a.kind !== "trip");

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
    // Reload history AND run a full cloud sync.
    await Promise.all([load(), triggerSyncNow()]);
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

  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const tabBarBg = isDark ? Colors.background : Colors.textWhite;
  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "#E5E8EC";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? "rgba(255,255,255,0.08)" : "#FFFFFF";

  return (
    <IOSScreen
      title={t("history.title")}
      subtitle={`${allTrips.length} ${allTrips.length === 1 ? "trip" : "trips"} so far`}
      back
      scrollable={false}
      scroll={scroll}
    >
      <Animated.FlatList
        data={filtered}
        keyExtractor={(item: TripWithPassengerCount) => item.id}
        showsVerticalScrollIndicator={false}
        {...scroll.scrollProps}
        contentContainerStyle={[styles.listContent, scroll.scrollProps.contentContainerStyle]}
        renderItem={({ item }: { item: TripWithPassengerCount }) => (
          <View style={styles.scrollContent}>
            <TripCard trip={item} />
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            progressViewOffset={scroll.contentInset}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        ListHeaderComponent={
          <>
            {nonTripActivity.length < 0 && (
              <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, gap: 8 }}>
                <Text style={[styles.headerTitle, { color: textColor, fontSize: 15 }]}>
                  Payments &amp; rewards
                </Text>
                <ActivityFeed
                  activities={nonTripActivity}
                  textColor={textColor}
                  subColor={subTextColor}
                  cardBg={cardBg}
                  borderColor={borderColor}
                  limit={6}
                />
              </View>
            )}
            <View style={[styles.FilterTabHolder, { borderBottomColor: borderColor }]}>
              <Glass
                variant="regular"
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
                fallbackIntensity={80}
                fallbackTint={tabBarBg}
              />
              {allTrips.length > 0 && (
                <StatSummary
                  totalTrips={allTrips.length}
                  completedTrips={counts.completed}
                  totalCoins={totalCoins}
                />
              )}
              <FilterTabs active={filter} onChange={setFilter} counts={counts} />
            </View>
          </>
        }
        ListEmptyComponent={<EmptyState filter={filter} />}
      />
    </IOSScreen>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    fontFamily: "Inter-Black",
    fontSize: 19,
    color: Colors.text,
  },

  // Summary cards
  summaryRow: {
    flexDirection: "row",
    gap: 20,
    // marginBottom: 4,
    padding: 20,
    paddingTop: 0,
    justifyContent: 'center',
  },
  summaryCard: {
    flex: 1,
    borderRadius: 14,
    padding: 10,
    alignItems: "center",
    borderWidth: .5,
    // marginBottom: 10,
  },
  summaryCardMiddle: {
    borderWidth: .5,
  },
  summaryValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
  },
  summaryLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    // marginTop: 2,
    textAlign: "center",  
  },

  // Filter tabs
  FilterTabHolder: {
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 5,
    elevation: 1, 
    borderBottomWidth:.5,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,    
    justifyContent: 'space-evenly'

  },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  filterTabActive: {
    borderBottomWidth: 2,
    borderColor: Colors.primary,
  },
  filterTabText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  filterTabTextActive: {
    color: Colors.primary,
  },
  filterBadge: {
    backgroundColor: Colors.error,
    borderRadius: 50,
    minWidth: 15,
    paddingHorizontal: 5,
    paddingVertical: 1,
    alignItems: "center",
    bottom: 7
  },
  filterBadgeActive: {
    backgroundColor: Colors.error,
  },
  filterBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    color: Colors.textWhite,
  },
  filterBadgeTextActive: {
    color: Colors.surface,
  },

  listContent: {
    // gap: 12,    
  },

  scrollContent: {
    paddingHorizontal: 0,
      // marginTop: 20
  },
  // Trip card
  tripCard: {
    padding: 30,
    paddingBottom: 0,
        borderBottomWidth: 1,
    borderBottomColor: Colors.overlayLight,
    gap: 14,     

    marginBottom: 5
  },
  tripCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center", 
    
  },
  tripCodeBadge: {
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    paddingVertical: 5,
  },
  tripCodeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    letterSpacing: 1.5,
    paddingLeft: 15
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
  },
  statusText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  statusTextLive: { color: Colors.primary },
  statusTextDone: { color: "#16A34A" },
  
  // Footer
  tripCardFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingBottom: 12,
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
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  footerEarningsText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#92400E",
  },

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
  },
  routeLineSegment: {
    width: 1,
    flex: 1,
    minHeight: 16,
    backgroundColor: Colors.overlay,
    marginVertical: 3,
  },
  routeDotRed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.error,
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

  // Empty state
  emptyState: {
    alignItems: "center",
    // The header's content inset already pushes the list down; this only has
    // to clear the filter strip above it.
    paddingTop: 80,
    gap: 12,
    paddingHorizontal: 40,
    justifyContent: 'center',
  },
  emptyIconBg: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 17,
    color: Colors.primary,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 15,
  },
});