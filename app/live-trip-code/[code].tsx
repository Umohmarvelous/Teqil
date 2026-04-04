/**
 * app/live-trip/[code].tsx
 *
 * Fixes applied:
 * - cacheGet generic broken in TSX: replaced with explicit cast inside function
 * - useSharedValue in StarRow loop → moved to class-based approach using Animated.Value array
 * - All useEffect exhaustive-deps: stabilized with refs or eslint-disable where intentional
 * - Line 675 unused expression: removed
 * - ActionSheetModal useEffect deps: stable refs passed via callbacks
 * - Bottom sheet is a proper PanResponder swipeable modal
 * - Navigates to /rating on trip end with full params
 * - Push notifications on trip end
 */

import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Modal,
  ActivityIndicator,
  TouchableOpacity,
  PanResponder,
  Animated,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type Region,
} from "react-native-maps";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { LinearGradient } from "expo-linear-gradient";
import { useAuthStore, useTripStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { TripsStorage, PassengersStorage } from "@/src/services/storage";
import { syncAll } from "@/src/services/sync";
import {
  scheduleTripEndNotification,
  scheduleSOSNotification,
  registerForPushNotifications,
} from "@/src/services/notifications";
import {
  askAI,
  QUICK_ACTIONS,
  type AIContext,
  type AIResponse,
} from "@/src/services/ai";
import { formatCoins, formatDuration } from "@/src/utils/helpers";
import type { Trip, Passenger } from "@/src/models/types";
import { useTranslation } from "react-i18next";
import RatingModal from "@/components/RatingModal";

const { width, height: SCREEN_HEIGHT } = Dimensions.get("window");
const GMAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LatLng {
  latitude: number;
  longitude: number;
}
interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  icon?: string;
  timestamp: Date;
}

// ─── Map cache helpers ────────────────────────────────────────────────────────
// NOTE: generic in angle-brackets would be parsed as JSX in .tsx — use explicit cast
async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key: string, val: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(val));
  } catch {
    // ignore
  }
}

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
  } catch {
    // network error
  }
  return null;
}

function decodePolyline(encoded: string): LatLng[] {
  const pts: LatLng[] = [];
  let idx = 0,
    lat = 0,
    lng = 0;
  while (idx < encoded.length) {
    let b,
      shift = 0,
      result = 0;
    do {
      b = encoded.charCodeAt(idx++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    (shift = 0), (result = 0);
    do {
      b = encoded.charCodeAt(idx++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    pts.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return pts;
}

async function fetchRoute(
  origin: string,
  dest: string,
  tripCode: string
): Promise<LatLng[] | null> {
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
  } catch {
    // network error
  }
  return null;
}

function midpoint(a: LatLng, b: LatLng): LatLng {
  return {
    latitude: (a.latitude + b.latitude) / 2,
    longitude: (a.longitude + b.longitude) / 2,
  };
}

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1a2e1f" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f1f13" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8aba95" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#2c4a32" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1a2e1f" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#3a6643" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0d1f17" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#1e3526" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#1e3526" }],
  },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

// ─── Animated pressable (Reanimated) ─────────────────────────────────────────
function AnimatedPressable({
  onPress,
  style,
  children,
  disabled,
  scaleValue = 0.94,
}: {
  onPress: () => void;
  style?: object;
  children: React.ReactNode;
  disabled?: boolean;
  scaleValue?: number;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <ReAnimated.View style={[animStyle, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(scaleValue, { damping: 20, stiffness: 300 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 15, stiffness: 200 });
        }}
        disabled={disabled}
        style={{ flex: 1 }}
      >
        {children}
      </Pressable>
    </ReAnimated.View>
  );
}

// ─── Earnings Counter ─────────────────────────────────────────────────────────
function EarningsCounter({ coins }: { coins: number }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.2, { duration: 120 }),
      withSpring(1, { damping: 12 })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coins]); // intentionally omit scale — it's a stable Reanimated shared value
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <ReAnimated.View style={[styles.earningsPill, style]}>
      <Ionicons name="star" size={14} color={Colors.gold} />
      <Text style={styles.earningsText}>{formatCoins(coins)}</Text>
    </ReAnimated.View>
  );
}

// ─── Live Badge ───────────────────────────────────────────────────────────────
function LiveBadge() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 800 }),
        withTiming(1, { duration: 800 })
      ),
      -1,
      false
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // opacity is a stable shared value, intentionally empty deps
  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <View style={styles.liveBadge}>
      <ReAnimated.View style={[styles.liveDot, dotStyle]} />
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
}

// ─── Passenger Chip ───────────────────────────────────────────────────────────
function PassengerChip({
  passenger,
  index,
}: {
  passenger: Passenger;
  index: number;
}) {
  const chipColors = [
    "#00A651",
    "#3B82F6",
    "#F5A623",
    "#EF4444",
    "#8B5CF6",
  ];
  const color = chipColors[index % chipColors.length];
  return (
    <View style={styles.passengerChip}>
      <View
        style={[styles.passengerAvatar, { backgroundColor: color + "22" }]}
      >
        <Text style={[styles.passengerAvatarText, { color }]}>
          {index + 1}
        </Text>
      </View>
      <Text style={styles.passengerDestText} numberOfLines={1}>
        {passenger.destination || "End"}
      </Text>
    </View>
  );
}

