import React, { useEffect, useState, useRef } from "react";
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
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
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
import { LinearGradient } from "expo-linear-gradient";
import { useAuthStore, useTripStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { TripsStorage, PassengersStorage } from "@/src/services/storage";
import { formatCoins, formatDuration } from "@/src/utils/helpers";
import type { Trip, Passenger } from "@/src/models/types";
import { useTranslation } from "react-i18next";

const { width, height } = Dimensions.get("window");

// ─── Animated Pressable ─────────────────────────────────────────────────────
interface AnimatedPressableProps {
  onPress: () => void;
  style?: object;
  children: React.ReactNode;
  disabled?: boolean;
  scaleValue?: number;
}

function AnimatedPressable({
  onPress,
  style,
  children,
  disabled,
  scaleValue = 0.94,
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(scaleValue, { damping: 20, stiffness: 300 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  return (
    <Animated.View style={[animStyle, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={{ flex: 1 }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─── Earnings Counter ────────────────────────────────────────────────────────
function EarningsCounter({ coins }: { coins: number }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.2, { duration: 120 }),
      withSpring(1, { damping: 12 })
    );
  }, [coins]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.earningsPill, style]}>
      <Ionicons name="star" size={14} color={Colors.gold} />
      <Text style={styles.earningsText}>{formatCoins(coins)}</Text>
    </Animated.View>
  );
}

// ─── Live Indicator ──────────────────────────────────────────────────────────
function LiveBadge() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0.3, { duration: 800 }), withTiming(1, { duration: 800 })),
      -1,
      false
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

// ─── SOS Confirmation Modal ──────────────────────────────────────────────────
function SOSModal({
  visible,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const translateY = useSharedValue(300);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withSpring(0, { damping: 20 });
    } else {
      opacity.value = withTiming(0, { duration: 150 });
      translateY.value = withTiming(300, { duration: 200 });
    }
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none">
      <Animated.View style={[styles.modalOverlay, overlayStyle]}>
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

// ─── AI Assistant Bottom Sheet ────────────────────────────────────────────────
function AIAssistantSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const translateY = useSharedValue(500);
  const opacity = useSharedValue(0);
  const [input, setInput] = useState("");
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withSpring(0, { damping: 22, stiffness: 200 });
    } else {
      opacity.value = withTiming(0, { duration: 150 });
      translateY.value = withTiming(500, { duration: 250 });
    }
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const quickActions = [
    { icon: "navigate-outline" as const, label: "Traffic Update" },
    { icon: "people-outline" as const, label: "Estimate Fares" },
    { icon: "shield-checkmark-outline" as const, label: "Safety Check" },
    { icon: "chatbubble-outline" as const, label: "Passenger Info" },
  ];

  const handleSend = () => {
    Alert.alert("AI Assistant", "AI assistant coming soon");
    setInput("");
  };

  const handleQuickAction = () => {
    Alert.alert("AI Assistant", "AI assistant coming soon");
  };

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View style={[styles.modalOverlay, overlayStyle]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <Animated.View
            style={[
              styles.aiSheet,
              { paddingBottom: insets.bottom + 16 },
              sheetStyle,
            ]}
          >
            {/* Header */}
            <View style={styles.aiSheetHeader}>
              <View style={styles.aiSheetHandle} />
              <View style={styles.aiTitleRow}>
                <View style={styles.aiIconBg}>
                  <Ionicons name="sparkles" size={18} color={Colors.gold} />
                </View>
                <View>
                  <Text style={styles.aiTitle}>Teqil AI Assistant</Text>
                  <Text style={styles.aiSubtitle}>Coming soon — ask me anything</Text>
                </View>
              </View>
            </View>

            {/* Quick Actions */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickActionsRow}
            >
              {quickActions.map((qa, i) => (
                <AnimatedPressable key={i} onPress={handleQuickAction} style={styles.quickActionBtn}>
                  <View style={styles.quickActionInner}>
                    <Ionicons name={qa.icon} size={18} color={Colors.primary} />
                    <Text style={styles.quickActionLabel}>{qa.label}</Text>
                  </View>
                </AnimatedPressable>
              ))}
            </ScrollView>

            {/* Coming soon banner */}
            <View style={styles.aiComingSoonBanner}>
              <Ionicons name="construct-outline" size={16} color={Colors.gold} />
              <Text style={styles.aiComingSoonText}>
                AI features are being built. Tap any action to get a preview.
              </Text>
            </View>

            {/* Input */}
            <View style={styles.aiInputRow}>
              <TextInput
                style={styles.aiInput}
                placeholder="Ask the AI anything about your trip..."
                placeholderTextColor={Colors.textTertiary}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={200}
              />
              <AnimatedPressable
                onPress={handleSend}
                style={styles.aiSendBtn}
                scaleValue={0.88}
              >
                <View
                  style={[
                    styles.aiSendInner,
                    { backgroundColor: input.trim() ? Colors.primary : Colors.border },
                  ]}
                >
                  <Ionicons name="send" size={16} color="#fff" />
                </View>
              </AnimatedPressable>
            </View>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Passenger Chip ───────────────────────────────────────────────────────────
function PassengerChip({ passenger, index }: { passenger: Passenger; index: number }) {
  const colors = ["#00A651", "#3B82F6", "#F5A623", "#EF4444", "#8B5CF6"];
  const color = colors[index % colors.length];

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

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function LiveTripScreen() {
  const insets = useSafeAreaInsets();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user } = useAuthStore();
  const {
    activeTrip,
    setActiveTrip,
    earningsCoins,
    incrementEarnings,
    elapsedSeconds,
    setElapsedSeconds,
    resetTripState,
  } = useTripStore();
  const { t } = useTranslation();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [isEnding, setIsEnding] = useState(false);
  const [sosVisible, setSosVisible] = useState(false);
  const [aiVisible, setAiVisible] = useState(false);
  const [topBarCollapsed, setTopBarCollapsed] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const topBarHeight = useSharedValue(1); // 1 = expanded, 0 = collapsed

  const isDriver = user?.role === "driver";
  const displayTrip = trip || activeTrip;
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  // ── Data loading ────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const found = await TripsStorage.getByCode(code || "");
      if (found) {
        setTrip(found);
        const psgrs = await PassengersStorage.getByTripId(found.id);
        setPassengers(psgrs);
      }
    };
    init();
  }, [code]);

  // ── Driver timer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isDriver) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(elapsedSeconds + 1);
        if (elapsedSeconds > 0 && elapsedSeconds % 30 === 0) {
          incrementEarnings(1);
        }
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [elapsedSeconds, isDriver]);

  // ── Top bar collapse ─────────────────────────────────────────────────────────
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

  // ── Floating AI button pulse ──────────────────────────────────────────────────
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
  }, []);
  const aiBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: aiBtnScale.value }],
  }));

  // ── End trip ──────────────────────────────────────────────────────────────────
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
            if (timerRef.current) clearInterval(timerRef.current);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            resetTripState();
            router.replace(isDriver ? "/(driver)" : "/(passenger)");
          },
        },
      ]
    );
  };

  // ── SOS ───────────────────────────────────────────────────────────────────────
  const handleSOSPress = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setSosVisible(true);
  };

  const handleSOSConfirm = () => {
    setSosVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Alert.alert("SOS Sent", "Emergency contacts and park owner have been notified.");
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ── Map Placeholder ──────────────────────────────────────────────────── */}
      <View style={styles.mapContainer}>
        <LinearGradient
          colors={["#0f2d1c", "#1a4a2e", "#22603b", "#1a4a2e"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Grid overlay for map feel */}
        <View style={styles.mapGrid} pointerEvents="none" />

        {/* Route visualization */}
        <View style={styles.routeViz}>
          {/* Origin dot */}
          <View style={styles.routeOriginNode}>
            <View style={styles.routeOriginDot} />
            <Text style={styles.routeNodeLabel} numberOfLines={1}>
              {displayTrip?.origin || "Origin"}
            </Text>
          </View>

          {/* Dotted path */}
          <View style={styles.routeDottedLine}>
            {Array.from({ length: 10 }).map((_, i) => (
              <View key={i} style={styles.routeDash} />
            ))}
          </View>

          {/* Car marker */}
          <View style={styles.carMarker}>
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              style={styles.carMarkerGradient}
            >
              <Ionicons name="car-sport" size={24} color="#fff" />
            </LinearGradient>
            <View style={styles.carMarkerShadow} />
          </View>

          {/* Dotted path */}
          <View style={styles.routeDottedLine}>
            {Array.from({ length: 10 }).map((_, i) => (
              <View key={i} style={styles.routeDash} />
            ))}
          </View>

          {/* Destination dot */}
          <View style={styles.routeDestNode}>
            <View style={styles.routeDestDot} />
            <Text style={styles.routeNodeLabel} numberOfLines={1}>
              {displayTrip?.destination || "Destination"}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Top Bar ───────────────────────────────────────────────────────────── */}
      <View style={[styles.topBarWrapper, { paddingTop: topPadding + 8 }]}>
        <View style={styles.topBarRow}>
          {/* Back button */}
          <AnimatedPressable
            onPress={() => router.back()}
            style={styles.topBarIconBtn}
            scaleValue={0.9}
          >
            <View style={styles.topBarIconInner}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </View>
          </AnimatedPressable>

          {/* Center info */}
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

          {/* Earnings / timer */}
          {isDriver ? (
            <EarningsCounter coins={earningsCoins} />
          ) : (
            <View style={styles.durationPill}>
              <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={styles.durationText}>{formatDuration(elapsedSeconds)}</Text>
            </View>
          )}
        </View>

        {/* Collapsible detail row */}
        <Animated.View style={topBarStyle}>
          <View style={styles.topBarDetailRow}>
            <View style={styles.topBarDetailItem}>
              <Ionicons name="radio-button-on" size={10} color={Colors.primary} />
              <Text style={styles.topBarDetailText} numberOfLines={1}>
                {displayTrip?.origin || "—"}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={12} color="rgba(255,255,255,0.3)" />
            <View style={styles.topBarDetailItem}>
              <Ionicons name="location" size={10} color={Colors.error} />
              <Text style={styles.topBarDetailText} numberOfLines={1}>
                {displayTrip?.destination || "—"}
              </Text>
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

      {/* ── Bottom Sheet ──────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.bottomSheet,
          { paddingBottom: Math.max(insets.bottom, 16) + (Platform.OS === "web" ? 34 : 0) },
        ]}
      >
        <View style={styles.sheetHandle} />

        {/* Trip meta row */}
        <View style={styles.tripMetaRow}>
          <View style={styles.tripCodeBadge}>
            <Text style={styles.tripCodeBadgeText}>{code}</Text>
          </View>
          <Text style={styles.tripDurationBadge}>{formatDuration(elapsedSeconds)}</Text>
          <View style={styles.passengerCountBadge}>
            <Ionicons name="people" size={13} color={Colors.primary} />
            <Text style={styles.passengerCountText}>
              {passengers.length} {t("trip.passengersOnboard")}
            </Text>
          </View>
        </View>

        {/* Passengers (driver only) */}
        {isDriver && passengers.length > 0 && (
          <View style={styles.passengersSection}>
            <Text style={styles.sectionLabel}>{t("trip.passengers")}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.passengersRow}
            >
              {passengers.map((p, i) => (
                <PassengerChip key={p.id} passenger={p} index={i} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Empty state (driver, no passengers) */}
        {isDriver && passengers.length === 0 && (
          <View style={styles.noPassengersRow}>
            <Ionicons name="person-add-outline" size={16} color={Colors.textTertiary} />
            <Text style={styles.noPassengersText}>{t("trip.noPassengers")}</Text>
          </View>
        )}

        {/* ── Action Row ────────────────────────────────────────────────────── */}
        <View style={styles.actionRow}>
          {/* SOS */}
          <AnimatedPressable
            onPress={handleSOSPress}
            style={styles.sosBtn}
            scaleValue={0.9}
          >
            <View style={styles.sosBtnInner}>
              <Text style={styles.sosBtnText}>{t("trip.sos")}</Text>
            </View>
          </AnimatedPressable>

          {/* End Trip (driver) */}
          {isDriver && (
            <AnimatedPressable
              onPress={handleEndTrip}
              style={[styles.endTripBtn, isEnding && styles.endTripBtnDisabled]}
              scaleValue={0.96}
            >
              <LinearGradient
                colors={[Colors.primary, Colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.endTripGradient}
              >
                <Ionicons name="flag" size={18} color="#fff" />
                <Text style={styles.endTripText}>
                  {isEnding ? "Ending..." : t("trip.endTrip")}
                </Text>
              </LinearGradient>
            </AnimatedPressable>
          )}

          {/* Leave Trip (passenger) */}
          {!isDriver && (
            <AnimatedPressable
              onPress={handleEndTrip}
              style={styles.endTripBtn}
              scaleValue={0.96}
            >
              <LinearGradient
                colors={["#3B82F6", "#1D4ED8"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.endTripGradient}
              >
                <Ionicons name="exit-outline" size={18} color="#fff" />
                <Text style={styles.endTripText}>Leave Trip</Text>
              </LinearGradient>
            </AnimatedPressable>
          )}
        </View>
      </View>

      {/* ── Floating AI Button ────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.aiFabContainer,
          {
            bottom:
              Math.max(insets.bottom, 16) +
              (Platform.OS === "web" ? 34 : 0) +
              // approx bottom sheet height offset
              (isDriver && passengers.length > 0 ? 240 : 190),
          },
          aiBtnStyle,
        ]}
      >
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
      </Animated.View>

      {/* ── SOS Modal ─────────────────────────────────────────────────────────── */}
      <SOSModal
        visible={sosVisible}
        onConfirm={handleSOSConfirm}
        onCancel={() => setSosVisible(false)}
      />

      {/* ── AI Sheet ──────────────────────────────────────────────────────────── */}
      <AIAssistantSheet
        visible={aiVisible}
        onClose={() => setAiVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f2d1c",
  },

  // ── Map ─────────────────────────────────────────────────────────────────────
  mapContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.06,
    borderWidth: 0,
  },

  // ── Route visualization ──────────────────────────────────────────────────────
  routeViz: {
    alignItems: "center",
    gap: 6,
  },
  routeOriginNode: {
    alignItems: "center",
    gap: 6,
  },
  routeOriginDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#4ADE80",
    borderWidth: 2.5,
    borderColor: "#fff",
    shadowColor: "#4ADE80",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  routeDestNode: {
    alignItems: "center",
    gap: 6,
  },
  routeDestDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.error,
    borderWidth: 2.5,
    borderColor: "#fff",
    shadowColor: Colors.error,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  routeNodeLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "rgba(255,255,255,0.9)",
    maxWidth: 130,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  routeDottedLine: {
    alignItems: "center",
    gap: 4,
  },
  routeDash: {
    width: 2,
    height: 5,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  carMarker: {
    alignItems: "center",
    marginVertical: 4,
  },
  carMarkerGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },
  carMarkerShadow: {
    position: "absolute",
    bottom: -8,
    width: 40,
    height: 8,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.3)",
  },

  // ── Top Bar ──────────────────────────────────────────────────────────────────
  topBarWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(10,22,14,0.85)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  topBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  topBarIconBtn: {
    width: 38,
    height: 38,
  },
  topBarIconInner: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarCenter: {
    flex: 1,
    alignItems: "center",
  },
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

  // ── Badges ───────────────────────────────────────────────────────────────────
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

  // ── Bottom Sheet ──────────────────────────────────────────────────────────────
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#111A14",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignSelf: "center",
    marginBottom: 16,
  },

  // ── Trip meta ─────────────────────────────────────────────────────────────────
  tripMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  tripCodeBadge: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  tripCodeBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: "#fff",
    letterSpacing: 2,
  },
  tripDurationBadge: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.primary,
  },
  passengerCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  passengerCountText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
  },

  // ── Passengers ────────────────────────────────────────────────────────────────
  passengersSection: {
    marginBottom: 14,
  },
  sectionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  passengersRow: {
    gap: 10,
    paddingRight: 8,
  },
  passengerChip: {
    alignItems: "center",
    gap: 5,
    width: 64,
  },
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
  noPassengersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  noPassengersText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.35)",
  },

  // ── Action Row ────────────────────────────────────────────────────────────────
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  sosBtn: {
    width: 72,
    height: 54,
  },
  sosBtnInner: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "rgba(239,68,68,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.error,
  },
  sosBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: Colors.error,
    letterSpacing: 0.5,
  },
  endTripBtn: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  endTripBtnDisabled: {
    opacity: 0.6,
  },
  endTripGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  endTripText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },

  // ── Floating AI FAB ───────────────────────────────────────────────────────────
  aiFabContainer: {
    position: "absolute",
    right: 20,
  },
  aiFab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  aiFabGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── SOS Modal ────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  sosSheet: {
    backgroundColor: "#111A14",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
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
  sosActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  sosCancelBtn: {
    flex: 1,
    height: 52,
  },
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

  // ── AI Sheet ──────────────────────────────────────────────────────────────────
  aiSheet: {
    backgroundColor: "#111A14",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  aiSheetHeader: {
    marginBottom: 16,
  },
  aiSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignSelf: "center",
    marginBottom: 16,
  },
  aiTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  aiIconBg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(245,166,35,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.2)",
  },
  aiTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  aiSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    marginTop: 1,
  },
  quickActionsRow: {
    gap: 10,
    paddingBottom: 4,
    paddingRight: 4,
  },
  quickActionBtn: {
    height: 44,
  },
  quickActionInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    backgroundColor: "rgba(0,166,81,0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,166,81,0.2)",
  },
  quickActionLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
  },
  aiComingSoonBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245,166,35,0.08)",
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.15)",
  },
  aiComingSoonText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(245,166,35,0.75)",
    lineHeight: 18,
  },
  aiInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginBottom: 4,
  },
  aiInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  aiSendBtn: {
    width: 44,
    height: 44,
  },
  aiSendInner: {
    flex: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});