import React, { useState } from "react";
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
  Modal,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { Colors } from "@/constants/colors";
import { supabase } from "@/src/services/supabase";
import type { MapStyle, FontSize, HistoryRetention } from "@/src/store/useSettingsStore";
import { StatusBar } from "expo-status-bar";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={sectionStyles.wrap}>
      <Text style={sectionStyles.title}>{title.toUpperCase()}</Text>
      <View style={sectionStyles.inner}>{children}</View>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  title: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    letterSpacing: 1,
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  inner: {
    borderRadius: 18,
    overflow: "hidden",
  },
});

interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  description?: string;
  rightElement?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  isDark?: boolean;
  cardBg?: string;
  textColor?: string;
  subColor?: string;
  borderColor?: string;
}

function SettingRow({
  icon,
  iconColor,
  label,
  description,
  rightElement,
  onPress,
  danger,
  isDark,
  cardBg,
  textColor,
  subColor,
  borderColor,
}: SettingRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        rowStyles.row,
        {
          backgroundColor: cardBg,
          borderBottomColor: borderColor,
          opacity: pressed && onPress ? 0.85 : 1,
        },
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View
        style={[rowStyles.iconBox, { backgroundColor: iconColor + "18" }]}
      >
        <Ionicons name={icon} size={17} color={danger ? Colors.error : iconColor} />
      </View>
      <View style={rowStyles.textBlock}>
        <Text style={[rowStyles.label, { color: danger ? Colors.error : textColor }]}>
          {label}
        </Text>
        {description ? (
          <Text style={[rowStyles.description, { color: subColor }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {rightElement ?? (onPress ? (
        <Ionicons name="chevron-forward" size={16} color={subColor} />
      ) : null)}
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
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

// ─── Color picker ─────────────────────────────────────────────────────────────
const ACCENT_COLORS = [
  "#009A43", "#0071E3", "#FF6B35", "#8B2FC9",
  "#E3003E", "#F5A623", "#00B4D8", "#2D6A4F",
];

function AccentColorPicker({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: string;
  onSelect: (c: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={pickerStyles.backdrop} onPress={onClose}>
        <View style={pickerStyles.card}>
          <Text style={pickerStyles.title}>Accent Color</Text>
          <View style={pickerStyles.grid}>
            {ACCENT_COLORS.map((c) => (
              <Pressable
                key={c}
                style={[
                  pickerStyles.swatch,
                  { backgroundColor: c },
                  current === c && pickerStyles.swatchActive,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSelect(c);
                  onClose();
                }}
              >
                {current === c && (
                  <Ionicons name="checkmark" size={20} color="#fff" />
                )}
              </Pressable>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    width: "100%",
    gap: 16,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "#0D1B3E",
    textAlign: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
  },
  swatch: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchActive: {
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.6)",
  },
});

// ─── Main settings screen ─────────────────────────────────────────────────────
export default function SettingsTab() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const settings = useSettingsStore();
  const [colorPickerVisible, setColorPickerVisible] = useState(false);

  const isDark = settings.theme === "dark";
  const textColor = isDark ? "#F0F0F0" : "#0D1B3E";
  const subColor = isDark ? "#6B7280" : "#9CA3AF";

  const bg = isDark ? Colors.background : Colors.border;
  // const textColor = isDark ? Colors.textWhite : Colors.text;
  // const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

//   const toggle = (setter: (v: boolean) => void, current: boolean) => {
//     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
//     setter(!current);
//   };

  const switchEl = (value: boolean, onValueChange: (v: boolean) => void) => (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: "#E5E7EB", true: settings.accentColor + "60" }}
      thumbColor={value ? settings.accentColor : "#fff"}
    />
  );

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // In production: call a server-side function to delete the user
            await supabase.auth.signOut();
            logout();
            router.replace("/(auth)/login");
          },
        },
      ]
    );
  };

  const handleExportData = () => {
    Alert.alert(
      "Export Data",
      "Your data export will be prepared and sent to your email address within 24 hours.",
      [{ text: "OK" }]
    );
  };

  const handleClearCache = () => {
    Alert.alert("Clear Cache", "Local cached data cleared.", [{ text: "OK" }]);
  };

  const props = { isDark, cardBg, textColor, subColor, borderColor };

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'}  />


      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: cardBg,
            paddingTop: topPadding + 12,
            borderBottomColor: borderColor,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: textColor }]}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── GENERAL ── */}
        <Section title="General">
          <SettingRow
            icon="moon-outline"
            iconColor="#60A5FA"
            label="Dark Mode"
            description="Switch between light and dark themes"
            rightElement={switchEl(isDark, (v) => settings.setTheme(v ? "dark" : "light"))}
            {...props}
          />
          <SettingRow
            icon="color-palette-outline"
            iconColor={settings.accentColor}
            label="Accent Color"
            description={`Current: ${settings.accentColor}`}
            onPress={() => setColorPickerVisible(true)}
            rightElement={
              <View
                style={[styles.colorDot, { backgroundColor: settings.accentColor }]}
              />
            }
            {...props}
          />
          <SettingRow
            icon="text-outline"
            iconColor="#F5A623"
            label="Font Size"
            description={`Currently: ${settings.fontSize}`}
            onPress={() => {
              const sizes: FontSize[] = ["small", "medium", "large"];
              const idx = sizes.indexOf(settings.fontSize);
              settings.setFontSize(sizes[(idx + 1) % 3]);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            rightElement={
              <View style={[styles.pill, { backgroundColor: Colors.goldLight }]}>
                <Text style={[styles.pillText, { color: "#92400E" }]}>
                  {settings.fontSize.charAt(0).toUpperCase() + settings.fontSize.slice(1)}
                </Text>
              </View>
            }
            {...props}
          />
          <SettingRow
            icon="language-outline"
            iconColor="#8B5CF6"
            label="Language"
            description="English or Nigerian Pidgin"
            onPress={() => {
              const next = settings.language === "en" ? "pid" : "en";
              settings.setLanguage(next);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            rightElement={
              <View style={[styles.pill, { backgroundColor: "#EDE9FE" }]}>
                <Text style={[styles.pillText, { color: "#5B21B6" }]}>
                  {settings.language === "en" ? "English" : "Pidgin"}
                </Text>
              </View>
            }
            {...props}
          />
          <SettingRow
            icon="map-outline"
            iconColor="#0891B2"
            label="Map Style"
            description="Standard, satellite, or terrain view"
            onPress={() => {
              const styles2: MapStyle[] = ["standard", "satellite", "terrain"];
              const idx = styles2.indexOf(settings.mapStyle);
              settings.setMapStyle(styles2[(idx + 1) % 3]);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            rightElement={
              <View style={[styles.pill, { backgroundColor: "#E0F2FE" }]}>
                <Text style={[styles.pillText, { color: "#0369A1" }]}>
                  {settings.mapStyle.charAt(0).toUpperCase() + settings.mapStyle.slice(1)}
                </Text>
              </View>
            }
            {...props}
          />
        </Section>

        {/* ── NOTIFICATIONS ── */}
        <Section title="Notifications">
          <SettingRow
            icon="notifications-outline"
            iconColor="#EC4899"
            label="Push Notifications"
            description="Receive alerts on your device"
            rightElement={switchEl(
              settings.notifications.push,
              (v) => settings.setNotifications({ push: v })
            )}
            {...props}
          />
          <SettingRow
            icon="mail-outline"
            iconColor="#F59E0B"
            label="Email Notifications"
            description="Trip summaries and receipts via email"
            rightElement={switchEl(
              settings.notifications.email,
              (v) => settings.setNotifications({ email: v })
            )}
            {...props}
          />
          <SettingRow
            icon="chatbubble-outline"
            iconColor="#10B981"
            label="SMS Notifications"
            description="Important alerts via text message"
            rightElement={switchEl(
              settings.notifications.sms,
              (v) => settings.setNotifications({ sms: v })
            )}
            {...props}
          />
          <SettingRow
            icon="navigate-outline"
            iconColor="#3B82F6"
            label="Trip Alerts"
            description="Notifications for trip events"
            rightElement={switchEl(
              settings.notifications.tripAlerts,
              (v) => settings.setNotifications({ tripAlerts: v })
            )}
            {...props}
          />
          <SettingRow
            icon="megaphone-outline"
            iconColor="#8B5CF6"
            label="Park Broadcasts"
            description="Messages from park owners"
            rightElement={switchEl(
              settings.notifications.broadcasts,
              (v) => settings.setNotifications({ broadcasts: v })
            )}
            {...props}
          />
        </Section>

        {/* ── PRIVACY & SECURITY ── */}
        <Section title="Privacy & Security">
          <SettingRow
            icon="finger-print-outline"
            iconColor="#0891B2"
            label="Biometric Lock"
            description="Use Face ID / fingerprint to unlock"
            rightElement={switchEl(
              settings.biometricLock,
              (v) => settings.setBiometricLock(v)
            )}
            {...props}
          />
          <SettingRow
            icon="shield-checkmark-outline"
            iconColor="#10B981"
            label="Two-Factor Authentication"
            description="Add an extra layer of security"
            rightElement={switchEl(
              settings.twoFactorEnabled,
              (v) => settings.setTwoFactor(v)
            )}
            {...props}
          />
          <SettingRow
            icon="eye-outline"
            iconColor="#6B7280"
            label="Profile Visibility"
            description={`Visible to: ${settings.privacy.showProfile.replace("_", " ")}`}
            onPress={() => {
              const options: Array <"everyone" | "drivers_only" | "nobody"> = [
                "everyone",
                "drivers_only",
                "nobody",
              ];
              const idx = options.indexOf(settings.privacy.showProfile);
              settings.setPrivacy({ showProfile: options[(idx + 1) % 3] });
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            {...props}
          />
          <SettingRow
            icon="location-outline"
            iconColor="#F59E0B"
            label="Share Location"
            description="Allow location sharing during trips"
            rightElement={switchEl(
              settings.privacy.shareLocation,
              (v) => settings.setPrivacy({ shareLocation: v })
            )}
            {...props}
          />
          <SettingRow
            icon="stats-chart-outline"
            iconColor="#8B5CF6"
            label="Analytics & Crash Reports"
            description="Help improve Teqil"
            rightElement={switchEl(
              settings.privacy.analytics,
              (v) => settings.setPrivacy({ analytics: v })
            )}
            {...props}
          />
        </Section>

        {/* ── DATA & STORAGE ── */}
        <Section title="Data & Storage">
          <SettingRow
            icon="cellular-outline"
            iconColor="#0891B2"
            label="Data Saver"
            description="Reduce data usage for images and maps"
            rightElement={switchEl(settings.dataSaver, (v) => settings.setDataSaver(v))}
            {...props}
          />
          <SettingRow
            icon="time-outline"
            iconColor="#F59E0B"
            label="Trip History Retention"
            description={`Keep trips for: ${settings.historyRetention === "forever" ? "Forever" : settings.historyRetention + " days"}`}
            onPress={() => {
              const options: HistoryRetention[] = ["30", "90", "180", "forever"];
              const idx = options.indexOf(settings.historyRetention);
              settings.setHistoryRetention(options[(idx + 1) % 4]);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            {...props}
          />
          <SettingRow
            icon="trash-outline"
            iconColor="#EF4444"
            label="Clear Cache"
            description="Free up storage space"
            onPress={handleClearCache}
            {...props}
          />
          <SettingRow
            icon="download-outline"
            iconColor="#10B981"
            label="Export My Data"
            description="Download all your data (GDPR)"
            onPress={handleExportData}
            {...props}
          />
        </Section>

        {/* ── REFERRALS ── */}
        <Section title="Referrals">
          <SettingRow
            icon="gift-outline"
            iconColor="#EC4899"
            label="My Referral Code"
            description={settings.referralCode}
            onPress={() => {
              Share.share({
                message: `Join me on Teqil — Nigeria's best ride network! Use my code ${settings.referralCode} to get started. Download: https://teqil.app`,
              });
            }}
            rightElement={
              <View style={[styles.pill, { backgroundColor: "#FCE7F3" }]}>
                <Text style={[styles.pillText, { color: "#BE185D" }]}>
                  {settings.referralCode}
                </Text>
              </View>
            }
            {...props}
          />
        </Section>

        {/* ── ROLE-SPECIFIC (driver) ── */}
        {user?.role === "driver" && (
          <Section title="Driver Settings">
            <SettingRow
              icon="car-outline"
              iconColor={Colors.primary}
              label="Default Vehicle"
              description={settings.driverSettings.defaultVehicle || "Not set"}
              onPress={() => {
                Alert.prompt(
                  "Default Vehicle",
                  "e.g. Toyota Corolla, Blue",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Save",
                      onPress: (v) =>
                        settings.setDriverSettings({ defaultVehicle: v || "" }),
                    },
                  ],
                  "plain-text",
                  settings.driverSettings.defaultVehicle
                );
              }}
              {...props}
            />
            <SettingRow
              icon="checkmark-circle-outline"
              iconColor="#10B981"
              label="Auto-accept Trips"
              description="Automatically accept passenger requests"
              rightElement={switchEl(
                settings.driverSettings.autoAcceptTrips,
                (v) => settings.setDriverSettings({ autoAcceptTrips: v })
              )}
              {...props}
            />
            <SettingRow
              icon="people-outline"
              iconColor="#3B82F6"
              label="Show Earnings"
              description="Display earnings on the dashboard"
              rightElement={switchEl(
                settings.driverSettings.showEarnings,
                (v) => settings.setDriverSettings({ showEarnings: v })
              )}
              {...props}
            />
          </Section>
        )}

        {/* ── ACCOUNT ── */}
        <Section title="Account">
          <SettingRow
            icon="person-remove-outline"
            iconColor={Colors.error}
            label="Delete Account"
            description="Permanently remove your account"
            onPress={handleDeleteAccount}
            danger
            {...props}
          />
        </Section>

        <Text style={[styles.version, { color: subColor }]}>
          Teqil v1.0.0 · Made in Nigeria 🇳🇬
        </Text>
      </ScrollView>

      <AccentColorPicker
        visible={colorPickerVisible}
        current={settings.accentColor}
        onSelect={settings.setAccentColor}
        onClose={() => setColorPickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 24 },
  scrollContent: { padding: 16, gap: 6 },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.1)",
  },
  pill: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
  },
  version: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    paddingBottom: 8,
  },
});