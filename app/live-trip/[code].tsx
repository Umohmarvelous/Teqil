import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, Platform,
  Alert, Dimensions, TextInput, KeyboardAvoidingView, Modal,
  ActivityIndicator, TouchableOpacity,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence,
  withTiming, withSpring, interpolate, Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { LinearGradient } from "expo-linear-gradient";
import { useAuthStore, useTripStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { TripsStorage, PassengersStorage } from "@/src/services/storage";
import { syncAll } from "@/src/services/sync";
import { askAI, QUICK_ACTIONS, type AIContext, type AIResponse } from "@/src/services/ai";
import { formatCoins, formatDuration } from "@/src/utils/helpers";
import type { Trip, Passenger } from "@/src/models/types";
import { useTranslation } from "react-i18next";
import RatingModal from "@/components/RatingModal";

const { width, height } = Dimensions.get("window");
const GMAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LatLng { latitude: number; longitude: number }
interface ChatMessage { id: string; role: "user" | "ai"; text: string; icon?: string; timestamp: Date }

// ─── Map cache helpers ────────────────────────────────────────────────────────
const cacheGet = async <T>(key: string): Promise<T | null> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
};
const cacheSet = async (key: string, val: unknown) => {
  try { await AsyncStorage.setItem(key, JSON.stringify(val)); } catch { }
};

// ─── Geocode address → LatLng ─────────────────────────────────────────────────
async function geocodeAddress(address: string): Promise<LatLng | null> {
  const cacheKey = `geocode_${address.toLowerCase().replace(/\s+/g, "_")}`;
  const cached = await cacheGet<LatLng>(cacheKey);
  if (cached) return cached;
  if (!GMAPS_KEY) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GMAPS_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === "OK" && json.results[0]) {
      const loc = json.results[0].geometry.location;
      const pt: LatLng = { latitude: loc.lat, longitude: loc.lng };
      await cacheSet(cacheKey, pt);
      return pt;
    }
  } catch { }
  return null;
}

// ─── Route polyline ───────────────────────────────────────────────────────────
function decodePolyline(encoded: string): LatLng[] {
  const pts: LatLng[] = [];
  let idx = 0, lat = 0, lng = 0;
  while (idx < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    pts.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return pts;
}

async function fetchRoute(origin: string, dest: string, tripCode: string): Promise<LatLng[] | null> {
  const cacheKey = `route_cache_${tripCode}`;
  const cached = await cacheGet<LatLng[]>(cacheKey);
  if (cached?.length) return cached;
  if (!GMAPS_KEY) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&key=${GMAPS_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === "OK" && json.routes[0]) {
      const pts = decodePolyline(json.routes[0].overview_polyline.points);
      await cacheSet(cacheKey, pts);
      return pts;
    }
  } catch { }
  return null;
}

function midpoint(a: LatLng, b: LatLng): LatLng {
  return { latitude: (a.latitude + b.latitude) / 2, longitude: (a.longitude + b.longitude) / 2 };
}

// ─── Dark map style ───────────────────────────────────────────────────────────
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1a2e1f" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f1f13" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8aba95" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c4a32" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a2e1f" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a6643" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1f17" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#1e3526" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1e3526" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

// ─── AnimatedPressable ────────────────────────────────────────────────────────
interface AnimPressProps {
  onPress: () => void;
  style?: object;
  children: React.ReactNode;
  disabled?: boolean;
  scaleValue?: number;
}
function AnimatedPressable({ onPress, style, children, disabled, scaleValue = 0.94 }: AnimPressProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[animStyle, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(scaleValue, { damping: 20, stiffness: 300 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 200 }); }}
        disabled={disabled}
        style={{ flex: 1 }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─── Earnings Counter ─────────────────────────────────────────────────────────
function EarningsCounter({ coins }: { coins: number }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSequence(withTiming(1.2, { duration: 120 }), withSpring(1, { damping: 12 }));
  }, [coins]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.earningsPill, style]}>
      <Ionicons name="star" size={14} color={Colors.gold} />
      <Text style={styles.earningsText}>{formatCoins(coins)}</Text>
    </Animated.View>
  );
}

// ─── Live Badge ───────────────────────────────────────────────────────────────
function LiveBadge() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0.3, { duration: 800 }), withTiming(1, { duration: 800 })),
      -1, false
    );
  }, []);
  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <View style={styles.liveBadge}>
      <Animated.View style={[styles.liveDot, dotStyle]} />
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
}

