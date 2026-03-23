import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { useTripStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { TripsStorage } from "@/src/services/storage";
import { generateTripCode, generateId } from "@/src/utils/helpers";
import { useTranslation } from "react-i18next";
import type { Trip } from "@/src/models/types";

// ─── Animated Input ───────────────────────────────────────────────────────────

interface AnimatedInputProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  error?: string;
  keyboardType?: "default" | "number-pad" | "decimal-pad";
  delay?: number;
}

function AnimatedInput({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType = "default",
  delay = 0,
}: AnimatedInputProps) {
  const [focused, setFocused] = useState(false);

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);
  const borderAnim = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  useEffect(() => {
    borderAnim.value = withTiming(focused ? 1 : 0, { duration: 180 });
  }, [focused]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const borderColor = error
    ? Colors.error
    : focused
    ? Colors.primary
    : "transparent";

  return (
    <Animated.View style={[styles.inputBlock, containerStyle]}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          { borderColor },
          error && styles.inputRowError,
        ]}
      >
        <Ionicons
          name={icon}
          size={18}
          color={focused ? Colors.primary : "#8E8E93"}
          style={styles.inputIcon}
        />
        <TextInput
          style={styles.textInput}
          placeholder={placeholder}
          placeholderTextColor="#555"
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CreateTripScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { setActiveTrip } = useTripStore();
  const { t } = useTranslation();

  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [departureTime, setDepartureTime] = useState(
    new Date().toLocaleTimeString("en-NG", {
      hour: "2-digit",
      minute: "2-digit",
    })
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Page-level fade/slide in
  const pageOpacity = useSharedValue(0);
  const pageY = useSharedValue(24);

  // ── Submit button scale
  const btnScale = useSharedValue(1);

  useEffect(() => {
    pageOpacity.value = withTiming(1, { duration: 480 });
    pageY.value = withTiming(0, {
      duration: 480,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  const pageStyle = useAnimatedStyle(() => ({
    opacity: pageOpacity.value,
    transform: [{ translateY: pageY.value }],
  }));

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  // ── Validation
  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!origin.trim()) newErrors.origin = t("trip.originPlaceholder");
    if (!destination.trim())
      newErrors.destination = t("trip.destinationPlaceholder");
    if (
      !capacity ||
      isNaN(Number(capacity)) ||
      Number(capacity) < 1 ||
      Number(capacity) > 20
    )
      newErrors.capacity = "Capacity must be between 1 and 20";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Submit
  const handleCreate = async () => {
    if (!validate()) return;

    btnScale.value = withSpring(0.95, { damping: 20 }, () => {
      btnScale.value = withSpring(1, { damping: 15 });
    });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsLoading(true);

    const tripCode = generateTripCode();
    const trip: Trip = {
      id: generateId(),
      driver_id: user!.id,
      trip_code: tripCode,
      origin: origin.trim(),
      destination: destination.trim(),
      start_time: new Date().toISOString(),
      capacity: Number(capacity),
      status: "active",
      created_at: new Date().toISOString(),
    };

    try {
      await TripsStorage.save(trip);
      setActiveTrip(trip);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push(`/live-trip/${tripCode}`);
    } catch {
      Alert.alert("Error", "Could not create trip. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.screen}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("trip.createTrip")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={pageStyle}>
          {/* ── Hero label ── */}
          <View style={styles.heroRow}>
            <View style={styles.heroDot} />
            <Text style={styles.heroLabel}>
              {t("trip.createTrip")} — Fill in the details below
            </Text>
          </View>

          {/* ── Route card ── */}
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Route</Text>

            {/* Visual route indicator */}
            <View style={styles.routeVisual}>
              <View style={styles.routeTrack}>
                <View style={styles.routeDotGreen} />
                <View style={styles.routeLine} />
                <View style={styles.routeDotRed} />
              </View>
              <View style={styles.routeInputs}>
                <AnimatedInput
                  label={t("trip.origin")}
                  icon="location"
                  value={origin}
                  onChangeText={(v) => {
                    setOrigin(v);
                    setErrors((e) => ({ ...e, origin: "" }));
                  }}
                  placeholder={t("trip.originPlaceholder")}
                  error={errors.origin}
                  delay={80}
                />
                <AnimatedInput
                  label={t("trip.destination")}
                  icon="flag"
                  value={destination}
                  onChangeText={(v) => {
                    setDestination(v);
                    setErrors((e) => ({ ...e, destination: "" }));
                  }}
                  placeholder={t("trip.destinationPlaceholder")}
                  error={errors.destination}
                  delay={160}
                />
              </View>
            </View>
          </View>

          {/* ── Trip details card ── */}
          <View style={[styles.card, styles.cardMt]}>
            <Text style={styles.cardHeading}>Trip Details</Text>

            <AnimatedInput
              label={t("trip.capacity")}
              icon="people"
              value={capacity}
              onChangeText={(v) => {
                setCapacity(v);
                setErrors((e) => ({ ...e, capacity: "" }));
              }}
              placeholder="e.g. 4"
              error={errors.capacity}
              keyboardType="number-pad"
              delay={240}
            />

            <AnimatedInput
              label={t("trip.departureTime")}
              icon="time"
              value={departureTime}
              onChangeText={setDepartureTime}
              placeholder="e.g. 08:30 AM"
              delay={320}
            />
          </View>

          {/* ── Info banner ── */}
          <View style={styles.infoBanner}>
            <Ionicons
              name="information-circle"
              size={16}
              color={Colors.primary}
            />
            <Text style={styles.infoText}>
              A unique 6-character trip code will be generated. Share it with
              your passengers to join.
            </Text>
          </View>

          {/* ── Submit button ── */}
          <Animated.View style={[styles.btnWrapper, btnStyle]}>
            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && styles.submitBtnPressed,
                isLoading && styles.submitBtnLoading,
              ]}
              onPress={handleCreate}
              disabled={isLoading}
            >
              {!isLoading ? (
                <Ionicons name="navigate" size={20} color="#fff" />
              ) : null}
              <Text style={styles.submitBtnText}>
                {isLoading ? "Creating..." : t("trip.startTrip")}
              </Text>
            </Pressable>
          </Animated.View>

          <View
            style={{
              height:
                80 + Math.max(insets.bottom, 16) + (Platform.OS === "web" ? 34 : 0),
            }}
          />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const INPUT_BG = "#2C2C2E";

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  headerSpacer: {
    width: 38,
  },

  // ── Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  // ── Hero row
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  heroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  heroLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#8E8E93",
  },

  // ── Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  cardMt: {
    marginTop: 16,
  },
  cardHeading: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 16,
  },

  // ── Route visual
  routeVisual: {
    flexDirection: "row",
    gap: 14,
  },
  routeTrack: {
    alignItems: "center",
    paddingTop: 38,
    paddingBottom: 4,
    width: 16,
  },
  routeDotGreen: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: "#1C1C1E",
  },
  routeLine: {
    flex: 1,
    width: 2,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginVertical: 4,
    borderRadius: 1,
  },
  routeDotRed: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.error,
    borderWidth: 2,
    borderColor: "#1C1C1E",
  },
  routeInputs: {
    flex: 1,
    gap: 4,
  },

  // ── Input block
  inputBlock: {
    marginBottom: 12,
  },
  inputLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "#8E8E93",
    marginBottom: 7,
    letterSpacing: 0.3,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: INPUT_BG,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  inputRowError: {
    borderColor: Colors.error,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: "#fff",
  },
  errorText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.error,
    marginTop: 5,
  },

  // ── Info banner
  infoBanner: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: `${Colors.primary}15`,
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.primaryDark,
    lineHeight: 18,
  },

  // ── Submit
  btnWrapper: {
    marginTop: 28,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 18,
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  submitBtnPressed: {
    opacity: 0.88,
  },
  submitBtnLoading: {
    opacity: 0.65,
  },
  submitBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: "#fff",
    letterSpacing: 0.4,
  },
});