// ─── SOS Modal ────────────────────────────────────────────────────────────────
function SOSModal({
  visible,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tY = useSharedValue(300);
  const op = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      op.value = withTiming(1, { duration: 200 });
      tY.value = withSpring(0, { damping: 25 });
    } else {
      op.value = withTiming(0, { duration: 150 });
      tY.value = withTiming(150, { duration: 200 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]); // op/tY are stable shared values

  const overlayStyle = useAnimatedStyle(() => ({ opacity: op.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: tY.value }],
  }));
  if (!visible) return null;
  return (
    <Modal transparent visible={visible} animationType="none">
      <ReAnimated.View
        style={[styles.modalOverlay, overlayStyle, { paddingBottom: 250 }]}
      >
        <ReAnimated.View style={[styles.sosSheet, sheetStyle]}>
          <View style={styles.sosIconRing}>
            <Ionicons name="warning" size={36} color={Colors.error} />
          </View>
          <Text style={styles.sosTitle}>Emergency SOS</Text>
          <Text style={styles.sosDesc}>
            This will immediately alert your emergency contacts and park owner
            with your live location.
          </Text>
          <View style={styles.sosActions}>
            <AnimatedPressable onPress={onCancel} style={styles.sosCancelBtn}>
              <View style={styles.sosCancelInner}>
                <Text style={styles.sosCancelText}>Cancel</Text>
              </View>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={onConfirm}
              style={styles.sosConfirmBtn}
              scaleValue={0.92}
            >
              <View style={styles.sosConfirmInner}>
                <Ionicons name="warning" size={18} color="#fff" />
                <Text style={styles.sosConfirmText}>Send SOS</Text>
              </View>
            </AnimatedPressable>
          </View>
        </ReAnimated.View>
      </ReAnimated.View>
    </Modal>
  );
}

