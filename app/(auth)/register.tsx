
/**
 * app/(auth)/register.tsx
 *
 * UI updated to match login.tsx design language:
 * - Same color composition (dynamic dark/light via useSettingsStore)
 * - Same typography (Poppins family), borderRadius, input styles
 * - Same header layout (back button + centered title/subtitle)
 * - Same FormField / OrDivider / OAuthButton pattern
 * - Dark/light mode reactive throughout
 * - All original logic, structure, and functionality preserved
 */

import React, { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  Easing,
} from "react-native-reanimated";

import { Colors } from "@/constants/colors";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { signUpOfflineAware, saveBiometricCredentials, checkUsernameExists } from "@/src/services/auth";
import {
  generateUsername,
  generateDriverIdFromUsername,
  generateStrongPassword,
  generateInitialsAvatar,
} from "@/src/utils/helpers";
import { getDeviceFingerprint } from "@/src/utils/device";
import { useCreditsStore } from "@/src/store/useCreditsStore";
import { supabase } from "@/src/services/supabase";
import type { UserRole } from "@/src/models/types";

WebBrowser.maybeCompleteAuthSession();

// ─── Schema ───────────────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
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

// ─── Animated pressable (matches login.tsx) ───────────────────────────────────

function AnimatedPressable({
  onPress,
  disabled,
  style,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  style: object | object[];
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => { if (!disabled) scale.value = withSpring(0.95, { damping: 20 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 15 }); }}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─── Role selector ────────────────────────────────────────────────────────────

const ROLES: { value: UserRole; label: string; icon: keyof typeof Ionicons.glyphMap; }[] = [
  { value: "driver",     label: "Driver",     icon: "car-sport"  },
  { value: "passenger",  label: "Passenger",  icon: "person"     },
  { value: "park_owner", label: "Park Owner", icon: "business"   },
];

function RoleSelector({
  value,
  onChange,
}: {
  value: UserRole | null;
  onChange: (r: UserRole) => void;
}) {
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  const cardBg = isDark ? "rgba(255,255,255,0.06)" : "#F5F7FA";

  return (
    <View style={roleStyles.container}>
      <Text style={[roleStyles.label, { color: subTextColor }]}>Who Are You?</Text>
      <View style={roleStyles.row}>
        {ROLES.map((role) => {
          const active = value === role.value;
          return (
            <Pressable
              key={role.value}
              style={[
                roleStyles.card,
                { backgroundColor: cardBg, borderColor },
                active && { backgroundColor: isDark ? Colors.primaryDark : Colors.primary, borderColor: Colors.primary },
              ]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(role.value); }}
            >
              <Ionicons
                name={role.icon}
                size={22}
                color={active ? "#fff" : isDark ? Colors.textSecondary : Colors.textTertiary}
              />
              <Text style={[roleStyles.cardLabel, { color: active ? "#fff" : subTextColor }]}>
                {role.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const roleStyles = StyleSheet.create({
  container: { marginBottom: 8 },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    marginTop: 16,
    marginBottom: 10,
    paddingLeft: 5,
  },
  row: { flexDirection: "row", gap: 10 },
  card: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    paddingVertical: 20,
    paddingHorizontal: 10,
    gap: 6,
  },
  cardLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    textAlign: "center",
  },
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
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const sheetBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  const pwBoxBg = isDark ? "rgba(255,255,255,0.05)" : "#F5F7FA";

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable style={pwStyles.backdrop} onPress={onDismiss}>
        <View style={[pwStyles.sheet, { backgroundColor: sheetBg }]} onStartShouldSetResponder={() => true}>
          <View style={[pwStyles.handle, { backgroundColor: borderColor }]} />
          <View style={pwStyles.iconRow}>
            <View style={[pwStyles.iconBg, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : Colors.border }]}>
              <Ionicons name="key-outline" size={26} color={Colors.primary} />
            </View>
          </View>
          <Text style={[pwStyles.title, { color: textColor }]}>Use a Strong Password?</Text>
          <Text style={[pwStyles.sub, { color: subTextColor }]}>
            We generated a strong password for you. Save it somewhere safe!
          </Text>
          <View style={[pwStyles.pwBox, { backgroundColor: pwBoxBg, borderColor }]}>
            <Text style={[pwStyles.pwText, { color: Colors.primary }]} selectable>{suggestion}</Text>
          </View>
          <Pressable
            style={pwStyles.acceptBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onAccept(suggestion); }}
          >
            <Text style={pwStyles.acceptBtnText}>Use this password</Text>
          </Pressable>
          <Pressable style={pwStyles.dismissBtn} onPress={onDismiss}>
            <Text style={[pwStyles.dismissBtnText, { color: subTextColor }]}>Type my own</Text>
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
    marginBottom: 8,
  },
  iconRow: { marginBottom: 4 },
  iconBg: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    textAlign: "center",
  },
  sub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  pwBox: {
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    width: "100%",
    borderWidth: 1,
  },
  pwText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    letterSpacing: 1.5,
    textAlign: "center",
  },
  acceptBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 26,
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
    textDecorationLine: "underline",
  },
});

