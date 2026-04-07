/**
 * app/(auth)/register.tsx
 *
 * Changes from original:
 * - Role selection (driver / passenger / park_owner) inline — no separate welcome screen needed
 * - Password suggestion modal on password field focus
 * - Google + Apple OAuth
 * - Auto-generated initials avatar if no photo uploaded
 * - Driver ID: username + 4 random digits
 */

import React, { useRef, useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  Platform,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
// import { LinearGradient } from "expo-linear-gradient";

import { Colors } from "@/constants/colors";
import { useAuthStore } from "@/src/store/useStore";
import { signUpOfflineAware, saveBiometricCredentials } from "@/src/services/auth";
import {
  generateUsername,
  generateDriverIdFromUsername,
  generateStrongPassword,
  generateInitialsAvatar,
} from "@/src/utils/helpers";
import { supabase } from "@/src/services/supabase";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import type { UserRole } from "@/src/models/types";

WebBrowser.maybeCompleteAuthSession();

// ─── Schema ───────────────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    fullName: z.string().optional(),
    email: z
      .string()
      .min(1, "Email is required")
      .email("Enter a valid email address"),
    phone: z
      .string()
      .min(7, "Enter a valid phone number")
      .regex(/^\+?[\d\s\-]{7,}$/, "Enter a valid phone number"),
    age: z
      .string()
      .min(1, "Age is required")
      .refine((val) => {
        const n = parseInt(val, 10);
        return !isNaN(n) && n >= 18;
      }, "You must be at least 18"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

// ─── Role selector ────────────────────────────────────────────────────────────

const ROLES: { value: UserRole; label: string; icon: keyof typeof Ionicons.glyphMap; desc: string }[] = [
  { value: "driver",     label: "Driver",     icon: "car-sport",  desc: "Earn coins driving" },
  { value: "passenger",  label: "Passenger",  icon: "person",     desc: "Find & track trips" },
  { value: "park_owner", label: "Park Owner", icon: "business",   desc: "Manage your park"   },
];

function RoleSelector({
  value,
  onChange,
}: {
  value: UserRole | null;
  onChange: (r: UserRole) => void;
}) {
  return (
    <View style={roleStyles.container}>
      <Text style={roleStyles.label}>I am a</Text>
      <View style={roleStyles.row}>
        {ROLES.map((role) => {
          const active = value === role.value;
          return (
            <Pressable
              key={role.value}
              style={[roleStyles.card, active && roleStyles.cardActive]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(role.value); }}
            >
              <Ionicons
                name={role.icon}
                size={22}
                color={active ? "#fff" : Colors.primaryLight}
              />
              <Text style={[roleStyles.cardLabel, active && roleStyles.cardLabelActive]}>
                {role.label}
              </Text>
              <Text style={[roleStyles.cardDesc, active && roleStyles.cardDescActive]}>
                {role.desc}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const roleStyles = StyleSheet.create({
  container: { marginBottom: 24 },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.primaryLight,
    marginBottom: 10,
    paddingLeft: 5,
  },
  row: { flexDirection: "row", gap: 10 },
  card: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Colors.overlayLight,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 6,
    gap: 6,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  cardActive: {
    backgroundColor: Colors.primaryDark,
    borderColor: Colors.primaryLight,
  },
  cardLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.primaryLight,
  },
  cardLabelActive: { color: "#fff" },
  cardDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: 14,
  },
  cardDescActive: { color: "rgba(255,255,255,0.75)" },
});

// ─── Password suggestion modal ────────────────────────────────────────────────

function PasswordSuggestionModal({
  visible,
  onAccept,
  onDismiss,
  suggestion,
}: {
  visible: boolean;
  onAccept: (pw: string) => void;
  onDismiss: () => void;
  suggestion: string;
}) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable style={pwStyles.backdrop} onPress={onDismiss}>
        <View style={pwStyles.sheet} onStartShouldSetResponder={() => true}>
          <View style={pwStyles.handle} />
          <View style={pwStyles.iconRow}>
            <View style={pwStyles.iconBg}>
              <Ionicons name="key-outline" size={26} color={Colors.primary} />
            </View>
          </View>
          <Text style={pwStyles.title}>Use a Strong Password?</Text>
          <Text style={pwStyles.sub}>
            We generated a strong password for you. Save it somewhere safe!
          </Text>
          <View style={pwStyles.pwBox}>
            <Text style={pwStyles.pwText} selectable>{suggestion}</Text>
          </View>
          <Pressable
            style={pwStyles.acceptBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onAccept(suggestion); }}
          >
            <Text style={pwStyles.acceptBtnText}>Use this password</Text>
          </Pressable>
          <Pressable style={pwStyles.dismissBtn} onPress={onDismiss}>
            <Text style={pwStyles.dismissBtnText}>Type my own</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const pwStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    paddingBottom: 44,
    alignItems: "center",
    gap: 14,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 8,
  },
  iconRow: { marginBottom: 4 },
  iconBg: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: Colors.text,
    textAlign: "center",
  },
  sub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  pwBox: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pwText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: Colors.primary,
    letterSpacing: 1.5,
    textAlign: "center",
  },
  acceptBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  acceptBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  dismissBtn: { paddingVertical: 8 },
  dismissBtnText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textDecorationLine: "underline",
  },
});

