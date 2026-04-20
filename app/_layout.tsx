// app/_layout.tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useCallback, useRef } from "react";
import { useColorScheme } from "react-native";
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
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useMessagesStore } from "@/src/store/useMessagesStore";
import { supabase } from "@/src/services/supabase";
import { syncAll, startConnectivityListener, SyncUser } from "@/src/services/sync";
import i18n from "@/src/i18n";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";

SplashScreen.preventAutoHideAsync();

// Configure notification handler globally so foreground notifications show
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function ThemeSync() {
  const systemTheme = useColorScheme();
  const { theme, setTheme } = useSettingsStore();

  useEffect(() => {
    if (systemTheme && systemTheme !== theme) {
      setTheme(systemTheme);
    }
  }, [systemTheme]);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <ThemeSync />
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
        <Stack.Screen name="(main)" options={{ headerShown: false, animation: "fade" }} />
        <Stack.Screen name="(driver)" options={{ headerShown: false }} />
        <Stack.Screen name="(passenger)" options={{ headerShown: false }} />
        <Stack.Screen name="(park-owner)" options={{ headerShown: false }} />
        <Stack.Screen
          name="live-trip/[code]"
          options={{ headerShown: false, animation: "fade" }}
        />
        <Stack.Screen
          name="live-trip-code/[code]"
          options={{ headerShown: false, animation: "fade" }}
        />
        <Stack.Screen
          name="rating"
          options={{ headerShown: false, presentation: "modal" }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const { setUser, setIsAuthenticated, setIsLoading, user, language } = useAuthStore();
  const { theme } = useSettingsStore();
  // const subscribeToRealtime = useMessagesStore((state) => state.subscribeToRealtime);
  // const unsubscribeRealtime = useMessagesStore((state) => state.unsubscribeRealtime);

  const userRef = useRef<SyncUser | null>(null);
  useEffect(() => {
    userRef.current = user
      ? { id: user.id, role: user.role, park_name: user.park_name }
      : null;
  }, [user]);

  // Sync language preference
  useEffect(() => {
    if (language) i18n.changeLanguage(language);
  }, [language]);

  // Request notification permissions on startup
  useEffect(() => {
    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        await Notifications.requestPermissionsAsync();
      }
    })();
  }, []);

  // Supabase auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session?.user);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Realtime messages subscription — subscribe when user is known, unsubscribe on logout
  // useEffect(() => {
  //   if (!user?.id) return;

  //   const unsubscribe = subscribeToRealtime(user.id);
  //   return () => {
  //     unsubscribe?.();
  //   };
  // }, [user?.id]);

  // Initial sync when user logs in
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    if (user.id === prevUserIdRef.current) return;
    prevUserIdRef.current = user.id;

    syncAll({ id: user.id, role: user.role, park_name: user.park_name }).catch(
      (err) => console.warn("[Layout] initial sync error:", err)
    );
  }, [user]);

  // Connectivity-triggered sync
  useEffect(() => {
    const unsubscribe = startConnectivityListener(() => userRef.current);
    return unsubscribe;
  }, []);

  const onLayoutRootView = useCallback(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
          <KeyboardProvider>
            <StatusBar style={theme === "dark" ? "light" : "dark"} backgroundColor="transparent" animated />
            <RootLayoutNav />
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}