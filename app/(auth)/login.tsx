// /**
//  * app/(auth)/login.tsx
//  *
//  * Changes from original:
//  * - Biometric login (Face ID / fingerprint) via expo-local-authentication
//  * - Google + Apple OAuth via Supabase
//  * - On sign-out redirect here (not welcome screen)
//  * - Saves credentials for biometric re-use after successful password login
//  */

// import React, { useEffect, useRef, useState, useCallback } from "react";
// import {
//   View,
//   Text,
//   StyleSheet,
//   Pressable,
//   TextInput,
//   Alert,
//   Platform,
//   ActivityIndicator,
// } from "react-native";
// import { router } from "expo-router";
// import { useSafeAreaInsets } from "react-native-safe-area-context";
// import { Ionicons } from "@expo/vector-icons";
// import * as Haptics from "expo-haptics";
// import * as WebBrowser from "expo-web-browser";
// import { useForm, Controller } from "react-hook-form";
// import { z } from "zod";
// import { zodResolver } from "@hookform/resolvers/zod";
// import Animated, {
//   useSharedValue,
//   useAnimatedStyle,
//   withTiming,
//   withSpring,
//   withDelay,
//   Easing,
// } from "react-native-reanimated";

// import { useAuthStore } from "@/src/store/useStore";
// import { Colors } from "@/constants/colors";
// import {
//   signInOfflineAware,
//   signInWithBiometrics,
//   saveBiometricCredentials,
// } from "@/src/services/auth";
// import { supabase } from "@/src/services/supabase";
// import { useTranslation } from "react-i18next";
// import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
// import { HugeiconsIcon } from "@hugeicons/react-native";
// import { Apple01Icon, AppleFinderIcon, AppleStocksIcon } from "@hugeicons/core-free-icons";

// // Required for OAuth redirect handling on web
// WebBrowser.maybeCompleteAuthSession();

// // ─── Validation ───────────────────────────────────────────────────────────────

// const loginSchema = z.object({
//   email: z.string().min(1, "Email is required").email("Enter a valid email"),
//   password: z.string().min(1, "Password is required"),
// });
// type LoginFormData = z.infer<typeof loginSchema>;

// // ─── Role → route helper ──────────────────────────────────────────────────────

// function routeByRole(
//   role: string,
//   profileComplete: boolean | undefined
// ) {
//   if (role === "driver") {
//     // return profileComplete ? "/(driver)" : "/(auth)/driver-profile";
//     return profileComplete ? "/(main)" : "/(auth)/driver-profile";

//   }
//   if (role === "park_owner") return "/(main)";
//   return "/(main)";
//   // if (role === "park_owner") return "/(park-owner)";
//   // return "/(passenger)";
// }

// // ─── Animated pressable ───────────────────────────────────────────────────────

// function AnimatedPressable({
//   onPress,
//   disabled,
//   style,
//   children,
// }: {
//   onPress: () => void;
//   disabled?: boolean;
//   style: object | object[];
//   children: React.ReactNode;
// }) {
//   const scale = useSharedValue(1);
//   const animStyle = useAnimatedStyle(() => ({
//     transform: [{ scale: scale.value }],
//   }));
//   return (
//     <Animated.View style={animStyle}>
//       <Pressable
//         onPress={onPress}
//         disabled={disabled}
//         onPressIn={() => { if (!disabled) scale.value = withSpring(0.95, { damping: 20 }); }}
//         onPressOut={() => { scale.value = withSpring(1, { damping: 15 }); }}
//         style={style}
//       >
//         {children}
//       </Pressable>
//     </Animated.View>
//   );
// }

// // ─── Form field ───────────────────────────────────────────────────────────────

