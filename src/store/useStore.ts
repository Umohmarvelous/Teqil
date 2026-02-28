import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User, UserRole, Trip, Passenger } from "../models/types";

type Language = "en" | "pid";

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  selectedRole: UserRole | null;
  language: Language;

  setUser: (user: User | null) => void;
  setIsAuthenticated: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
  setSelectedRole: (role: UserRole | null) => void;
  setLanguage: (lang: Language) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

interface TripStore {
  activeTrip: Trip | null;
  activeTripPassengers: Passenger[];
  earningsCoins: number;
  elapsedSeconds: number;
  tripDistanceKm: number;

  setActiveTrip: (trip: Trip | null) => void;
  setActiveTripPassengers: (passengers: Passenger[]) => void;
  setEarningsCoins: (coins: number) => void;
  incrementEarnings: (coins: number) => void;
  setElapsedSeconds: (s: number) => void;
  setTripDistanceKm: (km: number) => void;
  resetTripState: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      selectedRole: null,
      language: "en",

      setUser: (user) => set({ user }),
      setIsAuthenticated: (value) => set({ isAuthenticated: value }),
      setIsLoading: (value) => set({ isLoading: value }),
      setSelectedRole: (role) => set({ selectedRole: role }),
      setLanguage: (lang) => set({ language: lang }),
      logout: () =>
        set({ user: null, isAuthenticated: false, selectedRole: null }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
    }),
    {
      name: "teqil-auth",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        language: state.language,
      }),
    }
  )
);

export const useTripStore = create<TripStore>((set) => ({
  activeTrip: null,
  activeTripPassengers: [],
  earningsCoins: 0,
  elapsedSeconds: 0,
  tripDistanceKm: 0,

  setActiveTrip: (trip) => set({ activeTrip: trip }),
  setActiveTripPassengers: (passengers) =>
    set({ activeTripPassengers: passengers }),
  setEarningsCoins: (coins) => set({ earningsCoins: coins }),
  incrementEarnings: (coins) =>
    set((state) => ({ earningsCoins: state.earningsCoins + coins })),
  setElapsedSeconds: (s) => set({ elapsedSeconds: s }),
  setTripDistanceKm: (km) => set({ tripDistanceKm: km }),
  resetTripState: () =>
    set({
      activeTrip: null,
      activeTripPassengers: [],
      earningsCoins: 0,
      elapsedSeconds: 0,
      tripDistanceKm: 0,
    }),
}));
