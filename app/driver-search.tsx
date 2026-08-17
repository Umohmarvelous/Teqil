// app/driver-search.tsx
//
// Full-screen driver search, opened by the header's search icon.
//
// The transition is a shared-element expand: the caller measures the icon on
// screen and passes its rect as params, and the search field here starts as a
// circle at exactly that spot, then grows horizontally into a full-width bar.
// That's what makes the icon feel like it BECAME the field, rather than a new
// screen simply appearing over it — done by hand because React Navigation has no
// built-in shared-element transition.
//
// Search is by driver badge ID (the same lookup the old modal used), with
// filter + sort controls and recent searches alongside it.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Keyboard,
  Platform,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
  Easing,
  runOnJS,
} from "react-native-reanimated";

import {
  Glass,
  IOSButton,
  iosActionSheet,
  useIOSTheme,
  IOSFont,
  IOSMetrics,
  type IOSPalette,
} from "@/components/ios";
import { useAuthStore } from "@/src/store/useStore";
import { useMessagesStore } from "@/src/store/useMessagesStore";
import { useRecentDriverSearches } from "@/src/hooks/useRecentDriverSearches";
import { haptics } from "@/src/utils/haptics";
import Avatar from "@/components/Avatar";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { X } from "@hugeicons/core-free-icons";

/** Matches the expand animation's feel: quick, decelerating, no bounce. */
const EXPAND = { duration: 340, easing: Easing.bezier(0.2, 0.9, 0.25, 1) };
const FIELD_HEIGHT = 38;

type SortKey = "relevance" | "name" | "recent";
type FilterKey = "all" | "online" | "same-park";

interface DriverPreview {
  id: string;
  full_name?: string;
  driver_id?: string;
  vehicle_details?: string;
  park_name?: string;
  profile_photo?: string;
  conversationId: string;
}

// ─── Chips ───────────────────────────────────────────────────────────────────