// function FormField({
//   label,
//   icon,
//   placeholder,
//   value,
//   onChangeText,
//   onBlur,
//   error,
//   secureTextEntry,
//   keyboardType = "default",
//   autoCapitalize = "none",
//   rightElement,
//   inputRef,
//   returnKeyType,
//   onSubmitEditing,
// }: {
//   label: string;
//   icon: keyof typeof Ionicons.glyphMap;
//   placeholder: string;
//   value: string;
//   onChangeText: (v: string) => void;
//   onBlur: () => void;
//   error?: string;
//   secureTextEntry?: boolean;
//   keyboardType?: "email-address" | "default";
//   autoCapitalize?: "none" | "sentences";
//   rightElement?: React.ReactNode;
//   inputRef?: React.RefObject<TextInput | null>;
//   returnKeyType?: "next" | "done" | "go";
//   onSubmitEditing?: () => void;
// }) {
//   return (
//     <View style={fieldStyles.wrap}>
//       <Text style={fieldStyles.label}>{label}</Text>
//       <View style={[fieldStyles.inputRow, error ? fieldStyles.inputRowError : null]}>
//         <Ionicons name={icon} size={20} color={error ? Colors.error : Colors.primaryLight} style={fieldStyles.icon} />
//         <TextInput
//           ref={inputRef}
//           style={fieldStyles.input}
//           placeholder={placeholder}
//           placeholderTextColor={Colors.primaryLight}
//           value={value}
//           onChangeText={onChangeText}
//           onBlur={onBlur}
//           secureTextEntry={secureTextEntry}
//           keyboardType={keyboardType}
//           autoCapitalize={autoCapitalize}
//           autoCorrect={false}
//           returnKeyType={returnKeyType}
//           onSubmitEditing={onSubmitEditing}
//           blurOnSubmit={returnKeyType === "done"}
//         />
//         {rightElement}
//       </View>
//       {error ? <Text style={fieldStyles.errorText}>{error}</Text> : null}
//     </View>
//   );
// }

// const fieldStyles = StyleSheet.create({
//   wrap: { marginBottom: 16 },
//   label: {
//     fontFamily: "Poppins_500Medium",
//     fontSize: 13,
//     color: Colors.primaryLight,
//     marginTop: 16,
//     marginBottom: 7,
//     paddingLeft: 5,
//   },
//   inputRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     backgroundColor: Colors.overlayLight,
//     borderRadius: 26,
//     paddingHorizontal: 16,
//     paddingVertical: 14,
//     borderWidth: 1.5,
//     borderColor: "transparent",
//   },
//   inputRowError: { borderColor: Colors.error },
//   icon: { marginRight: 12 },
//   input: {
//     flex: 1,
//     fontFamily: "Poppins_400Regular",
//     fontSize: 15,
//     color: Colors.primaryLight,
//   },
//   errorText: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 12,
//     color: Colors.error,
//     marginTop: 4,
//   },
// });

// // ─── Divider ──────────────────────────────────────────────────────────────────

// function OrDivider() {
//   return (
//     <View style={divStyles.row}>
//       <View style={divStyles.line} />
//       <Text style={divStyles.text}>or continue with</Text>
//       <View style={divStyles.line} />
//     </View>
//   );
// }

// const divStyles = StyleSheet.create({
//   row: { flexDirection: "row", alignItems: "center", marginVertical: 40 },
//   line: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.2)" },
//   text: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 13,
//     color: Colors.primaryLight,
//     marginHorizontal: 12,
//   },
// });

// // ─── OAuth button ─────────────────────────────────────────────────────────────

// function OAuthButton({
//   provider,
//   onPress,
//   loading,
// }: {
//   provider: "google" | "apple";
//   onPress: () => void;
//   loading: boolean;
// }) {
//   const isApple = provider === "apple";
//   return (
//     <Pressable
//       style={[oauthStyles.btn, isApple && oauthStyles.btnApple]}
//       onPress={onPress}
//       disabled={loading}
//     >
//       <Ionicons
//         name={isApple ? "logo-apple" : "logo-google"}
//         size={20}
//         color={isApple ? "#fff" : "#fff"}
//       />
//       <Text style={[oauthStyles.text, isApple && oauthStyles.textApple]}>
//         {loading ? "Connecting..." : `${isApple ? "Apple" : "Google"}`}
//       </Text>
//     </Pressable>
//   );
// }

// const oauthStyles = StyleSheet.create({
//   btn: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "center",
//     gap: 10,
//     backgroundColor: Colors.overlayLight,
//     borderRadius: 26,
//     height: 52,
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.2)",
//     flex: 1
//   },
//   btnApple: {
//     // backgroundColor: "rgba(0,0,0,0.5)",
//     // borderColor: "rgba(255,255,255,0.3)",
//   },
//   text: {
//     fontFamily: "Poppins_500Medium",
//     fontSize: 15,
//     color: "#fff",
//   },
//   textApple: { color: "#fff" },
// });

