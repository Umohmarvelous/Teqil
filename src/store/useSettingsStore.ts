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
 * (Language lives in useAuthStore, which drives i18n.)
 */
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

  setTheme: (t: ThemeMode) => void;
  setPushNotifications: (v: boolean) => void;
  setBiometricLock: (v: boolean) => void;
  setShareLocation: (v: boolean) => void;

  setAutoStartTracking: (v: boolean) => void;
  setDataSaver: (v: boolean) => void;
  setHapticFeedback: (v: boolean) => void;
  setDistanceUnit: (v: DistanceUnit) => void;
  setConfirmEndTrip: (v: boolean) => void;
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

      setTheme: (theme) => set({ theme }),
      setPushNotifications: (pushNotifications) => set({ pushNotifications }),
      setBiometricLock: (biometricLock) => set({ biometricLock }),
      setShareLocation: (shareLocation) => set({ shareLocation }),

      setAutoStartTracking: (autoStartTracking) => set({ autoStartTracking }),
      setDataSaver: (dataSaver) => set({ dataSaver }),
      setHapticFeedback: (hapticFeedback) => set({ hapticFeedback }),
      setDistanceUnit: (distanceUnit) => set({ distanceUnit }),
      setConfirmEndTrip: (confirmEndTrip) => set({ confirmEndTrip }),
    }),
    {
      name: "teqil-settings",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
