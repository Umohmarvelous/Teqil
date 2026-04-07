import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";
export type MapStyle = "standard" | "satellite" | "terrain";
export type FontSize = "small" | "medium" | "large";
export type Language = "en" | "pid";
export type HistoryRetention = "30" | "90" | "180" | "forever";

interface NotificationPrefs {
  push: boolean;
  email: boolean;
  sms: boolean;
  tripAlerts: boolean;
  messages: boolean;
  broadcasts: boolean;
}

interface PrivacySettings {
  showProfile: "everyone" | "drivers_only" | "nobody";
  shareLocation: boolean;
  analytics: boolean;
}

interface DriverSettings {
  defaultVehicle: string;
  autoAcceptTrips: boolean;
  maxPassengers: number;
  showEarnings: boolean;
}

interface SettingsStore {
  theme: ThemeMode;
  accentColor: string;
  fontSize: FontSize;
  language: Language;
  notifications: NotificationPrefs;
  privacy: PrivacySettings;
  mapStyle: MapStyle;
  dataSaver: boolean;
  biometricLock: boolean;
  twoFactorEnabled: boolean;
  historyRetention: HistoryRetention;
  referralCode: string;
  driverSettings: DriverSettings;

  setTheme: (t: ThemeMode) => void;
  setAccentColor: (c: string) => void;
  setFontSize: (s: FontSize) => void;
  setLanguage: (l: Language) => void;
  setNotifications: (n: Partial<NotificationPrefs>) => void;
  setPrivacy: (p: Partial<PrivacySettings>) => void;
  setMapStyle: (s: MapStyle) => void;
  setDataSaver: (v: boolean) => void;
  setBiometricLock: (v: boolean) => void;
  setTwoFactor: (v: boolean) => void;
  setHistoryRetention: (v: HistoryRetention) => void;
  setDriverSettings: (d: Partial<DriverSettings>) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: "light",
      accentColor: "#009A43",
      fontSize: "medium",
      language: "en",
      notifications: {
        push: true,
        email: true,
        sms: true,
        tripAlerts: true,
        messages: true,
        broadcasts: true,
      },
      privacy: {
        showProfile: "everyone",
        shareLocation: true,
        analytics: true,
      },
      mapStyle: "standard",
      dataSaver: false,
      biometricLock: false,
      twoFactorEnabled: false,
      historyRetention: "90",
      referralCode: "TEQIL" + Math.random().toString(36).substr(2, 6).toUpperCase(),
      driverSettings: {
        defaultVehicle: "",
        autoAcceptTrips: false,
        maxPassengers: 4,
        showEarnings: true,
      },

      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setFontSize: (fontSize) => set({ fontSize }),
      setLanguage: (language) => set({ language }),
      setNotifications: (n) =>
        set((s) => ({ notifications: { ...s.notifications, ...n } })),
      setPrivacy: (p) =>
        set((s) => ({ privacy: { ...s.privacy, ...p } })),
      setMapStyle: (mapStyle) => set({ mapStyle }),
      setDataSaver: (dataSaver) => set({ dataSaver }),
      setBiometricLock: (biometricLock) => set({ biometricLock }),
      setTwoFactor: (twoFactorEnabled) => set({ twoFactorEnabled }),
      setHistoryRetention: (historyRetention) => set({ historyRetention }),
      setDriverSettings: (d) =>
        set((s) => ({ driverSettings: { ...s.driverSettings, ...d } })),
    }),
    {
      name: "teqil-settings",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);