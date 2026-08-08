// app/route-history/index.tsx
//
// Saved route history — every GPS-tracked ride the user has taken or driven.
// Tap a row for the full map; swipe left to delete.

import React, { useCallback, useMemo } from "react";
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

import { RouteThumbnail } from "@/components/RouteThumbnail";
import { useRouteHistory, type RouteHistoryEntry } from "@/src/hooks/useRouteHistory";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { Colors } from "@/constants/colors";
import { formatDistance, formatDuration, formatNaira } from "@/src/utils/helpers";

// ─── Row ─────────────────────────────────────────────────────────────────────

function HistoryCard({
  entry,
  onDelete,
  isDark,
}: {
  entry:    RouteHistoryEntry;
  onDelete: (id: string) => void;
  isDark:   boolean;
}) {
  const cardBg    = isDark ? Colors.surface        : "#FFFFFF";
  const textColor = isDark ? Colors.textWhite      : Colors.text;
  const subColor  = isDark ? Colors.textSecondary  : Colors.textTertiary;

  const isFreeRide = entry.context === "free_ride";
  const when = new Date(entry.started_at);
  const dateLabel = when.toLocaleDateString(undefined, {
    day:   "numeric",
    month: "short",
  });
  const timeLabel = when.toLocaleTimeString(undefined, {
    hour:   "2-digit",
    minute: "2-digit",
  });

  const renderRightActions = () => (
    <Pressable style={cardStyles.deleteBtn} onPress={() => onDelete(entry.id)}>
      <Ionicons name="trash-outline" size={22} color="#fff" />
    </Pressable>
  );

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <Pressable
        style={({ pressed }) => [
          cardStyles.card,
          { backgroundColor: cardBg },
          pressed && { opacity: 0.85 },
        ]}
        onPress={() => router.push(`/route-history/${entry.id}`)}
      >
        <RouteThumbnail path={entry.path} isDark={isDark} />

        <View style={cardStyles.body}>
          <View style={cardStyles.titleRow}>
            <Text style={[cardStyles.title, { color: textColor }]} numberOfLines={1}>
              {entry.dest_label || entry.origin_label || "Tracked ride"}
            </Text>
            {isFreeRide && (
              <View style={cardStyles.freeTag}>
                <Text style={cardStyles.freeTagText}>FREE</Text>
              </View>
            )}
          </View>

          <Text style={[cardStyles.meta, { color: subColor }]}>
            {dateLabel} · {timeLabel} · {entry.role === "driver" ? "Driving" : "Riding"}
          </Text>

          <View style={cardStyles.statsRow}>
            <View style={cardStyles.stat}>
              <Ionicons name="navigate-outline" size={13} color={Colors.primary} />
              <Text style={[cardStyles.statText, { color: subColor }]}>
                {formatDistance(entry.distance_km)}
              </Text>
            </View>
            <View style={cardStyles.stat}>
              <Ionicons name="time-outline" size={13} color={Colors.primary} />
              <Text style={[cardStyles.statText, { color: subColor }]}>
                {formatDuration(entry.duration_seconds)}
              </Text>
            </View>
            {entry.fare > 0 && (
              <View style={cardStyles.stat}>
                <Ionicons name="cash-outline" size={13} color={Colors.gold} />
                <Text style={[cardStyles.statText, { color: subColor }]}>
                  {formatNaira(entry.fare)}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={cardStyles.trailing}>
          {entry.gps_validated ? (
            <Ionicons name="shield-checkmark" size={16} color={Colors.primary} />
          ) : (
            <Ionicons name="shield-outline" size={16} color={Colors.textTertiary} />
          )}
          <Ionicons name="chevron-forward" size={16} color={subColor} />
        </View>
      </Pressable>
    </Swipeable>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              12,
    padding:          12,
    borderRadius:     18,
    marginHorizontal: 16,
    marginBottom:     10,
    shadowColor:      "#000",
    shadowOffset:     { width: 0, height: 2 },
    shadowOpacity:    0.06,
    shadowRadius:     8,
    elevation:        2,
  },
  body:      { flex: 1, gap: 4 },
  titleRow:  { flexDirection: "row", alignItems: "center", gap: 8 },
  title:     { fontFamily: "Poppins_600SemiBold", fontSize: 15, flexShrink: 1 },
  freeTag: {
    backgroundColor:   "rgba(0,154,67,0.12)",
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      6,
  },
  freeTagText: {
    fontFamily:    "Poppins_700Bold",
    fontSize:      9,
    color:         Colors.primary,
    letterSpacing: 0.5,
  },
  meta:      { fontFamily: "Poppins_400Regular", fontSize: 12 },
  statsRow:  { flexDirection: "row", gap: 14, marginTop: 2 },
  stat:      { flexDirection: "row", alignItems: "center", gap: 4 },
  statText:  { fontFamily: "Poppins_500Medium", fontSize: 12 },
  trailing:  { alignItems: "center", gap: 6 },
  deleteBtn: {
    backgroundColor: Colors.error,
    justifyContent:  "center",
    alignItems:      "center",
    width:           72,
    marginBottom:    10,
    marginRight:     16,
    borderRadius:    18,
  },
});

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ isDark }: { isDark: boolean }) {
  const txt = isDark ? Colors.textWhite     : Colors.text;
  const sub = isDark ? Colors.textSecondary : Colors.textTertiary;
  return (
    <View style={emptyStyles.wrap}>
      <View style={emptyStyles.iconWrap}>
        <Ionicons name="map-outline" size={40} color={Colors.primary} />
      </View>
      <Text style={[emptyStyles.title, { color: txt }]}>No tracked rides yet</Text>
      <Text style={[emptyStyles.sub, { color: sub }]}>
        Trips and free rides you take with GPS on are recorded here, with the
        route, distance and time.
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

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function RouteHistoryScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useSettingsStore((s) => s.theme) === "dark";

  const bg        = isDark ? Colors.background : Colors.border;
  const cardBg    = isDark ? Colors.surface    : "#FFFFFF";
  const textColor = isDark ? Colors.textWhite  : Colors.text;
  const subColor  = isDark ? Colors.textSecondary : Colors.textTertiary;

  const { entries, loading, error, refresh, remove } = useRouteHistory();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

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

  const confirmDelete = useCallback(
    (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert("Delete this track?", "The recorded route will be removed. This can't be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => remove(id) },
      ]);
    },
    [remove],
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.root, { backgroundColor: bg }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: cardBg }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={textColor} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: textColor }]}>Route History</Text>
            <Text style={[styles.headerSub, { color: subColor }]}>
              {entries.length > 0
                ? `${formatDistance(totals.km)} · ${formatDuration(totals.seconds)} tracked`
                : "Your tracked rides"}
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {error && (
          <View style={styles.errorBar}>
            <Ionicons name="cloud-offline-outline" size={15} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
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
            <HistoryCard entry={item} onDelete={confirmDelete} isDark={isDark} />
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
    flexDirection:        "row",
    alignItems:           "center",
    paddingHorizontal:    16,
    paddingBottom:        16,
    borderBottomLeftRadius:  24,
    borderBottomRightRadius: 24,
  },
  backBtn:     { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter:{ flex: 1, alignItems: "center" },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 17 },
  headerSub:   { fontFamily: "Poppins_400Regular",  fontSize: 12, marginTop: 1 },

  errorBar: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               8,
    marginHorizontal:  16,
    marginTop:         12,
    paddingHorizontal: 12,
    paddingVertical:   10,
    borderRadius:      12,
    backgroundColor:   "rgba(178,34,34,0.10)",
  },
  errorText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.error, flex: 1 },

  list: { paddingTop: 16 },
});
