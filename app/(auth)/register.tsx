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
import { Colors } from "@/constants/colors";
import { signUp } from "@/src/services/supabase";
import { generateUsername, generateDriverId, generateId } from "@/src/utils/helpers";
import { useTranslation } from "react-i18next";
import type { User } from "@/src/models/types";

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { setUser, setIsAuthenticated, selectedRole } = useAuthStore();
  const { t } = useTranslation();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!email || !email.includes("@")) newErrors.email = "Enter a valid email";
    if (!phone || phone.length < 7) newErrors.phone = "Enter a valid phone number";
    if (!age || isNaN(Number(age)) || Number(age) < 18)
      newErrors.age = "You must be 18 or older";
    if (!password || password.length < 8)
      newErrors.password = "Password must be at least 8 characters";
    if (password !== confirmPassword)
      newErrors.confirmPassword = "Passwords do not match";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    const displayName = fullName.trim() || generateUsername();
    const role = selectedRole || "passenger";
    const driverId = role === "driver" ? generateDriverId() : undefined;

    const metadata = {
      full_name: displayName,
      phone: phone.trim(),
      age: Number(age),
      role,
      driver_id: driverId,
      points_balance: 0,
      profile_complete: false,
    };

    try {
      const data = await signUp(email.trim().toLowerCase(), password, metadata);
      const supaUser = data.user;

      if (supaUser) {
        const user: User = {
          id: supaUser.id,
          full_name: displayName,
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          age: Number(age),
          role,
          driver_id: driverId,
          points_balance: 0,
          profile_complete: false,
          created_at: supaUser.created_at,
        };
        setUser(user);
        setIsAuthenticated(true);

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        if (role === "driver") {
          router.replace("/(auth)/driver-profile");
        } else if (role === "passenger") {
          router.replace("/(passenger)");
        } else {
          router.replace("/(park-owner)");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      Alert.alert("Sign Up Failed", msg);
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
        <Text style={styles.headerTitle}>{t("auth.register")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Join thousands of Nigerians on Teqil</Text>

        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("auth.fullName")}</Text>
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder="Your name (optional)"
                placeholderTextColor={Colors.textTertiary}
                value={fullName}
                onChangeText={setFullName}
                autoCorrect={false}
              />
            </View>
            <Text style={styles.hintText}>{t("auth.nameAutoGenerate")}</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("auth.email")}</Text>
            <View style={[styles.inputRow, errors.email && styles.inputError]}>
              <Ionicons name="mail-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder={t("auth.emailPlaceholder")}
                placeholderTextColor={Colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={(v) => { setEmail(v); setErrors((e) => ({ ...e, email: "" })); }}
              />
            </View>
            {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("auth.phone")}</Text>
            <View style={[styles.inputRow, errors.phone && styles.inputError]}>
              <Ionicons name="call-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder={t("auth.phonePlaceholder")}
                placeholderTextColor={Colors.textTertiary}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={(v) => { setPhone(v); setErrors((e) => ({ ...e, phone: "" })); }}
              />
            </View>
            {errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("auth.age")}</Text>
            <View style={[styles.inputRow, errors.age && styles.inputError]}>
              <Ionicons name="calendar-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder={t("auth.agePlaceholder")}
                placeholderTextColor={Colors.textTertiary}
                keyboardType="number-pad"
                value={age}
                onChangeText={(v) => { setAge(v); setErrors((e) => ({ ...e, age: "" })); }}
              />
            </View>
            {errors.age ? <Text style={styles.errorText}>{errors.age}</Text> : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("auth.password")}</Text>
            <View style={[styles.inputRow, errors.password && styles.inputError]}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder={t("auth.passwordPlaceholder")}
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={(v) => { setPassword(v); setErrors((e) => ({ ...e, password: "" })); }}
              />
              <Pressable onPress={() => setShowPassword((s) => !s)}>
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={Colors.textSecondary}
                />
              </Pressable>
            </View>
            {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("auth.confirmPassword")}</Text>
            <View style={[styles.inputRow, errors.confirmPassword && styles.inputError]}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder="Re-enter password"
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry={!showPassword}
                value={confirmPassword}
                onChangeText={(v) => { setConfirmPassword(v); setErrors((e) => ({ ...e, confirmPassword: "" })); }}
              />
            </View>
            {errors.confirmPassword ? <Text style={styles.errorText}>{errors.confirmPassword}</Text> : null}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              pressed && styles.submitBtnPressed,
              isLoading && styles.submitBtnLoading,
            ]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            <Text style={styles.submitBtnText}>
              {isLoading ? t("auth.registering") : t("auth.register")}
            </Text>
          </Pressable>

          <Pressable style={styles.switchBtn} onPress={() => router.replace("/(auth)/login")}>
            <Text style={styles.switchText}>
              {t("auth.haveAccount")}{" "}
              <Text style={styles.switchLink}>{t("auth.login")}</Text>
            </Text>
          </Pressable>
        </View>

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
  scrollContent: { padding: 24, paddingTop: 8 },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    color: Colors.text,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 28,
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
  hintText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textTertiary,
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
    alignItems: "center",
    justifyContent: "center",
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
  switchBtn: { alignItems: "center", marginTop: 20 },
  switchText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  switchLink: {
    fontFamily: "Poppins_600SemiBold",
    color: Colors.primary,
  },
});
