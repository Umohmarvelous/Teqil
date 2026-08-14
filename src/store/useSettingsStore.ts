import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";
/** The scheme actually in force. "system" is a preference, never a palette. */
export type ResolvedTheme = "light" | "dark";

export type DistanceUnit = "km" | "mi";

/**
 * Lean settings — every field maps to a REAL behavior. Nothing decorative goes
 * in here: if a toggle doesn't change what the app does, it doesn't belong.
 *
 *  - theme             → applied by ThemeSync in app/_layout.tsx
 *  - pushNotifications → gates push-token registration in app/_layout.tsx
 *  - biometricLock     → gates app open via <AppLock> (expo-local-authentication)
 *  - shareLocation     → gates startLocationTracking() during trips
 *  - referralCode      → shown + shared from the Settings screen
 *  - autoStartTracking → free-ride tracker begins on open vs waiting for a tap
 *  - dataSaver         → lower GPS accuracy + slower broadcasts in locationTracking
 *  - hapticFeedback    → gates every buzz via src/utils/haptics.ts
 *  - distanceUnit      → formatDistance() renders km or miles
 *  - confirmEndTrip    → ask before ending a tracked ride
 *
 * Notification categories — each is checked before that specific push is shown,
 * so switching one off genuinely silences that class of alert:
 *  - notifyDriverArrival → "your driver is nearby"
 *  - notifyFreeRides     → a free ride was offered on a route you use
 *  - notifyFuelPool      → (drivers) the fuel pool can no longer cover rewards
 *  - notifyPromotions    → premium offers and campaigns
 *
 * Other real behaviours:
 *  - syncOnWifiOnly    → sync.ts holds pushes/pulls until on Wi-Fi
 *  - voiceGuidance     → expo-speech announces trip cues
 *  - biometricOnPayout → Face ID required before changing a payout account
 *  - fareBreakdown     → show the split before confirming a scan-and-pay
 *  - showTierBadge     → publish your credit tier on your public profile
 *  - historyRetentionDays → local trip/route records older than this are pruned
 *  - emergencyContact  → surfaced on the live-trip screen for a one-tap call
 *
 * (Language lives in useAuthStore, which drives i18n.)
 */

/** How long local trip/route history is kept before pruning. */
export type RetentionDays = 30 | 90 | 365 | 0; // 0 = keep forever

export interface EmergencyContact {
  name: string;
  phone: string;
}
interface SettingsStore {
  /**
   * The scheme in force right now — what every screen branches on.
   *
   * Always concrete. It is DERIVED: when `themePreference` is "system" this
   * mirrors the OS appearance, otherwise it mirrors the preference. Only
   * ThemeSync writes it, via setResolvedTheme.
   */
  theme: ResolvedTheme;
  /** What the user actually chose. "system" means "follow the OS". */
  themePreference: ThemeMode;
  pushNotifications: boolean;
  biometricLock: boolean;
  shareLocation: boolean;
  referralCode: string;

  autoStartTracking: boolean;
  dataSaver: boolean;
  hapticFeedback: boolean;
  distanceUnit: DistanceUnit;
  confirmEndTrip: boolean;

  notifyDriverArrival: boolean;
  notifyFreeRides: boolean;
  notifyFuelPool: boolean;
  notifyPromotions: boolean;

  syncOnWifiOnly: boolean;
  voiceGuidance: boolean;
  biometricOnPayout: boolean;
  fareBreakdown: boolean;
  showTierBadge: boolean;
  historyRetentionDays: RetentionDays;
  emergencyContact: EmergencyContact | null;

  /** Record the user's choice. Pass "system" to hand control back to the OS. */
  setTheme: (t: ThemeMode) => void;
  /** ThemeSync only — publishes the scheme the OS is currently reporting. */
  setResolvedTheme: (t: ResolvedTheme) => void;
  setPushNotifications: (v: boolean) => void;
  setBiometricLock: (v: boolean) => void;
  setShareLocation: (v: boolean) => void;

  setAutoStartTracking: (v: boolean) => void;
  setDataSaver: (v: boolean) => void;
  setHapticFeedback: (v: boolean) => void;
  setDistanceUnit: (v: DistanceUnit) => void;
  setConfirmEndTrip: (v: boolean) => void;

