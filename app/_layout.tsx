import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useCallback, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { useFonts } from "expo-font";
import { useAuthStore } from "@/src/store/useStore";
import { supabase } from "@/src/services/supabase";
import { syncAll, startConnectivityListener } from "@/src/services/sync";
import type { SyncUser } from "@/src/services/sync";
import "@/src/i18n";
import i18n from "@/src/i18n";
import { StatusBar } from "expo-status-bar";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="(auth)"
        options={{
          presentation: "modal",
          headerShown: false,
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen name="(driver)" options={{ headerShown: false }} />
      <Stack.Screen name="(passenger)" options={{ headerShown: false }} />
      <Stack.Screen name="(park-owner)" options={{ headerShown: false }} />
      <Stack.Screen
        name="live-trip/[code]"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const { setUser, setIsAuthenticated, setIsLoading, user, language } =
    useAuthStore();

  // Keep a stable ref to the current user so the connectivity listener closure
  // always reads the freshest value without needing to be re-registered.
  const userRef = useRef<SyncUser | null>(null);
  useEffect(() => {
    userRef.current = user
      ? { id: user.id, role: user.role, park_name: user.park_name }
      : null;
  }, [user]);

  // ── Language ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (language) i18n.changeLanguage(language);
  }, [language]);

  // ── Supabase auth listener ────────────────────────────────────────────────────
  useEffect(() => {
    // Restore session on cold start
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session?.user);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Trigger initial sync once the user is authenticated ───────────────────────
  // We watch `user` rather than the auth event so we have the full user object
  // (including role and park_name) at the time we kick off the sync.
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    // Avoid re-running on unrelated re-renders that don't change the user ID.
    if (user.id === prevUserIdRef.current) return;
    prevUserIdRef.current = user.id;

    const syncUser: SyncUser = {
      id: user.id,
      role: user.role,
      park_name: user.park_name,
    };

    syncAll(syncUser).catch((err) =>
      console.warn("[Layout] initial sync error", err)
    );
  }, [user]);

  // ── Connectivity listener ────────────────────────────────────────────────────
  // Registered once on mount; uses the userRef so it always has the latest user.
  useEffect(() => {
    const unsubscribe = startConnectivityListener(() => userRef.current);
    return unsubscribe;
  }, []);

  // ── Splash screen ─────────────────────────────────────────────────────────────
  const onLayoutRootView = useCallback(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
          <KeyboardProvider>
            <StatusBar style="light" />
            <RootLayoutNav />
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}