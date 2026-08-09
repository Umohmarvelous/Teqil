// app/(passenger)/saved-routes.tsx
//
// The passenger's bookmarked origin→dest pairs, for quick repeat trips.
// Distinct from Route History, which is the GPS record of rides that happened.
//
// iOS kit: large-title header, inset-grouped rows, system swipe-to-delete.

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SymbolView } from "expo-symbols";

import {
  IOSAlert,
  useIOSTheme,
  IOSFont,
  IOSMetrics,
  type IOSPalette,
} from "@/components/ios";
import { useSavedRoutes, type SavedRoute } from "@/src/hooks/useSavedRoutes";
import { haptics } from "@/src/utils/haptics";
import { formatDistance, formatNaira } from "@/src/utils/helpers";

// ─── Row ─────────────────────────────────────────────────────────────────────

function RouteCard({
  route,
  onDelete,
  ios,
}: {
  route:    SavedRoute;
  onDelete: (route: SavedRoute) => void;
  ios:      IOSPalette;
}) {
  const renderRightActions = () => (
    <Pressable
      style={[styles.deleteBtn, { backgroundColor: ios.systemRed }]}
      onPress={() => onDelete(route)}
      accessibilityLabel={`Delete ${route.label || "saved route"}`}
    >
      <SymbolView name="trash.fill" size={20} tintColor="#FFFFFF" fallback={null} />
    </Pressable>
  );

  const origin = route.origin_label || "Pickup";
  const dest   = route.dest_label   || "Drop-off";

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: ios.secondarySystemGroupedBackground },
          pressed && { backgroundColor: ios.tertiarySystemFill },
        ]}
        onPress={() => router.push("/(passenger)/find-trip")}
        accessibilityRole="button"
      >
        {/* Origin → destination, drawn as the standard route stem */}
        <View style={styles.stem}>
          <View style={[styles.dot, { backgroundColor: ios.tint }]} />
          <View style={[styles.connector, { backgroundColor: ios.separator }]} />
          <View style={[styles.dot, styles.dotEnd, { borderColor: ios.tint }]} />
        </View>

        <View style={styles.body}>
          <Text numberOfLines={1} style={[IOSFont.headline, { color: ios.label }]}>
            {origin}
          </Text>
          <Text numberOfLines={1} style={[IOSFont.subheadline, { color: ios.secondaryLabel }]}>
            {dest}
          </Text>

          <View style={styles.statsRow}>
            {route.distance_km != null && (
              <Text style={[IOSFont.caption1, { color: ios.tertiaryLabel }]}>
                {formatDistance(route.distance_km)}
              </Text>
            )}
            {route.base_fare != null && route.base_fare > 0 && (
              <Text style={[IOSFont.caption1, { color: ios.tertiaryLabel }]}>
                {formatNaira(route.base_fare)}
              </Text>
            )}
            <Text style={[IOSFont.caption1, { color: ios.tertiaryLabel }]}>
              Used {route.use_count}×
            </Text>
          </View>
        </View>

        <SymbolView name="chevron.right" size={13} tintColor={ios.tertiaryLabel} fallback={null} />
      </Pressable>
    </Swipeable>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ ios }: { ios: IOSPalette }) {
  return (
    <View style={styles.emptyWrap}>
      <SymbolView name="bookmark" size={52} tintColor={ios.tertiaryLabel} fallback={null} />
      <Text style={[IOSFont.title3, { color: ios.label, textAlign: "center" }]}>
        No saved routes
      </Text>
      <Text style={[IOSFont.subheadline, { color: ios.secondaryLabel, textAlign: "center" }]}>
        Finish a trip and tap “Save route”, or save one from Route History, to keep it
        here for quick repeat trips.
      </Text>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SavedRoutesScreen() {
  const insets = useSafeAreaInsets();
  const ios = useIOSTheme();

  const { routes, loading, deleteRoute, refresh } = useSavedRoutes();
  const [pendingDelete, setPendingDelete] = useState<SavedRoute | null>(null);

  const topPadding = Platform.OS === "web" ? 20 : insets.top;

  const confirmDelete = useCallback((route: SavedRoute) => {
    haptics.warning();
    setPendingDelete(route);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
            Saved Routes
          </Text>
          <Text style={[IOSFont.footnote, { color: ios.secondaryLabel, marginBottom: 10 }]}>
            {routes.length > 0
              ? `${routes.length} route${routes.length > 1 ? "s" : ""} · swipe left to delete`
              : "Your quick-repeat trips"}
          </Text>
        </View>

        <FlatList
          data={routes}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingTop: 6, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={ios.secondaryLabel} />
          }
          renderItem={({ item }) => (
            <RouteCard route={item} onDelete={confirmDelete} ios={ios} />
          )}
          ListEmptyComponent={!loading ? <EmptyState ios={ios} /> : null}
        />

        <IOSAlert
          visible={!!pendingDelete}
          title="Delete route?"
          message="This can't be undone."
          onClose={() => setPendingDelete(null)}
          actions={[
            { label: "Cancel", style: "cancel", onPress: () => setPendingDelete(null) },
            {
              label: "Delete",
              style: "destructive",
              onPress: () => {
                if (pendingDelete) deleteRoute(pendingDelete.id);
                setPendingDelete(null);
              },
            },
          ]}
        />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: -4 },

  card: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              12,
    padding:          14,
    borderRadius:     IOSMetrics.groupedRadius,
    marginHorizontal: IOSMetrics.groupedInset,
    marginBottom:     10,
  },
  stem:      { alignItems: "center", width: 12 },
  dot:       { width: 8, height: 8, borderRadius: 4 },
  dotEnd:    { backgroundColor: "transparent", borderWidth: 2 },
  connector: { width: 1.5, height: 20, marginVertical: 2 },

  body:     { flex: 1, gap: 1 },
  statsRow: { flexDirection: "row", gap: 12, marginTop: 4 },

  deleteBtn: {
    justifyContent: "center",
    alignItems:     "center",
    width:          74,
    marginBottom:   10,
    marginRight:    IOSMetrics.groupedInset,
    borderRadius:   IOSMetrics.groupedRadius,
  },

  emptyWrap: { alignItems: "center", paddingTop: 90, paddingHorizontal: 44, gap: 10 },
});
