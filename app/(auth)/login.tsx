/**
 * app/(auth)/login.tsx
 *
 * Username-only login ("secure but easy and fast"):
 * - The user types just their username. No email, no submit button.
 * - As they type (debounced), we resolve the username via the
 *   get_user_by_username RPC and drive a status modal:
 *     searching  → "Searching for user…"
 *     found + this device has stored credentials → auto sign-in
 *         (Face ID / Touch ID when available, else replay the device-bound
 *          stored credentials) → a REAL Supabase session.
 *     found + new/other device → reveal a one-time password field, then
 *         save credentials so next time on this device is instant.
 *     not found  → "No user found"
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  Keyboard,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";

import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import {
  checkUsernameExists,
  signInOfflineAware,
  saveBiometricCredentials,
  signInWithBiometrics,
  getBiometricCredentials,
} from "@/src/services/auth";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import type { User } from "@/src/models/types";

// ─── Role → route helper ──────────────────────────────────────────────────────

function routeByRole(role: string, profileComplete: boolean | undefined) {
  if (role === "driver") {
    return profileComplete ? "/(main)" : "/(auth)/driver-profile";
  }
  return "/(main)";
}

const MIN_USERNAME_LEN = 3;
const SEARCH_DEBOUNCE_MS = 500;

type Status =
  | "idle"
  | "searching"
  | "authenticating"
  | "notfound"
  | "needPassword"
  | "error";

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : Colors.textWhite;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const fieldBg = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  const primaryBtn = isDark ? "rgba(255,255,255,0.08)" : Colors.text;

  const insets = useSafeAreaInsets();
  const { setUser, setIsAuthenticated } = useAuthStore();

  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [foundEmail, setFoundEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const passwordRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against out-of-order async results when the user keeps typing.
  const latestQueryRef = useRef("");

  // ── Entrance animation ────────────────────────────────────────────────────
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

  // ── Complete a successful login (real or offline session) ──────────────────
  const finishLogin = useCallback(
    (user: User, offlineMode?: boolean) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setUser(user);
      setIsAuthenticated(true);
      setStatus("idle");
      setPassword("");
      if (offlineMode) {
        Alert.alert("Offline Mode", "Signed in from cache. Some features need internet.");
      }
      router.replace(routeByRole(user.role, user.profile_complete) as any);
    },
    [setUser, setIsAuthenticated]
  );

  // ── Fast path: this device already knows the matched account ───────────────
  const attemptFastLogin = useCallback(
    async (creds: { email: string; password: string }) => {
      try {
        // Prefer biometric confirmation when the device supports it.
        const bio = await signInWithBiometrics();
        if (bio.success && bio.user) {
          finishLogin(bio.user, bio.offlineMode);
          return;
        }
        if (bio.supported && bio.enrolled) {
          // Biometric available but cancelled/failed → fall back to password.
          setErrorMsg("");
          setStatus("needPassword");
          setTimeout(() => passwordRef.current?.focus(), 250);
          return;
        }
        // No biometric hardware/enrolment → replay the device-bound credentials.
        const { user, offlineMode } = await signInOfflineAware(creds.email, creds.password);
        finishLogin(user, offlineMode);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Could not sign you in.");
        setStatus("error");
      }
    },
    [finishLogin]
  );

  // ── Resolve a username, then decide fast-path vs password fallback ─────────
  const runSearch = useCallback(
    async (name: string) => {
      setErrorMsg("");
      setStatus("searching");
      try {
        const meta = await checkUsernameExists(name);
        // Ignore stale responses (user kept typing).
        if (latestQueryRef.current !== name) return;

        if (!meta) {
          setStatus("notfound");
          return;
        }

        setFoundEmail(meta.email);

        const creds = await getBiometricCredentials();
        if (latestQueryRef.current !== name) return;

        if (creds && creds.email.toLowerCase() === meta.email.toLowerCase()) {
          // Same account, same device → sign in without typing anything.
          setStatus("authenticating");
          await attemptFastLogin(creds);
        } else {
          // New/other device → verify with a one-time password.
          setStatus("needPassword");
          setTimeout(() => passwordRef.current?.focus(), 250);
        }
      } catch {
        if (latestQueryRef.current !== name) return;
        setErrorMsg("Could not reach the server. Check your connection.");
        setStatus("error");
      }
    },
    [attemptFastLogin]
  );

  // ── Debounced auto-search as the user types ────────────────────────────────
  useEffect(() => {
    const name = username.trim().toLowerCase();
    latestQueryRef.current = name;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (name.length < MIN_USERNAME_LEN) {
      setStatus("idle");
      return;
    }

    debounceRef.current = setTimeout(() => runSearch(name), SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username, runSearch]);

  // ── Password fallback submit ───────────────────────────────────────────────
  const handlePasswordLogin = useCallback(async () => {
    if (!foundEmail || !password) return;
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStatus("authenticating");
    try {
      const { user, offlineMode } = await signInOfflineAware(foundEmail, password);
      // Remember on this device so next time is instant.
      await saveBiometricCredentials(foundEmail, password);
      finishLogin(user, offlineMode);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMsg(err instanceof Error ? err.message : "Wrong password. Please try again.");
      setStatus("error");
    }
  }, [foundEmail, password, finishLogin]);

  const dismissModal = useCallback(() => {
    setStatus("idle");
    setPassword("");
    setErrorMsg("");
  }, []);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const searching = status === "searching" || status === "authenticating";

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.dismissTo("/(main)")}>
          <Ionicons name="chevron-back" size={22} color={textColor} />
        </Pressable>
        <View style={styles.pageHeaderContainer}>
          <Text style={[styles.pageTitle, { color: textColor }]}>Login</Text>
          <Text style={[styles.pageSubtitle, { color: subTextColor }]}>
            Just type your username to continue
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <Animated.View style={[styles.body, formAnimStyle]}>
        <Text style={[styles.label, { color: textColor }]}>Username</Text>
        <View style={[styles.inputRow, { backgroundColor: fieldBg }]}>
          <Ionicons name="at-outline" size={20} color={subTextColor} style={styles.icon} />
          <TextInput
            style={[styles.input, { color: textColor }]}
            placeholder="Enter your username"
            placeholderTextColor={subTextColor}
            value={username}
            onChangeText={(v) => setUsername(v.replace(/\s/g, "").toLowerCase())}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            maxLength={20}
            returnKeyType="go"
            onSubmitEditing={() => {
              const name = username.trim().toLowerCase();
              if (name.length >= MIN_USERNAME_LEN) runSearch(name);
            }}
          />
          {searching ? (
            <ActivityIndicator size="small" color={subTextColor} style={{ marginLeft: 8 }} />
          ) : null}
        </View>
        <Text style={[styles.hint, { color: subTextColor }]}>
          We&apos;ll sign you in automatically on this device — no password needed.
        </Text>

        <Pressable style={styles.switchBtn} onPress={() => router.replace("/(auth)/register")}>
          <Text style={[styles.switchText, { color: subTextColor }]}>
            {"Don't have an account? "}
            <Text style={[styles.switchLink, { color: textColor }]}>Sign Up</Text>
          </Text>
        </Pressable>
      </Animated.View>

      {/* Status modal */}
      <Modal
        transparent
        visible={status !== "idle"}
        animationType="fade"
        onRequestClose={dismissModal}
      >
        <Pressable
          style={styles.backdrop}
          onPress={status === "searching" || status === "authenticating" ? undefined : dismissModal}
        >
          <Animated.View
            entering={FadeIn}
            exiting={FadeOut}
            style={[styles.sheet, { backgroundColor: isDark ? Colors.primaryDarker ?? "#0B2A18" : "#FFFFFF" }]}
            onStartShouldSetResponder={() => true}
          >
            {(status === "searching" || status === "authenticating") && (
              <>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={[styles.sheetTitle, { color: textColor }]}>
                  {status === "searching" ? "Searching for user…" : "Signing you in…"}
                </Text>
                <Text style={[styles.sheetSub, { color: subTextColor }]}>
                  {status === "searching"
                    ? "Looking up your account"
                    : "Confirming it's really you"}
                </Text>
              </>
            )}

            {status === "notfound" && (
              <>
                <View style={[styles.sheetIcon, { backgroundColor: "rgba(220,38,38,0.12)" }]}>
                  <Ionicons name="person-remove-outline" size={28} color={Colors.error} />
                </View>
                <Text style={[styles.sheetTitle, { color: textColor }]}>No user found</Text>
                <Text style={[styles.sheetSub, { color: subTextColor }]}>
                  We couldn&apos;t find anyone with that username.
                </Text>
                <Pressable style={[styles.sheetBtn, { backgroundColor: primaryBtn }]} onPress={dismissModal}>
                  <Text style={styles.sheetBtnText}>Edit username</Text>
                </Pressable>
              </>
            )}

            {status === "needPassword" && (
              <>
                <View style={[styles.sheetIcon, { backgroundColor: "rgba(0,154,67,0.12)" }]}>
                  <Ionicons name="lock-closed-outline" size={26} color={Colors.primary} />
                </View>
                <Text style={[styles.sheetTitle, { color: textColor }]}>One more step</Text>
                <Text style={[styles.sheetSub, { color: subTextColor }]}>
                  Enter your password to sign in on this device. We&apos;ll remember you next time.
                </Text>
                <View style={[styles.inputRow, styles.sheetInput, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#F5F7FA" }]}>
                  <Ionicons name="lock-closed-outline" size={20} color={subTextColor} style={styles.icon} />
                  <TextInput
                    ref={passwordRef}
                    style={[styles.input, { color: textColor }]}
                    placeholder="Password"
                    placeholderTextColor={subTextColor}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handlePasswordLogin}
                  />
                  <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={subTextColor}
                    />
                  </Pressable>
                </View>
                <Pressable
                  style={[styles.sheetBtn, { backgroundColor: primaryBtn }, !password && { opacity: 0.5 }]}
                  onPress={handlePasswordLogin}
                  disabled={!password}
                >
                  <Text style={styles.sheetBtnText}>Sign In</Text>
                </Pressable>
                <Pressable style={styles.sheetDismiss} onPress={dismissModal}>
                  <Text style={[styles.sheetDismissText, { color: subTextColor }]}>Cancel</Text>
                </Pressable>
              </>
            )}

            {status === "error" && (
              <>
                <View style={[styles.sheetIcon, { backgroundColor: "rgba(220,38,38,0.12)" }]}>
                  <Ionicons name="alert-circle-outline" size={28} color={Colors.error} />
                </View>
                <Text style={[styles.sheetTitle, { color: textColor }]}>Couldn&apos;t sign in</Text>
                <Text style={[styles.sheetSub, { color: subTextColor }]}>{errorMsg}</Text>
                <Pressable
                  style={[styles.sheetBtn, { backgroundColor: primaryBtn }]}
                  onPress={() => (foundEmail ? setStatus("needPassword") : dismissModal())}
                >
                  <Text style={styles.sheetBtnText}>Try again</Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  pageHeaderContainer: { alignItems: "center" },
  pageTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, marginBottom: 3 },
  pageSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 12 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { paddingHorizontal: 24, paddingTop: 48 },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    marginBottom: 7,
    paddingLeft: 5,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  icon: { marginRight: 12 },
  input: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 15 },
  hint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 10,
    paddingLeft: 5,
    lineHeight: 18,
  },
  switchBtn: { alignItems: "center", marginTop: 40, paddingVertical: 8 },
  switchText: { fontFamily: "Poppins_400Regular", fontSize: 14 },
  switchLink: { fontFamily: "Poppins_600SemiBold" },

  // Modal
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  sheet: {
    width: "100%",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  sheetIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sheetTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    textAlign: "center",
  },
  sheetSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  sheetInput: { width: "100%", marginTop: 6 },
  sheetBtn: {
    height: 52,
    borderRadius: 14,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  sheetBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#fff" },
  sheetDismiss: { paddingVertical: 6 },
  sheetDismissText: { fontFamily: "Poppins_400Regular", fontSize: 13 },
});
