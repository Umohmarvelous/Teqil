// app/(passenger)/saved-routes.tsx
//
// Passenger's saved routes list — shows origin → dest, distance, fare estimate,
// use count.  Tap a route to navigate to find-trip pre-filled (or just copy).
// Swipe-to-delete with confirmation.

import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  Platform,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";

import { useSavedRoutes, type SavedRoute } from "@/src/hooks/useSavedRoutes";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { Colors } from "@/constants/colors";
import { formatCoins } from "@/src/utils/helpers";

// ─── Route card ──────────────────────────────────────────────────────────────

function RouteCard({
  route,
  onDelete,
  isDark,
}: {
  route:    SavedRoute;
  onDelete: (id: string) => void;
  isDark:   boolean;
}) {
  const cardBg    = isDark ? Colors.surface    : "#FFFFFF";
  const textColor = isDark ? Colors.textWhite  : Colors.text;
  const subColor  = isDark ? Colors.textSecondary : Colors.textTertiary;

  const renderRightActions = () => (
    <Pressable
      style={swipeStyles.deleteBtn}
      onPress={() => onDelete(route.id)}
    >
      <Ionicons name="trash-outline" size={22} color="#fff" />
    </Pressable>
  );

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <View style={[cardStyles.card, { backgroundColor: cardBg }]}>
        {/* Route line */}
        <View style={cardStyles.routeCol}>
          <View style={cardStyles.dotGreen} />
          <View style={cardStyles.connector} />
          <View style={cardStyles.dotRed} />
        </View>

        <View style={cardStyles.body}>
          <Text style={[cardStyles.routeText, { color: textColor }]} numberOfLines={1}>
            {route.origin_label || `${route.origin_lat.toFixed(4)}, ${route.origin_lng.toFixed(4)}`}
          </Text>
          <Text style={[cardStyles.routeText, { color: textColor, marginTop: 8 }]} numberOfLines={1}>
            {route.dest_label || `${route.dest_lat.toFixed(4)}, ${route.dest_lng.toFixed(4)}`}
          </Text>

          {/* Footer stats */}
          <View style={cardStyles.statsRow}>
            {route.distance_km != null && (
              <View style={cardStyles.stat}>
                <Ionicons name="navigate-outline" size={11} color={subColor} />
                <Text style={[cardStyles.statText, { color: subColor }]}>
                  {route.distance_km.toFixed(1)} km
                </Text>
              </View>
            )}
            {route.base_fare != null && (
              <View style={cardStyles.stat}>
                <Ionicons name="star-outline" size={11} color={Colors.gold} />
                <Text style={[cardStyles.statText, { color: Colors.gold }]}>
                  ~{formatCoins(Math.round(route.base_fare))}
                </Text>
              </View>
            )}
            <View style={cardStyles.stat}>
              <Ionicons name="repeat" size={11} color={subColor} />
              <Text style={[cardStyles.statText, { color: subColor }]}>
                {route.use_count}×
              </Text>
            </View>
          </View>
        </View>

        {/* Use count badge */}
        {route.use_count > 1 && (
          <View style={cardStyles.useBadge}>
            <Text style={cardStyles.useBadgeText}>{route.use_count}×</Text>
          </View>
        )}
      </View>
    </Swipeable>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            14,
    borderRadius:   18,
    padding:        16,
    shadowColor:    "#000",
    shadowOffset:   { width: 0, height: 2 },
    shadowOpacity:  0.06,
    shadowRadius:   8,
    elevation:      2,
  },
  routeCol:  { alignItems: "center", paddingVertical: 2 },
  dotGreen:  { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  connector: { width: 2, height: 22, backgroundColor: Colors.border, marginVertical: 3 },
  dotRed:    { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.error },
  body:      { flex: 1 },
  routeText: { fontFamily: "Poppins_500Medium", fontSize: 13 },
  statsRow:  { flexDirection: "row", gap: 14, marginTop: 10, flexWrap: "wrap" },
  stat:      { flexDirection: "row", alignItems: "center", gap: 4 },
  statText:  { fontFamily: "Poppins_400Regular", fontSize: 11 },
  useBadge:  {
    backgroundColor:  Colors.primaryLight,
    borderRadius:     10,
    paddingHorizontal:8,
    paddingVertical:   4,
  },
  useBadgeText: { fontFamily: "Poppins_700Bold", fontSize: 11, color: Colors.primaryDark },
});

const swipeStyles = StyleSheet.create({
  deleteBtn: {
    backgroundColor:  Colors.error,
    width:            72,
    borderRadius:     18,
    alignItems:       "center",
    justifyContent:   "center",
    marginLeft:       8,
  },
});

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ isDark }: { isDark: boolean }) {
  const txt = isDark ? Colors.textWhite      : Colors.text;
  const sub = isDark ? Colors.textSecondary  : Colors.textTertiary;
  return (
    <View style={emptyStyles.wrap}>
      <View style={emptyStyles.iconWrap}>
        <Ionicons name="bookmark-outline" size={40} color={Colors.primary} />
      </View>
      <Text style={[emptyStyles.title, { color: txt }]}>No saved routes</Text>
      <Text style={[emptyStyles.sub, { color: sub }]}>
        {`Complete a trip and tap "Save route" to store it here for quick repeat trips.`}
      </Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  wrap:     { alignItems: "center", paddingTop: 100, paddingHorizontal: 40, gap: 12 },
  iconWrap: {
    width:           72,
    height:          72,
    borderRadius:    22,
    backgroundColor: Colors.primaryLight,
    alignItems:      "center",
    justifyContent:  "center",
    marginBottom:    4,
  },
  title: { fontFamily: "Poppins_600SemiBold", fontSize: 18, textAlign: "center" },
  sub:   { fontFamily: "Poppins_400Regular",  fontSize: 13, textAlign: "center", lineHeight: 20 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SavedRoutesScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useSettingsStore();
  const isDark    = theme === "dark";

  const bg        = isDark ? Colors.background : Colors.border;
  const cardBg    = isDark ? Colors.surface    : "#FFFFFF";
  const textColor = isDark ? Colors.textWhite  : Colors.text;
  const subColor  = isDark ? Colors.textSecondary : Colors.textTertiary;

  const { routes, loading, deleteRoute, refresh } = useSavedRoutes();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const confirmDelete = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Delete route?",
      "This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text:    "Delete",
          style:   "destructive",
          onPress: () => deleteRoute(id),
        },
      ],
    );
  }, [deleteRoute]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.root, { backgroundColor: bg }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: cardBg }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={textColor} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: textColor }]}>Saved Routes</Text>
            <Text style={[styles.headerSub, { color: subColor }]}>
              {routes.length > 0 ? `${routes.length} route${routes.length > 1 ? "s" : ""}` : "Swipe left to delete"}
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <FlatList
          data={routes}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          renderItem={({ item }) => (
            <RouteCard route={item} onDelete={confirmDelete} isDark={isDark} />
          )}
          ListEmptyComponent={!loading ? <EmptyState isDark={isDark} /> : null}
          ListFooterComponent={<View style={{ height: 60 + insets.bottom }} />}
        />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection:    "row",
    alignItems:       "center",
    paddingHorizontal:20,
    paddingBottom:    16,
  },
  backBtn:      { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle:  { fontFamily: "Poppins_700Bold",    fontSize: 18 },
  headerSub:    { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  list:         { padding: 16, gap: 12 },
});