// ─── SOS Modal ────────────────────────────────────────────────────────────────
function SOSModal({ visible, onConfirm, onCancel }: {
  visible: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const tY = useSharedValue(300);
  const op = useSharedValue(0);
  useEffect(() => {
    if (visible) { op.value = withTiming(1, { duration: 200 }); tY.value = withSpring(0, { damping: 25 }); }
    else { op.value = withTiming(0, { duration: 150 }); tY.value = withTiming(150, { duration: 200 }); }
  }, [visible]);
  const overlayStyle = useAnimatedStyle(() => ({ opacity: op.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: tY.value }] }));
  if (!visible) return null;
  return (
    <Modal transparent visible={visible} animationType="none">
      <Animated.View style={[styles.modalOverlay, overlayStyle, { paddingBottom: 250 }]}>
        <Animated.View style={[styles.sosSheet, sheetStyle]}>
          <View style={styles.sosIconRing}>
            <Ionicons name="warning" size={36} color={Colors.error} />
          </View>
          <Text style={styles.sosTitle}>Emergency SOS</Text>
          <Text style={styles.sosDesc}>
            This will immediately alert your emergency contacts and park owner with your live location.
          </Text>
          <View style={styles.sosActions}>
            <AnimatedPressable onPress={onCancel} style={styles.sosCancelBtn}>
              <View style={styles.sosCancelInner}>
                <Text style={styles.sosCancelText}>Cancel</Text>
              </View>
            </AnimatedPressable>
            <AnimatedPressable onPress={onConfirm} style={styles.sosConfirmBtn} scaleValue={0.92}>
              <View style={styles.sosConfirmInner}>
                <Ionicons name="warning" size={18} color="#fff" />
                <Text style={styles.sosConfirmText}>Send SOS</Text>
              </View>
            </AnimatedPressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ─── Passenger Chip ───────────────────────────────────────────────────────────
function PassengerChip({ passenger, index }: { passenger: Passenger; index: number }) {
  const chipColors = ["#00A651", "#3B82F6", "#F5A623", "#EF4444", "#8B5CF6"];
  const color = chipColors[index % chipColors.length];
  return (
    <View style={styles.passengerChip}>
      <View style={[styles.passengerAvatar, { backgroundColor: color + "22" }]}>
        <Text style={[styles.passengerAvatarText, { color }]}>{index + 1}</Text>
      </View>
      <Text style={styles.passengerDestText} numberOfLines={1}>
        {passenger.destination || "End"}
      </Text>
    </View>
  );
}

// ─── Chat Bubble ─────────────────────────────────────────────────────────────
function ChatBubble({ msg, isSpeaking, onSpeak }: {
  msg: ChatMessage; isSpeaking: boolean; onSpeak: (text: string) => void;
}) {
  const isUser = msg.role === "user";
  return (
    <View style={[aiStyles.bubble, isUser ? aiStyles.bubbleUser : aiStyles.bubbleAI]}>
      {!isUser && (
        <View style={aiStyles.bubbleHeader}>
          <View style={aiStyles.aiBubbleIcon}>
            <Ionicons name={(msg.icon as any) ?? "sparkles"} size={13} color={Colors.gold} />
          </View>
          <Text style={aiStyles.bubbleAILabel}>Teqil AI</Text>
          <Pressable onPress={() => onSpeak(msg.text)} style={aiStyles.speakBtn} hitSlop={8}>
            <Ionicons
              name={isSpeaking ? "volume-high" : "volume-medium-outline"}
              size={14}
              color={isSpeaking ? Colors.primary : "rgba(255,255,255,0.4)"}
            />
          </Pressable>
        </View>
      )}
      <Text style={[aiStyles.bubbleText, isUser && aiStyles.bubbleTextUser]}>{msg.text}</Text>
      <Text style={aiStyles.bubbleTime}>
        {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </Text>
    </View>
  );
}

// ─── AI Assistant Modal ───────────────────────────────────────────────────────
function AIAssistantModal({ visible, onClose, ctx }: {
  visible: boolean; onClose: () => void; ctx: AIContext;
}) {
  const insets = useSafeAreaInsets();
  const tY = useSharedValue(600);
  const op = useSharedValue(0);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      op.value = withTiming(1, { duration: 220 });
      tY.value = withSpring(0, { damping: 22, stiffness: 200 });
      if (messages.length === 0) {
        const welcome: ChatMessage = {
          id: "welcome", role: "ai", icon: "sparkles", timestamp: new Date(),
          text: ctx.role === "driver"
            ? `Hi boss 👋 I'm your Teqil AI co-pilot. Ask me about traffic, fuel stations, earnings or anything about your trip from ${ctx.origin ?? "origin"} to ${ctx.destination ?? "destination"}.`
            : `Hi there 👋 I'm your Teqil AI assistant. Ask me about your ETA, the route, weather or anything about your journey to ${ctx.passengerDestination ?? ctx.destination ?? "your destination"}.`,
        };
        setMessages([welcome]);
        if (!muted) speakText(welcome.id, welcome.text);
      }
    } else {
      op.value = withTiming(0, { duration: 180 });
      tY.value = withTiming(600, { duration: 260 });
    }
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: op.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: tY.value }] }));

  const speakText = useCallback((id: string, text: string) => {
    Speech.stop();
    setSpeakingId(id);
    Speech.speak(text, { language: "en-NG", rate: 1.05, pitch: 1.1, volume: 1.0, onDone: () => setSpeakingId(null), onError: () => setSpeakingId(null) });
  }, []);

  const stopSpeaking = useCallback(() => { Speech.stop(); setSpeakingId(null); }, []);

  const toggleMute = () => { if (!muted) stopSpeaking(); setMuted((m) => !m); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

  const sendMessage = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput("");
    stopSpeaking();
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text: q, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    try {
      const resp: AIResponse = await askAI(q, ctx);
      const aiMsg: ChatMessage = { id: `ai-${Date.now()}`, role: "ai", text: resp.text, icon: resp.icon, timestamp: new Date() };
      setMessages((prev) => [...prev, aiMsg]);
      if (!muted) speakText(aiMsg.id, aiMsg.text);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    } catch {
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "ai", text: "Sorry, I couldn't get a response. Please try again.", icon: "alert-circle-outline", timestamp: new Date() }]);
    } finally { setLoading(false); }
  }, [loading, muted, ctx, speakText, stopSpeaking]);

  const handleClose = () => { stopSpeaking(); onClose(); };
  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={[aiStyles.overlay, overlayStyle]}>
          <Pressable style={aiStyles.overlayTap} onPress={handleClose} />
        </Animated.View>
        <Animated.View style={[aiStyles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }, sheetStyle]}>
          <View style={aiStyles.sheetHandle} />
          <View style={aiStyles.header}>
            <View style={aiStyles.headerLeft}>
              <View style={aiStyles.headerIcon}><Ionicons name="sparkles" size={18} color={Colors.gold} /></View>
              <View>
                <Text style={aiStyles.headerTitle}>Teqil AI</Text>
                <Text style={aiStyles.headerSub}>{ctx.role === "driver" ? "Driver co-pilot" : "Journey assistant"}</Text>
              </View>
            </View>
            <View style={aiStyles.headerRight}>
              <Pressable onPress={toggleMute} style={aiStyles.muteBtn} hitSlop={8}>
                <Ionicons name={muted ? "volume-mute" : "volume-high-outline"} size={20} color={muted ? Colors.error : "rgba(255,255,255,0.6)"} />
              </Pressable>
              <Pressable onPress={handleClose} style={aiStyles.closeBtn} hitSlop={8}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
              </Pressable>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={aiStyles.quickRow} style={aiStyles.quickScroll}>
            {QUICK_ACTIONS.map((qa) => (
              <Pressable key={qa.label} style={({ pressed }) => [aiStyles.quickChip, pressed && { opacity: 0.7 }]} onPress={() => sendMessage(qa.question)} disabled={loading}>
                <Ionicons name={qa.icon as any} size={14} color={Colors.primary} />
                <Text style={aiStyles.quickChipText}>{qa.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView ref={scrollRef} style={aiStyles.chatScroll} contentContainerStyle={aiStyles.chatContent} showsVerticalScrollIndicator={false} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
            {messages.map((msg) => (
              <ChatBubble key={msg.id} msg={msg} isSpeaking={speakingId === msg.id} onSpeak={(text) => { speakingId === msg.id ? stopSpeaking() : speakText(msg.id, text); }} />
            ))}
            {loading && (
              <View style={aiStyles.typingRow}>
                <View style={aiStyles.typingBubble}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={aiStyles.typingText}>Teqil AI is thinking…</Text>
                </View>
              </View>
            )}
          </ScrollView>
          <View style={aiStyles.inputRow}>
            <TextInput ref={inputRef} style={aiStyles.input} placeholder="Ask me anything about your trip…" placeholderTextColor="rgba(255,255,255,0.3)" value={input} onChangeText={setInput} multiline maxLength={200} returnKeyType="send" onSubmitEditing={() => sendMessage(input)} editable={!loading} />
            <Pressable style={[aiStyles.sendBtn, (!input.trim() || loading) && aiStyles.sendBtnDisabled]} onPress={() => sendMessage(input)} disabled={!input.trim() || loading}>
              <Ionicons name="send" size={16} color="#fff" />
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function LiveTripScreen() {
  const insets = useSafeAreaInsets();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user } = useAuthStore();
  const {
    activeTrip, earningsCoins, incrementEarnings,
    elapsedSeconds, setElapsedSeconds, resetTripState,
  } = useTripStore();
  const { t } = useTranslation();

  // ── Trip state ──────────────────────────────────────────────────────────────
  const [trip, setTrip] = useState<Trip | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [myPassenger, setMyPassenger] = useState<Passenger | null>(null);
  const [isEnding, setIsEnding] = useState(false);
  const [sosVisible, setSosVisible] = useState(false);
  const [aiVisible, setAiVisible] = useState(false);
  const [topBarCollapsed, setTopBarCollapsed] = useState(false);

  // ── Rating state (passengers only) ─────────────────────────────────────────
  // showRating is set to true only when a PASSENGER leaves a trip.
  // Drivers never see the rating modal.
  const [showRating, setShowRating] = useState(false);
  const [ratingDriverId, setRatingDriverId] = useState<string>("");
  const [ratingTripId, setRatingTripId] = useState<string>("");

  // ── Map state ───────────────────────────────────────────────────────────────
  const [routePoints, setRoutePoints] = useState<LatLng[]>([]);
  const [originCoord, setOriginCoord] = useState<LatLng | null>(null);
  const [destCoord, setDestCoord] = useState<LatLng | null>(null);
  const [driverLocation, setDriverLocation] = useState<LatLng | null>(null);
  const [passengerMarkers, setPassengerMarkers] = useState<{ passenger: Passenger; coord: LatLng }[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);

  const mapRef = useRef<MapView>(null);
  const locationWatcher = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const topBarHeight = useSharedValue(1);

  const isDriver = user?.role === "driver";
  const displayTrip = trip || activeTrip;
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const aiCtx: AIContext = useMemo(() => ({
    role: isDriver ? "driver" : "passenger",
    origin: displayTrip?.origin,
    destination: displayTrip?.destination,
    passengerDestination: myPassenger?.destination,
    elapsedSeconds,
    passengerCount: passengers.length,
    tripCode: code ?? undefined,
  }), [isDriver, displayTrip, myPassenger, elapsedSeconds, passengers.length, code]);

  // ── Location permission ─────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === "granted");
    })();
  }, []);

  // ── Load trip + passengers ──────────────────────────────────────────────────
  useEffect(() => {
    if (!code) return;
    (async () => {
      const found = await TripsStorage.getByCode(code);
      if (!found) return;
      setTrip(found);
      const psgrs = await PassengersStorage.getByTripId(found.id);
      setPassengers(psgrs);
      if (!isDriver && user?.id) {
        setMyPassenger(psgrs.find((p) => p.user_id === user.id) ?? null);
      }
    })();
  }, [code]);

  // ── Geocode + fetch route ───────────────────────────────────────────────────
  useEffect(() => {
    if (!displayTrip) return;
    (async () => {
      const [oCoord, dCoord] = await Promise.all([
        geocodeAddress(displayTrip.origin),
        geocodeAddress(displayTrip.destination),
      ]);
      if (oCoord) setOriginCoord(oCoord);
      if (dCoord) setDestCoord(dCoord);
      const pts = await fetchRoute(displayTrip.origin, displayTrip.destination, displayTrip.trip_code);
      if (pts && pts.length > 0) { setRoutePoints(pts); setRouteError(null); }
      else if (!GMAPS_KEY) { setRouteError("Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to enable route drawing."); }
      else { setRouteError("Could not load route. Showing map without directions."); }
    })();
  }, [displayTrip?.id]);

  useEffect(() => {
    if (!passengers.length) return;
    (async () => {
      const results: { passenger: Passenger; coord: LatLng }[] = [];
      await Promise.all(
        passengers.map(async (p) => {
          const dest = p.destination || displayTrip?.destination;
          if (!dest) return;
          const coord = await geocodeAddress(dest);
          if (coord) results.push({ passenger: p, coord });
        })
      );
      setPassengerMarkers(results);
    })();
  }, [passengers]);

  useEffect(() => {
    if (!isDriver || !locationPermission) return;
    (async () => {
      locationWatcher.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 5 },
        (loc) => { setDriverLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }); }
      );
    })();
    return () => { locationWatcher.current?.remove(); };
  }, [isDriver, locationPermission]);

  useEffect(() => {
    if (isDriver || !locationPermission) return;
    (async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setDriverLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch { }
    })();
  }, [isDriver, locationPermission]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const center = driverLocation ?? (originCoord && destCoord ? midpoint(originCoord, destCoord) : originCoord ?? destCoord);
    if (!center) return;
    if (routePoints.length > 1) {
      mapRef.current.fitToCoordinates(routePoints, { edgePadding: { top: 120, right: 40, bottom: 260, left: 40 }, animated: true });
    } else {
      mapRef.current.animateToRegion({ ...center, latitudeDelta: 0.04, longitudeDelta: 0.04 }, 800);
    }
  }, [mapReady, routePoints.length, driverLocation]);

  const handleRecenter = useCallback(() => {
    const target = driverLocation ?? originCoord;
    if (!target || !mapRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mapRef.current.animateToRegion({ ...target, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 600);
  }, [driverLocation, originCoord]);

  useEffect(() => {
    if (!isDriver) return;
    timerRef.current = setInterval(() => {
      setElapsedSeconds(elapsedSeconds + 1);
      if (elapsedSeconds > 0 && elapsedSeconds % 30 === 0) incrementEarnings(1);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [elapsedSeconds, isDriver]);

  const toggleTopBar = () => {
    const next = !topBarCollapsed;
    setTopBarCollapsed(next);
    topBarHeight.value = withSpring(next ? 0 : 1, { damping: 18 });
  };
  const topBarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(topBarHeight.value, [0, 0.4, 1], [0, 0, 1], Extrapolation.CLAMP),
    maxHeight: interpolate(topBarHeight.value, [0, 1], [0, 120], Extrapolation.CLAMP),
    overflow: "hidden",
  }));

  const aiBtnScale = useSharedValue(1);
  useEffect(() => {
    aiBtnScale.value = withRepeat(
      withSequence(withTiming(1.06, { duration: 1200 }), withTiming(1, { duration: 1200 })),
      -1, false
    );
  }, []);
  const aiBtnStyle = useAnimatedStyle(() => ({ transform: [{ scale: aiBtnScale.value }] }));

  // ── End trip (DRIVER only) ────────────────────────────────────────────────
  // Drivers just complete the trip and go home. No rating for them.
  const handleEndTrip = () => {
    Alert.alert(
      t("trip.endTrip"),
      "This will complete the trip for all passengers.",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("trip.endTrip"),
          style: "destructive",
          onPress: async () => {
            setIsEnding(true);
            if (trip) {
              await TripsStorage.update(trip.id, {
                status: "completed",
                end_time: new Date().toISOString(),
              });
            }
            if (user) {
              syncAll({ id: user.id, role: user.role, park_name: user.park_name }).catch(() => {});
            }
            if (timerRef.current) clearInterval(timerRef.current);
            locationWatcher.current?.remove();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            resetTripState();
            // Driver goes straight back to the dashboard — no rating modal
            router.replace("/(driver)");
          },
        },
      ]
    );
  };

  // ── Leave trip (PASSENGER only) ───────────────────────────────────────────
  // After the passenger marks themselves as arrived, show the rating modal
  // so they can rate the driver before navigating away.
  const handleLeaveTrip = () => {
    Alert.alert(
      "Leave Trip",
      "Are you sure you want to leave this trip? Your emergency contacts will be notified that you have arrived.",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: "Leave Trip",
          style: "destructive",
          onPress: async () => {
            setIsEnding(true);
            const currentTrip = displayTrip;

            // 1. Mark the passenger record as completed
            if (myPassenger) {
              await PassengersStorage.update(myPassenger.id, {
                status: "completed",
                dropoff_time: new Date().toISOString(),
              });
            }

            // 2. Sync immediately if online
            if (user) {
              syncAll({ id: user.id, role: user.role, park_name: user.park_name }).catch(() => {});
            }

            locationWatcher.current?.remove();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            resetTripState();

            // 3. Show rating modal for the driver
            if (currentTrip?.id && currentTrip?.driver_id) {
              setRatingTripId(currentTrip.id);
              setRatingDriverId(currentTrip.driver_id);
              setShowRating(true);
            } else {
              // No driver info available — navigate directly
              router.replace("/(passenger)");
            }
          },
        },
      ]
    );
  };

  // ── SOS ─────────────────────────────────────────────────────────────────────
  const handleSOSPress = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setSosVisible(true);
  };
  const handleSOSConfirm = () => {
    setSosVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Alert.alert("SOS Sent", "Emergency contacts and park owner have been notified.");
  };

  const initialRegion: Region = useMemo(() => {
    const center = driverLocation ?? originCoord ?? { latitude: 6.5244, longitude: 3.3792 };
    return { ...center, latitudeDelta: 0.04, longitudeDelta: 0.04 };
  }, []);

  return (
    <View style={styles.container}>

      {/* ── Map ── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        customMapStyle={DARK_MAP_STYLE}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        onMapReady={() => setMapReady(true)}
        zoomEnabled scrollEnabled rotateEnabled pitchEnabled={false}
      >
        {routePoints.length > 1 && (
          <Polyline coordinates={routePoints} strokeColor={Colors.primary} strokeWidth={4} />
        )}
        {originCoord && (
          <Marker coordinate={originCoord} title="Origin" description={displayTrip?.origin} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={mapStyles.originMarker}><View style={mapStyles.originDot} /></View>
          </Marker>
        )}
        {destCoord && (
          <Marker coordinate={destCoord} title="Destination" description={displayTrip?.destination} anchor={{ x: 0.5, y: 1 }}>
            <View style={mapStyles.destMarkerWrap}>
              <View style={mapStyles.destMarker}><Ionicons name="flag" size={16} color="#fff" /></View>
              <View style={mapStyles.destMarkerTail} />
            </View>
          </Marker>
        )}
        {driverLocation && (
          <Marker coordinate={driverLocation} title={isDriver ? "You" : "Driver"} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={mapStyles.driverMarker}>
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={mapStyles.driverMarkerGradient}>
                <Ionicons name="car-sport" size={18} color="#fff" />
              </LinearGradient>
              <View style={mapStyles.driverPulse} />
            </View>
          </Marker>
        )}
        {passengerMarkers.map(({ passenger, coord }, i) => (
          <Marker key={passenger.id} coordinate={coord} title={`Passenger ${i + 1}`} description={passenger.destination ?? ""} anchor={{ x: 0.5, y: 1 }}>
            <View style={mapStyles.passengerMarkerWrap}>
              <View style={mapStyles.passengerMarker}><Text style={mapStyles.passengerMarkerText}>{i + 1}</Text></View>
              <View style={mapStyles.passengerMarkerTail} />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* ── Route error ── */}
      {routeError && (
        <View style={styles.routeErrorBanner}>
          <Ionicons name="warning-outline" size={14} color="rgba(245,166,35,0.9)" />
          <Text style={styles.routeErrorText} numberOfLines={2}>{routeError}</Text>
        </View>
      )}

      {/* ── Re-center ── */}
      <TouchableOpacity style={[styles.recenterBtn, { top: topPadding + (topBarCollapsed ? 64 : 120) }]} onPress={handleRecenter} activeOpacity={0.8}>
        <Ionicons name="locate" size={20} color="#fff" />
      </TouchableOpacity>

      {/* ── Top Bar ── */}
      <View style={[styles.topBarWrapper, { paddingTop: topPadding + 8 }]}>
        <View style={styles.topBarRow}>
          <AnimatedPressable onPress={() => router.back()} style={styles.topBarIconBtn} scaleValue={0.9}>
            <View style={styles.topBarIconInner}><Ionicons name="arrow-back" size={20} color="#fff" /></View>
          </AnimatedPressable>
          <Pressable onPress={toggleTopBar} style={styles.topBarCenter}>
            <View style={styles.topBarCenterContent}>
              <LiveBadge />
              <Text style={styles.topBarCodeText}>{code}</Text>
              <Ionicons name={topBarCollapsed ? "chevron-down" : "chevron-up"} size={12} color="rgba(255,255,255,0.5)" />
            </View>
          </Pressable>
          {isDriver ? (
            <EarningsCounter coins={earningsCoins} />
          ) : (
            <View style={styles.durationPill}>
              <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={styles.durationText}>{formatDuration(elapsedSeconds)}</Text>
            </View>
          )}
        </View>
        <Animated.View style={topBarStyle}>
          <View style={styles.topBarDetailRow}>
            <View style={styles.topBarDetailItem}>
              <Ionicons name="radio-button-on" size={10} color={Colors.primary} />
              <Text style={styles.topBarDetailText} numberOfLines={1}>{displayTrip?.origin || "—"}</Text>
            </View>
            <Ionicons name="arrow-forward" size={12} color="rgba(255,255,255,0.3)" />
            <View style={styles.topBarDetailItem}>
              <Ionicons name="location" size={10} color={Colors.error} />
              <Text style={styles.topBarDetailText} numberOfLines={1}>{displayTrip?.destination || "—"}</Text>
            </View>
            {isDriver && (
              <View style={styles.topBarDetailItem}>
                <Ionicons name="people-outline" size={10} color="rgba(255,255,255,0.5)" />
                <Text style={styles.topBarDetailText}>{passengers.length} aboard</Text>
              </View>
            )}
          </View>
        </Animated.View>
      </View>

      {/* ── Bottom Sheet ── */}
      <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 16) + (Platform.OS === "web" ? 34 : 0) }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.tripMetaRow}>
          <View style={styles.tripCodeBadge}><Text style={styles.tripCodeBadgeText}>{code}</Text></View>
          <Text style={styles.tripDurationBadge}>{formatDuration(elapsedSeconds)}</Text>
          <View style={styles.passengerCountBadge}>
            <Ionicons name="people" size={13} color={Colors.primary} />
            <Text style={styles.passengerCountText}>{passengers.length} {t("trip.passengersOnboard")}</Text>
          </View>
        </View>

        {isDriver && passengers.length > 0 && (
          <View style={styles.passengersSection}>
            <Text style={styles.sectionLabel}>{t("trip.passengers")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.passengersRow}>
              {passengers.map((p, i) => <PassengerChip key={p.id} passenger={p} index={i} />)}
            </ScrollView>
          </View>
        )}

        {isDriver && passengers.length === 0 && (
          <View style={styles.noPassengersRow}>
            <Ionicons name="person-add-outline" size={16} color={Colors.textTertiary} />
            <Text style={styles.noPassengersText}>{t("trip.noPassengers")}</Text>
          </View>
        )}

        {!isDriver && myPassenger?.destination && (
          <View style={styles.myDestRow}>
            <Ionicons name="location" size={14} color={Colors.primary} />
            <Text style={styles.myDestText} numberOfLines={1}>Your stop: {myPassenger.destination}</Text>
          </View>
        )}

        <View style={styles.actionRow}>
          <AnimatedPressable onPress={handleSOSPress} style={styles.sosBtn} scaleValue={0.9}>
            <View style={styles.sosBtnInner}><Text style={styles.sosBtnText}>{t("trip.sos")}</Text></View>
          </AnimatedPressable>

          {isDriver ? (
            <AnimatedPressable onPress={handleEndTrip} style={[styles.endTripBtn, isEnding && styles.endTripBtnDisabled]} scaleValue={0.96}>
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.endTripGradient}>
                <Ionicons name="flag" size={18} color="#fff" />
                <Text style={styles.endTripText}>{isEnding ? "Ending..." : t("trip.endTrip")}</Text>
              </LinearGradient>
            </AnimatedPressable>
          ) : (
            <AnimatedPressable onPress={handleLeaveTrip} style={styles.endTripBtn} scaleValue={0.96}>
              <LinearGradient colors={["#3B82F6", "#1D4ED8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.endTripGradient}>
                <Ionicons name="exit-outline" size={18} color="#fff" />
                <Text style={styles.endTripText}>{isEnding ? "Leaving..." : "Leave Trip"}</Text>
              </LinearGradient>
            </AnimatedPressable>
          )}
        </View>
      </View>

      {/* ── AI FAB ── */}
      <Animated.View style={[styles.aiFabContainer, { bottom: Math.max(insets.bottom, 16) + (Platform.OS === "web" ? 34 : 0) + (isDriver && passengers.length > 0 ? 240 : 190) }, aiBtnStyle]}>
        <AnimatedPressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAiVisible(true); }} style={styles.aiFab} scaleValue={0.88}>
          <LinearGradient colors={["#2D2D2D", "#1A1A1A"]} style={styles.aiFabGradient}>
            <Ionicons name="sparkles" size={22} color={Colors.gold} />
          </LinearGradient>
        </AnimatedPressable>
      </Animated.View>

      {/* ── SOS Modal ── */}
      <SOSModal visible={sosVisible} onConfirm={handleSOSConfirm} onCancel={() => setSosVisible(false)} />

      {/* ── AI Modal ── */}
      <AIAssistantModal visible={aiVisible} onClose={() => setAiVisible(false)} ctx={aiCtx} />

      {/* ── Rating Modal (PASSENGERS ONLY — shown after leaving a trip) ── */}
      {showRating && (
        <RatingModal
          visible={showRating}
          tripId={ratingTripId}
          driverUserId={ratingDriverId}
          onDone={() => {
            setShowRating(false);
            router.replace("/(passenger)");
          }}
          onClose={() => {
            // Skip pressed — still navigate home
            setShowRating(false);
            router.replace("/(passenger)");
          }}
        />
      )}
    </View>
  );
}