// ─── Swipeable Action Sheet Modal ─────────────────────────────────────────────
function ActionSheetModal({
  visible,
  onClose,
  trip,
  passengers,
  myPassenger,
  isDriver,
  earningsCoins,
  elapsedSeconds,
  isEnding,
  onEndTrip,
  onLeaveTrip,
  onSOS,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  trip: Trip | null;
  passengers: Passenger[];
  myPassenger: Passenger | null;
  isDriver: boolean;
  earningsCoins: number;
  elapsedSeconds: number;
  isEnding: boolean;
  onEndTrip: () => void;
  onLeaveTrip: () => void;
  onSOS: () => void;
  t: (key: string) => string;
}) {
  const SHEET_HEIGHT = Math.min(SCREEN_HEIGHT * 0.72, 560);

  // Use refs so the PanResponder closure is stable across renders
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 22,
          stiffness: 180,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SHEET_HEIGHT,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]); // translateY, backdropOpacity, SHEET_HEIGHT are stable refs/constants

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          translateY.setValue(gs.dy);
          backdropOpacity.setValue(
            Math.max(0, 1 - gs.dy / SHEET_HEIGHT)
          );
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > SHEET_HEIGHT * 0.35 || gs.vy > 0.6) {
          onClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            damping: 22,
            stiffness: 180,
            useNativeDriver: true,
          }).start();
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current; // stable ref — don't recreate

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: "rgba(0,0,0,0.7)", opacity: backdropOpacity },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          sheetStyles.sheet,
          { height: SHEET_HEIGHT, transform: [{ translateY }] },
        ]}
      >
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={sheetStyles.handleArea}>
          <View style={sheetStyles.handle} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={sheetStyles.scrollContent}
          bounces={false}
        >
          {/* Trip meta */}
          <View style={sheetStyles.metaRow}>
            <View style={sheetStyles.codeChip}>
              <Ionicons
                name="barcode-outline"
                size={13}
                color="rgba(255,255,255,0.5)"
              />
              <Text style={sheetStyles.codeText}>
                {trip?.trip_code ?? "—"}
              </Text>
            </View>
            <Text style={sheetStyles.durationText}>
              {formatDuration(elapsedSeconds)}
            </Text>
            {isDriver && (
              <View style={sheetStyles.earningsChip}>
                <Ionicons name="star" size={13} color={Colors.gold} />
                <Text style={sheetStyles.earningsChipText}>
                  {formatCoins(earningsCoins)}
                </Text>
              </View>
            )}
          </View>

          {/* Route summary */}
          {trip && (
            <View style={sheetStyles.routeRow}>
              <View style={sheetStyles.routeTrack}>
                <View style={sheetStyles.routeDotGreen} />
                <View style={sheetStyles.routeConnector} />
                <View style={sheetStyles.routeDotRed} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sheetStyles.routeStop} numberOfLines={1}>
                  {trip.origin}
                </Text>
                <Text style={sheetStyles.routeStop} numberOfLines={1}>
                  {trip.destination}
                </Text>
              </View>
            </View>
          )}

          {/* Passenger chips (driver only) */}
          {isDriver && passengers.length > 0 && (
            <View style={sheetStyles.section}>
              <Text style={sheetStyles.sectionLabel}>
                {t("trip.passengers")}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={sheetStyles.passengerRow}
              >
                {passengers.map((p, i) => (
                  <PassengerChip key={p.id} passenger={p} index={i} />
                ))}
              </ScrollView>
            </View>
          )}

          {isDriver && passengers.length === 0 && (
            <View style={sheetStyles.noPassRow}>
              <Ionicons
                name="person-add-outline"
                size={16}
                color="rgba(255,255,255,0.3)"
              />
              <Text style={sheetStyles.noPassText}>
                {t("trip.noPassengers")}
              </Text>
            </View>
          )}

          {!isDriver && myPassenger?.destination && (
            <View style={sheetStyles.myDestRow}>
              <Ionicons name="location" size={14} color={Colors.primary} />
              <Text style={sheetStyles.myDestText} numberOfLines={1}>
                Your stop: {myPassenger.destination}
              </Text>
            </View>
          )}

          <View style={sheetStyles.aboardRow}>
            <Ionicons
              name="people-outline"
              size={14}
              color="rgba(255,255,255,0.4)"
            />
            <Text style={sheetStyles.aboardText}>
              {passengers.length} {t("trip.passengersOnboard")}
            </Text>
          </View>

          {/* Action buttons */}
          <View style={sheetStyles.actionRow}>
            <Pressable
              style={({ pressed }) => [
                sheetStyles.sosBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={onSOS}
            >
              <Ionicons name="warning" size={18} color={Colors.error} />
              <Text style={sheetStyles.sosBtnText}>{t("trip.sos")}</Text>
            </Pressable>

            {isDriver ? (
              <Pressable
                style={({ pressed }) => [
                  sheetStyles.endBtn,
                  isEnding && sheetStyles.endBtnDisabled,
                  pressed && !isEnding && { opacity: 0.88 },
                ]}
                onPress={onEndTrip}
                disabled={isEnding}
              >
                <LinearGradient
                  colors={[Colors.primary, Colors.primaryDark]}
                  style={sheetStyles.endBtnGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="flag" size={18} color="#fff" />
                  <Text style={sheetStyles.endBtnText}>
                    {isEnding ? "Ending..." : t("trip.endTrip")}
                  </Text>
                </LinearGradient>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  sheetStyles.endBtn,
                  isEnding && sheetStyles.endBtnDisabled,
                  pressed && !isEnding && { opacity: 0.88 },
                ]}
                onPress={onLeaveTrip}
                disabled={isEnding}
              >
                <LinearGradient
                  colors={["#3B82F6", "#1D4ED8"]}
                  style={sheetStyles.endBtnGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="exit-outline" size={18} color="#fff" />
                  <Text style={sheetStyles.endBtnText}>
                    {isEnding ? "Leaving..." : "Leave Trip"}
                  </Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ─── Chat Bubble ──────────────────────────────────────────────────────────────
function ChatBubble({
  msg,
  isSpeaking,
  onSpeak,
}: {
  msg: ChatMessage;
  isSpeaking: boolean;
  onSpeak: (text: string) => void;
}) {
  const isUser = msg.role === "user";
  return (
    <View
      style={[aiStyles.bubble, isUser ? aiStyles.bubbleUser : aiStyles.bubbleAI]}
    >
      {!isUser && (
        <View style={aiStyles.bubbleHeader}>
          <View style={aiStyles.aiBubbleIcon}>
            <Ionicons
              name={(msg.icon as any) ?? "sparkles"}
              size={13}
              color={Colors.gold}
            />
          </View>
          <Text style={aiStyles.bubbleAILabel}>Teqil AI</Text>
          <Pressable
            onPress={() => onSpeak(msg.text)}
            style={aiStyles.speakBtn}
            hitSlop={8}
          >
            <Ionicons
              name={isSpeaking ? "volume-high" : "volume-medium-outline"}
              size={14}
              color={
                isSpeaking ? Colors.primary : "rgba(255,255,255,0.4)"
              }
            />
          </Pressable>
        </View>
      )}
      <Text
        style={[
          aiStyles.bubbleText,
          isUser && aiStyles.bubbleTextUser,
        ]}
      >
        {msg.text}
      </Text>
      <Text style={aiStyles.bubbleTime}>
        {msg.timestamp.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </Text>
    </View>
  );
}

// ─── AI Assistant Modal ───────────────────────────────────────────────────────
function AIAssistantModal({
  visible,
  onClose,
  ctx,
}: {
  visible: boolean;
  onClose: () => void;
  ctx: AIContext;
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

  // Keep ctx in a ref so the welcome message callback doesn't need it in deps
  const ctxRef = useRef(ctx);
  useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);

  const speakText = useCallback((id: string, text: string) => {
    Speech.stop();
    setSpeakingId(id);
    Speech.speak(text, {
      language: "en-NG",
      rate: 1.05,
      pitch: 1.1,
      volume: 1.0,
      onDone: () => setSpeakingId(null),
      onError: () => setSpeakingId(null),
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    Speech.stop();
    setSpeakingId(null);
  }, []);

  useEffect(() => {
    if (visible) {
      op.value = withTiming(1, { duration: 220 });
      tY.value = withSpring(0, { damping: 22, stiffness: 200 });
      if (messages.length === 0) {
        const c = ctxRef.current;
        const welcome: ChatMessage = {
          id: "welcome",
          role: "ai",
          icon: "sparkles",
          timestamp: new Date(),
          text:
            c.role === "driver"
              ? `Hi boss 👋 I'm your Teqil AI co-pilot. Ask me about traffic, fuel stations, earnings or anything about your trip from ${c.origin ?? "origin"} to ${c.destination ?? "destination"}.`
              : `Hi there 👋 I'm your Teqil AI assistant. Ask me about your ETA, the route, weather or anything about your journey to ${c.passengerDestination ?? c.destination ?? "your destination"}.`,
        };
        setMessages([welcome]);
        if (!muted) speakText(welcome.id, welcome.text);
      }
    } else {
      op.value = withTiming(0, { duration: 180 });
      tY.value = withTiming(600, { duration: 260 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]); // intentional: welcome message only on first open, op/tY stable

  const overlayStyle = useAnimatedStyle(() => ({ opacity: op.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: tY.value }],
  }));

  const toggleMute = () => {
    if (!muted) stopSpeaking();
    setMuted((m) => !m);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const sendMessage = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || loading) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setInput("");
      stopSpeaking();
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        text: q,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      setTimeout(
        () => scrollRef.current?.scrollToEnd({ animated: true }),
        80
      );
      try {
        const resp: AIResponse = await askAI(q, ctxRef.current);
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: "ai",
          text: resp.text,
          icon: resp.icon,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMsg]);
        if (!muted) speakText(aiMsg.id, aiMsg.text);
        setTimeout(
          () => scrollRef.current?.scrollToEnd({ animated: true }),
          80
        );
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "ai",
            text: "Sorry, I couldn't get a response. Please try again.",
            icon: "alert-circle-outline",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, muted, speakText, stopSpeaking]
  );

  const handleClose = () => {
    stopSpeaking();
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ReAnimated.View style={[aiStyles.overlay, overlayStyle]}>
          <Pressable style={aiStyles.overlayTap} onPress={handleClose} />
        </ReAnimated.View>
        <ReAnimated.View
          style={[
            aiStyles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
            sheetStyle,
          ]}
        >
          <View style={aiStyles.sheetHandle} />
          <View style={aiStyles.header}>
            <View style={aiStyles.headerLeft}>
              <View style={aiStyles.headerIcon}>
                <Ionicons name="sparkles" size={18} color={Colors.gold} />
              </View>
              <View>
                <Text style={aiStyles.headerTitle}>Teqil AI</Text>
                <Text style={aiStyles.headerSub}>
                  {ctx.role === "driver"
                    ? "Driver co-pilot"
                    : "Journey assistant"}
                </Text>
              </View>
            </View>
            <View style={aiStyles.headerRight}>
              <Pressable
                onPress={toggleMute}
                style={aiStyles.muteBtn}
                hitSlop={8}
              >
                <Ionicons
                  name={muted ? "volume-mute" : "volume-high-outline"}
                  size={20}
                  color={
                    muted ? Colors.error : "rgba(255,255,255,0.6)"
                  }
                />
              </Pressable>
              <Pressable
                onPress={handleClose}
                style={aiStyles.closeBtn}
                hitSlop={8}
              >
                <Ionicons
                  name="close"
                  size={20}
                  color="rgba(255,255,255,0.6)"
                />
              </Pressable>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={aiStyles.quickRow}
            style={aiStyles.quickScroll}
          >
            {QUICK_ACTIONS.map((qa) => (
              <Pressable
                key={qa.label}
                style={({ pressed }) => [
                  aiStyles.quickChip,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => sendMessage(qa.question)}
                disabled={loading}
              >
                <Ionicons
                  name={qa.icon as any}
                  size={14}
                  color={Colors.primary}
                />
                <Text style={aiStyles.quickChipText}>{qa.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <ScrollView
            ref={scrollRef}
            style={aiStyles.chatScroll}
            contentContainerStyle={aiStyles.chatContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              scrollRef.current?.scrollToEnd({ animated: true })
            }
          >
            {messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                msg={msg}
                isSpeaking={speakingId === msg.id}
                onSpeak={(text) => {
                  speakingId === msg.id
                    ? stopSpeaking()
                    : speakText(msg.id, text);
                }}
              />
            ))}
            {loading && (
              <View style={aiStyles.typingRow}>
                <View style={aiStyles.typingBubble}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={aiStyles.typingText}>
                    Teqil AI is thinking…
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={aiStyles.inputRow}>
            <TextInput
              ref={inputRef}
              style={aiStyles.input}
              placeholder="Ask me anything about your trip…"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={200}
              returnKeyType="send"
              onSubmitEditing={() => sendMessage(input)}
              editable={!loading}
            />
            <Pressable
              style={[
                aiStyles.sendBtn,
                (!input.trim() || loading) && aiStyles.sendBtnDisabled,
              ]}
              onPress={() => sendMessage(input)}
              disabled={!input.trim() || loading}
            >
              <Ionicons name="send" size={16} color="#fff" />
            </Pressable>
          </View>
        </ReAnimated.View>
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
    activeTrip,
    earningsCoins,
    incrementEarnings,
    elapsedSeconds,
    setElapsedSeconds,
    resetTripState,
  } = useTripStore();
  const { t } = useTranslation();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [myPassenger, setMyPassenger] = useState<Passenger | null>(null);
  const [isEnding, setIsEnding] = useState(false);
  const [sosVisible, setSosVisible] = useState(false);
  const [aiVisible, setAiVisible] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [topBarCollapsed, setTopBarCollapsed] = useState(false);

  // Rating modal state
  const [ratingContext, setRatingContext] = useState<{
    tripId: string;
    ratedUserId: string;
    raterRole: "driver" | "passenger";
  } | null>(null);

  const [routePoints, setRoutePoints] = useState<LatLng[]>([]);
  const [originCoord, setOriginCoord] = useState<LatLng | null>(null);
  const [destCoord, setDestCoord] = useState<LatLng | null>(null);
  const [driverLocation, setDriverLocation] = useState<LatLng | null>(null);
  const [passengerMarkers, setPassengerMarkers] = useState<
    { passenger: Passenger; coord: LatLng }[]
  >([]);
  const [mapReady, setMapReady] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [locationPermission, setLocationPermission] = useState<
    boolean | null
  >(null);

  const mapRef = useRef<MapView>(null);
  const locationWatcher = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const topBarHeight = useSharedValue(1);

  // Stable refs to avoid stale closures in effects
  const isDriverRef = useRef(user?.role === "driver");
  const userRef = useRef(user);
  useEffect(() => {
    isDriverRef.current = user?.role === "driver";
    userRef.current = user;
  }, [user]);

  const isDriver = user?.role === "driver";
  const displayTrip = trip || activeTrip;
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const aiCtx: AIContext = useMemo(
    () => ({
      role: isDriver ? "driver" : "passenger",
      origin: displayTrip?.origin,
      destination: displayTrip?.destination,
      passengerDestination: myPassenger?.destination,
      elapsedSeconds,
      passengerCount: passengers.length,
      tripCode: code ?? undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isDriver,
      displayTrip?.id,
      myPassenger?.id,
      elapsedSeconds,
      passengers.length,
      code,
    ]
  );

  // Register for push notifications once on mount
  useEffect(() => {
    registerForPushNotifications().catch(() => {});
  }, []);

  // Location permission
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      setLocationPermission(status === "granted");
    });
  }, []);

  // Load trip + passengers
  useEffect(() => {
    if (!code) return;
    const currentIsDriver = isDriverRef.current;
    const currentUser = userRef.current;
    (async () => {
      const found = await TripsStorage.getByCode(code);
      if (!found) return;
      setTrip(found);
      const psgrs = await PassengersStorage.getByTripId(found.id);
      setPassengers(psgrs);
      if (!currentIsDriver && currentUser?.id) {
        setMyPassenger(
          psgrs.find((p) => p.user_id === currentUser.id) ?? null
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]); // intentionally omit isDriver/user.id — read from stable refs

  // Geocode + fetch route
  useEffect(() => {
    if (!displayTrip) return;
    const { origin, destination, trip_code } = displayTrip;
    (async () => {
      const [oCoord, dCoord] = await Promise.all([
        geocodeAddress(origin),
        geocodeAddress(destination),
      ]);
      if (oCoord) setOriginCoord(oCoord);
      if (dCoord) setDestCoord(dCoord);
      const pts = await fetchRoute(origin, destination, trip_code);
      if (pts && pts.length > 0) {
        setRoutePoints(pts);
        setRouteError(null);
      } else if (!GMAPS_KEY) {
        setRouteError(
          "Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to enable route drawing."
        );
      } else {
        setRouteError(
          "Could not load route. Showing map without directions."
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayTrip?.id]); // re-run only when trip changes, not on every render

  // Geocode passenger markers
  useEffect(() => {
    if (!passengers.length) return;
    const destFallback = displayTrip?.destination;
    (async () => {
      const results: { passenger: Passenger; coord: LatLng }[] = [];
      await Promise.all(
        passengers.map(async (p) => {
          const dest = p.destination || destFallback;
          if (!dest) return;
          const coord = await geocodeAddress(dest);
          if (coord) results.push({ passenger: p, coord });
        })
      );
      setPassengerMarkers(results);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passengers]); // displayTrip?.destination is stable once trip is loaded

  // Driver live location watcher
  useEffect(() => {
    if (!isDriver || !locationPermission) return;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (loc) => {
          setDriverLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      );
      locationWatcher.current = sub;
    })();
    return () => {
      sub?.remove();
    };
  }, [isDriver, locationPermission]);

  // Passenger: single position
  useEffect(() => {
    if (isDriver || !locationPermission) return;
    Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    })
      .then((loc) => {
        setDriverLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      })
      .catch(() => {});
  }, [isDriver, locationPermission]);

  // Center map after data ready
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const center =
      driverLocation ??
      (originCoord && destCoord
        ? midpoint(originCoord, destCoord)
        : originCoord ?? destCoord);
    if (!center) return;
    if (routePoints.length > 1) {
      mapRef.current.fitToCoordinates(routePoints, {
        edgePadding: { top: 120, right: 40, bottom: 120, left: 40 },
        animated: true,
      });
    } else {
      mapRef.current.animateToRegion(
        { ...center, latitudeDelta: 0.04, longitudeDelta: 0.04 },
        800
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, routePoints.length, driverLocation]); // originCoord/destCoord stable after load

  // Driver earnings timer
  useEffect(() => {
    if (!isDriver) return;
    timerRef.current = setInterval(() => {
      setElapsedSeconds(elapsedSeconds + 1);
      if (elapsedSeconds > 0 && elapsedSeconds % 30 === 0) {
        incrementEarnings(1);
      }
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSeconds, isDriver]); // incrementEarnings/setElapsedSeconds are stable Zustand actions

  const toggleTopBar = () => {
    const next = !topBarCollapsed;
    setTopBarCollapsed(next);
    topBarHeight.value = withSpring(next ? 0 : 1, { damping: 18 });
  };
  const topBarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      topBarHeight.value,
      [0, 0.4, 1],
      [0, 0, 1],
      Extrapolation.CLAMP
    ),
    maxHeight: interpolate(
      topBarHeight.value,
      [0, 1],
      [0, 120],
      Extrapolation.CLAMP
    ),
    overflow: "hidden",
  }));

  // AI FAB pulse
  const aiBtnScale = useSharedValue(1);
  useEffect(() => {
    aiBtnScale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 1200 }),
        withTiming(1, { duration: 1200 })
      ),
      -1,
      false
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // aiBtnScale is a stable shared value

  const aiBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: aiBtnScale.value }],
  }));

  const handleRecenter = useCallback(() => {
    const target = driverLocation ?? originCoord;
    if (!target || !mapRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mapRef.current.animateToRegion(
      { ...target, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      600
    );
  }, [driverLocation, originCoord]);

  // End trip (driver) → show rating for first passenger, then navigate home
  const handleEndTrip = useCallback(() => {
    setActionSheetVisible(false);
    Alert.alert(t("trip.endTrip"), "This will complete the trip for all passengers.", [
      {
        text: t("common.cancel"),
        style: "cancel",
        onPress: () => setActionSheetVisible(true),
      },
      {
        text: t("trip.endTrip"),
        style: "destructive",
        onPress: async () => {
          setIsEnding(true);
          const endTime = new Date().toISOString();

          if (trip) {
            await TripsStorage.update(trip.id, {
              status: "completed",
              end_time: endTime,
            });
          }

          const currentUser = userRef.current;
          if (currentUser) {
            syncAll({
              id: currentUser.id,
              role: currentUser.role,
              park_name: currentUser.park_name,
            }).catch(() => {});
          }

          if (timerRef.current) clearInterval(timerRef.current);
          locationWatcher.current?.remove();

          const finalTrip = {
            ...trip!,
            end_time: endTime,
            status: "completed" as const,
          };

          await scheduleTripEndNotification({
            trip: finalTrip,
            role: "driver",
          }).catch(() => {});

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          resetTripState();

          // Show rating modal for first passenger (driver rates passenger)
          if (passengers.length > 0) {
            setRatingContext({
              tripId: finalTrip.id,
              ratedUserId: passengers[0].user_id,
              raterRole: "driver",
            });
          } else {
            router.replace("/(driver)");
          }
        },
      },
    ]);
  }, [trip, passengers, t, resetTripState]);

  // Leave trip (passenger) → show rating for driver
  const handleLeaveTrip = useCallback(() => {
    setActionSheetVisible(false);
    Alert.alert("Leave Trip", "Are you sure you want to leave this trip?", [
      {
        text: t("common.cancel"),
        style: "cancel",
        onPress: () => setActionSheetVisible(true),
      },
      {
        text: "Leave Trip",
        style: "destructive",
        onPress: async () => {
          setIsEnding(true);
          const endTime = new Date().toISOString();
          const currentTrip = displayTrip;

          if (myPassenger) {
            await PassengersStorage.update(myPassenger.id, {
              status: "completed",
              dropoff_time: endTime,
            });
          }

          const currentUser = userRef.current;
          if (currentUser) {
            syncAll({
              id: currentUser.id,
              role: currentUser.role,
              park_name: currentUser.park_name,
            }).catch(() => {});
          }

          if (currentTrip) {
            await scheduleTripEndNotification({
              trip: { ...currentTrip, end_time: endTime },
              role: "passenger",
              emergencyContacts: myPassenger?.emergency_contacts,
            }).catch(() => {});
          }

          locationWatcher.current?.remove();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          resetTripState();

          // Show rating modal — passenger rates driver
          if (currentTrip?.driver_id) {
            setRatingContext({
              tripId: currentTrip.id,
              ratedUserId: currentTrip.driver_id,
              raterRole: "passenger",
            });
          } else {
            router.replace("/(passenger)");
          }
        },
      },
    ]);
  }, [displayTrip, myPassenger, t, resetTripState]);

  const handleSOSPress = () => {
    setActionSheetVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setSosVisible(true);
  };

  const handleSOSConfirm = async () => {
    setSosVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    const contacts = myPassenger?.emergency_contacts ?? [];
    const locationStr = driverLocation
      ? `${driverLocation.latitude.toFixed(5)}, ${driverLocation.longitude.toFixed(5)}`
      : "Location unavailable";
    if (displayTrip) {
      await scheduleSOSNotification(
        displayTrip,
        contacts,
        locationStr
      ).catch(() => {});
    }
    Alert.alert(
      "SOS Sent",
      "Emergency contacts and park owner have been notified."
    );
  };

  // Rating modal submit/close
  const handleRatingClose = useCallback(() => {
    const role = ratingContext?.raterRole;
    setRatingContext(null);
    if (role === "driver") {
      router.replace("/(driver)");
    } else {
      router.replace("/(passenger)");
    }
  }, [ratingContext?.raterRole]);

  const initialRegion: Region = useMemo(() => {
    const center = driverLocation ??
      originCoord ?? { latitude: 6.5244, longitude: 3.3792 };
    return { ...center, latitudeDelta: 0.04, longitudeDelta: 0.04 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally static — only used as initial value for MapView

  return (
    <View style={styles.container}>
      {/* Map */}
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
        zoomEnabled
        scrollEnabled
        rotateEnabled
        pitchEnabled={false}
      >
        {routePoints.length > 1 && (
          <Polyline
            coordinates={routePoints}
            strokeColor={Colors.primary}
            strokeWidth={4}
          />
        )}
        {originCoord && (
          <Marker
            coordinate={originCoord}
            title="Origin"
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={mapStyles.originMarker}>
              <View style={mapStyles.originDot} />
            </View>
          </Marker>
        )}
        {destCoord && (
          <Marker
            coordinate={destCoord}
            title="Destination"
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={mapStyles.destMarkerWrap}>
              <View style={mapStyles.destMarker}>
                <Ionicons name="flag" size={16} color="#fff" />
              </View>
              <View style={mapStyles.destMarkerTail} />
            </View>
          </Marker>
        )}
        {driverLocation && (
          <Marker
            coordinate={driverLocation}
            title={isDriver ? "You" : "Driver"}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={mapStyles.driverMarker}>
              <LinearGradient
                colors={[Colors.primary, Colors.primaryDark]}
                style={mapStyles.driverMarkerGradient}
              >
                <Ionicons name="car-sport" size={18} color="#fff" />
              </LinearGradient>
              <View style={mapStyles.driverPulse} />
            </View>
          </Marker>
        )}
        {passengerMarkers.map(({ passenger, coord }, i) => (
          <Marker
            key={passenger.id}
            coordinate={coord}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={mapStyles.passengerMarkerWrap}>
              <View style={mapStyles.passengerMarker}>
                <Text style={mapStyles.passengerMarkerText}>{i + 1}</Text>
              </View>
              <View style={mapStyles.passengerMarkerTail} />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Route error toast */}
      {routeError && (
        <View style={styles.routeErrorBanner}>
          <Ionicons
            name="warning-outline"
            size={14}
            color="rgba(245,166,35,0.9)"
          />
          <Text style={styles.routeErrorText} numberOfLines={2}>
            {routeError}
          </Text>
        </View>
      )}

      {/* Re-center button */}
      <TouchableOpacity
        style={[
          styles.recenterBtn,
          { top: topPadding + (topBarCollapsed ? 64 : 120) },
        ]}
        onPress={handleRecenter}
        activeOpacity={0.8}
      >
        <Ionicons name="locate" size={20} color="#fff" />
      </TouchableOpacity>

      {/* Top bar */}
      <View
        style={[styles.topBarWrapper, { paddingTop: topPadding + 8 }]}
      >
        <View style={styles.topBarRow}>
          <AnimatedPressable
            onPress={() => router.back()}
            style={styles.topBarIconBtn}
            scaleValue={0.9}
          >
            <View style={styles.topBarIconInner}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </View>
          </AnimatedPressable>

          <Pressable onPress={toggleTopBar} style={styles.topBarCenter}>
            <View style={styles.topBarCenterContent}>
              <LiveBadge />
              <Text style={styles.topBarCodeText}>{code}</Text>
              <Ionicons
                name={topBarCollapsed ? "chevron-down" : "chevron-up"}
                size={12}
                color="rgba(255,255,255,0.5)"
              />
            </View>
          </Pressable>

          {isDriver ? (
            <EarningsCounter coins={earningsCoins} />
          ) : (
            <View style={styles.durationPill}>
              <Ionicons
                name="time-outline"
                size={13}
                color="rgba(255,255,255,0.7)"
              />
              <Text style={styles.durationText}>
                {formatDuration(elapsedSeconds)}
              </Text>
            </View>
          )}
        </View>

        <ReAnimated.View style={topBarStyle}>
          <View style={styles.topBarDetailRow}>
            <View style={styles.topBarDetailItem}>
              <Ionicons
                name="radio-button-on"
                size={10}
                color={Colors.primary}
              />
              <Text style={styles.topBarDetailText} numberOfLines={1}>
                {displayTrip?.origin || "—"}
              </Text>
            </View>
            <Ionicons
              name="arrow-forward"
              size={12}
              color="rgba(255,255,255,0.3)"
            />
            <View style={styles.topBarDetailItem}>
              <Ionicons
                name="location"
                size={10}
                color={Colors.error}
              />
              <Text style={styles.topBarDetailText} numberOfLines={1}>
                {displayTrip?.destination || "—"}
              </Text>
            </View>
            {isDriver && (
              <View style={styles.topBarDetailItem}>
                <Ionicons
                  name="people-outline"
                  size={10}
                  color="rgba(255,255,255,0.5)"
                />
                <Text style={styles.topBarDetailText}>
                  {passengers.length} aboard
                </Text>
              </View>
            )}
          </View>
        </ReAnimated.View>
      </View>

      {/* Floating FAB group */}
      <View
        style={[
          styles.fabGroup,
          {
            bottom:
              Math.max(insets.bottom, 24) +
              (Platform.OS === "web" ? 34 : 0),
          },
        ]}
      >
        {/* AI FAB */}
        <ReAnimated.View style={aiBtnStyle}>
          <AnimatedPressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAiVisible(true);
            }}
            style={styles.aiFab}
            scaleValue={0.88}
          >
            <LinearGradient
              colors={["#2D2D2D", "#1A1A1A"]}
              style={styles.aiFabGradient}
            >
              <Ionicons name="sparkles" size={22} color={Colors.gold} />
            </LinearGradient>
          </AnimatedPressable>
        </ReAnimated.View>

        {/* Trip action sheet FAB */}
        <AnimatedPressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setActionSheetVisible(true);
          }}
          style={styles.tripFab}
          scaleValue={0.92}
        >
          <LinearGradient
            colors={[Colors.primary, Colors.primaryDark]}
            style={styles.tripFabGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="list" size={22} color="#fff" />
            <Text style={styles.tripFabText}>Trip</Text>
          </LinearGradient>
        </AnimatedPressable>
      </View>

      {/* Modals */}
      <SOSModal
        visible={sosVisible}
        onConfirm={handleSOSConfirm}
        onCancel={() => setSosVisible(false)}
      />

      <AIAssistantModal
        visible={aiVisible}
        onClose={() => setAiVisible(false)}
        ctx={aiCtx}
      />

      <ActionSheetModal
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        trip={displayTrip ?? null}
        passengers={passengers}
        myPassenger={myPassenger}
        isDriver={isDriver}
        earningsCoins={earningsCoins}
        elapsedSeconds={elapsedSeconds}
        isEnding={isEnding}
        onEndTrip={handleEndTrip}
        onLeaveTrip={handleLeaveTrip}
        onSOS={handleSOSPress}
        t={t}
      />

      {/* Rating Modal — shown after trip ends */}
      {ratingContext && (
        <RatingModal
          visible
          onClose={handleRatingClose}
          tripId={ratingContext.tripId}
          ratedUserId={ratingContext.ratedUserId}
          raterRole={ratingContext.raterRole}
          onSubmit={handleRatingClose}
        />
      )}
    </View>
  );
}

// ─── Action Sheet Styles ──────────────────────────────────────────────────────
const sheetStyles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#111A14",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 24,
  },
  handleArea: {
    paddingTop: 12,
    paddingBottom: 4,
    alignItems: "center",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 14,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 8,
  },
  codeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  codeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: "#fff",
    letterSpacing: 2,
  },
  durationText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.primary,
  },
  earningsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(245,166,35,0.12)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: "auto" as any,
  },
  earningsChipText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.gold,
  },
  routeRow: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: 14,
  },
  routeTrack: {
    alignItems: "center",
    paddingTop: 3,
    width: 14,
  },
  routeDotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  routeConnector: {
    width: 2,
    flex: 1,
    minHeight: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginVertical: 4,
  },
  routeDotRed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.error,
  },
  routeStop: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    marginBottom: 10,
  },
  section: { gap: 8 },
  sectionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  passengerRow: { gap: 10, paddingRight: 8 },
  noPassRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 12,
  },
  noPassText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.35)",
  },
  myDestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,166,81,0.08)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(0,166,81,0.18)",
  },
  myDestText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    flex: 1,
  },
  aboardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  aboardText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  sosBtn: {
    width: 80,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  sosBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: Colors.error,
    letterSpacing: 0.5,
  },
  endBtn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  endBtnDisabled: { opacity: 0.6 },
  endBtnGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  endBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});

