// app/route-history/index.tsx
//
// Saved route history — every GPS-tracked ride the user has taken or driven.
// Tap a row for the full map; swipe left to delete.
//
// iOS kit: large-title header, inset-grouped rows, system swipe-to-delete.

import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import Animated from "react-native-reanimated";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SymbolView } from "expo-symbols";

import { RouteThumbnail } from "@/components/RouteThumbnail";
import {
  IOSAlert,
  IOSButton,
  useIOSTheme,
  IOSFont,
  IOSMetrics,
  type IOSPalette,
  IOSScreen,
  useCollapsibleScroll,
} from "@/components/ios";
import { useRouteHistory, type RouteHistoryEntry } from "@/src/hooks/useRouteHistory";
import { haptics } from "@/src/utils/haptics";
import { formatDistance, formatDuration, formatNaira } from "@/src/utils/helpers";

// ─── Row ─────────────────────────────────────────────────────────────────────

function HistoryCard({
  entry,
  onDelete,
  ios,
}: {
  entry:    RouteHistoryEntry;
  onDelete: (entry: RouteHistoryEntry) => void;
  ios:      IOSPalette;
}) {
  const isFreeRide = entry.context === "free_ride";
  const when = new Date(entry.started_at);

  const dateLabel = when.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const timeLabel = when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const renderRightActions = () => (
    <Pressable
      style={[cardStyles.deleteBtn, { backgroundColor: ios.systemRed }]}
      onPress={() => onDelete(entry)}
      accessibilityLabel={`Delete ${entry.dest_label || "tracked ride"}`}
    >
      <SymbolView name="trash.fill" size={20} tintColor="#FFFFFF" fallback={null} />
    </Pressable>
  );

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <Pressable
        style={({ pressed }) => [
          cardStyles.card,
          { backgroundColor: ios.secondarySystemGroupedBackground },
          pressed && { backgroundColor: ios.tertiarySystemFill },
        ]}
        onPress={() => router.push(`/route-history/${entry.id}`)}
        accessibilityRole="button"
      >
        <RouteThumbnail path={entry.path} isDark={ios.scheme === "dark"} width={64} height={64} />

        <View style={cardStyles.body}>
          <View style={cardStyles.titleRow}>
            <Text numberOfLines={1} style={[IOSFont.headline, { color: ios.label, flexShrink: 1 }]}>
              {entry.dest_label || entry.origin_label || "Tracked ride"}
            </Text>
            {isFreeRide && (
              <View style={[cardStyles.tag, { backgroundColor: ios.tertiarySystemFill }]}>
                <Text style={[IOSFont.caption2, { color: ios.tint, fontWeight: "600" }]}>FREE</Text>
              </View>
            )}
          </View>

          <Text style={[IOSFont.footnote, { color: ios.secondaryLabel }]}>
            {dateLabel} · {timeLabel} · {entry.role === "driver" ? "Driving" : "Riding"}
          </Text>

          <View style={cardStyles.statsRow}>
            <Stat ios={ios} symbol="location.fill" text={formatDistance(entry.distance_km)} />
            <Stat ios={ios} symbol="clock.fill" text={formatDuration(entry.duration_seconds)} />
            {entry.fare > 0 && (
              <Stat ios={ios} symbol="naironsign.circle.fill" text={formatNaira(entry.fare)} tint={ios.systemOrange} />
            )}
          </View>
        </View>

        <View style={cardStyles.trailing}>
          <SymbolView
            name={entry.gps_validated ? "checkmark.shield.fill" : "shield"}
            size={15}
            tintColor={entry.gps_validated ? ios.tint : ios.tertiaryLabel}
            fallback={null}
          />
          <SymbolView name="chevron.right" size={13} tintColor={ios.tertiaryLabel} fallback={null} />
        </View>
      </Pressable>
    </Swipeable>
  );
}