// ─── Map Marker Styles ────────────────────────────────────────────────────────
const mapStyles = StyleSheet.create({
  originMarker: { width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(74,222,128,0.25)", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#4ADE80" },
  originDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#4ADE80" },
  destMarkerWrap: { alignItems: "center" },
  destMarker: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.error, alignItems: "center", justifyContent: "center", shadowColor: Colors.error, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 6 },
  destMarkerTail: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: Colors.error, marginTop: -1 },
  driverMarker: { alignItems: "center", justifyContent: "center", position: "relative" },
  driverMarkerGradient: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 8, elevation: 8 },
  driverPulse: { position: "absolute", width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: Colors.primary + "55", backgroundColor: "transparent" },
  passengerMarkerWrap: { alignItems: "center" },
  passengerMarker: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.error, alignItems: "center", justifyContent: "center", shadowColor: Colors.error, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4 },
  passengerMarkerText: { fontFamily: "Poppins_700Bold", fontSize: 12, color: "#fff" },
  passengerMarkerTail: { width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: Colors.error, marginTop: -1 },
});

// ─── Main Styles ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f2d1c" },
  routeErrorBanner: { position: "absolute", bottom: 270, left: 16, right: 70, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(20,30,22,0.9)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(245,166,35,0.3)", zIndex: 10 },
  routeErrorText: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(245,166,35,0.85)", lineHeight: 16 },
  recenterBtn: { position: "absolute", right: 16, zIndex: 10, width: 42, height: 42, borderRadius: 13, backgroundColor: "rgba(10,22,14,0.85)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 6 },
  topBarWrapper: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "rgba(10,22,14,0.88)", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)", zIndex: 20 },
  topBarRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  topBarIconBtn: { width: 38, height: 38 },
  topBarIconInner: { flex: 1, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  topBarCenter: { flex: 1, alignItems: "center" },
  topBarCenterContent: { flexDirection: "row", alignItems: "center", gap: 8 },
  topBarCodeText: { fontFamily: "Poppins_700Bold", fontSize: 14, color: "#fff", letterSpacing: 2 },
  topBarDetailRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)", flexWrap: "wrap" },
  topBarDetailItem: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1, minWidth: 80 },
  topBarDetailText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.65)", flex: 1 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(239,68,68,0.15)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.error },
  liveText: { fontFamily: "Poppins_700Bold", fontSize: 10, color: Colors.error, letterSpacing: 1.5 },
  earningsPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(245,166,35,0.15)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(245,166,35,0.3)" },
  earningsText: { fontFamily: "Poppins_700Bold", fontSize: 12, color: Colors.gold },
  durationPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  durationText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "rgba(255,255,255,0.7)" },
  bottomSheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(17,26,20,0.95)", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", shadowColor: "#000", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 20, zIndex: 20 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.12)", alignSelf: "center", marginBottom: 16 },
  tripMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  tripCodeBadge: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  tripCodeBadgeText: { fontFamily: "Poppins_700Bold", fontSize: 12, color: "#fff", letterSpacing: 2 },
  tripDurationBadge: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  passengerCountBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  passengerCountText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.5)" },
  passengersSection: { marginBottom: 14 },
  sectionLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  passengersRow: { gap: 10, paddingRight: 8 },
  passengerChip: { alignItems: "center", gap: 5, width: 64 },
  passengerAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.08)" },
  passengerAvatarText: { fontFamily: "Poppins_700Bold", fontSize: 15 },
  passengerDestText: { fontFamily: "Poppins_400Regular", fontSize: 10, color: "rgba(255,255,255,0.45)", textAlign: "center" },
  noPassengersRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  noPassengersText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.35)" },
  myDestRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,166,81,0.08)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12, borderWidth: 1, borderColor: "rgba(0,166,81,0.18)" },
  myDestText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "rgba(255,255,255,0.75)", flex: 1 },
  actionRow: { flexDirection: "row", gap: 12 },
  sosBtn: { width: 72, height: 54 },
  sosBtnInner: { flex: 1, borderRadius: 16, backgroundColor: "rgba(239,68,68,0.12)", alignItems: "center", justifyContent: "center" },
  sosBtnText: { fontFamily: "Poppins_700Bold", fontSize: 13, color: Colors.error, letterSpacing: 0.5 },
  endTripBtn: { flex: 1, height: 54, borderRadius: 16, overflow: "hidden", shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8 },
  endTripBtnDisabled: { opacity: 0.6 },
  endTripGradient: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  endTripText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#fff" },
  aiFabContainer: { position: "absolute", right: 20, zIndex: 15 },
  aiFab: { width: 52, height: 52, borderRadius: 26, overflow: "hidden", shadowColor: Colors.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 10 },
  aiFabGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  sosSheet: { backgroundColor: "rgba(59,59,59,0.85)", borderRadius: 28, marginHorizontal: 12, padding: 28, paddingBottom: 40, alignItems: "center", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  sosIconRing: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(239,68,68,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 16, borderWidth: 2, borderColor: "rgba(239,68,68,0.3)" },
  sosTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#fff", marginBottom: 8 },
  sosDesc: { fontFamily: "Poppins_400Regular", fontSize: 14, color: "rgba(255,255,255,0.55)", textAlign: "center", lineHeight: 22, marginBottom: 28, paddingHorizontal: 8 },
  sosActions: { flexDirection: "row", gap: 12, width: "100%" },
  sosCancelBtn: { flex: 1, height: 52 },
  sosCancelInner: { flex: 1, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  sosCancelText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "rgba(255,255,255,0.7)" },
  sosConfirmBtn: { flex: 1, height: 52, borderRadius: 16, overflow: "hidden", backgroundColor: Colors.error },
  sosConfirmInner: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.error },
  sosConfirmText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#fff" },
});

