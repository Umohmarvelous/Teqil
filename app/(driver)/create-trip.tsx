import React, { useState } from "react";
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
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { useTripStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { TripsStorage } from "@/src/services/storage";
import { generateTripCode, generateId } from "@/src/utils/helpers";
import { useTranslation } from "react-i18next";
import type { Trip } from "@/src/models/types";

export default function CreateTripScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { setActiveTrip } = useTripStore();
  const { t } = useTranslation();

  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [departureTime, setDepartureTime] = useState(
    new Date().toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!origin.trim()) newErrors.origin = "Enter starting location";
    if (!destination.trim()) newErrors.destination = "Enter destination";
    if (!capacity || isNaN(Number(capacity)) || Number(capacity) < 1 || Number(capacity) > 20)
      newErrors.capacity = "Capacity must be between 1 and 20";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
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
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("trip.createTrip")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Fill in your trip details. A unique code will be generated for passengers to join.</Text>

        <View style={styles.routeCard}>
          <View style={styles.routeIndicator}>
            <View style={styles.routeDotGreen} />
            <View style={styles.routeLine} />
            <View style={styles.routeDotGray} />
          </View>

          <View style={styles.routeInputs}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t("trip.origin")}</Text>
              <View style={[styles.inputRow, errors.origin && styles.inputError]}>
                <TextInput
                  style={styles.input}
                  placeholder={t("trip.originPlaceholder")}
                  placeholderTextColor={Colors.textTertiary}
                  value={origin}
                  onChangeText={(v) => { setOrigin(v); setErrors((e) => ({ ...e, origin: "" })); }}
                />
              </View>
              {errors.origin ? <Text style={styles.errorText}>{errors.origin}</Text> : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t("trip.destination")}</Text>
              <View style={[styles.inputRow, errors.destination && styles.inputError]}>
                <TextInput
                  style={styles.input}
                  placeholder={t("trip.destinationPlaceholder")}
                  placeholderTextColor={Colors.textTertiary}
                  value={destination}
                  onChangeText={(v) => { setDestination(v); setErrors((e) => ({ ...e, destination: "" })); }}
                />
              </View>
              {errors.destination ? <Text style={styles.errorText}>{errors.destination}</Text> : null}
            </View>
          </View>
        </View>

        <View style={styles.detailsCard}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("trip.capacity")}</Text>
            <View style={[styles.inputRow, errors.capacity && styles.inputError]}>
              <Ionicons name="people-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder="e.g. 4"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="number-pad"
                value={capacity}
                onChangeText={(v) => { setCapacity(v); setErrors((e) => ({ ...e, capacity: "" })); }}
              />
              <Text style={styles.inputUnit}>passengers</Text>
            </View>
            {errors.capacity ? <Text style={styles.errorText}>{errors.capacity}</Text> : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("trip.departureTime")}</Text>
            <View style={styles.inputRow}>
              <Ionicons name="time-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder="e.g. 08:30 AM"
                placeholderTextColor={Colors.textTertiary}
                value={departureTime}
                onChangeText={setDepartureTime}
              />
            </View>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={18} color={Colors.primary} />
          <Text style={styles.infoText}>
            A unique 6-character trip code will be created. Share it with your passengers to join.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.submitBtn,
            pressed && styles.submitBtnPressed,
            isLoading && styles.submitBtnLoading,
          ]}
          onPress={handleCreate}
          disabled={isLoading}
        >
          <Ionicons name="navigate" size={22} color={Colors.surface} />
          <Text style={styles.submitBtnText}>
            {isLoading ? "Creating..." : t("trip.startTrip")}
          </Text>
        </Pressable>

        <View style={{ height: 100 + (Platform.OS === "web" ? 34 : 0) }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 16 },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  routeCard: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  routeIndicator: {
    alignItems: "center",
    paddingTop: 28,
    gap: 0,
  },
  routeDotGreen: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  routeLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  routeDotGray: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.error,
  },
  routeInputs: { flex: 1, gap: 16 },
  detailsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  fieldGroup: { gap: 6 },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  inputError: { borderColor: Colors.error },
  input: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: Colors.text,
  },
  inputUnit: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  errorText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.error,
  },
  infoBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: Colors.primaryLight,
    borderRadius: 14,
    padding: 14,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.primaryDark,
    lineHeight: 20,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  submitBtnPressed: { opacity: 0.9 },
  submitBtnLoading: { opacity: 0.7 },
  submitBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.surface,
  },
});
