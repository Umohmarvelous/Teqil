import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { PaystackProvider } from "react-native-paystack-webview";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import i18n from "@/src/i18n";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { supabase } from "@/src/services/supabase";
import { syncAll, startConnectivityListener, SyncUser } from "@/src/services/sync";
import { flushPendingRoute } from "@/src/services/locationTracking";
import { syncUserToPublicTable } from "@/src/services/auth";
import { registerForPushNotifications } from "@/src/services/notifications";
import NetworkBanner from "@/components/NetworkBanner";
import { AlertHost } from "@/components/ios";
// import SessionTimeout from "@/src/components/SessionTimeout";
import AppLock from "@/src/components/AppLock";
import FloatingCreditAnimation from "@/src/components/FloatingCreditAnimation";
import EmilgoSplash from "../components/EmilgoSplash";
import { Colors } from "@/constants/colors";

// ----------------------------------------------------------------------
// Notifications setup
// ----------------------------------------------------------------------
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

SplashScreen.preventAutoHideAsync();

// ----------------------------------------------------------------------
// Theme synchronisation component
// ----------------------------------------------------------------------
//
// Resolves the user's PREFERENCE (light / dark / system) against the OS
// appearance and publishes the concrete scheme every screen reads.
//
// It used to write the preference itself — `setTheme(systemTheme)` whenever the
// two disagreed. That made the Dark Mode switch impossible to turn on: the tap
// set "dark", this effect saw it differ from a light OS, and set it straight
// back to "light" on the very next render. "Match System" could never stay on
// either, because the concrete value it wrote was no longer "system".
//
// So the rule is now one-way: the preference is the user's, and only this
// component writes the resolved value.
function ThemeSync() {
  const systemTheme = useColorScheme();
  const themePreference = useSettingsStore((s) => s.themePreference);
  const theme = useSettingsStore((s) => s.theme);
  const setResolvedTheme = useSettingsStore((s) => s.setResolvedTheme);

  useEffect(() => {
    const resolved =
      themePreference === "system"
        ? systemTheme === "dark"
          ? "dark"
          : "light"
        : themePreference;

    if (resolved !== theme) setResolvedTheme(resolved);
  }, [systemTheme, themePreference, theme, setResolvedTheme]);

  return null;
}

// ----------------------------------------------------------------------
// Main navigation structure
// ----------------------------------------------------------------------
const PAYSTACK_PUBLIC_KEY = process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY;

function RootLayoutNav() {
  const nav = (
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
          name="live-trip-code/[code]"
          options={{ headerShown: false, animation: "fade" }}
        />
        <Stack.Screen
          name="rating"
          options={{ headerShown: false, presentation: "modal" }}
        />
        <Stack.Screen
          name="program"
          options={{ headerShown: false, animation: "slide_from_right" }}
        />
        <Stack.Screen
          name="tiers"
          options={{ headerShown: false, animation: "slide_from_right" }}
        />
      </Stack>
    </>
  );

  // Wrap in PaystackProvider so screens can use usePaystack() for real checkout.
  // When no public key is configured, render without it (services fall back to mock).
  if (PAYSTACK_PUBLIC_KEY) {
    return (
      <PaystackProvider
        publicKey={PAYSTACK_PUBLIC_KEY}
        currency="NGN"
        defaultChannels={["card", "bank", "ussd", "mobile_money", "bank_transfer"]}
      >
        {nav}
      </PaystackProvider>
    );
  }
  return nav;
}

// ----------------------------------------------------------------------
// Root layout
// ----------------------------------------------------------------------
export default function RootLayout() {
  // ----- fonts & splash states -----
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const [splashDone, setSplashDone] = useState(false);

  // ----- global stores -----
  const { setUser, setIsAuthenticated, setIsLoading, user, language } = useAuthStore();
  const { theme } = useSettingsStore();
  const pushNotifications = useSettingsStore((s) => s.pushNotifications);
  const isDark = theme === "dark";

  // ----- refs -----
  const userRef = useRef<SyncUser | null>(null);
  const prevUserIdRef = useRef<string | null>(null);


  // ----- keep userRef in sync -----
  useEffect(() => {
    userRef.current = user
      ? { id: user.id, role: user.role, park_name: user.park_name }
      : null;
  }, [user]);

  // ----- i18n -----
  useEffect(() => {
    if (language) i18n.changeLanguage(language);
  }, [language]);

  // ----- auth state subscription -----
  useEffect(() => {
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
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [setIsAuthenticated, setIsLoading, setUser]);

  // ----- initial data sync when user changes -----
  useEffect(() => {
    if (!user) return;
    if (user.id === prevUserIdRef.current) return;
    prevUserIdRef.current = user.id;

    syncAll({ id: user.id, role: user.role, park_name: user.park_name }).catch((err) =>
      console.warn("[Layout] initial sync error:", err)
    );

    // Upload a GPS track left behind by an app kill or an offline trip end.
    flushPendingRoute().catch((err) =>
      console.warn("[Layout] pending route flush error:", err)
    );
  }, [user]);

  // ----- push token registration (gated by the Settings toggle) -----
  useEffect(() => {
    if (!user || !pushNotifications) return;
    (async () => {
      try {
        const token = await registerForPushNotifications();
        if (token && token !== user.push_token) {
          const updatedUser = { ...user, push_token: token };
          setUser(updatedUser);
          await syncUserToPublicTable(updatedUser);
        }
      } catch (e) {
        console.warn("[Layout] Failed to register push token:", e);
      }
    })();
  }, [user, setUser, pushNotifications]);

  // ----- network connectivity listener -----
  useEffect(() => {
    const unsubscribe = startConnectivityListener(() => userRef.current);
    return unsubscribe;
  }, []);

  // ----- hide native splash once fonts are ready -----
  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // ----- manual retry callback -----
  const handleNetworkRetry = useCallback(() => {
    const u = userRef.current;
    if (!u) return;
    syncAll(u).catch((err) => console.warn("[Layout] manual retry sync error:", err));
  }, []);

  // ----- block render until fonts are ready -----
  if (!fontsLoaded) {
    return null;
  }

  // ----- main UI -----
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          {/* Hidden until splash finishes */}
          {splashDone && (
            <StatusBar
              style={theme === "dark" ? "light" : "dark"}
              animated
            />
          )}

          {/* <SessionTimeout> */}
            <View style={{ flex: 1, backgroundColor: isDark ? Colors.background : Colors.textWhite }}>
              <AppLock>
                <RootLayoutNav />
              </AppLock>
              {/* Custom animated splash overlay */}
              {!splashDone && (
                <EmilgoSplash onFinish={() => setSplashDone(true)} />
              )}
            </View>
            <FloatingCreditAnimation />
          {/* </SessionTimeout> */}

          {/* Hidden until splash finishes */}
          {/* {splashDone && <NetworkBanner onRetry={handleNetworkRetry} />} */}

          {/* App-wide host for native-style dialogs — see components/ios/AlertHost. */}
          <AlertHost />
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}