// ─── AI Modal Styles ───────────────────────────────────────────────────────────
const aiStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.76)" },
  overlayTap: { flex: 1 },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#111A14", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingHorizontal: 0, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", maxHeight: "90%", shadowColor: "#000", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 24 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginBottom: 14 },
  header: { flexDirection: "column", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 12 },
  headerLeft: { flexDirection: "column", alignItems: "center", gap: 12 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(245,166,35,0.12)", borderWidth: 1, borderColor: "rgba(245,166,35,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#fff", textAlign: "center" },
  headerSub: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 },
  headerRight: { flexDirection: "row", gap: 6, justifyContent: "flex-end", alignSelf: "flex-end" },
  muteBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  closeBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  quickScroll: { marginBottom: 10 },
  quickRow: { gap: 8, paddingHorizontal: 20, paddingVertical: 2, flexWrap: "wrap", justifyContent: "space-evenly" },
  quickChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,166,81,0.1)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(0,166,81,0.22)" },
  quickChipText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "rgba(255,255,255,0.8)" },
  chatScroll: { flex: 1, minHeight: 120 },
  chatContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 10 },
  bubble: { maxWidth: "85%", borderRadius: 16, padding: 12 },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleAI: { alignSelf: "flex-start", backgroundColor: "#1E2820", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  bubbleHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  aiBubbleIcon: { width: 20, height: 20, borderRadius: 6, backgroundColor: "rgba(245,166,35,0.15)", alignItems: "center", justifyContent: "center" },
  bubbleAILabel: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: Colors.gold, letterSpacing: 0.5, flex: 1 },
  speakBtn: { padding: 2 },
  bubbleText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 20 },
  bubbleTextUser: { color: "#fff" },
  bubbleTime: { fontFamily: "Poppins_400Regular", fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4, alignSelf: "flex-end" },
  typingRow: { alignSelf: "flex-start" },
  typingBubble: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1E2820", borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  typingText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.4)" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  input: { flex: 1, minHeight: 42, maxHeight: 90, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontFamily: "Poppins_400Regular", fontSize: 13, color: "#fff", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  sendBtn: { width: 42, height: 42, borderRadius: 13, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  sendBtnDisabled: { backgroundColor: "rgba(255,255,255,0.1)", shadowOpacity: 0, elevation: 0 },
});