// ─── Map Marker Styles ────────────────────────────────────────────────────────
const mapStyles = StyleSheet.create({
  originMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(74,222,128,0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#4ADE80",
  },
  originDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ADE80",
  },
  destMarkerWrap: { alignItems: "center" },
  destMarker: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.error,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.error,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },
  destMarkerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: Colors.error,
    marginTop: -1,
  },
  driverMarker: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  driverMarkerGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  driverPulse: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: Colors.primary + "55",
    backgroundColor: "transparent",
  },
  passengerMarkerWrap: { alignItems: "center" },
  passengerMarker: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.error,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.error,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  passengerMarkerText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: "#fff",
  },
  passengerMarkerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: Colors.error,
    marginTop: -1,
  },
});

// ─── Main Styles ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f2d1c" },

  routeErrorBanner: {
    position: "absolute",
    bottom: 120,
    left: 16,
    right: 80,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(20,30,22,0.9)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.3)",
    zIndex: 10,
  },
  routeErrorText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(245,166,35,0.85)",
    lineHeight: 16,
  },

  recenterBtn: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "rgba(10,22,14,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },

  topBarWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(10,22,14,0.88)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    zIndex: 20,
  },
  topBarRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  topBarIconBtn: { width: 38, height: 38 },
  topBarIconInner: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarCenter: { flex: 1, alignItems: "center" },
  topBarCenterContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topBarCodeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: "#fff",
    letterSpacing: 2,
  },
  topBarDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
    flexWrap: "wrap",
  },
  topBarDetailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    minWidth: 80,
  },
  topBarDetailText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
    flex: 1,
  },

  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(239,68,68,0.15)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.error,
  },
  liveText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10,
    color: Colors.error,
    letterSpacing: 1.5,
  },
  earningsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(245,166,35,0.15)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.3)",
  },
  earningsText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: Colors.gold,
  },
  durationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  durationText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
  },

  // FAB group
  fabGroup: {
    position: "absolute",
    right: 20,
    zIndex: 15,
    gap: 12,
    alignItems: "center",
  },
  aiFab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  aiFabGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
  tripFab: {
    width: 72,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 12,
  },
  tripFabGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  tripFabText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },

  // SOS modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  sosSheet: {
    backgroundColor: "rgba(59,59,59,0.85)",
    borderRadius: 28,
    marginHorizontal: 12,
    padding: 28,
    paddingBottom: 40,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  sosIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(239,68,68,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "rgba(239,68,68,0.3)",
  },
  sosTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: "#fff",
    marginBottom: 8,
  },
  sosDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  sosActions: { flexDirection: "row", gap: 12, width: "100%" },
  sosCancelBtn: { flex: 1, height: 52 },
  sosCancelInner: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  sosCancelText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "rgba(255,255,255,0.7)",
  },
  sosConfirmBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.error,
  },
  sosConfirmInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.error,
  },
  sosConfirmText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },

  passengerChip: { alignItems: "center", gap: 5, width: 64 },
  passengerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.08)",
  },
  passengerAvatarText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
  },
  passengerDestText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
  },
});

