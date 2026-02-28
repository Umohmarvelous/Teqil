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
import { signIn } from "@/src/services/supabase";
import { useTranslation } from "react-i18next";
import type { User } from "@/src/models/types";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { setUser, setIsAuthenticated, selectedRole } = useAuthStore();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!email || !email.includes("@")) newErrors.email = "Enter a valid email";
    if (!password || password.length < 6) newErrors.password = "Password is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    try {
      const data = await signIn(email.trim().toLowerCase(), password);
      const supaUser = data.user;

      if (supaUser) {
        const meta = supaUser.user_metadata;
        const user: User = {
          id: supaUser.id,
          full_name: meta.full_name || null,
          phone: meta.phone || "",
          email: supaUser.email || "",
          age: meta.age || 18,
          role: meta.role || selectedRole || "passenger",
          driver_id: meta.driver_id,
          profile_photo: meta.profile_photo,
          vehicle_details: meta.vehicle_details,
          park_location: meta.park_location,
          park_name: meta.park_name,
          points_balance: meta.points_balance || 0,
          avg_rating: meta.avg_rating,
          profile_complete: meta.profile_complete || false,
          created_at: supaUser.created_at,
        };
        setUser(user);
        setIsAuthenticated(true);

        if (user.role === "driver" && !user.profile_complete) {
          router.replace("/(auth)/driver-profile");
        } else if (user.role === "driver") {
          router.replace("/(driver)");
        } else if (user.role === "passenger") {
          router.replace("/(passenger)");
        } else {
          router.replace("/(park-owner)");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      Alert.alert("Sign In Failed", msg);
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
        <Text style={styles.headerTitle}>{t("auth.login")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue your journey</Text>

        <View style={styles.form}>
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
                onChangeText={(v) => { setEmail(v); setErrors((e) => ({ ...e, email: undefined })); }}
              />
            </View>
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
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
                onChangeText={(v) => { setPassword(v); setErrors((e) => ({ ...e, password: undefined })); }}
              />
              <Pressable onPress={() => setShowPassword((s) => !s)}>
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={Colors.textSecondary}
                />
              </Pressable>
            </View>
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
          </View>

          <Pressable style={styles.forgotBtn}>
            <Text style={styles.forgotText}>{t("auth.forgotPassword")}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.submitBtn, pressed && styles.submitBtnPressed, isLoading && styles.submitBtnLoading]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <Text style={styles.submitBtnText}>
              {isLoading ? t("auth.loggingIn") : t("auth.login")}
            </Text>
          </Pressable>

          <Pressable style={styles.switchBtn} onPress={() => router.replace("/(auth)/register")}>
            <Text style={styles.switchText}>
              {t("auth.noAccount")}{" "}
              <Text style={styles.switchLink}>{t("auth.signUp")}</Text>
            </Text>
          </Pressable>
        </View>
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
    marginBottom: 32,
  },
  form: { gap: 4 },
  fieldGroup: { gap: 6, marginBottom: 16 },
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
    marginTop: 2,
  },
  forgotBtn: { alignSelf: "flex-end", marginBottom: 8 },
  forgotText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.primary,
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