// ─── Divider ──────────────────────────────────────────────────────────────────

function OrDivider() {
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";

  return (
    <View style={divStyles.row}>
      <View style={[divStyles.line, { backgroundColor: borderColor }]} />
      <Text style={[divStyles.text, { color: subTextColor }]}>or continue with</Text>
      <View style={[divStyles.line, { backgroundColor: borderColor }]} />
    </View>
  );
}

const divStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginVertical: 32 },
  line: { flex: 1, height: 1 },
  text: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    marginHorizontal: 12,
  },
});

// ─── OAuth button ─────────────────────────────────────────────────────────────

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
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";

  return (
    <Pressable
      style={[oauthStyles.btn, { backgroundColor: borderColor, borderColor }]}
      onPress={onPress}
      disabled={loading}
    >
      <Ionicons
        name={isApple ? "logo-apple" : "logo-google"}
        size={20}
        color={isDark ? "#fff" : "#000"}
      />
      <Text style={[oauthStyles.text, { color: textColor }]}>
        {loading ? "Connecting..." : `${isApple ? "Apple" : "Google"}`}
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
    borderRadius: 9,
    height: 52,
    borderWidth: 1,
    flex: 1,
  },
  text: {
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
  },
});

// ─── Form field (matches login.tsx FormField exactly) ─────────────────────────