function Chip({
  label,
  symbol,
  active,
  ios,
  onPress,
}: {
  label: string;
  symbol?: string;
  active?: boolean;
  ios: IOSPalette;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? ios.tint : ios.tertiarySystemFill,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      {symbol && (
        <SymbolView
          name={symbol as never}
          size={12}
          tintColor={active ? "#FFFFFF" : ios.secondaryLabel}
          fallback={null}
        />
      )}
      <Text
        style={[IOSFont.footnote, { color: active ? "#FFFFFF" : ios.label, fontWeight: "600" }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function DriverSearchScreen() {
  // Rect of the icon that opened us, so the field can grow out of it.
  const { x, y, w, h } = useLocalSearchParams<{
    x?: string;
    y?: string;
    w?: string;
    h?: string;
  }>();

  const insets = useSafeAreaInsets();
  const ios = useIOSTheme();
  const { width: screenW } = useWindowDimensions();

  const user = useAuthStore((s) => s.user);
  const fetchConversationByDriverId = useMessagesStore((s) => s.fetchConversationByDriverId);
  const { recents, remember, clear } = useRecentDriverSearches();

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<DriverPreview | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("relevance");
  const [filter, setFilter] = useState<FilterKey>("all");

  const inputRef = React.useRef<TextInput>(null);

  // ── Expand transition ─────────────────────────────────────────────────────
  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const barTop = topPad + 6;
  const barLeft = IOSMetrics.groupedInset;
  const barWidth = screenW - IOSMetrics.groupedInset * 2 - 62; // room for Cancel

  // Fall back to a sensible origin if the caller didn't measure.
  const originX = Number(x ?? screenW - 60);
  const originY = Number(y ?? barTop);
  const originW = Number(w ?? 38);
  const originH = Number(h ?? 38);

  const t = useSharedValue(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    t.value = withTiming(1, EXPAND, (finished) => {
      if (finished) runOnJS(setExpanded)(true);
    });
  }, [t]);

  // Focus only once the field has finished growing — raising the keyboard
  // mid-animation makes the expand stutter.
  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  const fieldStyle = useAnimatedStyle(() => ({
    left: interpolate(t.value, [0, 1], [originX, barLeft], Extrapolation.CLAMP),
    top: interpolate(t.value, [0, 1], [originY, barTop], Extrapolation.CLAMP),
    width: interpolate(t.value, [0, 1], [originW, barWidth], Extrapolation.CLAMP),
    height: interpolate(t.value, [0, 1], [originH, FIELD_HEIGHT], Extrapolation.CLAMP),
    borderRadius: interpolate(t.value, [0, 1], [originW / 2, 10], Extrapolation.CLAMP),
  }));

  // Everything below the bar fades in once the expand is most of the way there.
  const bodyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.55, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const cancelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.6, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const close = useCallback(() => {
    haptics.tap();
    Keyboard.dismiss();
    // Reverse the expand, then pop.
    t.value = withTiming(0, { ...EXPAND, duration: 260 }, (finished) => {
      if (finished) runOnJS(router.back)();
    });
  }, [t]);

  // ── Search ────────────────────────────────────────────────────────────────
  const runSearch = useCallback(
    async (raw?: string) => {
      const q = (raw ?? query).trim();
      if (!q) return;
      if (!user?.id) {
        setError("Please sign in first.");
        return;
      }

      Keyboard.dismiss();
      haptics.tap();
      setLoading(true);
      setPreview(null);
      setError("");

      try {
        const { driverUser, conversation } = await fetchConversationByDriverId(q, user.id);
        setPreview({
          id: driverUser.id,
          full_name: driverUser.full_name ?? undefined,
          driver_id: driverUser.driver_id ?? undefined,
          vehicle_details: (driverUser as any).vehicle_details,
          park_name: (driverUser as any).park_name,
          profile_photo: (driverUser as any).profile_photo,
          conversationId: conversation.id,
        });
        remember(q);
        haptics.success();
      } catch (err: any) {
        setError(err?.message ?? "Driver not found. Check the ID and try again.");
        haptics.error();
      } finally {
        setLoading(false);
      }
    },
    [query, user?.id, fetchConversationByDriverId, remember],
  );

  const openChat = useCallback(() => {
    if (!preview) return;
    haptics.press();
    router.push({
      pathname: "/direct-chat/[conversationId]",
      params: {
        conversationId: preview.conversationId,
        driverName: preview.full_name ?? "Driver",
        driverId: preview.driver_id ?? "",
      },
    });
  }, [preview]);

  const chooseSort = useCallback(() => {
    haptics.tap();
    iosActionSheet("Sort results", undefined, [
      { text: "Best match", onPress: () => setSort("relevance") },
      { text: "Name (A–Z)", onPress: () => setSort("name") },
      { text: "Recently searched", onPress: () => setSort("recent") },
      { text: "Cancel", style: "cancel" },
    ]);
  }, []);

  const sortLabel = useMemo(
    () => ({ relevance: "Best match", name: "Name", recent: "Recent" }[sort]),
    [sort],
  );

  return (
    <View style={[styles.root, { backgroundColor: ios.systemGroupedBackground }]}>
      <StatusBar style={ios.scheme === "dark" ? "light" : "dark"} />

      {/* Expanding search field */}
      <Animated.View style={[styles.field, fieldStyle]}>
        {/* Same material as IOSSearchBar. The parent's animated borderRadius
            clips it, so the surface morphs with the expand. */}
        <Glass
          variant="regular"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={40}
          fallbackTint={ios.tertiarySystemFill}
        />

        <View style={styles.fieldInner}>
          <SymbolView
            name="magnifyingglass"
            size={15}
            tintColor={ios.secondaryLabel}
            fallback={null}
          />
          {expanded && (
            <>
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                placeholder="Driver ID, e.g. EMG-4821"
                placeholderTextColor={ios.secondaryLabel}
                style={[IOSFont.body, styles.input, { color: ios.label }]}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => runSearch()}
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear">
                  <SymbolView
                    name="xmark.circle.fill"
                    size={16}
                    tintColor={ios.tertiaryLabel}
                    fallback={null}
                  />
                </Pressable>
              )}
            </>
          )}
        </View>
      </Animated.View>

      <Animated.View style={[styles.cancel, { top: barTop, height: FIELD_HEIGHT }, cancelStyle]}>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button">
          <Text style={[IOSFont.body, { color: ios.tint }]}>Cancel</Text>
          {/* <HugeiconsIcon icon={X} size={17} color={ios.label}/> */}
        </Pressable>
      </Animated.View>

      {/* Body */}
      <Animated.View style={[styles.body, { paddingTop: barTop + FIELD_HEIGHT + 12 }, bodyStyle]}>
        {/* Filter + sort.
            NOTE: the underlying lookup is an exact badge-ID match returning at
            most one driver, so these currently have nothing to act on. They're
            wired to real state and ready for a browse/list query (e.g. drivers
            at a park, or online now) — until that exists they only narrow a
            single result. Don't mistake them for working filters. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <Chip label="All" active={filter === "all"} ios={ios} onPress={() => setFilter("all")} />
          <Chip
            label="Online now"
            symbol="dot.radiowaves.left.and.right"
            active={filter === "online"}
            ios={ios}
            onPress={() => setFilter("online")}
          />
          <Chip
            label="My park"
            symbol="building.2"
            active={filter === "same-park"}
            ios={ios}
            onPress={() => setFilter("same-park")}
          />
          <Chip
            label={sortLabel}
            symbol="arrow.up.arrow.down"
            ios={ios}
            onPress={chooseSort}
          />
        </ScrollView>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {loading && (
            <View style={styles.center}>
              <ActivityIndicator color={ios.tint} />
            </View>
          )}

          {!!error && !loading && (
            <View style={[styles.card, { backgroundColor: ios.secondarySystemGroupedBackground }]}>
              <SymbolView
                name="exclamationmark.triangle.fill"
                size={20}
                tintColor={ios.systemOrange}
                fallback={null}
              />
              <Text style={[IOSFont.subheadline, { color: ios.label, flex: 1 }]}>{error}</Text>
            </View>
          )}

          {preview && !loading && (
            <View style={[styles.card, { backgroundColor: ios.secondarySystemGroupedBackground }]}>
              <Avatar
                name={preview.full_name ?? "Driver"}
                photoUri={preview.profile_photo}
                size={48}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[IOSFont.headline, { color: ios.label }]} numberOfLines={1}>
                  {preview.full_name ?? "Driver"}
                </Text>
                <Text style={[IOSFont.footnote, { color: ios.secondaryLabel }]} numberOfLines={1}>
                  {[preview.driver_id, preview.vehicle_details, preview.park_name]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <IOSButton title="Message" variant="tinted" size="small" onPress={openChat} />
            </View>
          )}

          {/* Recents — the empty state that isn't empty. */}
          {!preview && !loading && !error && (
            <View style={styles.recents}>
              <View style={styles.recentsHead}>
                <Text style={[IOSFont.footnote, { color: ios.secondaryLabel, letterSpacing: 0.5 }]}>
                  {recents.length ? "RECENT SEARCHES" : ""}
                </Text>
                {recents.length > 0 && (
                  <Pressable onPress={clear} hitSlop={8}>
                    <Text style={[IOSFont.footnote, { color: ios.tint }]}>Clear</Text>
                  </Pressable>
                )}
              </View>

              {recents.length === 0 ? (
                <View style={styles.center}>
                  <SymbolView
                    name="person.badge.key"
                    size={44}
                    tintColor={ios.tertiaryLabel}
                    fallback={null}
                  />
                  <Text style={[IOSFont.headline, { color: ios.label, marginTop: 10 }]}>
                    Find a driver
                  </Text>
                  <Text
                    style={[
                      IOSFont.subheadline,
                      { color: ios.secondaryLabel, textAlign: "center", marginTop: 4 },
                    ]}
                  >
                    Enter the badge ID shown on the driver&apos;s QR code or vehicle.
                  </Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.recentsCard,
                    { backgroundColor: ios.secondarySystemGroupedBackground },
                  ]}
                >
                  {recents.map((r, i) => (
                    <Pressable
                      key={r}
                      onPress={() => {
                        setQuery(r);
                        runSearch(r);
                      }}
                      style={({ pressed }) => [
                        styles.recentRow,
                        pressed && { backgroundColor: ios.systemFill },
                      ]}
                    >
                      {i > 0 && (
                        <View
                          style={[styles.sep, { backgroundColor: ios.separator }]}
                          pointerEvents="none"
                        />
                      )}
                      <SymbolView
                        name="clock.arrow.circlepath"
                        size={15}
                        tintColor={ios.secondaryLabel}
                        fallback={null}
                      />
                      <Text style={[IOSFont.body, { color: ios.label, flex: 1 }]}>{r}</Text>
                      <SymbolView
                        name="arrow.up.left"
                        size={13}
                        tintColor={ios.tertiaryLabel}
                        fallback={null}
                      />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  field: {
    position: "absolute",
    overflow: "hidden",
    justifyContent: "center",
    zIndex: 10,
  },
  fieldInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    height: "100%",
  },
  input: { flex: 1, padding: 0, height: "100%" },
  cancel: {
    position: "absolute",
    right: IOSMetrics.groupedInset,
    justifyContent: "center",
    zIndex: 10,
  },
  body: { flex: 1 },

  chipRow: { gap: 8, paddingHorizontal: IOSMetrics.groupedInset, paddingBottom: 12 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },

  center: { alignItems: "center", paddingTop: 60, paddingHorizontal: 44 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: IOSMetrics.groupedInset,
    padding: 14,
    borderRadius: IOSMetrics.groupedRadius,
  },

  recents: { flex: 1 },
  recentsHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: IOSMetrics.groupedInset + 4,
    paddingBottom: 6,
    minHeight: 18,
  },
  recentsCard: {
    marginHorizontal: IOSMetrics.groupedInset,
    borderRadius: IOSMetrics.groupedRadius,
    overflow: "hidden",
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    minHeight: IOSMetrics.minTouchTarget,
  },
  sep: { position: "absolute", top: 0, left: 40, right: 0, height: IOSMetrics.hairline },
});
