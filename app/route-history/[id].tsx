// app/route-history/[id].tsx
//
// Detail view of one recorded GPS track: the full route on a map plus the
// distance / duration / speed breakdown, and a shortcut to bookmark it as a
// saved route for re-booking.

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useRouteHistoryEntry, regionForPath } from "@/src/hooks/useRouteHistory";
import { useSavedRoutes } from "@/src/hooks/useSavedRoutes";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { MAP_PROVIDER } from "@/src/utils/maps";
import { Colors } from "@/constants/colors";
import { iosAlert } from "@/components/ios";
import {
  formatDistance,
  formatDuration,
  formatNaira,
  formatDateTime,
} from "@/src/utils/helpers";

// ─── Stat tile ───────────────────────────────────────────────────────────────

function Stat({
  icon,
  label,
  value,
  tint,
  isDark,
}: {
  icon:   keyof typeof Ionicons.glyphMap;
  label:  string;
  value:  string;
  tint?:  string;
  isDark: boolean;
}) {
  return (
    <View
      style={[
        statStyles.tile,
        { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#F4F6F5" },
      ]}
    >
      <Ionicons name={icon} size={16} color={tint ?? Colors.primary} />
      <Text style={[statStyles.value, { color: isDark ? Colors.textWhite : Colors.text }]}>
        {value}
      </Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  tile: {
    flex:           1,
    minWidth:       92,
    borderRadius:   16,
    paddingVertical:14,
    alignItems:     "center",
    gap:            4,
  },
  value: { fontFamily: "Poppins_700Bold", fontSize: 16 },
  label: {
    fontFamily:    "Poppins_500Medium",
    fontSize:      10,
    color:         Colors.textTertiary,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function RouteHistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const isDark = useSettingsStore((s) => s.theme) === "dark";

  const { entry, loading } = useRouteHistoryEntry(id);
  const { saveRoute, saving } = useSavedRoutes();
  const [bookmarked, setBookmarked] = useState(false);

  const mapRef = useRef<MapView>(null);

  const bg        = isDark ? Colors.background : Colors.border;
  const cardBg    = isDark ? Colors.surface    : "#FFFFFF";
  const textColor = isDark ? Colors.textWhite  : Colors.text;
  const subColor  = isDark ? Colors.textSecondary : Colors.textTertiary;

  const path   = entry?.path ?? [];
  const region = useMemo(() => regionForPath(path), [path]);

  const fitPath = useCallback(() => {
    if (path.length < 2) return;
    mapRef.current?.fitToCoordinates(path, {
      edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
      animated:    true,
    });
  }, [path]);

  const handleBookmark = useCallback(async () => {
    if (!entry || path.length < 2) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const saved = await saveRoute({
      origin_lat:   path[0].latitude,
      origin_lng:   path[0].longitude,
      origin_label: entry.origin_label ?? undefined,
      dest_lat:     path[path.length - 1].latitude,
      dest_lng:     path[path.length - 1].longitude,
      dest_label:   entry.dest_label ?? undefined,
      distance_km:  entry.distance_km,
      base_fare:    entry.fare,
    });

    if (saved) {
      setBookmarked(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      iosAlert("Couldn't save", "This route wasn't bookmarked. Please try again.");
    }
  }, [entry, path, saveRoute]);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: bg }]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={[styles.centered, { backgroundColor: bg, paddingHorizontal: 40 }]}>
        <Ionicons name="alert-circle-outline" size={40} color={Colors.textTertiary} />
        <Text style={[styles.missingTitle, { color: textColor }]}>Track not found</Text>
        <Text style={[styles.missingSub, { color: subColor }]}>
          It may have been deleted, or it belongs to another account.
        </Text>
        <Pressable style={styles.missingBtn} onPress={() => router.back()}>
          <Text style={styles.missingBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Map */}
      <View style={styles.mapWrap}>
        {region ? (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            provider={MAP_PROVIDER}
            initialRegion={region}
            onMapReady={fitPath}
            showsUserLocation={false}
            showsMyLocationButton={false}
            toolbarEnabled={false}
          >
            {path.length > 1 && (
              <Polyline
                coordinates={path}
                strokeColor={Colors.primary}
                strokeWidth={5}
                lineCap="round"
                lineJoin="round"
              />
            )}
            {path.length > 0 && (
              <Marker coordinate={path[0]} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={[styles.pin, { backgroundColor: Colors.primary }]} />
              </Marker>
            )}
            {path.length > 1 && (
              <Marker coordinate={path[path.length - 1]} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={[styles.pin, styles.pinEnd]} />
              </Marker>
            )}
          </MapView>
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.noPath]}>
            <Ionicons name="location-outline" size={32} color={Colors.textTertiary} />
            <Text style={[styles.noPathText, { color: subColor }]}>
              No GPS points were recorded for this ride.
            </Text>
          </View>
        )}

        <Pressable
          style={[styles.floatingBack, { top: topPadding + 8 }]}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>

        {region && (
          <Pressable style={[styles.recenter, { top: topPadding + 8 }]} onPress={fitPath} hitSlop={8}>
            <Ionicons name="scan-outline" size={18} color="#fff" />
          </Pressable>
        )}
      </View>

      {/* Detail sheet */}
      <ScrollView
        style={[styles.sheet, { backgroundColor: cardBg }]}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
              {entry.dest_label || entry.origin_label || "Tracked ride"}
            </Text>
            <Text style={[styles.subtitle, { color: subColor }]}>
              {formatDateTime(entry.started_at)} ·{" "}
              {entry.role === "driver" ? "Driving" : "Riding"}
            </Text>
          </View>

          <View
            style={[
              styles.badge,
              entry.gps_validated ? styles.badgeOk : styles.badgeWarn,
            ]}
          >
            <Ionicons
              name={entry.gps_validated ? "shield-checkmark" : "shield-outline"}
              size={13}
              color={entry.gps_validated ? Colors.primary : Colors.textTertiary}
            />
            <Text
              style={[
                styles.badgeText,
                { color: entry.gps_validated ? Colors.primary : Colors.textTertiary },
              ]}
            >
              {entry.gps_validated ? "GPS verified" : "Unverified"}
            </Text>
          </View>
        </View>

        {entry.context === "free_ride" && (
          <View style={styles.freeBanner}>
            <Ionicons name="gift-outline" size={16} color={Colors.primary} />
            <Text style={styles.freeBannerText}>
              Free ride — tracking is compulsory and this record backs the driver's fuel reward.
            </Text>
          </View>
        )}

        <View style={styles.statsGrid}>
          <Stat icon="navigate-outline" label="Distance" value={formatDistance(entry.distance_km)} isDark={isDark} />
          <Stat icon="time-outline"     label="Duration" value={formatDuration(entry.duration_seconds)} isDark={isDark} />
          <Stat
            icon="speedometer-outline"
            label="Avg speed"
            value={`${Math.round(entry.avg_speed_kmh)} km/h`}
            isDark={isDark}
          />
          <Stat
            icon="flash-outline"
            label="Top speed"
            value={`${Math.round(entry.max_speed_kmh)} km/h`}
            tint={Colors.gold}
            isDark={isDark}
          />
        </View>

        {entry.fare > 0 && (
          <View style={[styles.fareRow, { borderColor: isDark ? "rgba(255,255,255,0.08)" : Colors.border }]}>
            <Text style={[styles.fareLabel, { color: subColor }]}>Fare recorded</Text>
            <Text style={styles.fareValue}>{formatNaira(entry.fare)}</Text>
          </View>
        )}

        <Text style={[styles.pointsNote, { color: subColor }]}>
          {entry.point_count} GPS fix{entry.point_count === 1 ? "" : "es"} accepted ·{" "}
          {path.length} plotted
        </Text>

        {path.length > 1 &&
          (bookmarked ? (
            <View style={styles.savedRow}>
              <Ionicons name="bookmark" size={16} color={Colors.primary} />
              <Text style={styles.savedText}>Saved to your routes</Text>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.bookmarkBtn, pressed && { opacity: 0.85 }]}
              onPress={handleBookmark}
              disabled={saving}
            >
              <Ionicons name="bookmark-outline" size={17} color={Colors.primary} />
              <Text style={styles.bookmarkText}>
                {saving ? "Saving…" : "Save as a route"}
              </Text>
            </Pressable>
          ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },

  missingTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 17 },
  missingSub:   { fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", lineHeight: 20 },
  missingBtn: {
    marginTop:        10,
    paddingHorizontal:20,
    paddingVertical:  10,
    borderRadius:     12,
    backgroundColor:  Colors.primary,
  },
  missingBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },

  mapWrap: { height: "45%", backgroundColor: "#0f1b14" },
  noPath:  { alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 40 },
  noPathText: { fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center" },

  pin: {
    width:        16,
    height:       16,
    borderRadius: 8,
    borderWidth:  3,
    borderColor:  "rgba(255,255,255,0.9)",
  },
  pinEnd: { backgroundColor: "#fff", borderColor: Colors.primary },

  floatingBack: {
    position:        "absolute",
    left:            16,
    width:           38,
    height:          38,
    borderRadius:    12,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems:      "center",
    justifyContent:  "center",
  },
  recenter: {
    position:        "absolute",
    right:           16,
    width:           38,
    height:          38,
    borderRadius:    12,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems:      "center",
    justifyContent:  "center",
  },

  sheet: {
    flex:                 1,
    marginTop:            -24,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
  },

  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  title:    { fontFamily: "Poppins_700Bold", fontSize: 19 },
  subtitle: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },

  badge: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               5,
    paddingHorizontal: 10,
    paddingVertical:   6,
    borderRadius:      10,
    borderWidth:       1,
  },
  badgeOk:   { backgroundColor: "rgba(0,154,67,0.10)", borderColor: "rgba(0,154,67,0.30)" },
  badgeWarn: { backgroundColor: "rgba(156,163,175,0.12)", borderColor: "rgba(156,163,175,0.3)" },
  badgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },

  freeBanner: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               10,
    padding:           12,
    borderRadius:      14,
    backgroundColor:   "rgba(0,154,67,0.08)",
    borderWidth:       1,
    borderColor:       "rgba(0,154,67,0.20)",
  },
  freeBannerText: {
    flex:       1,
    fontFamily: "Poppins_400Regular",
    fontSize:   12,
    lineHeight: 18,
    color:      Colors.primary,
  },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  fareRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    paddingTop:     14,
    borderTopWidth: 1,
  },
  fareLabel: { fontFamily: "Poppins_400Regular",  fontSize: 13 },
  fareValue: { fontFamily: "Poppins_700Bold",     fontSize: 18, color: Colors.gold },

  pointsNote: { fontFamily: "Poppins_400Regular", fontSize: 11 },

  bookmarkBtn: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            8,
    paddingVertical:14,
    borderRadius:   14,
    borderWidth:    1.5,
    borderColor:    Colors.primary,
  },
  bookmarkText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.primary },

  savedRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            7,
    paddingVertical:14,
  },
  savedText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.primary },
});
