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
// Search is by USERNAME only. Badge IDs were removed from every typed search
// path (migration_user_privacy.sql): an ID is printed on a QR sticker and
// issued in a guessable pattern, so a searchable ID field is an index of every
// driver on the platform. A username is chosen, public by intent, and can be
// changed. Suggestions stream in as you type; the exact lookup still runs on
// submit, because a prefix search that happens to return one row is not the
// same as a match and silently opening a chat with "whoever ranked first" is
// how you message the wrong person.

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

/** Long enough that a word is one query, short enough to feel live. */
const SUGGEST_DEBOUNCE_MS = 300;

type SortKey = "relevance" | "name" | "recent";
type FilterKey = "all" | "online" | "same-park";

interface DriverPreview {
  id: string;
  full_name?: string;
  username?: string;
  driver_id?: string;
  vehicle_details?: string;
  park_name?: string;
  profile_photo?: string;
  conversationId: string;
}

interface Suggestion {
  id: string;
  full_name: string | null;
  username: string | null;
  role: string | null;
  profile_photo: string | null;
  vehicle_details: string | null;
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
  const searchUsersForChat = useMessagesStore((s) => s.searchUsersForChat);
  const { recents, remember, clear } = useRecentDriverSearches();

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<DriverPreview | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("relevance");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
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
          username: (driverUser as any).username ?? undefined,
          driver_id: driverUser.driver_id ?? undefined,
          vehicle_details: (driverUser as any).vehicle_details,
          park_name: (driverUser as any).park_name,
          profile_photo: (driverUser as any).profile_photo,
          conversationId: conversation.id,
        });
        remember(q);
        haptics.success();
      } catch (err: any) {
        setError(err?.message ?? "No account with that username. Check the spelling and try again.");
        haptics.error();
      } finally {
        setLoading(false);
      }
    },
    [query, user?.id, fetchConversationByDriverId, remember],
  );

  // ── Live suggestions ──────────────────────────────────────────────────────
  // Cancelling the timer on every keystroke means only the last pause in
  // typing reaches the database. `alive` covers the other race: a slow
  // response for "da" must not overwrite a fast one for "dani".
  useEffect(() => {
    const handle = query.trim().replace(/^@/, "");
    if (handle.length < 2) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      searchUsersForChat(handle)
        .then((rows) => {
          if (alive) setSuggestions(rows as unknown as Suggestion[]);
        })
        .catch(() => {
          if (alive) setSuggestions([]);
        });
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, searchUsersForChat]);

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
                placeholder="Username, e.g. @danieloky"
                placeholderTextColor={ios.secondaryLabel}
                style={[IOSFont.body, styles.input, { color: ios.label }]}
                autoCapitalize="none"
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

          {/* Live suggestions — shown while typing, before anything is submitted. */}
          {!preview && !loading && suggestions.length > 0 && (
            <View
              style={[
                styles.recentsCard,
                { backgroundColor: ios.secondarySystemGroupedBackground },
              ]}
            >
              {suggestions.map((sg, i) => (
                <Pressable
                  key={sg.id}
                  onPress={() => {
                    const handle = sg.username ?? "";
                    setQuery(handle);
                    runSearch(handle);
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
                  <Avatar
                    name={sg.full_name ?? sg.username ?? "?"}
                    photoUri={sg.profile_photo ?? undefined}
                    size={32}
                  />
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={[IOSFont.subheadline, { color: ios.label }]} numberOfLines={1}>
                      @{sg.username}
                    </Text>
                    <Text
                      style={[IOSFont.caption1, { color: ios.secondaryLabel }]}
                      numberOfLines={1}
                    >
                      {[sg.full_name, sg.role === "driver" ? sg.vehicle_details : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  <SymbolView
                    name="chevron.right"
                    size={12}
                    tintColor={ios.tertiaryLabel}
                    fallback={null}
                  />
                </Pressable>
              ))}
            </View>
          )}

          {/* Recents — the empty state that isn't empty. */}
          {!preview && !loading && !error && suggestions.length === 0 && (
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
                    Find someone by username
                  </Text>
                  <Text
                    style={[
                      IOSFont.subheadline,
                      { color: ios.secondaryLabel, textAlign: "center", marginTop: 4 },
                    ]}
                  >
                    Type a username to see suggestions. Scanning a QR code still
                    works for drivers you meet in person.
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
