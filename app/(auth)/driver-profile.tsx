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
  Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { supabase } from "@/src/services/supabase";
import { useTranslation } from "react-i18next";

export default function DriverProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuthStore();
  const { t } = useTranslation();

  const [fullName, setFullName] = useState(user?.full_name || "");
  const [photo, setPhoto] = useState<string | null>(user?.profile_photo || null);
  const [vehicle, setVehicle] = useState(user?.vehicle_details || "");
  const [parkLocation, setParkLocation] = useState(user?.park_location || "");
  const [parkName, setParkName] = useState(user?.park_name || "");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!fullName.trim()) newErrors.fullName = "Full name is required";
    if (!vehicle.trim()) newErrors.vehicle = "Vehicle details are required";
    if (!parkLocation.trim()) newErrors.parkLocation = "Park location is required";
    if (!parkName.trim()) newErrors.parkName = "Park name is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!validate()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    const updates = {
      full_name: fullName.trim(),
      profile_photo: photo || undefined,
      vehicle_details: vehicle.trim(),
      park_location: parkLocation.trim(),
      park_name: parkName.trim(),
      profile_complete: true,
    };

    try {
      await supabase.auth.updateUser({ data: updates });
      updateUser(updates);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(driver)");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not save profile";
      Alert.alert("Error", msg);
    } finally {
      setIsLoading(false);
    }
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <View style={{ width: 40 }} />
        <Text style={styles.headerTitle}>{t("driverProfile.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileBanner}>
          <View style={styles.driverIdCard}>
            <Ionicons name="id-card-outline" size={18} color={Colors.gold} />
            <Text style={styles.driverIdLabel}>{t("driverProfile.driverId")}</Text>
            <Text style={styles.driverIdValue}>{user?.driver_id || "Pending..."}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>{t("driverProfile.subtitle")}</Text>

        <Pressable style={styles.photoSection} onPress={pickPhoto}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.photoImg} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera-outline" size={28} color={Colors.primary} />
            </View>
          )}
          <View style={styles.photoInfo}>
            <Text style={styles.photoLabel}>
              {photo ? t("driverProfile.changePhoto") : t("driverProfile.addPhoto")}
            </Text>
            <Text style={styles.photoHint}>Clear photo helps passengers trust you</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
        </Pressable>

        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("driverProfile.fullName")}</Text>
            <View style={[styles.inputRow, errors.fullName && styles.inputError]}>
              <Ionicons name="person-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder="e.g. Chukwuemeka Obi"
                placeholderTextColor={Colors.textTertiary}
                value={fullName}
                onChangeText={(v) => { setFullName(v); setErrors((e) => ({ ...e, fullName: "" })); }}
              />
            </View>
            {errors.fullName ? <Text style={styles.errorText}>{errors.fullName}</Text> : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("driverProfile.vehicle")}</Text>
            <View style={[styles.inputRow, errors.vehicle && styles.inputError]}>
              <Ionicons name="car-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder={t("driverProfile.vehiclePlaceholder")}
                placeholderTextColor={Colors.textTertiary}
                value={vehicle}
                onChangeText={(v) => { setVehicle(v); setErrors((e) => ({ ...e, vehicle: "" })); }}
              />
            </View>
            {errors.vehicle ? <Text style={styles.errorText}>{errors.vehicle}</Text> : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("driverProfile.parkName")}</Text>
            <View style={[styles.inputRow, errors.parkName && styles.inputError]}>
              <Ionicons name="business-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder={t("driverProfile.parkNamePlaceholder")}
                placeholderTextColor={Colors.textTertiary}
                value={parkName}
                onChangeText={(v) => { setParkName(v); setErrors((e) => ({ ...e, parkName: "" })); }}
              />
            </View>
            {errors.parkName ? <Text style={styles.errorText}>{errors.parkName}</Text> : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("driverProfile.parkLocation")}</Text>
            <View style={[styles.inputRow, errors.parkLocation && styles.inputError]}>
              <Ionicons name="location-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder={t("driverProfile.parkLocationPlaceholder")}
                placeholderTextColor={Colors.textTertiary}
                value={parkLocation}
                onChangeText={(v) => { setParkLocation(v); setErrors((e) => ({ ...e, parkLocation: "" })); }}
              />
            </View>
            {errors.parkLocation ? <Text style={styles.errorText}>{errors.parkLocation}</Text> : null}
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.submitBtn,
            pressed && styles.submitBtnPressed,
            isLoading && styles.submitBtnLoading,
          ]}
          onPress={handleSave}
          disabled={isLoading}
        >
          <Ionicons name="checkmark-circle" size={22} color={Colors.surface} />
          <Text style={styles.submitBtnText}>
            {isLoading ? t("driverProfile.completing") : t("driverProfile.completeProfile")}
          </Text>
        </Pressable>

        <View style={{ height: Math.max(insets.bottom, 20) + (Platform.OS === "web" ? 34 : 0) }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingTop: 8 },
  profileBanner: { marginBottom: 20 },
  driverIdCard: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  driverIdLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    flex: 1,
  },
  driverIdValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: Colors.gold,
    letterSpacing: 2,
  },
  sectionLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 22,
  },
  photoSection: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginBottom: 24,
  },
  photoImg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.border,
  },
  photoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  photoInfo: { flex: 1 },
  photoLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  photoHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  form: { gap: 2 },
  fieldGroup: { gap: 6, marginBottom: 14 },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
  errorText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.error,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 24,
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