// // ─── Main screen ──────────────────────────────────────────────────────────────

// export default function LoginScreen() {
//   const insets = useSafeAreaInsets();
//   const { setUser, setIsAuthenticated } = useAuthStore();
//   const { t } = useTranslation();

//   const [showPassword, setShowPassword] = useState(false);
//   const [isLoading, setIsLoading] = useState(false);
//   const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);
//   const [biometricAvailable, setBiometricAvailable] = useState(false);
//   const [biometricLoading, setBiometricLoading] = useState(false);

//   const passwordRef = useRef<TextInput>(null);

//   // Check biometric availability on mount
//   useEffect(() => {
//     (async () => {
//       const result = await signInWithBiometrics().catch(() => null);
//       // We just want to know if supported + enrolled, not actually authenticate
//       const { LocalAuthentication } = await import("expo-local-authentication").catch(() => ({ LocalAuthentication: null }));
//       if (!LocalAuthentication) return;
//       const supported = await LocalAuthentication.hasHardwareAsync?.().catch(() => false);
//       const enrolled = await LocalAuthentication.isEnrolledAsync?.().catch(() => false);
//       setBiometricAvailable(!!(supported && enrolled));
//     })();
//   }, []);

//   const formOpacity = useSharedValue(0);
//   const formY = useSharedValue(20);

//   useEffect(() => {
//     formOpacity.value = withDelay(150, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
//     formY.value = withDelay(150, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));
//   }, []);

//   const formAnimStyle = useAnimatedStyle(() => ({
//     opacity: formOpacity.value,
//     transform: [{ translateY: formY.value }],
//   }));

//   const {
//     control,
//     handleSubmit,
//     formState: { errors },
//   } = useForm<LoginFormData>({
//     resolver: zodResolver(loginSchema),
//     defaultValues: { email: "", password: "" },
//     mode: "onBlur",
//   });

//   // ── Password login ────────────────────────────────────────────────────────

//   const onSubmit = async (data: LoginFormData) => {
//     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
//     setIsLoading(true);
//     try {
//       const { user, offlineMode } = await signInOfflineAware(data.email, data.password);
//       setUser(user);
//       setIsAuthenticated(true);

//       // Save for future biometric login
//       await saveBiometricCredentials(data.email, data.password);

//       Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

//       if (offlineMode) {
//         Alert.alert("Offline Mode", "Signed in from cache. Some features need internet.");
//       }

//       router.replace(routeByRole(user.role, user.profile_complete) as any);
//     } catch (err) {
//       Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
//       Alert.alert("Sign In Failed", err instanceof Error ? err.message : t("common.error"));
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   // ── Biometric login ───────────────────────────────────────────────────────

//   const handleBiometricLogin = useCallback(async () => {
//     setBiometricLoading(true);
//     try {
//       const result = await signInWithBiometrics();
//       if (!result.supported || !result.enrolled) {
//         Alert.alert("Not Available", "Biometric authentication is not set up on this device.");
//         return;
//       }
//       if (!result.success) {
//         if (result.error === "no_credentials") {
//           Alert.alert("Not Set Up", "Sign in with your password first to enable biometric login.");
//         }
//         // If user cancelled, do nothing
//         return;
//       }
//       if (result.user) {
//         setUser(result.user);
//         setIsAuthenticated(true);
//         Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
//         router.replace(routeByRole(result.user.role, result.user.profile_complete) as any);
//       }
//     } finally {
//       setBiometricLoading(false);
//     }
//   }, [setUser, setIsAuthenticated]);

//   // ── OAuth ─────────────────────────────────────────────────────────────────

//   const handleOAuth = useCallback(async (provider: "google" | "apple") => {
//     setOauthLoading(provider);
//     try {
//       const { data, error } = await supabase.auth.signInWithOAuth({
//         provider,
//         options: {
//           redirectTo: Platform.OS === "web"
//             ? window.location.origin
//             : "teqil://oauth-callback",
//           skipBrowserRedirect: Platform.OS !== "web",
//         },
//       });

//       if (error) throw error;

