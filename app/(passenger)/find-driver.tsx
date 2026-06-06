// app/(passenger)/find-driver.tsx
//
// Global driver search — passengers search by driver badge ID (e.g. "chidio")
// or partial name.  Results show photo, name, vehicle, city.
// "Message" button opens a direct chat via the existing messages store.

import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  Platform,
  Alert,
  Keyboard,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { supabase } from "@/src/services/supabase";
import { useAuthStore } from "@/src/store/useStore";
import { useMessagesStore } from "@/src/store/useMessagesStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { Colors } from "@/constants/colors";
import { getInitials } from "@/src/utils/helpers";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DriverResult {
  id:              string;
  full_name:       string | null;
  driver_id:       string | null;
  profile_photo:   string | null;
  vehicle_details: string | null;
  park_name:       string | null;
  park_location:   string | null;
  avg_rating:      number | null;
}

// ─── Avatar with initials fallback ───────────────────────────────────────────

function DriverAvatar({ photo, name, size = 52 }: { photo?: string | null; name: string; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  if (photo && !imgFailed) {
    return (
      <Image
        source={{ uri: photo }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <View style={[
      avatarStyles.fallback,
      { width: size, height: size, borderRadius: size / 2 },
    ]}>
      <Text style={avatarStyles.initials}>{getInitials(name || "?")}</Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  fallback: { backgroundColor: Colors.primaryDark, alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#fff" },
});

// ─── Star rating display ──────────────────────────────────────────────────────

function StarRating({ value }: { value: number | null }) {
  if (!value) return <Text style={ratingStyles.noRating}>New driver</Text>;
  const stars = Math.round(value);
  return (
    <View style={ratingStyles.row}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < stars ? "star" : "star-outline"}
          size={11}
          color={i < stars ? Colors.gold : Colors.textTertiary}
        />
      ))}
      <Text style={ratingStyles.value}>{value.toFixed(1)}</Text>
    </View>
  );
}

const ratingStyles = StyleSheet.create({
  row:      { flexDirection: "row", alignItems: "center", gap: 2 },
  value:    { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.textSecondary, marginLeft: 3 },
  noRating: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textTertiary },
});

// ─── Driver result card ───────────────────────────────────────────────────────

function DriverCard({
  driver,
  onMessage,
  isSelf,
  isDark,
}: {
  driver:    DriverResult;
  onMessage: (d: DriverResult) => void;
  isSelf:    boolean;
  isDark:    boolean;
}) {
  const cardBg   = isDark ? Colors.surface    : "#FFFFFF";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor  = isDark ? Colors.textSecondary : Colors.textTertiary;

  return (
    <View style={[cardStyles.card, { backgroundColor: cardBg }]}>
      <View style={cardStyles.left}>
        <DriverAvatar photo={driver.profile_photo} name={driver.full_name || "Driver"} />
        {/* Online dot placeholder — replace with realtime presence if needed */}
        <View style={cardStyles.onlineDot} />
      </View>

      <View style={cardStyles.info}>
        <Text style={[cardStyles.name, { color: textColor }]} numberOfLines={1}>
          {driver.full_name || "Driver"}
        </Text>

        <View style={cardStyles.badgeRow}>
          <View style={cardStyles.idBadge}>
            <Ionicons name="id-card-outline" size={11} color={Colors.primary} />
            <Text style={cardStyles.idText}>{driver.driver_id}</Text>
          </View>
          <StarRating value={driver.avg_rating} />
        </View>

        {driver.vehicle_details ? (
          <Text style={[cardStyles.detail, { color: subColor }]} numberOfLines={1}>
            🚗 {driver.vehicle_details}
          </Text>
        ) : null}

        {(driver.park_name || driver.park_location) ? (
          <Text style={[cardStyles.detail, { color: subColor }]} numberOfLines={1}>
            📍 {driver.park_name || driver.park_location}
          </Text>
        ) : null}
      </View>

      {!isSelf && (
        <Pressable
          style={({ pressed }) => [
            cardStyles.msgBtn,
            pressed && { opacity: 0.8 },
          ]}
          onPress={() => onMessage(driver)}
        >
          <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
          <Text style={cardStyles.msgBtnText}>Message</Text>
        </Pressable>
      )}
    </View>
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
    shadowOpacity:  0.07,
    shadowRadius:   8,
    elevation:      2,
  },
  left:     { position: "relative" },
  onlineDot:{
    position:    "absolute",
    bottom:      2,
    right:       2,
    width:       11,
    height:      11,
    borderRadius:6,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: "#fff",
  },
  info:     { flex: 1, gap: 3 },
  name:     { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  idBadge:  {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             3,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical:   3,
    borderRadius:    8,
  },
  idText:   { fontFamily: "Poppins_700Bold", fontSize: 11, color: Colors.primaryDark, letterSpacing: 0.5 },
  detail:   { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 18 },
  msgBtn:   {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              5,
    backgroundColor:  Colors.primary,
    paddingHorizontal:12,
    paddingVertical:   9,
    borderRadius:     12,
    shadowColor:      Colors.primary,
    shadowOffset:     { width: 0, height: 3 },
    shadowOpacity:    0.3,
    shadowRadius:     6,
    elevation:        4,
  },
  msgBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#fff" },
});

