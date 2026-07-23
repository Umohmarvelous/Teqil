import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";

/**
 * Lean settings — every field maps to a REAL behavior:
 *  - theme            → applied by ThemeSync in app/_layout.tsx
 *  - pushNotifications→ gates push-token registration in app/_layout.tsx
 *  - biometricLock    → gates app open via <AppLock> (expo-local-authentication)
 *  - shareLocation    → gates startLocationTracking() during trips
 *  - referralCode     → shown + shared from the Settings screen
 *
 * (Language lives in useAuthStore, which drives i18n.)
 */
interface SettingsStore {
  theme: ThemeMode;
  pushNotifications: boolean;
  biometricLock: boolean;
  shareLocation: boolean;
  referralCode: string;

  setTheme: (t: ThemeMode) => void;
  setPushNotifications: (v: boolean) => void;
  setBiometricLock: (v: boolean) => void;
  setShareLocation: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: "light",
      pushNotifications: true,
      biometricLock: false,
      shareLocation: true,
      referralCode: "TEQIL" + Math.random().toString(36).substr(2, 6).toUpperCase(),

      setTheme: (theme) => set({ theme }),
      setPushNotifications: (pushNotifications) => set({ pushNotifications }),
      setBiometricLock: (biometricLock) => set({ biometricLock }),
      setShareLocation: (shareLocation) => set({ shareLocation }),
    }),
    {
      name: "teqil-settings",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
