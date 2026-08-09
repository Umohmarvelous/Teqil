import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";

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
  theme: ThemeMode;
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

  setTheme: (t: ThemeMode) => void;
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

      setTheme: (theme) => set({ theme }),
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
    }
  )
);