//       if (Platform.OS !== "web" && data.url) {
//         const result = await WebBrowser.openAuthSessionAsync(
//           data.url,
//           "teqil://oauth-callback"
//         );
//         if (result.type === "success") {
//           // Supabase session will be picked up by the onAuthStateChange listener in _layout.tsx
//           // which calls setIsAuthenticated. We just need to navigate after session is ready.
//           const { data: sessionData } = await supabase.auth.getSession();
//           if (sessionData.session?.user) {
//             const { data: profileData } = await supabase
//               .from("users")
//               .select("*")
//               .eq("id", sessionData.session.user.id)
//               .single();

//             if (profileData) {
//               const user = profileData as any;
//               setUser(user);
//               setIsAuthenticated(true);
//               router.replace(routeByRole(user.role || "passenger", user.profile_complete) as any);
//             }
//           }
//         }
//       }
//     } catch (err) {
//       Alert.alert("OAuth Error", err instanceof Error ? err.message : "Could not sign in");
//     } finally {
//       setOauthLoading(null);
//     }
//   }, [setUser, setIsAuthenticated]);

//   const topPadding = Platform.OS === "web" ? 67 : insets.top;

//   return (
//     <View style={styles.container}>
//       <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
//         {/* <Pressable style={styles.backBtn} onPress={() => router.back()}>
//           <Ionicons name="arrow-back" size={22} color={Colors.primaryLight} />
//           <Text style={styles.backText}>Back</Text>
//         </Pressable>
//         <View style={styles.backBtn} /> */}
//       </View>

//       <KeyboardAwareScrollViewCompat
//         style={styles.scroll}
//         contentContainerStyle={[
//           styles.scrollContent,
//           { paddingBottom: Math.max(insets.bottom, 24) + (Platform.OS === "web" ? 34 : 0) },
//         ]}
//         showsVerticalScrollIndicator={false}
//       >
//         <View style={styles.pageHeaderContainer}>
//           <Text style={styles.pageTitle}>Login</Text>
//           <Text style={styles.pageSubtitle}>Sign in to continue your journey</Text>
//         </View>

//         <Animated.View style={formAnimStyle}>
//           {/* Email */}
//           <Controller
//             control={control}
//             name="email"
//             render={({ field: { onChange, onBlur, value } }) => (
//               <FormField
//                 label={t("auth.email")}
//                 icon="mail-outline"
//                 placeholder={t("auth.emailPlaceholder")}
//                 value={value}
//                 onChangeText={onChange}
//                 onBlur={onBlur}
//                 error={errors.email?.message}
//                 keyboardType="email-address"
//                 returnKeyType="next"
//                 onSubmitEditing={() => passwordRef.current?.focus()}
//               />
//             )}
//           />

//           {/* Password */}
//           <Controller
//             control={control}
//             name="password"
//             render={({ field: { onChange, onBlur, value } }) => (
//               <FormField
//                 label={t("auth.password")}
//                 icon="lock-closed-outline"
//                 placeholder={t("auth.passwordPlaceholder")}
//                 value={value}
//                 onChangeText={onChange}
//                 onBlur={onBlur}
//                 error={errors.password?.message}
//                 secureTextEntry={!showPassword}
//                 inputRef={passwordRef}
//                 returnKeyType="done"
//                 onSubmitEditing={handleSubmit(onSubmit)}
//                 rightElement={
//                   <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
//                     <Ionicons
//                       name={showPassword ? "eye-off-outline" : "eye-outline"}
//                       size={20}
//                       color={Colors.primaryLight}
//                     />
//                   </Pressable>
//                 }
//               />
//             )}
//           />

//           <Pressable
//             style={styles.forgotBtn}
//             onPress={() => Alert.alert("Reset Password", "Password reset coming soon.")}
//             hitSlop={8}
//           >
//             <Text style={styles.forgotText}>{t("auth.forgotPassword")}</Text>
//           </Pressable>

//           {/* Submit */}
//           <AnimatedPressable
//             onPress={handleSubmit(onSubmit)}
//             disabled={isLoading}
//             style={[styles.submitBtn, isLoading && styles.submitBtnLoading]}
//           >
//             <Text style={styles.submitBtnText}>
//               {isLoading
//                 ? <ActivityIndicator size="small" color={Colors.primaryLight} />
//                 : t("auth.login")}
//             </Text>
//             {!isLoading && (
//               <Ionicons name="arrow-forward" size={18} color={Colors.primaryLight} />
//             )}
//           </AnimatedPressable>

