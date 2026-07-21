

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
  ScrollView,
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
  FadeIn,
  FadeOut,
} from "react-native-reanimated";

import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import {
  signInOfflineAware,
  saveBiometricCredentials,
} from "@/src/services/auth";
import { supabase } from "@/src/services/supabase";
import { useTranslation } from "react-i18next";
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
    borderRadius: 9,
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
  }, [formOpacity, formY]);

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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + (Platform.OS === "web" ? 34 : 0) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
    paddingHorizontal: 12,
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 125, marginVertical:'auto' },
  forgotBtn: { alignSelf: "flex-end", marginBottom: 24, marginTop: -8 },
  forgotText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
  },
  submitBtn: {
    borderWidth: 1,
    borderRadius: 9,
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














// import React, { useEffect, useRef, useState } from "react";
// import {
//   View,
//   Text,
//   StyleSheet,
//   Pressable,
//   TextInput,
//   Alert,
//   Platform,
//   ActivityIndicator,
//   ScrollView,
// } from "react-native";
// import { router } from "expo-router";
// import { useSafeAreaInsets } from "react-native-safe-area-context";
// import { Ionicons } from "@expo/vector-icons";
// import * as Haptics from "expo-haptics";

// import Animated, {
//   useSharedValue,
//   useAnimatedStyle,
//   withTiming,
//   withDelay,
//   Easing,
//   FadeIn,
//   FadeOut,
// } from "react-native-reanimated";

// import { useAuthStore } from "@/src/store/useStore";
// import { Colors } from "@/constants/colors";
// import {
//   signInOfflineAware,
//   saveBiometricCredentials,
//   signInWithBiometrics,
//   getBiometricCredentials,
//   checkUsernameExists,
//   syncUserToPublicTable,
// } from "@/src/services/auth";
// import { useTranslation } from "react-i18next";
// import { useSettingsStore } from "@/src/store/useSettingsStore";
// import { getDeviceFingerprint } from "@/src/utils/device";

// function routeByRole(role: string, profileComplete: boolean | undefined) {
//   if (role === "driver") {
//     return profileComplete ? "/(main)" : "/(auth)/driver-profile";
//   }
//   return "/(main)";
// }

// export default function LoginScreen() {
//   const { theme } = useSettingsStore();
//   const isDark = theme === "dark";
//   const bg = isDark ? Colors.background : Colors.textWhite;
//   const textColor = isDark ? Colors.textWhite : Colors.text;
//   const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
//   const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";

//   const insets = useSafeAreaInsets();
//   const { setUser, setIsAuthenticated } = useAuthStore();
//   const { t } = useTranslation();

//   const [username, setUsername] = useState("");
//   const [password, setPassword] = useState("");
//   const [showPasswordInput, setShowPasswordInput] = useState(false);
//   const [showPassword, setShowPassword] = useState(false);
//   const [isLoading, setIsLoading] = useState(false);
//   const [isBiometricLoading, setIsBiometricLoading] = useState(false);
//   const [emailForLogin, setEmailForLogin] = useState<string | null>(null);
//   const [hasBiometricCredentials, setHasBiometricCredentials] = useState(false);

//   const passwordRef = useRef<TextInput>(null);

//   const formOpacity = useSharedValue(0);
//   const formY = useSharedValue(20);

//   // Check if we have stored biometric credentials on mount
//   useEffect(() => {
//     (async () => {
//       const creds = await getBiometricCredentials();
//       setHasBiometricCredentials(!!creds);
//     })();
//   }, []);

//   useEffect(() => {
//     formOpacity.value = withDelay(
//       150,
//       withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) })
//     );
//     formY.value = withDelay(
//       150,
//       withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) })
//     );
//   }, []);

//   const formAnimStyle = useAnimatedStyle(() => ({
//     opacity: formOpacity.value,
//     transform: [{ translateY: formY.value }],
//   }));

//   // ─── Username submit: look up user, show password field ─────────────────────
//   const handleUsernameSubmit = async () => {
//     if (!username.trim()) return;
//     setIsLoading(true);

//     try {
//       const userMeta = await checkUsernameExists(username.trim().toLowerCase());

//       if (!userMeta) {
//         Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
//         Alert.alert(
//           "User not found",
//           "No account found with that username. Please sign up."
//         );
//         setIsLoading(false);
//         return;
//       }

//       setEmailForLogin(userMeta.email);
//       // Always show the password input after username lookup
//       setShowPasswordInput(true);
//       setTimeout(() => passwordRef.current?.focus(), 100);
//     } catch (err) {
//       Alert.alert("Error", "Could not verify username.");
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   // ─── Biometric login: uses stored credentials + device FaceID/TouchID ───────
//   const handleBiometricLogin = async () => {
//     setIsBiometricLoading(true);
//     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

//     try {
//       const biometricResult = await signInWithBiometrics();

//       if (!biometricResult.supported) {
//         Alert.alert(
//           "Not Supported",
//           "Biometric authentication is not available on this device."
//         );
//         return;
//       }

//       if (!biometricResult.enrolled) {
//         Alert.alert(
//           "Not Enrolled",
//           "Please set up Face ID or Touch ID in your device settings first."
//         );
//         return;
//       }

//       if (biometricResult.success && biometricResult.user) {
//         handleSuccessfulLogin(
//           biometricResult.user,
//           biometricResult.offlineMode
//         );
//         return;
//       }

//       // Biometric failed
//       if (biometricResult.error === "no_credentials") {
//         Alert.alert(
//           "No Saved Login",
//           "Please sign in with your username and password first. After that, biometric login will be available."
//         );
//       } else if (biometricResult.error) {
//         // User cancelled or auth failed — just silently return, don't show error
//         console.log("[Login] Biometric dismissed:", biometricResult.error);
//       }
//     } catch (err) {
//       Alert.alert(
//         "Error",
//         "Biometric authentication failed. Please try again."
//       );
//     } finally {
//       setIsBiometricLoading(false);
//     }
//   };

//   // ─── Password login ─────────────────────────────────────────────────────────
//   const handlePasswordLogin = async () => {
//     if (!emailForLogin || !password) return;
//     setIsLoading(true);
//     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

//     try {
//       const { user, offlineMode } = await signInOfflineAware(
//         emailForLogin,
//         password
//       );

//       // Save for future biometric logins
//       await saveBiometricCredentials(emailForLogin, password);

//       // Update device fingerprint on successful password login
//       const currentFingerprint = await getDeviceFingerprint();
//       user.device_fingerprint = currentFingerprint;

//       // Sync fingerprint to DB so biometric works on next login
//       syncUserToPublicTable(user).catch(() => {});

//       handleSuccessfulLogin(user, offlineMode);
//     } catch (err) {
//       Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
//       Alert.alert(
//         "Sign In Failed",
//         err instanceof Error ? err.message : t("common.error")
//       );
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const handleSuccessfulLogin = (user: any, offlineMode?: boolean) => {
//     setUser(user);
//     setIsAuthenticated(true);
//     Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

//     if (offlineMode) {
//       Alert.alert(
//         "Offline Mode",
//         "Signed in from cache. Some features need internet."
//       );
//     }
//     router.replace(routeByRole(user.role, user.profile_complete) as any);
//   };

//   const handleForgotPassword = () => {
//     if (!username.trim()) {
//       Alert.alert("Forgot Password", "Please enter your username first.");
//       return;
//     }
//     Alert.alert(
//       "Reset Password",
//       `A reset link will be sent to the email associated with '${username}'`
//     );
//   };

//   const topPadding = Platform.OS === "web" ? 67 : insets.top;

//   return (
//     <View style={[styles.container, { backgroundColor: bg }]}>
//       <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
//         <View style={styles.pageHeaderContainer}>
//           <Text style={[styles.pageTitle, { color: textColor }]}>Login</Text>
//           <Text style={[styles.pageSubtitle, { color: subTextColor }]}>
//             Sign in to continue your journey
//           </Text>
//         </View>
//       </View>

//       <ScrollView
//         style={styles.scroll}
//         contentContainerStyle={[
//           styles.scrollContent,
//           { paddingBottom: Math.max(insets.bottom, 24) },
//         ]}
//         showsVerticalScrollIndicator={false}
//         keyboardShouldPersistTaps="handled"
//       >
//         <Animated.View style={formAnimStyle}>
//           <View style={{marginVertical: 50, marginBottom: 150}}>

//             {/* Username Input Row */}
//             <Text style={[styles.label, { color: textColor }]}>Username</Text>
            
//             <View style={{flex: 1, flexDirection: 'row', justifyContent: 'space-between', gap: 12}}>
//               <View
//                 style={[
//                   styles.inputRow,
//                   { backgroundColor: textColor },
//                   {flex: 1}
//                 ]}
//               >
//                 <Ionicons
//                   name="person-outline"
//                   size={15}
//                   color={isDark ? Colors.text : Colors.textWhite}
//                   style={styles.icon}
//                 />
//                 <TextInput
//                   style={[styles.input, { color: isDark ? Colors.text : Colors.textWhite }]}
//                   placeholder="Enter your username"
//                   placeholderTextColor={isDark ? Colors.text : Colors.textWhite}
//                   value={username}
//                   onChangeText={(text) => {
//                     setUsername(text);
//                     setShowPasswordInput(false);
//                     setEmailForLogin(null);
//                   }}
//                   autoCapitalize="none"
//                   autoCorrect={false}
//                   returnKeyType="go"
//                   onSubmitEditing={handleUsernameSubmit}
//                   editable={!isLoading && !isBiometricLoading}
//                 />
//                 {isLoading && !isBiometricLoading ? (
//                   <ActivityIndicator
//                     size="small"
//                     color={textColor}
//                     style={{ marginLeft: 8 }}
//                   />
//                 ) : null}
//               </View>


//               {/* Biometric Login Button — always visible if credentials exist */}
//               <Pressable
//                 style={[
//                   styles.biometricBtn,
//                   {
//                     borderColor: hasBiometricCredentials
//                       ? textColor
//                       : textColor,
//                     opacity: hasBiometricCredentials ? 1 : 0.4,
//                   },
//                 ]}
//                 onPress={handleBiometricLogin}
//                 disabled={isBiometricLoading || !hasBiometricCredentials}
//               >
//                 {isBiometricLoading ? (
//                   <ActivityIndicator size={28} color={textColor} />
//                 ) : (
//                   <Ionicons
//                     name="finger-print"
//                     size={28}
//                     color={
//                       hasBiometricCredentials ? textColor : textColor
//                     }
//                   />
//                 )}
//                 {/* <Text
//                   style={[
//                     styles.biometricBtnText,
//                     {
//                       color: hasBiometricCredentials
//                         ? Colors.primary
//                         : subTextColor,
//                     },
//                   ]}
//                 >
//                   {hasBiometricCredentials
//                     ? "Sign in with Face ID / Touch ID"
//                     : "Sign in with password first to enable biometrics"}
//                 </Text> */}
//               </Pressable>
//             </View>
                
//             {/* Password Input (Hidden until username is verified) */}
//             {showPasswordInput && (
//               <Animated.View entering={FadeIn} exiting={FadeOut}>
//                 <Text style={[styles.label, { color: textColor }]}>Password</Text>
//                 <View
//                   style={[
//                     styles.inputRow,
//                     { backgroundColor: borderColor, borderColor },
//                   ]}
//                 >
//                   <Ionicons
//                     name="lock-closed-outline"
//                     size={20}
//                     color={subTextColor}
//                     style={styles.icon}
//                   />
//                   <TextInput
//                     ref={passwordRef}
//                     style={[styles.input, { color: textColor }]}
//                     placeholder="Enter your password"
//                     placeholderTextColor={subTextColor}
//                     value={password}
//                     onChangeText={setPassword}
//                     secureTextEntry={!showPassword}
//                     autoCapitalize="none"
//                     returnKeyType="done"
//                     onSubmitEditing={handlePasswordLogin}
//                     editable={!isLoading}
//                   />
//                   <Pressable
//                     onPress={() => setShowPassword(!showPassword)}
//                     hitSlop={8}
//                   >
//                     <Ionicons
//                       name={showPassword ? "eye-off-outline" : "eye-outline"}
//                       size={20}
//                       color={textColor}
//                     />
//                   </Pressable>
//                 </View>
//               </Animated.View>
//             )}



//             <Pressable style={styles.forgotBtn} onPress={handleForgotPassword}>
//               <Text style={[styles.forgotText, { color: subTextColor }]}>
//                 Forgot password?
//               </Text>
//             </Pressable>
//           </View>

//           {/* Sign In / Username Submit Button */}
//           <Pressable
//             onPress={showPasswordInput ? handlePasswordLogin : handleUsernameSubmit}
//             disabled={isLoading || isBiometricLoading || !username.trim()}
//             style={[
//               styles.submitBtn,
//               (isLoading || !username.trim()) && styles.submitBtnDisabled,
//               { backgroundColor: textColor },
//             ]}
//           >
//             <Text style={[styles.submitBtnText, { color: bg }]}>
//               {isLoading ? (
//                 <ActivityIndicator size="small" color={bg} />
//               ) : showPasswordInput ? (
//                 "Sign In"
//               ) : (
//                 "Continue"
//               )}
//             </Text>
//           </Pressable>

        

//           <Pressable
//             style={styles.switchBtn}
//             onPress={() => router.replace("/(auth)/register")}
//           >
//             <Text style={[styles.switchText, { color: subTextColor }]}>
//               {`Don't have an account?`}
//               <Text style={[styles.switchLink, { color: textColor }]}>
//                 Sign Up
//               </Text>
//             </Text>
//           </Pressable>
//         </Animated.View>
//       </ScrollView>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1 },
//   header: {
//     alignItems: "center",
//     paddingHorizontal: 20,
//     paddingBottom: 8,
//   },
//   pageHeaderContainer: { alignItems: "center" },
//   pageTitle: {
//     fontFamily: "Poppins_700Bold",
//     fontSize: 24,
//     marginBottom: 3,
//   },
//   pageSubtitle: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 14,
//   },
//   scroll: { flex: 1 },
//   scrollContent: {
//     paddingHorizontal: 30,
//     marginVertical: 70,
//   },
//   label: {
//     fontFamily: "Poppins_500Medium",
//     fontSize: 13,
//     // marginTop: 16,
//     marginBottom: 7,
//     paddingLeft: 5,
//   },
//   inputRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     borderRadius: 26,
//     paddingHorizontal: 16,
//     paddingVertical: 14,
//   },
//   icon: { marginRight: 12 },
//   input: {
//     flex: 1,
//     fontFamily: "Poppins_400Regular",
//     fontSize: 14,
//   },
//   forgotBtn: {
//     alignSelf: "flex-end", 
//     marginVertical: 16, 
//    },
//   forgotText: {
//     fontFamily: "Poppins_500Medium",
//     fontSize: 13,
//   },
//   submitBtn: {
//     borderRadius: 26,
//     height: 56,
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "center",
//     marginTop: 8,
//   },
//   submitBtnDisabled: { opacity: 0.5 },
//   submitBtnText: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 16,
//   },
//   biometricBtn: {
//     alignItems: "center",
//     justifyContent: "center",
//     borderRadius: 56,
//     borderWidth: .3,
//     padding: 9
//   },
//   biometricBtnText: {
//     fontFamily: "Poppins_500Medium",
//     fontSize: 13,
//   },
//   switchBtn: { alignItems: "center", marginTop: 40, paddingVertical: 8 },
//   switchText: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 14,
//   },
//   switchLink: {
//     fontFamily: "Poppins_600SemiBold",
//   },
// });