  setNotifyDriverArrival: (v: boolean) => void;
  setNotifyFreeRides: (v: boolean) => void;
  setNotifyFuelPool: (v: boolean) => void;
  setNotifyPromotions: (v: boolean) => void;

  setSyncOnWifiOnly: (v: boolean) => void;
  setVoiceGuidance: (v: boolean) => void;
  setBiometricOnPayout: (v: boolean) => void;
  setFareBreakdown: (v: boolean) => void;
  setShowTierBadge: (v: boolean) => void;
  setHistoryRetentionDays: (v: RetentionDays) => void;
  setEmergencyContact: (v: EmergencyContact | null) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: "light",
      themePreference: "system",
      pushNotifications: true,
      biometricLock: false,
      shareLocation: true,
      referralCode: "TEQIL" + Math.random().toString(36).substr(2, 6).toUpperCase(),

      autoStartTracking: true,
      dataSaver: false,
      hapticFeedback: true,
      distanceUnit: "km",
      confirmEndTrip: true,

      notifyDriverArrival: true,
      notifyFreeRides: true,
      notifyFuelPool: true,
      // Marketing is off unless asked for — opt-in, not opt-out.
      notifyPromotions: false,

      syncOnWifiOnly: false,
      voiceGuidance: false,
      biometricOnPayout: true,
      fareBreakdown: true,
      showTierBadge: true,
      historyRetentionDays: 365,
      emergencyContact: null,

      // Choosing a concrete scheme applies it immediately as well as recording
      // the preference, so the UI flips on the same frame as the tap rather
      // than waiting for ThemeSync's effect to run.
      setTheme: (themePreference) =>
        set(
          themePreference === "system"
            ? { themePreference }
            : { themePreference, theme: themePreference },
        ),
      setResolvedTheme: (theme) => set({ theme }),
      setPushNotifications: (pushNotifications) => set({ pushNotifications }),
      setBiometricLock: (biometricLock) => set({ biometricLock }),
      setShareLocation: (shareLocation) => set({ shareLocation }),

      setAutoStartTracking: (autoStartTracking) => set({ autoStartTracking }),
      setDataSaver: (dataSaver) => set({ dataSaver }),
      setHapticFeedback: (hapticFeedback) => set({ hapticFeedback }),
      setDistanceUnit: (distanceUnit) => set({ distanceUnit }),
      setConfirmEndTrip: (confirmEndTrip) => set({ confirmEndTrip }),

      setNotifyDriverArrival: (notifyDriverArrival) => set({ notifyDriverArrival }),
      setNotifyFreeRides: (notifyFreeRides) => set({ notifyFreeRides }),
      setNotifyFuelPool: (notifyFuelPool) => set({ notifyFuelPool }),
      setNotifyPromotions: (notifyPromotions) => set({ notifyPromotions }),

      setSyncOnWifiOnly: (syncOnWifiOnly) => set({ syncOnWifiOnly }),
      setVoiceGuidance: (voiceGuidance) => set({ voiceGuidance }),
      setBiometricOnPayout: (biometricOnPayout) => set({ biometricOnPayout }),
      setFareBreakdown: (fareBreakdown) => set({ fareBreakdown }),
      setShowTierBadge: (showTierBadge) => set({ showTierBadge }),
      setHistoryRetentionDays: (historyRetentionDays) => set({ historyRetentionDays }),
      setEmergencyContact: (emergencyContact) => set({ emergencyContact }),
    }),
    {
      name: "teqil-settings",
      storage: createJSONStorage(() => AsyncStorage),
      // v1 split `theme` into a preference plus a resolved scheme. Installs
      // from before that hold a single field which may legitimately contain
      // "system" — a value the resolved field can no longer represent.
      version: 1,
      migrate: (persisted: any, from: number) => {
        if (from >= 1 || !persisted) return persisted;

        const old = persisted.theme;
        return {
          ...persisted,
          themePreference: old ?? "system",
          // "system" was never a palette; ThemeSync fills in the real one on
          // mount, and light is the safer thing to paint for the one frame
          // before it does.
          theme: old === "dark" ? "dark" : "light",
        };
      },
    }
  )
);