//           {/* Biometric login */}
//           {biometricAvailable && (
//             <Pressable
//               style={styles.biometricBtn}
//               onPress={handleBiometricLogin}
//               disabled={biometricLoading}
//             >
//               {biometricLoading ? (
//                 <ActivityIndicator size="small" color={Colors.primaryLight} />
//               ) : (
//                 <>
//                   <Ionicons name="finger-print" size={22} color={Colors.primaryLight} />
//                   <Text style={styles.biometricText}>
//                     {Platform.OS === "ios" ? "Sign in with Face ID / Touch ID" : "Sign in with Fingerprint"}
//                   </Text>
//                 </>
//               )}
//             </Pressable>
//           )}

//           <OrDivider />

//           {/* OAuth */}
//           <View style={styles.oauthContent}>
//             {Platform.OS === "ios" && (
//               <OAuthButton
//                 provider="apple"
//                 onPress={() => handleOAuth("apple")}
//                 loading={oauthLoading === "apple"}
//               />
//             )}
//             <OAuthButton
//               provider="google"
//               onPress={() => handleOAuth("google")}
//               loading={oauthLoading === "google"}
//             />
//           </View>

//           {/* Switch to register */}
//           <Pressable style={styles.switchBtn} onPress={() => router.replace("/(auth)/register")}>
//             <Text style={styles.switchText}>
//               {t("auth.noAccount")}{" "}
//               <Text style={styles.switchLink}>{t("auth.signUp")}</Text>
//             </Text>
//           </Pressable>
//         </Animated.View>
//       </KeyboardAwareScrollViewCompat>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: Colors.primary },
//   header: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     paddingHorizontal: 20,
//     paddingBottom: 8,
//   },
//   backBtn: {
//     width: 40,
//     height: 40,
//     borderRadius: 12,
//     alignItems: "center",
//     justifyContent: "center",
//     flexDirection: "row",
//     gap: 5,
//   },
//   backText: { color: Colors.primaryLight, fontWeight: "600", fontSize: 15 },
//   scroll: { flex: 1 },
//   scrollContent: { paddingHorizontal: 44, paddingTop: 28 },
//   pageHeaderContainer: { alignItems: "center", marginBottom: 40 },
//   pageTitle: {
//     fontFamily: "Poppins_700Bold",
//     fontSize: 30,
//     color: Colors.primaryLight,
//     marginBottom: 6,
//   },
//   pageSubtitle: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 15,
//     color: Colors.primaryLight,
//     marginBottom: 32,
//   },
//   forgotBtn: { alignSelf: "flex-end", marginBottom: 24, marginTop: -8 },
//   forgotText: {
//     fontFamily: "Poppins_500Medium",
//     fontSize: 13,
//     color: Colors.primaryLight,
//   },
//   submitBtn: {
//     backgroundColor: Colors.overlay,
//     borderRadius: 26,
//     height: 56,
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "center",
//     gap: 8,
//     elevation: 8,
//     marginTop: 10,
//   },
//   submitBtnLoading: { opacity: 0.7 },
//   submitBtnText: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 16,
//     color: Colors.primaryLight,
//   },
//   biometricBtn: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "center",
//     gap: 10,
//     backgroundColor: Colors.overlayLight,
//     borderRadius: 26,
//     height: 52,
//     marginTop: 12,
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.2)",
//   },
//   biometricText: {
//     fontFamily: "Poppins_500Medium",
//     fontSize: 14,
//     color: Colors.primaryLight,
//   },
//   oauthContent: {
//     gap:10,
//     flexDirection: 'row',
//     justifyContent: 'center',
//     marginBottom: 10
//   },
//   switchBtn: { alignItems: "center", marginTop: 24, paddingVertical: 8 },
//   switchText: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 14,
//     color: Colors.primaryLight,
//   },
//   switchLink: {
//     fontFamily: "Poppins_600SemiBold",
//     color: Colors.primaryDark,
//   },
// });














