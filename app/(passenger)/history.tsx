// app/(passenger)/history.tsx
//
// The passenger's trip history, plus non-trip activity (payments, rewards).
//
// iOS kit: large-title header, semantic palette, SF Symbols, iOS text ramp.

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  RefreshControl,
  Pressable,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { SymbolView } from "expo-symbols";

import {
  useIOSTheme,
  IOSFont,
  IOSMetrics,
  type IOSPalette,
} from "@/components/ios";
import { useAuthStore } from "@/src/store/useStore";
import { PassengersStorage, TripsStorage } from "@/src/services/storage";
import { triggerSyncNow } from "@/src/services/sync";
import { formatDate } from "@/src/utils/helpers";
import type { Trip } from "@/src/models/types";
import { useActivityFeed } from "@/src/hooks/useActivityFeed";
import ActivityFeed from "@/components/ActivityFeed";

// ─── Trip card ───────────────────────────────────────────────────────────────

function TripCard({ trip, ios }: { trip: Trip; ios: IOSPalette }) {
  const isCompleted = trip.status === "completed";
  const statusColor = isCompleted ? ios.systemGray : ios.tint;

  return (
    <View style={[styles.card, { backgroundColor: ios.secondarySystemGroupedBackground }]}>
      {/* Code + status */}
      <View style={styles.cardHeader}>
        <View style={[styles.codeBadge, { backgroundColor: ios.tertiarySystemFill }]}>
          <SymbolView name="barcode" size={12} tintColor={ios.secondaryLabel} fallback={null} />
          <Text style={[IOSFont.caption1, { color: ios.secondaryLabel }]}>{trip.trip_code}</Text>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[IOSFont.caption1, { color: statusColor }]}>
            {isCompleted ? "Completed" : "Active"}
          </Text>
        </View>
      </View>

      {/* Route */}
      <View style={styles.routeBlock}>
        <View style={styles.routeItem}>
          <View style={[styles.dot, { backgroundColor: ios.tint }]} />
          <Text numberOfLines={1} style={[IOSFont.callout, { color: ios.label, flex: 1 }]}>
            {trip.origin}
          </Text>
        </View>
        <View style={[styles.routeSep, { backgroundColor: ios.separator }]} />
        <View style={styles.routeItem}>
          <View style={[styles.dot, styles.dotEnd, { borderColor: ios.systemRed }]} />
          <Text numberOfLines={1} style={[IOSFont.callout, { color: ios.label, flex: 1 }]}>
            {trip.destination}
          </Text>
        </View>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: ios.separator }]}>
        <View style={styles.footerItem}>
          <SymbolView name="calendar" size={12} tintColor={ios.tertiaryLabel} fallback={null} />
          <Text style={[IOSFont.caption1, { color: ios.secondaryLabel }]}>
            {formatDate(trip.created_at)}
          </Text>
        </View>

        {(trip.driver?.full_name || trip.driver_id) && (
          <View style={styles.footerItem}>
            <SymbolView name="person" size={12} tintColor={ios.tertiaryLabel} fallback={null} />
            <Text numberOfLines={1} style={[IOSFont.caption1, { color: ios.secondaryLabel }]}>
              {trip.driver?.full_name ?? "Driver on record"}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function PassengerHistoryScreen() {
  const insets = useSafeAreaInsets();
  const ios = useIOSTheme();
  const { user } = useAuthStore();
  const { t } = useTranslation();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const nonTripActivity = useActivityFeed().filter((a) => a.kind !== "trip");

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
    // Reload history AND run a full cloud sync.
    await Promise.all([load(), triggerSyncNow()]);
    setRefreshing(false);
  };

  const topPadding = Platform.OS === "web" ? 20 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: ios.systemGroupedBackground }]}>
      <StatusBar style={ios.scheme === "dark" ? "light" : "dark"} />

      <View style={{ paddingTop: topPadding + 6, paddingHorizontal: IOSMetrics.groupedInset }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.backRow}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <SymbolView name="chevron.left" size={17} tintColor={ios.tint} fallback={null} />
          <Text style={[IOSFont.body, { color: ios.tint }]}>Back</Text>
        </Pressable>

        <Text style={[IOSFont.largeTitle, { color: ios.label, marginTop: 4 }]}>
          {t("history.title")}
        </Text>
        <Text style={[IOSFont.footnote, { color: ios.secondaryLabel, marginBottom: 8 }]}>
          {trips.length} {trips.length === 1 ? "trip" : "trips"}
        </Text>
      </View>

      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TripCard trip={item} ios={ios} />}
        contentContainerStyle={{ paddingTop: 6, paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!trips.length || nonTripActivity.length > 0}
        ListHeaderComponent={
          nonTripActivity.length > 0 ? (
            <View style={styles.activityHeader}>
              <Text style={[IOSFont.footnote, styles.sectionHeader, { color: ios.secondaryLabel }]}>
                PAYMENTS & REWARDS
              </Text>
              <ActivityFeed
                activities={nonTripActivity}
                textColor={ios.label}
                subColor={ios.secondaryLabel}
                cardBg={ios.secondarySystemGroupedBackground}
                borderColor={ios.separator}
                limit={6}
              />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={ios.secondaryLabel}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <SymbolView name="clock.arrow.circlepath" size={52} tintColor={ios.tertiaryLabel} fallback={null} />
            <Text style={[IOSFont.title3, { color: ios.label, textAlign: "center" }]}>
              {t("history.noHistory")}
            </Text>
            <Text style={[IOSFont.subheadline, { color: ios.secondaryLabel, textAlign: "center" }]}>
              Trips you join will appear here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: -4 },

  card: {
    borderRadius:     IOSMetrics.groupedRadius,
    marginHorizontal: IOSMetrics.groupedInset,
    marginBottom:     10,
    padding:          14,
    gap:              12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  codeBadge: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               5,
    paddingHorizontal: 8,
    paddingVertical:   4,
    borderRadius:      6,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },

  routeBlock: { gap: 0 },
  routeItem:  { flexDirection: "row", alignItems: "center", gap: 10 },
  dot:        { width: 9, height: 9, borderRadius: 5 },
  dotEnd:     { backgroundColor: "transparent", borderWidth: 2 },
  routeSep:   { width: 1.5, height: 16, marginLeft: 4, marginVertical: 2 },

  footer: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           16,
    paddingTop:    10,
    borderTopWidth: IOSMetrics.hairline,
  },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },

  activityHeader: { paddingTop: 4, paddingBottom: 10, gap: 6 },
  sectionHeader:  { paddingHorizontal: IOSMetrics.groupedInset + 4, letterSpacing: 0.5 },

  emptyWrap: { alignItems: "center", paddingTop: 90, paddingHorizontal: 44, gap: 10 },
});
