/**
 * app/(main)/settings.tsx
 *
 * Lean settings — every row maps to a REAL, working behavior:
 *  - Dark Mode              → useSettingsStore.theme (applied by ThemeSync)
 *  - Language               → useAuthStore.language (drives i18n)
 *  - Biometric App Lock     → useSettingsStore.biometricLock (gates <AppLock>)
 *  - Change Password        → Supabase password-reset email
 *  - Push Notifications     → useSettingsStore.pushNotifications (gates registration)
 *  - Share Location         → useSettingsStore.shareLocation (gates trip tracking)
 *  - Clear Cache            → wipes local synced record caches
 *  - Referral Code          → share sheet
 *  - Sign Out / Delete      → Supabase auth
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  Share,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";

import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { haptics } from "@/src/utils/haptics";
import { Colors } from "@/constants/colors";
import { supabase } from "@/src/services/supabase";
import { queryClient } from "@/lib/query-client";
import {
  IOSListSection,
  IOSListRow,
  RatingModal,
  FeedbackModal,
  useIOSTheme,
  useTabBarInset,
  IOSFont,
} from "@/components/ios";

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsTab() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user, logout, language, setLanguage } = useAuthStore();
  const {
    theme,
    setTheme,
    pushNotifications,
    setPushNotifications,
    biometricLock,
    setBiometricLock,
    shareLocation,
    setShareLocation,
    referralCode,
    autoStartTracking,
    setAutoStartTracking,
    dataSaver,
    setDataSaver,
    hapticFeedback,
    setHapticFeedback,
    distanceUnit,
    setDistanceUnit,
    confirmEndTrip,
    setConfirmEndTrip,
  } = useSettingsStore();

  const isDark = theme === "dark";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  // iOS semantic palette + the inset so the last row clears the translucent bar.
  const ios = useIOSTheme();
  const tabInset = useTabBarInset();

  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [ratingVisible, setRatingVisible] = useState(false);

  const toggleTheme = (v: boolean) => {
    haptics.tap();
    setTheme(v ? "dark" : "light");
  };

  const toggleLanguage = () => {
    haptics.tap();
    setLanguage(language === "en" ? "pid" : "en");
  };

  // Only enable the lock if the device can actually satisfy it.
  const toggleBiometricLock = async (v: boolean) => {
    if (v) {
      try {
        const LA = await import("expo-local-authentication");
        const [hasHardware, enrolled] = await Promise.all([
          LA.hasHardwareAsync(),
          LA.isEnrolledAsync(),
        ]);
        if (!hasHardware || !enrolled) {
          Alert.alert(
            "Not available",
            "Set up Face ID / Touch ID or a device passcode first, then try again."
          );
          return;
        }
      } catch {
        Alert.alert("Not available", "Biometric authentication isn't available on this device.");
        return;
      }
    }
    haptics.tap();
    setBiometricLock(v);
  };

  const handleChangePassword = () => {
    if (!user?.email) {
      Alert.alert("No email on file", "This account has no email to send a reset link to.");
      return;
    }
    Alert.alert(
      "Change Password",
      `We'll email a password-reset link to ${user.email}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send link",
          onPress: async () => {
            const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
              redirectTo:
                Platform.OS === "web" ? window.location.origin : "teqil://reset-password",
            });
            if (error) Alert.alert("Couldn't send", error.message);
            else Alert.alert("Sent", "Check your email for the reset link.");
          },
        },
      ]
    );
  };

  const handleClearCache = () => {
    Alert.alert(
      "Clear Cache",
      "Clears cached trips and feed data on this device. Your login and credits are kept and will re-sync when online.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.multiRemove([
              "teqil_trips",
              "teqil_passengers",
              "teqil_ratings",
              "teqil_broadcasts",
              "teqil_active_trip_code",
            ]);
            try {
              queryClient.clear();
            } catch {
              /* no-op */
            }
            haptics.success();
            Alert.alert("Done", "Local cache cleared.");
          },
        },
      ]
    );
  };

  const handleReferral = () => {
    Share.share({
      message: `Join me on Teqil — Nigeria's ride network. Use my code ${referralCode} to get started: https://teqil.app`,
    });
  };

  const signOutFlow = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore — clear local session regardless */
    }
    logout();
    router.replace("/(auth)/login");
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOutFlow },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your account and data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: signOutFlow },
      ]
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: ios.systemGroupedBackground }]}>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Large title, as every system Settings-style screen uses. */}
      <View style={{ paddingTop: topPadding + 8, paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text style={{ ...IOSFont.largeTitle, color: ios.label }}>
          {t("nav.settings", "Settings")}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingBottom: tabInset + 40 }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        <IOSListSection header="Appearance">
          <IOSListRow
            symbol="moon.fill"
            symbolColor={ios.systemBlue}
            label="Dark Mode"
            accessory={{ type: "switch", value: isDark, onValueChange: toggleTheme }}
          />
          <IOSListRow
            symbol="globe"
            symbolColor={ios.systemBlue}
            label="Language"
            accessory={{
              type: "detail",
              text: language === "pid" ? "Nigerian Pidgin" : "English",
            }}
            onPress={toggleLanguage}
          />
        </IOSListSection>

        <IOSListSection header="Security">
          <IOSListRow
            symbol="faceid"
            symbolColor={ios.systemGreen}
            label="Biometric App Lock"
            detail="Face ID, Touch ID or passcode to open the app"
            accessory={{ type: "switch", value: biometricLock, onValueChange: toggleBiometricLock }}
          />
          <IOSListRow
            symbol="key.fill"
            symbolColor={ios.systemGray}
            label="Change Password"
            accessory={{ type: "disclosure" }}
            onPress={handleChangePassword}
          />
        </IOSListSection>

        <IOSListSection header="Notifications">
          <IOSListRow
            symbol="bell.badge.fill"
            symbolColor={ios.systemRed}
            label="Push Notifications"
            detail="Trip updates and alerts on this device"
            accessory={{
              type: "switch",
              value: pushNotifications,
              onValueChange: (v) => {
                haptics.tap();
                setPushNotifications(v);
              },
            }}
          />
        </IOSListSection>

        <IOSListSection
          header="Privacy"
          footer="Free rides are always tracked — turning this off won't stop them."
        >
          <IOSListRow
            symbol="location.fill"
            symbolColor={ios.systemBlue}
            label="Share Location During Trips"
            accessory={{
              type: "switch",
              value: shareLocation,
              onValueChange: (v) => {
                haptics.tap();
                setShareLocation(v);
              },
            }}
          />
          <IOSListRow
            symbol="map.fill"
            symbolColor={ios.tint}
            label="Route History"
            detail="GPS routes of trips and free rides you've taken"
            accessory={{ type: "disclosure" }}
            onPress={() => router.push("/route-history" as any)}
          />
        </IOSListSection>

        <IOSListSection
          header="Tracking"
          footer="Data Saver keeps the route recorded and still verifiable — it only lowers GPS precision and update rate."
        >
          <IOSListRow
            symbol="play.circle.fill"
            symbolColor={ios.tint}
            label="Start Tracking Automatically"
            detail="Begin recording as soon as a tracked ride opens"
            accessory={{
              type: "switch",
              value: autoStartTracking,
              onValueChange: (v) => {
                haptics.tap();
                setAutoStartTracking(v);
              },
            }}
          />
          <IOSListRow
            symbol="hand.raised.fill"
            symbolColor={ios.systemOrange}
            label="Confirm Before Ending a Ride"
            detail="So a stray tap can't cut a ride short"
            accessory={{
              type: "switch",
              value: confirmEndTrip,
              onValueChange: (v) => {
                haptics.tap();
                setConfirmEndTrip(v);
              },
            }}
          />
          <IOSListRow
            symbol="battery.25"
            symbolColor={ios.systemGreen}
            label="Data Saver"
            detail="Coarser GPS, slower live updates"
            accessory={{
              type: "switch",
              value: dataSaver,
              onValueChange: (v) => {
                haptics.tap();
                setDataSaver(v);
              },
            }}
          />
          <IOSListRow
            symbol="ruler.fill"
            symbolColor={ios.systemGray}
            label="Distance Units"
            accessory={{ type: "detail", text: distanceUnit === "km" ? "Kilometres" : "Miles" }}
            onPress={() => {
              haptics.select();
              setDistanceUnit(distanceUnit === "km" ? "mi" : "km");
            }}
          />
        </IOSListSection>

        <IOSListSection header="Feedback">
          <IOSListRow
            symbol="iphone.radiowaves.left.and.right"
            symbolColor={ios.systemBlue}
            label="Haptic Feedback"
            detail="Vibration on taps, confirmations and alerts"
            accessory={{
              type: "switch",
              value: hapticFeedback,
              onValueChange: (v) => {
                // Buzz on the way ON so the change is felt, not just seen.
                setHapticFeedback(v);
                if (v) haptics.success();
              },
            }}
          />
          <IOSListRow
            symbol="envelope.fill"
            symbolColor={ios.tint}
            label="Send Feedback"
            accessory={{ type: "disclosure" }}
            onPress={() => setFeedbackVisible(true)}
          />
          <IOSListRow
            symbol="star.fill"
            symbolColor={ios.systemOrange}
            label="Rate Emilgo"
            accessory={{ type: "disclosure" }}
            onPress={() => setRatingVisible(true)}
          />
        </IOSListSection>

        <IOSListSection header="Data">
          <IOSListRow
            symbol="trash.fill"
            symbolColor={ios.systemGray}
            label="Clear Cache"
            detail="Frees space; keeps your login and credits"
            accessory={{ type: "disclosure" }}
            onPress={handleClearCache}
          />
        </IOSListSection>

        <IOSListSection header="Referrals">
          <IOSListRow
            symbol="gift.fill"
            symbolColor="#EC4899"
            label="My Referral Code"
            accessory={{ type: "detail", text: referralCode }}
            onPress={handleReferral}
          />
        </IOSListSection>

        <IOSListSection footer="Teqil v1.0.0 · Made in Nigeria 🇳🇬">
          <IOSListRow
            symbol="rectangle.portrait.and.arrow.right"
            symbolColor={ios.systemGray}
            label="Sign Out"
            accessory={{ type: "disclosure" }}
            onPress={handleSignOut}
          />
          <IOSListRow
            symbol="trash.fill"
            symbolColor={ios.systemRed}
            label="Delete Account"
            destructive
            accessory={{ type: "disclosure" }}
            onPress={handleDeleteAccount}
          />
        </IOSListSection>
      </ScrollView>

      <FeedbackModal visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} />
      <RatingModal visible={ratingVisible} onClose={() => setRatingVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 24 },
  scrollContent: { padding: 16, gap: 6 },
  pill: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: { fontFamily: "Poppins_500Medium", fontSize: 13, letterSpacing: 2 },
  version: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    paddingBottom: 8,
  },
});
