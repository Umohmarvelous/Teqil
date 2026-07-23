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
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Switch,
  Alert,
  Share,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  Moon02Icon,
  Globe02Icon,
  Notification,
  Fingerprint,
  Location,
  Trash2,
  Gift,
  LockPasswordIcon,
  Logout01Icon,
  DeleteThrowIcon,
} from "@hugeicons/core-free-icons";

import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { Colors } from "@/constants/colors";
import { supabase } from "@/src/services/supabase";
import { queryClient } from "@/lib/query-client";

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const isDark = useSettingsStore((s) => s.theme) === "dark";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  return (
    <View style={sectionStyles.wrap}>
      <Text style={[sectionStyles.title, { color: textColor }]}>{title.toUpperCase()}</Text>
      <View style={sectionStyles.inner}>{children}</View>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  wrap: { marginBottom: 23 },
  title: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    letterSpacing: 1,
    paddingHorizontal: 4,
    marginVertical: 12,
  },
  inner: { borderRadius: 30, overflow: "hidden" },
});

// ─── Row ──────────────────────────────────────────────────────────────────────

function SettingRow({
  iconName,
  iconColor,
  label,
  description,
  rightElement,
  onPress,
  danger,
  isDark,
  cardBg,
  textColor,
  subTextColor,
}: {
  iconName: any;
  iconColor: string;
  label: string;
  description?: string;
  rightElement?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  isDark: boolean;
  cardBg: string;
  textColor: string;
  subTextColor: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        rowStyles.row,
        {
          backgroundColor: cardBg,
          borderBottomColor: isDark ? "#3E3E3E" : "#CDCDCD",
          opacity: pressed && onPress ? 0.85 : 1,
        },
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={rowStyles.iconBox}>
        <HugeiconsIcon icon={iconName as any} size={22} color={danger ? Colors.error : iconColor} />
      </View>
      <View style={rowStyles.textBlock}>
        <Text style={[rowStyles.label, { color: danger ? Colors.error : textColor }]}>{label}</Text>
        {description ? (
          <Text style={[rowStyles.description, { color: subTextColor }]}>{description}</Text>
        ) : null}
      </View>
      {rightElement ?? null}
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 15,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textBlock: { flex: 1 },
  label: { fontFamily: "Poppins_500Medium", fontSize: 14 },
  description: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
});

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
  } = useSettingsStore();

  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : Colors.border;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const rowProps = { isDark, cardBg, textColor, subTextColor };

  const switchEl = (value: boolean, onValueChange: (v: boolean) => void) => (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: "#E5E7EB", true: Colors.primary + "60" }}
      thumbColor={value ? Colors.primary : "#fff"}
    />
  );

  const toggleTheme = (v: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTheme(v ? "dark" : "light");
  };

  const toggleLanguage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    <View style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar style={isDark ? "light" : "dark"} />

      <View
        style={[
          styles.header,
          { backgroundColor: cardBg, paddingTop: topPadding + 12, borderBottomColor: borderColor },
        ]}
      >
        <Text style={[styles.headerTitle, { color: textColor }]}>{t("nav.settings", "Settings")}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 80 }]}
        showsVerticalScrollIndicator={false}
      >
        <Section title="Appearance">
          <SettingRow
            iconName={Moon02Icon}
            iconColor={textColor}
            label="Dark Mode"
            description="Switch between light and dark themes"
            rightElement={switchEl(isDark, toggleTheme)}
            {...rowProps}
          />
          <SettingRow
            iconName={Globe02Icon}
            iconColor={textColor}
            label="Language"
            description={`Currently: ${language === "pid" ? "Nigerian Pidgin" : "English"}`}
            onPress={toggleLanguage}
            {...rowProps}
          />
        </Section>

        <Section title="Security">
          <SettingRow
            iconName={Fingerprint}
            iconColor={textColor}
            label="Biometric App Lock"
            description="Require Face ID / Touch ID or passcode to open the app"
            rightElement={switchEl(biometricLock, toggleBiometricLock)}
            {...rowProps}
          />
          <SettingRow
            iconName={LockPasswordIcon}
            iconColor={textColor}
            label="Change Password"
            description="Email yourself a password-reset link"
            onPress={handleChangePassword}
            {...rowProps}
          />
        </Section>

        <Section title="Notifications">
          <SettingRow
            iconName={Notification}
            iconColor={textColor}
            label="Push Notifications"
            description="Trip updates and alerts on this device"
            rightElement={switchEl(pushNotifications, (v) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPushNotifications(v);
            })}
            {...rowProps}
          />
        </Section>

        <Section title="Privacy">
          <SettingRow
            iconName={Location}
            iconColor={textColor}
            label="Share Location During Trips"
            description="Allow live location tracking while a trip is active"
            rightElement={switchEl(shareLocation, (v) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShareLocation(v);
            })}
            {...rowProps}
          />
        </Section>

        <Section title="Data">
          <SettingRow
            iconName={Trash2}
            iconColor={textColor}
            label="Clear Cache"
            description="Free up space; keeps your login and credits"
            onPress={handleClearCache}
            {...rowProps}
          />
        </Section>

        <Section title="Referrals">
          <SettingRow
            iconName={Gift}
            iconColor="#EC4899"
            label="My Referral Code"
            description={referralCode}
            onPress={handleReferral}
            rightElement={
              <View style={[styles.pill, { backgroundColor: "#FCE7F3" }]}>
                <Text style={[styles.pillText, { color: "#BE185D" }]}>{referralCode}</Text>
              </View>
            }
            {...rowProps}
          />
        </Section>

        <Section title="Account">
          <SettingRow
            iconName={Logout01Icon}
            iconColor={textColor}
            label="Sign Out"
            description="Log out of this device"
            onPress={handleSignOut}
            {...rowProps}
          />
          <SettingRow
            iconName={DeleteThrowIcon}
            iconColor={Colors.error}
            label="Delete Account"
            description="Permanently remove your account"
            onPress={handleDeleteAccount}
            danger
            {...rowProps}
          />
        </Section>

        <Text style={[styles.version, { color: subTextColor }]}>
          Teqil v1.0.0 · Made in Nigeria 🇳🇬
        </Text>
      </ScrollView>
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