function Stat({
  ios,
  symbol,
  text,
  tint,
}: {
  ios:    IOSPalette;
  symbol: string;
  text:   string;
  tint?:  string;
}) {
  return (
    <View style={cardStyles.stat}>
      <SymbolView name={symbol as never} size={11} tintColor={tint ?? ios.tint} fallback={null} />
      <Text style={[IOSFont.caption1, { color: ios.secondaryLabel }]}>{text}</Text>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              12,
    padding:          12,
    borderRadius:     IOSMetrics.groupedRadius,
    marginHorizontal: IOSMetrics.groupedInset,
    marginBottom:     10,
  },
  body:     { flex: 1, gap: 3 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tag: {
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      5,
  },
  statsRow: { flexDirection: "row", gap: 14, marginTop: 2 },
  stat:     { flexDirection: "row", alignItems: "center", gap: 4 },
  trailing: { alignItems: "center", gap: 6 },
  deleteBtn: {
    justifyContent: "center",
    alignItems:     "center",
    width:          74,
    marginBottom:   10,
    marginRight:    IOSMetrics.groupedInset,
    borderRadius:   IOSMetrics.groupedRadius,
  },
});

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ ios }: { ios: IOSPalette }) {
  return (
    <View style={emptyStyles.wrap}>
      <SymbolView name="map" size={52} tintColor={ios.tertiaryLabel} fallback={null} />
      <Text style={[IOSFont.title3, { color: ios.label, textAlign: "center" }]}>
        No tracked rides yet
      </Text>
      <Text style={[IOSFont.subheadline, { color: ios.secondaryLabel, textAlign: "center" }]}>
        Trips and free rides you take with GPS on are recorded here, with the route,
        distance and time.
      </Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  wrap: { alignItems: "center", paddingTop: 90, paddingHorizontal: 44, gap: 10 },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function RouteHistoryScreen() {
  const scroll = useCollapsibleScroll();
  const ios = useIOSTheme();

  const { entries, loading, error, refresh, remove } = useRouteHistory();
  const [pendingDelete, setPendingDelete] = React.useState<RouteHistoryEntry | null>(null);


  const totals = useMemo(
    () =>
      entries.reduce(
        (acc, e) => ({
          km:      acc.km + (e.distance_km || 0),
          seconds: acc.seconds + (e.duration_seconds || 0),
        }),
        { km: 0, seconds: 0 },
      ),
    [entries],
  );

  const confirmDelete = useCallback((entry: RouteHistoryEntry) => {
    haptics.warning();
    setPendingDelete(entry);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <IOSScreen
        title="Route History"
        subtitle={
          entries.length > 0
            ? `${formatDistance(totals.km)} · ${formatDuration(totals.seconds)} tracked`
            : "Your tracked rides"
        }
        back
        scrollable={false}
        scroll={scroll}
      >
        {error && (
          <View style={[styles.errorBar, { backgroundColor: ios.tertiarySystemFill }]}>
            <SymbolView name="wifi.slash" size={14} tintColor={ios.systemRed} fallback={null} />
            <Text style={[IOSFont.footnote, { color: ios.systemRed, flex: 1 }]}>{error}</Text>
            <IOSButton title="Retry" variant="borderless" size="small" onPress={refresh} />
          </View>
        )}

        <Animated.FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          showsVerticalScrollIndicator={false}
          {...scroll.scrollProps}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refresh}
              // Without this the spinner draws behind the translucent header.
              progressViewOffset={scroll.refreshOffset}
              tintColor={ios.secondaryLabel}
            />
          }
          renderItem={({ item }) => (
            <HistoryCard entry={item} onDelete={confirmDelete} ios={ios} />
          )}
          ListEmptyComponent={!loading ? <EmptyState ios={ios} /> : null}
        />

        <IOSAlert
          visible={!!pendingDelete}
          title="Delete this track?"
          message="The recorded route will be removed. This can't be undone."
          onClose={() => setPendingDelete(null)}
          actions={[
            { label: "Cancel", style: "cancel", onPress: () => setPendingDelete(null) },
            {
              label: "Delete",
              style: "destructive",
              onPress: () => {
                if (pendingDelete) remove(pendingDelete.id);
                setPendingDelete(null);
              },
            },
          ]}
        />
      </IOSScreen>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  errorBar: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               8,
    marginHorizontal:  IOSMetrics.groupedInset,
    marginBottom:      8,
    paddingHorizontal: 12,
    paddingVertical:   8,
    borderRadius:      IOSMetrics.groupedRadius,
  },
});
