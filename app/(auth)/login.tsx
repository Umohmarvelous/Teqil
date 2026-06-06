/**
 * app/(auth)/login.tsx
 *
 * Changes from original:
 * - Biometric login (Face ID / fingerprint) via expo-local-authentication
 * - Google + Apple OAuth via Supabase
 * - On sign-out redirect here (not welcome screen)
 * - Saves credentials for biometric re-use after successful password login
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  Easing,
} from "react-native-reanimated";

import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import {
  signInOfflineAware,
  saveBiometricCredentials,
} from "@/src/services/auth";
import { supabase } from "@/src/services/supabase";
import { useTranslation } from "react-i18next";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSettingsStore } from "@/src/store/useSettingsStore";

// Required for OAuth redirect handling on web
WebBrowser.maybeCompleteAuthSession();

// ─── Validation ───────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type LoginFormData = z.infer<typeof loginSchema>;

// ─── Role → route helper ──────────────────────────────────────────────────────

function routeByRole(
  role: string,
  profileComplete: boolean | undefined
) {
  if (role === "driver") {
    // return profileComplete ? "/(driver)" : "/(auth)/driver-profile";
    return profileComplete ? "/(main)" : "/(auth)/driver-profile";

  }
  if (role === "park_owner") return "/(main)";
  return "/(main)";
  // if (role === "park_owner") return "/(park-owner)";
  // return "/(passenger)";
}

// ─── Animated pressable ───────────────────────────────────────────────────────

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

// ─── Form field ───────────────────────────────────────────────────────────────

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
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  onBlur: () => void;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: "email-address" | "default";
  autoCapitalize?: "none" | "sentences";
  rightElement?: React.ReactNode;
  inputRef?: React.RefObject<TextInput | null>;
  returnKeyType?: "next" | "done" | "go";
  onSubmitEditing?: () => void;
  })
{

  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  
  return (
    <View style={fieldStyles.wrap}>
      <Text style={[fieldStyles.label, { color: textColor}]}>{label}</Text>
      <View style={[fieldStyles.inputRow, error ? fieldStyles.inputRowError : null, { backgroundColor: borderColor }, {borderColor:error ? Colors.error : borderColor}]}>
        <Ionicons name={icon} size={20} color={subTextColor} style={fieldStyles.icon} />
        <TextInput
          ref={inputRef}
          style={[fieldStyles.input, {color: textColor}]}
          placeholder={placeholder}
          placeholderTextColor={subTextColor}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={returnKeyType === "done"}
        />
        {rightElement}
      </View>
      {error ? <Text style={[fieldStyles.errorText, {color: Colors.error}]}>{error}</Text> : null}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap: { marginBottom: 16 },
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
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
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
      <View style={[divStyles.line, {backgroundColor: borderColor}]} />
      <Text style={[divStyles.text, {color: subTextColor}]}>or continue with</Text>
      <View style={[divStyles.line, {backgroundColor: borderColor}]} />
    </View>
  );
}

const divStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginVertical: 40 },
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
      style={[oauthStyles.btn, {backgroundColor: borderColor, borderColor}]}
      onPress={onPress}
      disabled={loading}
    >
      <Ionicons
        name={isApple ? "logo-apple" : "logo-google"}
        size={20}
        color={isDark ? "#fff" : "#000"}
      />
      
      <Text style={[oauthStyles.text, {color: textColor}]}>
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
    borderRadius: 26,
    height: 52,
    borderWidth: 1,
    flex: 1,
  },

  text: {
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
    color: "#fff",
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LoginScreen() {

  const { theme } = useSettingsStore();


  
  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : Colors.textWhite;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : Colors.text;


  const insets = useSafeAreaInsets();
  const { setUser, setIsAuthenticated } = useAuthStore();
  const { t } = useTranslation();

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);


  const passwordRef = useRef<TextInput>(null);


  const formOpacity = useSharedValue(0);
  const formY = useSharedValue(20);

  useEffect(() => {
    formOpacity.value = withDelay(150, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    formY.value = withDelay(150, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, []);

  const formAnimStyle = useAnimatedStyle(() => ({
    opacity: formOpacity.value,
    transform: [{ translateY: formY.value }],
  }));

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  // ── Password login ────────────────────────────────────────────────────────

  const onSubmit = async (data: LoginFormData) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    try {
      const { user, offlineMode } = await signInOfflineAware(data.email, data.password);
      setUser(user);
      setIsAuthenticated(true);

      // Save for future biometric login
      await saveBiometricCredentials(data.email, data.password);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (offlineMode) {
        Alert.alert("Offline Mode", "Signed in from cache. Some features need internet.");
      }

      router.replace(routeByRole(user.role, user.profile_complete) as any);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Sign In Failed", err instanceof Error ? err.message : t("common.error"));
    } finally {
      setIsLoading(false);
    }
  };



  // ── OAuth ─────────────────────────────────────────────────────────────────

  const handleOAuth = useCallback(async (provider: "google" | "apple") => {
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
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          "teqil://oauth-callback"
        );
        if (result.type === "success") {
          // Supabase session will be picked up by the onAuthStateChange listener in _layout.tsx
          // which calls setIsAuthenticated. We just need to navigate after session is ready.
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData.session?.user) {
            const { data: profileData } = await supabase
              .from("users")
              .select("*")
              .eq("id", sessionData.session.user.id)
              .single();

            if (profileData) {
              const user = profileData as any;
              setUser(user);
              setIsAuthenticated(true);
              router.replace(routeByRole(user.role || "passenger", user.profile_complete) as any);
            }
          }
        }
      }
    } catch (err) {
      Alert.alert("OAuth Error", err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setOauthLoading(null);
    }
  }, [setUser, setIsAuthenticated]);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, {backgroundColor: bg}]}>
      <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.dismissTo('/(main)')}>
          <Ionicons name="chevron-back" size={22} color={textColor} />
          {/* <Text style={[styles.backText, {color: textColor}]}>Back</Text> */}
        </Pressable>

        <View style={styles.pageHeaderContainer}>
          <Text style={[styles.pageTitle, {color: textColor}]}>Login</Text>
          <Text style={[styles.pageSubtitle, {color: subTextColor}]}>Sign in to continue your journey</Text>
        </View>

        <View style={styles.backBtn} />
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + (Platform.OS === "web" ? 34 : 0) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        

        <Animated.View style={formAnimStyle}>
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
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
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
                inputRef={passwordRef}
                returnKeyType="done"
                onSubmitEditing={handleSubmit(onSubmit)}
                rightElement={
                  <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={textColor}
                    />
                  </Pressable>
                }
              />
            )}
          />

          <Pressable
            style={styles.forgotBtn}
            onPress={() => Alert.alert("Reset Password", "Password reset coming soon.")}
            hitSlop={8}
          >
            <Text style={[styles.forgotText, {color: subTextColor}]}>{t("auth.forgotPassword")}</Text>
          </Pressable>

          {/* Submit */}
          <AnimatedPressable
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading}
            style={[styles.submitBtn, isLoading && styles.submitBtnLoading, {backgroundColor: borderColor, borderColor}]}
          >
            <Text style={[styles.submitBtnText, {color: isDark ? '#fff' : '#fff'}]}>
              {isLoading
                ? <ActivityIndicator size="small" color={subTextColor} />
                : t("auth.login")}
            </Text>
            {!isLoading && (
              ""
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

          {/* Switch to register */}
          <Pressable style={[styles.switchBtn] } onPress={() => router.replace("/(auth)/register")}>
            <Text style={[styles.switchText, {color: subTextColor}] }>
              {t("auth.noAccount")}{" "}
              <Text style={[styles.switchLink, {color: textColor}]}>{t("auth.signUp")}</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
    paddingHorizontal: 20,
    paddingBottom: 8,
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
    // marginBottom: 32,
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
  backText: { fontWeight: "600", fontSize: 15 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 44, paddingTop: 125, marginVertical:'auto' },
  forgotBtn: { alignSelf: "flex-end", marginBottom: 24, marginTop: -8 },
  forgotText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
  },
  submitBtn: {
    borderWidth: 1,
    borderRadius: 26,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 100,
  },
  submitBtnLoading: { opacity: 0.7 },
  submitBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  biometricBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.overlayLight,
    borderRadius: 26,
    height: 52,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  biometricText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.primaryLight,
  },
  oauthContent: {
    gap:10,
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 10
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