function FormField({
  label,
  icon,
  placeholder,
  value,
  onChangeText,
  onBlur,
  error,
  secureTextEntry,
  keyboardType = "default",
  autoCapitalize = "none",
  rightElement,
  inputRef,
  returnKeyType,
  onSubmitEditing,
  onFocus,
  autoComplete,
  maxLength,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  onBlur: () => void;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: "email-address" | "default" | "phone-pad" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  rightElement?: React.ReactNode;
  inputRef?: React.RefObject<TextInput | null>;
  returnKeyType?: "next" | "done" | "go";
  onSubmitEditing?: () => void;
  onFocus?: () => void;
  autoComplete?: string;
  maxLength?: number;
}) {
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";

  return (
    <View style={fieldStyles.wrap}>
      <Text style={[fieldStyles.label, { color: textColor }]}>{label}</Text>
      <View style={[
        fieldStyles.inputRow,
        error ? fieldStyles.inputRowError : null,
        { backgroundColor: borderColor },
        { borderColor: error ? Colors.error : borderColor },
      ]}>
        <Ionicons name={icon} size={20} color={subTextColor} style={fieldStyles.icon} />
        <TextInput
          ref={inputRef}
          style={[fieldStyles.input, { color: textColor }]}
          placeholder={placeholder}
          placeholderTextColor={subTextColor}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          onFocus={onFocus}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={returnKeyType === "done"}
          maxLength={maxLength}
          {...(autoComplete ? { autoComplete: autoComplete as any } : {})}
          {...Platform.select({ web: { style: [fieldStyles.input, { color: textColor, outlineStyle: "none" } as any] } })}
        />
        {rightElement}
      </View>
      {error ? <Text style={[fieldStyles.errorText, { color: Colors.error }]}>{error}</Text> : null}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    marginTop: 16,
    marginBottom: 7,
    paddingLeft: 5,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 9,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: .2,
    borderColor: "transparent",
  },
  inputRowError: { borderColor: Colors.error },
  icon: { marginRight: 12 },
  input: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
  },
  errorText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 4,
    paddingLeft: 5,
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useSettingsStore();

  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : Colors.textWhite;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : Colors.text;

  const { selectedRole, setSelectedRole, setUser } = useAuthStore();
  const [role, setRole] = useState<UserRole | null>(selectedRole || null);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);
  const [pwSuggestion, setPwSuggestion] = useState("");
  const [pwModalVisible, setPwModalVisible] = useState(false);

  // Reanimated (matches login.tsx animation pattern)
  const formOpacity = useSharedValue(0);
  const formY = useSharedValue(20);

  useEffect(() => {
    formOpacity.value = withDelay(150, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    formY.value = withDelay(150, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, [formOpacity, formY]);

  const formAnimStyle = useAnimatedStyle(() => ({
    opacity: formOpacity.value,
    transform: [{ translateY: formY.value }],
  }));

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      age: "",
      password: "",
      confirmPassword: "",
    },
  });

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
        let usernameBase = `${data.firstName.trim().toLowerCase()}${data.lastName.trim().toLowerCase()}`;
        let finalUsername = usernameBase;
        
        // Ensure uniqueness
        let exists = await checkUsernameExists(finalUsername);
        let counter = 1;
        while (exists) {
          finalUsername = `${usernameBase}${Math.floor(Math.random() * 10000)}`;
          exists = await checkUsernameExists(finalUsername);
          counter++;
          if(counter > 5) break; // Fallback to avoid infinite loops
        }

        const resolvedName = `${data.firstName.trim()} ${data.lastName.trim()}`;
        const driverId = role === "driver"
          ? generateDriverIdFromUsername(finalUsername)
          : undefined;
        const avatarUri = generateInitialsAvatar(resolvedName);
        const deviceFingerprint = await getDeviceFingerprint();

        const metadata: Record<string, unknown> = {
          first_name: data.firstName.trim(),
          last_name: data.lastName.trim(),
          username: finalUsername,
          full_name: resolvedName,
          phone: data.phone.trim(),
          age: parseInt(data.age, 10),
          role,
          points_balance: 0,
          credits_balance: 10,
          device_fingerprint: deviceFingerprint,
          profile_complete: false,
          profile_photo: avatarUri,
          ...(driverId ? { driver_id: driverId } : {}),
        };

        const result = await signUpOfflineAware(data.email.trim(), data.password, metadata);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        if (result?.user) {
          setUser(result.user);
          await saveBiometricCredentials(data.email.trim(), data.password);
          
          // Grant 10 credits
          useCreditsStore.getState().addCredit('signup', 10, result.user.id);
        }

        if (role === "driver") {
          router.replace("/(auth)/driver-profile");
        } else if (role === "park_owner") {
          router.replace("/(main)");
        } else {
          router.replace("/(main)");
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
                router.replace("/(main)");
              } else {
                router.replace("/(main)");
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

  const goToLogin = () => router.replace("/(auth)/login");
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: bg }]}
      // behavior={Platform.OS === "ios" ? "padding" : "height"}
      // keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header — matches login.tsx header exactly */}
      <View style={[styles.header, { paddingTop: topPadding + 2 }, {backgroundColor:'transparent'}]}>
        <Pressable style={styles.backBtn} onPress={() => router.dismissTo("/(main)")}>
          <Ionicons name="chevron-back" size={22} color={textColor} />
        </Pressable>
        <View style={styles.pageHeaderContainer}>
          <Text style={[styles.pageTitle, { color: textColor }]}>{t("auth.register")}</Text>
          <Text style={[styles.pageSubtitle, { color: subTextColor }]}>Join thousands of Nigerians on Teqil</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={formAnimStyle}>
          {/* Role selector */}
          <RoleSelector value={role} onChange={handleRoleChange} />

          {/* First Name */}
          <Controller
            control={control}
            name="firstName"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="First Name"
                icon="person-outline"
                placeholder="e.g. Emeka"
                value={value ?? ""}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.firstName?.message}
                autoCapitalize="words"
                returnKeyType="next"
              />
            )}
          />

          {/* Last Name */}
          <Controller
            control={control}
            name="lastName"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label="Last Name"
                icon="person-outline"
                placeholder="e.g. Okonkwo"
                value={value ?? ""}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.lastName?.message}
                autoCapitalize="words"
                returnKeyType="next"
              />
            )}
          />

          {/* Email */}
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label={t("auth.email")}
                icon="mail-outline"
                placeholder={t("auth.emailPlaceholder")}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.email?.message}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="next"
              />
            )}
          />

          {/* Phone */}
          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label={t("auth.phone")}
                icon="call-outline"
                placeholder={t("auth.phonePlaceholder")}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.phone?.message}
                keyboardType="phone-pad"
                autoComplete="tel"
                returnKeyType="next"
              />
            )}
          />

          {/* Age */}
          <Controller
            control={control}
            name="age"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label={t("auth.age")}
                icon="calendar-outline"
                placeholder={t("auth.agePlaceholder")}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.age?.message}
                keyboardType="number-pad"
                maxLength={3}
                returnKeyType="next"
              />
            )}
          />

          {/* Password */}
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label={t("auth.password")}
                icon="lock-closed-outline"
                placeholder={t("auth.passwordPlaceholder")}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
                secureTextEntry={!showPassword}
                onFocus={handlePasswordFocus}
                returnKeyType="next"
                rightElement={
                  <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={isDark ? Colors.textSecondary : Colors.textTertiary}
                    />
                  </Pressable>
                }
              />
            )}
          />

          {/* Confirm Password */}
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label={t("auth.confirmPassword")}
                icon="shield-checkmark-outline"
                placeholder="Repeat your password"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.confirmPassword?.message}
                secureTextEntry={!showConfirm}
                returnKeyType="done"
                onSubmitEditing={handleSubmit(onSubmit)}
                rightElement={
                  <Pressable onPress={() => setShowConfirm((v) => !v)} hitSlop={8}>
                    <Ionicons
                      name={showConfirm ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={isDark ? Colors.textSecondary : Colors.textTertiary}
                    />
                  </Pressable>
                }
              />
            )}
          />

          {/* Submit — matches login.tsx submitBtn style */}
          <AnimatedPressable
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
            style={[
              styles.submitBtn,
              loading && styles.submitBtnLoading,
              { backgroundColor: borderColor, borderColor },
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={isDark ? Colors.textSecondary : "#fff"} />
            ) : (
              <Text style={[styles.submitBtnText, { color: "#fff" }]}>Create Account</Text>
            )}
          </AnimatedPressable>

          <OrDivider />

          {/* OAuth */}
          <View style={styles.oauthContent}>
            {Platform.OS === "ios" && (
              <OAuthButton
                provider="apple"
                onPress={() => handleOAuth("apple")}
                loading={oauthLoading === "apple"}
              />
            )}
            <OAuthButton
              provider="google"
              onPress={() => handleOAuth("google")}
              loading={oauthLoading === "google"}
            />
          </View>

          {/* Sign in link */}
          <Pressable style={styles.switchBtn} onPress={goToLogin}>
            <Text style={[styles.switchText, { color: subTextColor }]}>
              Already have an account?{" "}
              <Text style={[styles.switchLink, { color: textColor }]}>Sign In</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>

      {/* Password suggestion modal */}
      <PasswordSuggestionModal
        visible={pwModalVisible}
        suggestion={pwSuggestion}
        onAccept={handleAcceptPassword}
        onDismiss={() => setPwModalVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    // paddingBottom: 8,
  },
  pageHeaderContainer: { alignItems: "center", marginBottom: 0 },
  pageTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    marginBottom: 3,
  },
  pageSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },
  submitBtn: {
    borderWidth: 1,
    borderRadius: 9,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
  },
  submitBtnLoading: { opacity: 0.7 },
  submitBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  oauthContent: {
    gap: 10,
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 10,
  },
  switchBtn: { alignItems: "center", marginTop: 24, paddingVertical: 8 },
  switchText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  switchLink: {
    fontFamily: "Poppins_600SemiBold",
  },
});