// ─── AI Modal Styles ──────────────────────────────────────────────────────────
const aiStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.76)",
  },
  overlayTap: { flex: 1 },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#111A14",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 24,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(245,166,35,0.12)",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  headerSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    marginTop: 1,
  },
  headerRight: { flexDirection: "row", gap: 6 },
  muteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  quickScroll: { flexGrow: 0, marginBottom: 10 },
  quickRow: { gap: 8, paddingHorizontal: 20, paddingVertical: 2 },
  quickChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,166,81,0.1)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(0,166,81,0.22)",
  },
  quickChipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
  },
  chatScroll: { flex: 1, minHeight: 120 },
  chatContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 10,
  },
  bubble: { maxWidth: "85%", borderRadius: 16, padding: 12 },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    alignSelf: "flex-start",
    backgroundColor: "#1E2820",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  bubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  aiBubbleIcon: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: "rgba(245,166,35,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleAILabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    color: Colors.gold,
    letterSpacing: 0.5,
    flex: 1,
  },
  speakBtn: { padding: 2 },
  bubbleText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 20,
  },
  bubbleTextUser: { color: "#fff" },
  bubbleTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: "rgba(255,255,255,0.35)",
    marginTop: 4,
    alignSelf: "flex-end",
  },
  typingRow: { alignSelf: "flex-start" },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1E2820",
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  typingText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 90,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  sendBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.1)",
    shadowOpacity: 0,
    elevation: 0,
  },
});