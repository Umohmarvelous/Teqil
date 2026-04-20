import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
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
import * as Location from "expo-location";
import { useAuthStore, useTripStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { TripsStorage } from "@/src/services/storage";
import { syncAll } from "@/src/services/sync";
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
  rightElement?: React.ReactNode;
  editable?: boolean;
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
  rightElement,
  editable = true,
}: AnimatedInputProps) {
  const [focused, setFocused] = useState(false);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) }));
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const borderColor = error ? Colors.error : focused ? Colors.primary : "transparent";

  return (
    <Animated.View style={[styles.inputBlock, containerStyle]}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={[styles.inputRow, { borderColor }, error ? styles.inputRowError : null, !editable && styles.inputRowDisabled]}>
        <Ionicons
          name={icon}
          size={18}
          color={focused ? Colors.primary : "#8E8E93"}
          style={styles.inputIcon}
        />
        <TextInput
          style={[styles.textInput, !editable && { color: Colors.textSecondary }]}
          placeholder={placeholder}
          placeholderTextColor="#888"
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={editable}
        />
        {rightElement}
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
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationCoords, setLocationCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const pageOpacity = useSharedValue(0);
  const pageY = useSharedValue(24);
  const btnScale = useSharedValue(1);

  useEffect(() => {
    pageOpacity.value = withTiming(1, { duration: 480 });
    pageY.value = withTiming(0, { duration: 480, easing: Easing.out(Easing.cubic) });
    // Auto-detect location on mount
    detectLocation();
  }, []);

  const pageStyle = useAnimatedStyle(() => ({
    opacity: pageOpacity.value,
    transform: [{ translateY: pageY.value }],
  }));

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  // ── GPS Location Detection ──────────────────────────────────────────────────
  const detectLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location Permission",
          "Allow location access to auto-fill your starting position.",
          [{ text: "OK" }]
        );
        setLocationLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLocationCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });

      // Reverse geocode to get a readable address
      const geo = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      if (geo.length > 0) {
        const g = geo[0];
        // Build a sensible address string: street, district/city
        const parts = [
          g.street,
          g.district || g.subregion,
          g.city,
        ].filter(Boolean);
        const address = parts.join(", ") || g.formattedAddress || "Current Location";
        setOrigin(address);
      }
    } catch (e) {
      console.warn("[CreateTrip] Location error:", e);
      // Silently fail — user can type manually
    } finally {
      setLocationLoading(false);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!origin.trim()) newErrors.origin = "Starting location is required";
    if (!destination.trim()) newErrors.destination = "Destination is required";
    if (!capacity || isNaN(Number(capacity)) || Number(capacity) < 1 || Number(capacity) > 20)
      newErrors.capacity = "Capacity must be between 1 and 20";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreate = async () => {
    if (!user) {
      Alert.alert("Not logged in", "Please sign in first.");
      router.replace("/(auth)/login");
      return;
    }
    if (!validate()) return;

    btnScale.value = withSpring(0.95, { damping: 20 }, () => {
      btnScale.value = withSpring(1, { damping: 15 });
    });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsLoading(true);

    const tripCode = generateTripCode();
    const trip: Trip = {
      id: generateId(),
      driver_id: user.id,
      trip_code: tripCode,
      origin: origin.trim(),
      destination: destination.trim(),
      start_time: new Date().toISOString(),
      capacity: Number(capacity),
      status: "active",
      created_at: new Date().toISOString(),
      synced: false,
      updated_at: new Date().toISOString(),
    };

    // Store GPS coords in trip metadata if we have them (for live map tracking)
    if (locationCoords) {
      (trip as any).origin_lat = locationCoords.latitude;
      (trip as any).origin_lng = locationCoords.longitude;
    }

    try {
      await TripsStorage.save(trip);
      setActiveTrip(trip);

      syncAll({ id: user.id, role: user.role, park_name: user.park_name }).catch(
        (err) => console.warn("[CreateTrip] Sync failed (offline):", err)
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      try {
        await router.push(`/live-trip-code/${tripCode}`);
      } catch (navError) {
        Alert.alert("Trip Created!", `Trip code: ${tripCode}`, [{ text: "OK", onPress: () => router.back() }]);
      }
    } catch (err) {
      console.error("[CreateTrip] Error:", err);
      Alert.alert("Error", "Could not create trip. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#000" />
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
          <View style={styles.heroRow}>
            <View style={styles.heroDot} />
            <Text style={styles.heroLabel}>Fill in your trip details</Text>
          </View>

          {/* Route card */}
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Route</Text>
            <View style={styles.routeVisual}>
              <View style={styles.routeTrack}>
                <View style={styles.routeDotGreen} />
                <View style={styles.routeLine} />
                <View style={styles.routeDotRed} />
              </View>
              <View style={styles.routeInputs}>
                {/* Origin with GPS button */}
                <AnimatedInput
                  label={t("trip.origin")}
                  icon="location"
                  value={origin}
                  onChangeText={(v) => { setOrigin(v); setErrors((e) => ({ ...e, origin: "" })); }}
                  placeholder={locationLoading ? "Detecting location..." : t("trip.originPlaceholder")}
                  error={errors.origin}
                  delay={80}
                  rightElement={
                    <Pressable
                      onPress={detectLocation}
                      style={styles.gpsBtn}
                      hitSlop={8}
                      disabled={locationLoading}
                    >
                      {locationLoading ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <Ionicons name="navigate" size={18} color={Colors.primary} />
                      )}
                    </Pressable>
                  }
                />
                <AnimatedInput
                  label={t("trip.destination")}
                  icon="flag"
                  value={destination}
                  onChangeText={(v) => { setDestination(v); setErrors((e) => ({ ...e, destination: "" })); }}
                  placeholder={t("trip.destinationPlaceholder")}
                  error={errors.destination}
                  delay={160}
                />
              </View>
            </View>

            {/* Show detected coords as a small info pill */}
            {locationCoords && (
              <View style={styles.coordsPill}>
                <Ionicons name="checkmark-circle" size={13} color={Colors.primary} />
                <Text style={styles.coordsText}>
                  GPS: {locationCoords.latitude.toFixed(4)}, {locationCoords.longitude.toFixed(4)}
                </Text>
              </View>
            )}
          </View>

          {/* Trip details card */}
          <View style={[styles.card, styles.cardMt]}>
            <Text style={styles.cardHeading}>Trip Details</Text>
            <AnimatedInput
              label={t("trip.capacity")}
              icon="people"
              value={capacity}
              onChangeText={(v) => { setCapacity(v); setErrors((e) => ({ ...e, capacity: "" })); }}
              placeholder="e.g. 4"
              error={errors.capacity}
              keyboardType="number-pad"
              delay={240}
            />
          </View>

          {/* Info banner */}
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle" size={16} color={Colors.primary} />
            <Text style={styles.infoText}>
              A unique 6-character trip code will be generated. Passengers use it to join and track your trip.
            </Text>
          </View>

          {/* Submit */}
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
              {!isLoading && <Ionicons name="navigate" size={20} color="#fff" />}
              <Text style={styles.submitBtnText}>
                {isLoading ? "Creating..." : t("trip.startTrip")}
              </Text>
            </Pressable>
          </Animated.View>

          <View style={{ height: 80 + Math.max(insets.bottom, 16) }} />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.border },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: Colors.borderLight,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: "Poppins_600SemiBold", fontSize: 16, color: "#000" },
  headerSpacer: { width: 38 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 },
  heroDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  heroLabel: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "#8E8E93" },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  cardMt: { marginTop: 16 },
  cardHeading: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  routeVisual: { flexDirection: "row", gap: 14 },
  routeTrack: { alignItems: "center", paddingTop: 38, paddingBottom: 4, width: 16 },
  routeDotGreen: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary },
  routeLine: { flex: 1, width: 2, backgroundColor: "rgba(0,0,0,0.12)", marginVertical: 4, borderRadius: 1 },
  routeDotRed: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.error },
  routeInputs: { flex: 1, gap: 4 },
  inputBlock: { marginBottom: 12 },
  inputLabel: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "#8E8E93", marginBottom: 7, letterSpacing: 0.3 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.borderLight,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  inputRowError: { borderColor: Colors.error },
  inputRowDisabled: { opacity: 0.7 },
  inputIcon: { marginRight: 10 },
  textInput: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 15, color: "#0F0F0F" },
  gpsBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${Colors.primary}18`,
    alignItems: "center",
    justifyContent: "center",
  },
  coordsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    backgroundColor: `${Colors.primary}12`,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  coordsText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.primary },
  errorText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.error, marginTop: 5 },
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
  infoText: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.primaryDark, lineHeight: 18 },
  btnWrapper: { marginTop: 28 },
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
  submitBtnPressed: { opacity: 0.88 },
  submitBtnLoading: { opacity: 0.65 },
  submitBtnText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#fff", letterSpacing: 0.4 },
});