/**
 * app/(auth)/login.tsx
 *
 * Authentication via:
 *  1. Username lookup → if exists, verify via biometric/OAuth; if not, redirect to signup
 *  2. Google OAuth (expo-auth-session / Supabase)
 *  3. Apple OAuth (iOS only)
 *  4. Face ID / fingerprint biometric replay
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  Easing,
} from "react-native-reanimated";
// import * as {LocalAuthentication} from "expo-local-authentication";


import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import {
  signInWithBiometrics,
  saveBiometricCredentials,
  getBiometricCredentials,
} from "@/src/services/auth";
import { supabase } from "@/src/services/supabase";
import { useTranslation } from "react-i18next";
import type { User } from "@/src/models/types";

WebBrowser.maybeCompleteAuthSession();

// ─── Route helper ─────────────────────────────────────────────────────────────

function routeByRole(role: string, profileComplete?: boolean) {
  if (role === "driver" && !profileComplete) return "/(auth)/driver-profile";
  return "/(main)";
}

// ─── Username step ────────────────────────────────────────────────────────────

function UsernameStep({
  onFound,
  onNotFound,
  isDark,
}: {
  onFound: (username: string, userData: User) => void;
  onNotFound: (username: string) => void;
  isDark: boolean;
}) {
  const [username, setUsername] = useState("");
  const [checking, setChecking] = useState(false);
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const inputBg = isDark ? Colors.primaryDarker : "#F4F6FA";
  const placeholderColor = isDark ? Colors.textSecondary : Colors.textTertiary;

  const handleContinue = async () => {
    const clean = username.trim().toLowerCase();
    if (!clean || clean.length < 3) {
      Alert.alert("Invalid username", "Username must be at least 3 characters.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChecking(true);

    try {
      // Look up by username in Supabase auth metadata
      // Since Supabase doesn't have a direct username lookup on auth.users,
      // we query our users table (or user metadata).
      // Adjust the column name to match your actual schema.
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", clean)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (data) {
        onFound(clean, data as User);
      } else {
        onNotFound(clean);
      }
    } catch (err) {
      console.warn("[Login] username lookup error", err);
      // If the users table doesn't exist yet / RLS blocks it,
      // fall through to signup so the user can create an account.
      onNotFound(clean);
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={stepStyles.container}>
      <Text style={[stepStyles.label, { color: textColor }]}>Your username</Text>
      <View style={[stepStyles.inputRow, { backgroundColor: inputBg }]}>
        <Text style={[stepStyles.atSign, { color: Colors.primary }]}>@</Text>
        <TextInput
          style={[stepStyles.input, { color: textColor }]}
          placeholder="e.g. emeka_driver"
          placeholderTextColor={placeholderColor}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="go"
          onSubmitEditing={handleContinue}
        />
      </View>
      <Pressable
        style={[stepStyles.continueBtn, checking && { opacity: 0.7 }]}
        onPress={handleContinue}
        disabled={checking}
      >
        {checking ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Text style={stepStyles.continueBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </>
        )}
      </Pressable>
    </View>
  );
}

const stepStyles = StyleSheet.create({
  container: { gap: 14 },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    paddingLeft: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  atSign: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
  },
  input: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 16,
  },
  continueBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  continueBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
});

// ─── Divider ──────────────────────────────────────────────────────────────────

function Divider() {
  return (
    <View style={divStyles.row}>
      <View style={divStyles.line} />
      <Text style={divStyles.text}>or</Text>
      <View style={divStyles.line} />
    </View>
  );
}

const divStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginVertical: 20 },
  line: { flex: 1, height: 1, backgroundColor: "rgba(150,150,150,0.2)" },
  text: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginHorizontal: 12,
  },
});

// ─── OAuth Button ─────────────────────────────────────────────────────────────

function OAuthBtn({
  provider,
  onPress,
  loading,
  isDark,
}: {
  provider: "google" | "apple";
  onPress: () => void;
  loading: boolean;
  isDark: boolean;
}) {
  const bg = isDark ? Colors.primaryDarker : "#F4F6FA";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  return (
    <Pressable
      style={[oauthStyles.btn, { backgroundColor: bg }]}
      onPress={onPress}
      disabled={loading}
    >
      <Ionicons
        name={provider === "apple" ? "logo-apple" : "logo-google"}
        size={20}
        color={textColor}
      />
      <Text style={[oauthStyles.text, { color: textColor }]}>
        {loading ? "Connecting..." : `Continue with ${provider === "apple" ? "Apple" : "Google"}`}
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
    borderRadius: 16,
    height: 52,
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.15)",
  },
  text: {
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
  },
});

// ─── Main Login Screen ────────────────────────────────────────────────────────

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { setUser, setIsAuthenticated } = useAuthStore();
  const { t } = useTranslation();

  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // Once username is found, we store the matched user here so we can
  // log them in after biometric confirmation.
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [step, setStep] = useState<"username" | "verify">("username");

  // const isDark = false; // login screen always light
  const bg = Colors.primary;

  useEffect(() => {
    (async () => {
      try {
        const { LocalAuthentication } = await import("expo-local-authentication");
        const supported = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setBiometricAvailable(!!(supported && enrolled));
      } catch {
        // expo-local-authentication not available
      }
    })();
  }, []);

  // ── Username found → go to verification step ──────────────────────────────
  const handleUsernameFound = (username: string, userData: User) => {
    setPendingUser(userData);
    setStep("verify");
  };

  // ── Username not found → redirect to signup ────────────────────────────────
  const handleUsernameNotFound = (username: string) => {
    router.push({
      pathname: "/(auth)/register",
      params: { prefillUsername: username },
    });
  };

  // ── Biometric login ───────────────────────────────────────────────────────
  const handleBiometricLogin = useCallback(async () => {
    setBiometricLoading(true);
    try {
      const result = await signInWithBiometrics();
      if (!result.success) {
        if (result.error === "no_credentials") {
          Alert.alert(
            "Not Set Up",
            "Sign in with Google or Apple first to enable biometric login."
          );
        }
        return;
      }
      if (result.user) {
        setUser(result.user);
        setIsAuthenticated(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace(routeByRole(result.user.role, result.user.profile_complete) as any);
      }
    } finally {
      setBiometricLoading(false);
    }
  }, [setUser, setIsAuthenticated]);

  // ── Confirm found user via biometric ──────────────────────────────────────
  const handleConfirmWithBiometric = useCallback(async () => {
    if (!pendingUser) return;
    setBiometricLoading(true);
    try {
      const { LocalAuthentication } = await import("expo-local-authentication");
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Sign in as @${(pendingUser as any).username || pendingUser.full_name}`,
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });
      if (result.success) {
        setUser(pendingUser);
        setIsAuthenticated(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace(routeByRole(pendingUser.role, pendingUser.profile_complete) as any);
      }
    } catch {
      Alert.alert("Error", "Biometric authentication failed.");
    } finally {
      setBiometricLoading(false);
    }
  }, [pendingUser, setUser, setIsAuthenticated]);

  // ── OAuth ─────────────────────────────────────────────────────────────────
  const handleOAuth = useCallback(
    async (provider: "google" | "apple") => {
      setOauthLoading(provider);
      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo:
              Platform.OS === "web"
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
            const { data: sessionData } = await supabase.auth.getSession();
            const supaUser = sessionData.session?.user;
            if (supaUser) {
              const meta = supaUser.user_metadata ?? {};
              const user: User = {
                id: supaUser.id,
                full_name: meta.full_name ?? null,
                phone: meta.phone ?? "",
                email: supaUser.email ?? "",
                age: meta.age ?? 18,
                role: meta.role ?? "passenger",
                driver_id: meta.driver_id,
                profile_photo: meta.avatar_url ?? meta.profile_photo,
                vehicle_details: meta.vehicle_details,
                park_location: meta.park_location,
                park_name: meta.park_name,
                points_balance: meta.points_balance ?? 0,
                avg_rating: meta.avg_rating,
                profile_complete: meta.profile_complete ?? false,
                created_at: supaUser.created_at,
              };
              setUser(user);
              setIsAuthenticated(true);
              router.replace(routeByRole(user.role, user.profile_complete) as any);
            }
          }
        }
      } catch (err) {
        Alert.alert("OAuth Error", err instanceof Error ? err.message : "Could not sign in");
      } finally {
        setOauthLoading(null);
      }
    },
    [setUser, setIsAuthenticated]
  );

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: topPadding + 32, paddingBottom: insets.bottom + 40 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.headerBlock}>
            <Text style={styles.pageTitle}>
              {step === "username" ? "Welcome back" : "Verify it's you"}
            </Text>
            <Text style={styles.pageSubtitle}>
              {step === "username"
                ? "Enter your username to continue"
                : `Confirm your identity as @${(pendingUser as any)?.username ?? ""}`}
            </Text>
          </View>

          {step === "username" && (
            <>
              <UsernameStep
                onFound={handleUsernameFound}
                onNotFound={handleUsernameNotFound}
                isDark={false}
              />

              <Divider />

              {/* OAuth options */}
              <View style={styles.oauthStack}>
                {Platform.OS === "ios" && (
                  <OAuthBtn
                    provider="apple"
                    onPress={() => handleOAuth("apple")}
                    loading={oauthLoading === "apple"}
                    isDark={false}
                  />
                )}
                <OAuthBtn
                  provider="google"
                  onPress={() => handleOAuth("google")}
                  loading={oauthLoading === "google"}
                  isDark={false}
                />
              </View>

              {/* Biometric shortcut (only if credentials exist) */}
              {biometricAvailable && (
                <Pressable
                  style={styles.biometricBtn}
                  onPress={handleBiometricLogin}
                  disabled={biometricLoading}
                >
                  {biometricLoading ? (
                    <ActivityIndicator size="small" color={Colors.primaryLight} />
                  ) : (
                    <>
                      <Ionicons name="finger-print" size={22} color={Colors.primaryLight} />
                      <Text style={styles.biometricText}>
                        {Platform.OS === "ios" ? "Use Face ID / Touch ID" : "Use Fingerprint"}
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
            </>
          )}

          {step === "verify" && pendingUser && (
            <View style={styles.verifyBlock}>
              {/* User avatar / name */}
              <View style={styles.userPreview}>
                <View style={styles.userPreviewAvatar}>
                  <Text style={styles.userPreviewInitial}>
                    {(pendingUser.full_name ?? "U").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.userPreviewName}>
                  {pendingUser.full_name ?? "Teqil User"}
                </Text>
                <Text style={styles.userPreviewRole}>{pendingUser.role}</Text>
              </View>

              {biometricAvailable && (
                <Pressable
                  style={[styles.continueBtn, biometricLoading && { opacity: 0.7 }]}
                  onPress={handleConfirmWithBiometric}
                  disabled={biometricLoading}
                >
                  {biometricLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="finger-print" size={20} color="#fff" />
                      <Text style={styles.continueBtnText}>Confirm with Biometrics</Text>
                    </>
                  )}
                </Pressable>
              )}

              <Divider />

              <View style={styles.oauthStack}>
                {Platform.OS === "ios" && (
                  <OAuthBtn
                    provider="apple"
                    onPress={() => handleOAuth("apple")}
                    loading={oauthLoading === "apple"}
                    isDark={false}
                  />
                )}
                <OAuthBtn
                  provider="google"
                  onPress={() => handleOAuth("google")}
                  loading={oauthLoading === "google"}
                  isDark={false}
                />
              </View>

              <Pressable
                style={styles.backLink}
                onPress={() => { setStep("username"); setPendingUser(null); }}
              >
                <Ionicons name="arrow-back" size={16} color={Colors.primaryLight} />
                <Text style={styles.backLinkText}>Not you? Go back</Text>
              </Pressable>
            </View>
          )}

          {/* Sign up link */}
          <Pressable
            style={styles.signupLink}
            onPress={() => router.push("/(auth)/register")}
          >
            <Text style={styles.signupText}>
              New to Teqil?{" "}
              <Text style={styles.signupHighlight}>Create an account</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 28,
    gap: 0,
  },
  headerBlock: {
    marginBottom: 32,
    gap: 6,
  },
  pageTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 30,
    color: Colors.primaryLight,
  },
  pageSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: Colors.primaryLight,
    lineHeight: 22,
  },
  oauthStack: {
    gap: 10,
  },
  biometricBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.overlayLight,
    borderRadius: 16,
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

  // Verify step
  verifyBlock: { gap: 16 },
  userPreview: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  userPreviewAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primaryDark,
    borderWidth: 3,
    borderColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  userPreviewInitial: {
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    color: Colors.primaryLight,
  },
  userPreviewName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: Colors.primaryLight,
  },
  userPreviewRole: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.primaryLight,
    textTransform: "capitalize",
  },
  continueBtn: {
    backgroundColor: Colors.primaryDark,
    borderRadius: 16,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  continueBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  backLinkText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.primaryLight,
  },

  // Sign up link
  signupLink: {
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 8,
  },
  signupText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.primaryLight,
  },
  signupHighlight: {
    fontFamily: "Poppins_600SemiBold",
    color: Colors.primaryDark,
  },
});