// ─── Divider + OAuth ──────────────────────────────────────────────────────────

function OrDivider() {
  return (
    <View style={divStyles.row}>
      <View style={divStyles.line} />
      <Text style={divStyles.text}>or</Text>
      <View style={divStyles.line} />
    </View>
  );
}

const divStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginVertical: 16 },
  line: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  text: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.primaryLight,
    marginHorizontal: 12,
  },
});

function OAuthButton({
  provider,
  onPress,
  loading,
}: {
  provider: "google" | "apple";
  onPress: () => void;
  loading: boolean;
}) {
  const isApple = provider === "apple";
  return (
    <Pressable
      style={[oauthStyles.btn, isApple && oauthStyles.btnApple]}
      onPress={onPress}
      disabled={loading}
    >
      <Ionicons
        name={isApple ? "logo-apple" : "logo-google"}
        size={20}
        color={isApple ? "#fff" : "#DB4437"}
      />
      <Text style={oauthStyles.text}>
        {loading ? "Connecting..." : `Continue with ${isApple ? "Apple" : "Google"}`}
      </Text>
    </Pressable>
  );
}

const oauthStyles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.overlayLight,
    borderRadius: 26,
    height: 52,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    marginBottom: 10,
  },
  btnApple: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderColor: "rgba(255,255,255,0.3)",
  },
  text: {
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
    color: "#fff",
  },
});

// ─── Field wrapper + input ────────────────────────────────────────────────────

function FieldWrapper({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={fieldStyles.wrapper}>
      <Text style={fieldStyles.label}>{label}</Text>
      {children}
      {error ? <Text style={fieldStyles.errorText}>{error}</Text> : null}
    </View>
  );
}

function InputRow({
  icon,
  trailingIcon,
  hasError,
  onFocusCallback,
  ...inputProps
}: {
  icon: React.ReactNode;
  trailingIcon?: React.ReactNode;
  hasError?: boolean;
  onFocusCallback?: () => void;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  onBlur?: () => void;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
  autoCapitalize?: "none" | "words" | "sentences" | "characters";
  autoComplete?: string;
  maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[inputStyles.row, focused && inputStyles.focused, hasError && inputStyles.errored]}>
      <View style={inputStyles.iconWrap}>{icon}</View>
      <TextInput
        style={inputStyles.input}
        placeholderTextColor={Colors.primaryLight}
        onFocus={() => { setFocused(true); onFocusCallback?.(); }}
        onBlur={() => { setFocused(false); inputProps.onBlur?.(); }}
        {...(inputProps as any)}
      />
      {trailingIcon ? <View style={inputStyles.trailingWrap}>{trailingIcon}</View> : null}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrapper: { marginBottom: 18 },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.primaryLight,
    marginTop: 16,
    marginBottom: 7,
    paddingLeft: 15,
  },
  errorText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.error,
    marginTop: 4,
    marginLeft: 2,
  },
});

const inputStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.overlayLight,
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  focused: { backgroundColor: Colors.overlayLight },
  errored: { borderColor: Colors.error },
  iconWrap: { marginRight: 10, width: 22, alignItems: "center" },
  trailingWrap: { marginLeft: 8 },
  input: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.primaryLight,
    height: "100%",
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { selectedRole, setSelectedRole, setUser } = useAuthStore();
  const [role, setRole] = useState<UserRole | null>(selectedRole || null);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);
  const [pwSuggestion, setPwSuggestion] = useState("");
  const [pwModalVisible, setPwModalVisible] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 480, useNativeDriver: true }).start();
  }, []);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      age: "",
      password: "",
      confirmPassword: "",
    },
  });

  const handlePressIn = useCallback(() => {
    Animated.spring(buttonScale, { toValue: 0.95, useNativeDriver: true }).start();
  }, []);
  const handlePressOut = useCallback(() => {
    Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true }).start();
  }, []);

  const handlePasswordFocus = useCallback(() => {
    const suggestion = generateStrongPassword();
    setPwSuggestion(suggestion);
    setPwModalVisible(true);
  }, []);

  const handleAcceptPassword = useCallback(
    (pw: string) => {
      setValue("password", pw);
      setValue("confirmPassword", pw);
      setPwModalVisible(false);
    },
    [setValue]
  );

  const handleRoleChange = (r: UserRole) => {
    setRole(r);
    setSelectedRole(r);
  };

  // ── Submit ──────────────────────────────────────────────────────────────

  const onSubmit = useCallback(
    async (data: RegisterFormData) => {
      if (!role) {
        Alert.alert("Select a Role", "Please choose whether you are a driver, passenger, or park owner.");
        return;
      }
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setLoading(true);

      try {
        const resolvedName = data.fullName?.trim() || generateUsername();
        // Driver ID: username-derived + 4 digits
        const driverId = role === "driver"
          ? generateDriverIdFromUsername(resolvedName)
          : undefined;

        // Auto-generate avatar from initials if no photo
        const avatarUri = generateInitialsAvatar(resolvedName);

        const metadata: Record<string, unknown> = {
          full_name: resolvedName,
          phone: data.phone.trim(),
          age: parseInt(data.age, 10),
          role,
          points_balance: 0,
          profile_complete: false,
          profile_photo: avatarUri,
          ...(driverId ? { driver_id: driverId } : {}),
        };

        const result = await signUpOfflineAware(data.email.trim(), data.password, metadata);

        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        if (result?.user) {
          setUser(result.user);
          // Save credentials for biometric login
          await saveBiometricCredentials(data.email.trim(), data.password);
        }

        if (role === "driver") {
          router.replace("/(auth)/driver-profile");
        } else if (role === "park_owner") {
          router.replace("/(park-owner)");
        } else {
          router.replace("/(passenger)");
        }
      } catch (err) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(t("common.error"), err instanceof Error ? err.message : "Registration failed");
      } finally {
        setLoading(false);
      }
    },
    [role, setUser, router, t]
  );

  // ── OAuth ───────────────────────────────────────────────────────────────

  const handleOAuth = useCallback(
    async (provider: "google" | "apple") => {
      if (!role) {
        Alert.alert("Select a Role", "Choose your role before continuing with OAuth.");
        return;
      }
      setOauthLoading(provider);
      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: Platform.OS === "web"
              ? window.location.origin
              : "teqil://oauth-callback",
            skipBrowserRedirect: Platform.OS !== "web",
          },
        });
        if (error) throw error;
        if (Platform.OS !== "web" && data.url) {
          const result = await WebBrowser.openAuthSessionAsync(data.url, "teqil://oauth-callback");
          if (result.type === "success") {
            const { data: sessionData } = await supabase.auth.getSession();
            const supaUser = sessionData.session?.user;
            if (supaUser) {
              const resolvedName = supaUser.user_metadata?.full_name || generateUsername();
              const driverId = role === "driver"
                ? generateDriverIdFromUsername(resolvedName)
                : undefined;
              const avatarUri = supaUser.user_metadata?.avatar_url || generateInitialsAvatar(resolvedName);

              // Upsert the profile row
              await supabase.from("users").upsert({
                id: supaUser.id,
                full_name: resolvedName,
                email: supaUser.email ?? "",
                phone: "",
                age: 18,
                role,
                points_balance: 0,
                profile_complete: false,
                profile_photo: avatarUri,
                ...(driverId ? { driver_id: driverId } : {}),
              });

              if (role === "driver") {
                router.replace("/(auth)/driver-profile");
              } else if (role === "park_owner") {
                router.replace("/(park-owner)");
              } else {
                router.replace("/(passenger)");
              }
            }
          }
        }
      } catch (err) {
        Alert.alert("OAuth Error", err instanceof Error ? err.message : "Could not sign in");
      } finally {
        setOauthLoading(null);
      }
    },
    [role, router]
  );

  const goBack = () => router.push('/(auth)/login');
  const goToLogin = () => router.replace("/(auth)/login");

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} hitSlop={{ top: 100, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.primaryLight} />
          <Text style={styles.backText}>Back to Login</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={[styles.titleBlock, { opacity: fadeAnim }]}>
          <Text style={styles.title}>{t("auth.register")}</Text>
          <Text style={styles.subtitle}>Join thousands of Nigerians on Teqil</Text>
        </Animated.View>

        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Role selector */}
          <RoleSelector value={role} onChange={handleRoleChange} />

          {/* Full Name */}
          <FieldWrapper label={t("auth.fullName")} error={errors.fullName?.message}>
            <Controller
              control={control}
              name="fullName"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  icon={<Ionicons name="person-outline" size={18} color={Colors.primaryLight} />}
                  placeholder="e.g. Emeka Okonkwo"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  hasError={!!errors.fullName}
                  autoCapitalize="words"
                />
              )}
            />
          </FieldWrapper>

          {/* Email */}
          <FieldWrapper label={t("auth.email")} error={errors.email?.message}>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  icon={<Ionicons name="mail-outline" size={18} color={Colors.primaryLight} />}
                  placeholder={t("auth.emailPlaceholder")}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  hasError={!!errors.email}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              )}
            />
          </FieldWrapper>

          {/* Phone */}
          <FieldWrapper label={t("auth.phone")} error={errors.phone?.message}>
            <Controller
              control={control}
              name="phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  icon={<Ionicons name="call-outline" size={18} color={Colors.primaryLight} />}
                  placeholder={t("auth.phonePlaceholder")}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  hasError={!!errors.phone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                />
              )}
            />
          </FieldWrapper>

          {/* Age */}
          <FieldWrapper label={t("auth.age")} error={errors.age?.message}>
            <Controller
              control={control}
              name="age"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  icon={<FontAwesome5 name="birthday-cake" size={16} color={Colors.primaryLight} />}
                  placeholder={t("auth.agePlaceholder")}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  hasError={!!errors.age}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              )}
            />
          </FieldWrapper>

          {/* Password — focus triggers suggestion modal */}
          <FieldWrapper label={t("auth.password")} error={errors.password?.message}>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  icon={<Ionicons name="lock-closed-outline" size={18} color={Colors.primaryLight} />}
                  placeholder={t("auth.passwordPlaceholder")}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  hasError={!!errors.password}
                  secureTextEntry={!showPassword}
                  onFocusCallback={handlePasswordFocus}
                  trailingIcon={
                    <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={Colors.primaryLight} />
                    </TouchableOpacity>
                  }
                />
              )}
            />
          </FieldWrapper>

          {/* Confirm Password */}
          <FieldWrapper label={t("auth.confirmPassword")} error={errors.confirmPassword?.message}>
            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  icon={<Ionicons name="shield-checkmark-outline" size={18} color={Colors.primaryLight} />}
                  placeholder="Repeat your password"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  hasError={!!errors.confirmPassword}
                  secureTextEntry={!showConfirm}
                  trailingIcon={
                    <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name={showConfirm ? "eye-off-outline" : "eye-outline"} size={18} color={Colors.primaryLight} />
                    </TouchableOpacity>
                  }
                />
              )}
            />
          </FieldWrapper>

          {/* Submit */}
          <Animated.View style={[styles.buttonWrap, { transform: [{ scale: buttonScale }] }]}>
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit(onSubmit)}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              disabled={loading}
              activeOpacity={0.9}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </Animated.View>

          <OrDivider />

          {/* OAuth */}
          {Platform.OS === "ios" && (
            <OAuthButton provider="apple" onPress={() => handleOAuth("apple")} loading={oauthLoading === "apple"} />
          )}
          <OAuthButton provider="google" onPress={() => handleOAuth("google")} loading={oauthLoading === "google"} />

          {/* Sign in link */}
          <View style={styles.signInRow}>
            <Text style={styles.signInText}>Already have an account? </Text>
            <TouchableOpacity onPress={goToLogin} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Text style={styles.signInLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAwareScrollViewCompat>

      {/* Password suggestion modal */}
      <PasswordSuggestionModal
        visible={pwModalVisible}
        suggestion={pwSuggestion}
        onAccept={handleAcceptPassword}
        onDismiss={() => setPwModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.primary },
  header: { paddingHorizontal: 30, paddingVertical: 12 },
  backBtn: {
    alignItems: "flex-start",
    justifyContent: "flex-start",
    flexDirection: "column",
    gap: 55,
  },
  backText: { color: Colors.primaryLight, fontWeight: "600", fontSize: 15 },
  scrollContent: { paddingHorizontal: 34, paddingTop: 4 },
  titleBlock: { marginBottom: 32, alignItems: "center" },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 30,
    color: Colors.primaryLight,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.primaryLight,
    lineHeight: 20,
  },
  buttonWrap: { marginTop: 28, marginBottom: 8 },
  submitBtn: {
    backgroundColor: Colors.overlay,
    borderRadius: 44,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
  submitBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#fff",
    letterSpacing: 0.3,
  },
  signInRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    paddingBottom: 8,
  },
  signInText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.primaryLight,
  },
  signInLink: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.primaryLight,
    textDecorationLine: "underline",
  },
});