// ─── Empty / idle states ──────────────────────────────────────────────────────

function EmptyState({ query, searched, isDark }: { query: string; searched: boolean; isDark: boolean }) {
  const sub = isDark ? Colors.textSecondary : Colors.textTertiary;
  const txt = isDark ? Colors.textWhite : Colors.text;

  if (!searched) {
    return (
      <View style={emptyStyles.wrap}>
        <View style={emptyStyles.iconWrap}>
          <Ionicons name="search" size={40} color={Colors.primary} />
        </View>
        <Text style={[emptyStyles.title, { color: txt }]}>Find a Driver</Text>
        <Text style={[emptyStyles.sub, { color: sub }]}>
          {`Enter a driver badge ID (e.g. "chidio") or part of their name.`}
        </Text>
      </View>
    );
  }
  return (
    <View style={emptyStyles.wrap}>
      <Text style={[emptyStyles.title, { color: txt }]}>No drivers found</Text>
      <Text style={[emptyStyles.sub, { color: sub }]}>
        {`No results for "{query}". Check the ID or try a different name.`}
      </Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  wrap:     { alignItems: "center", paddingTop: 80, paddingHorizontal: 40, gap: 12 },
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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function FindDriverScreen() {
  const insets = useSafeAreaInsets();
  const { user }                             = useAuthStore();
  const { fetchConversationByDriverId }      = useMessagesStore();
  const { theme }                            = useSettingsStore();
  const isDark                               = theme === "dark";

  const bg        = isDark ? Colors.background   : Colors.border;
  const cardBg    = isDark ? Colors.surface      : "#FFFFFF";
  const textColor = isDark ? Colors.textWhite    : Colors.text;
  const subColor  = isDark ? Colors.textSecondary: Colors.textTertiary;
  const inputBg   = isDark ? Colors.surface      : "#FFFFFF";

  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState<DriverResult[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [searched,  setSearched]  = useState(false);
  const [messaging, setMessaging] = useState<string | null>(null); // driver.id while opening chat

  const inputRef = useRef<TextInput>(null);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setResults([]); setSearched(false); return; }

    setLoading(true);
    Keyboard.dismiss();

    try {
      // Try the RPC first (fast path with DB index)
      const { data: rpcData, error: rpcErr } = await supabase
        .rpc("search_drivers", { query: trimmed });

      if (!rpcErr && rpcData) {
        setResults(rpcData as DriverResult[]);
      } else {
        // Fallback: direct table query (RPC may not exist yet on older migrations)
        const { data, error } = await supabase
          .from("users")
          .select("id, full_name, driver_id, profile_photo, vehicle_details, park_name, park_location, avg_rating")
          .eq("role", "driver")
          .or(`driver_id.ilike.%${trimmed}%,full_name.ilike.%${trimmed}%`)
          .limit(20);

        if (!error && data) setResults(data as DriverResult[]);
        else setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, []);

  const handleMessage = useCallback(
    async (driver: DriverResult) => {
      if (!user?.id || !driver.driver_id) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setMessaging(driver.id);

      try {
        const { conversation } = await fetchConversationByDriverId(
          driver.driver_id,
          user.id,
        );

        router.push({
          pathname: "/direct-chat/[conversationId]",
          params: {
            conversationId: conversation.id,
            driverName:     driver.full_name ?? "Driver",
            driverId:       driver.driver_id ?? "",
          },
        });
      } catch (err: any) {
        Alert.alert("Couldn't open chat", err?.message ?? "Please try again.");
      } finally {
        setMessaging(null);
      }
    },
    [user?.id, fetchConversationByDriverId],
  );

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: cardBg }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={textColor} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Find a Driver</Text>
          <Text style={[styles.headerSub, { color: subColor }]}>
            Search by badge ID or name
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Search bar ── */}
      <View style={[styles.searchWrap, { backgroundColor: cardBg, borderBottomColor: isDark ? "rgba(255,255,255,0.06)" : "#E8ECF0" }]}>
        <View style={[styles.searchRow, { backgroundColor: inputBg, borderColor: isDark ? "rgba(255,255,255,0.1)" : "#E8ECF0" }]}>
          <Ionicons name="search" size={18} color={Colors.textSecondary} />
          <TextInput
            ref={inputRef}
            style={[styles.searchInput, { color: textColor }]}
            placeholder='Driver ID (e.g. "chidio") or name'
            placeholderTextColor={subColor}
            value={query}
            onChangeText={(v) => { setQuery(v); if (!v.trim()) { setResults([]); setSearched(false); } }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => doSearch(query)}
          />
          {query.length > 0 && (
            <Pressable
              hitSlop={8}
              onPress={() => { setQuery(""); setResults([]); setSearched(false); inputRef.current?.focus(); }}
            >
              <Ionicons name="close-circle" size={18} color={subColor} />
            </Pressable>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.searchBtn,
            { opacity: !query.trim() || loading ? 0.55 : pressed ? 0.8 : 1 },
          ]}
          onPress={() => doSearch(query)}
          disabled={!query.trim() || loading}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.searchBtnText}>Search</Text>
          }
        </Pressable>
      </View>

      {/* ── Results ── */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View style={{ opacity: messaging === item.id ? 0.6 : 1 }}>
            <DriverCard
              driver={item}
              onMessage={handleMessage}
              isSelf={item.id === user?.id}
              isDark={isDark}
            />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState query={query} searched={searched} isDark={isDark} />
        }
        ListFooterComponent={<View style={{ height: 80 + insets.bottom }} />}
      />
    </View>
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
  backBtn: {
    width:        36,
    height:       36,
    borderRadius: 12,
    alignItems:   "center",
    justifyContent:"center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle:  { fontFamily: "Poppins_700Bold",    fontSize: 18 },
  headerSub:    { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },

  searchWrap: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            10,
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: 1,
  },
  searchRow: {
    flex:            1,
    flexDirection:   "row",
    alignItems:      "center",
    gap:             10,
    borderRadius:    14,
    paddingHorizontal:14,
    paddingVertical:  11,
    borderWidth:     1,
  },
  searchInput: {
    flex:       1,
    fontFamily: "Poppins_400Regular",
    fontSize:   14,
    padding:    0,
  },
  searchBtn: {
    backgroundColor:  Colors.primary,
    borderRadius:     14,
    paddingHorizontal:16,
    paddingVertical:   11,
  },
  searchBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize:   14,
    color:      "#fff",
  },

  list: {
    padding: 16,
    gap:     12,
  },
});