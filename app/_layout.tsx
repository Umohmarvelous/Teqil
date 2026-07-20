import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
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
import { syncUserToPublicTable } from "@/src/services/auth";
import { registerForPushNotifications } from "@/src/services/notifications";
import NetworkBanner from "@/components/NetworkBanner";
import SessionTimeout from "@/src/components/SessionTimeout";
import FloatingCreditAnimation from "@/src/components/FloatingCreditAnimation";
import EmilgoSplash from "../components/EmilgoSplash";

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
function ThemeSync() {
  const systemTheme = useColorScheme();
  const { theme, setTheme } = useSettingsStore();

  useEffect(() => {
    if (systemTheme && systemTheme !== theme) {
      setTheme(systemTheme);
    }
  }, [systemTheme, theme, setTheme]);

  return null;
}

// ----------------------------------------------------------------------
// Main navigation structure
// ----------------------------------------------------------------------
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
  }, [user]);

  // ----- push token registration -----
  useEffect(() => {
    if (!user) return;
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
  }, [user, setUser]);

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
          <StatusBar
            style={theme === "dark" ? "light" : "dark"}
            backgroundColor="transparent"
            animated
          />

          <SessionTimeout>
            <View style={{ flex: 1 }}>
              <RootLayoutNav />
              {/* Custom animated splash overlay */}
              {!splashDone && (
                <EmilgoSplash onFinish={() => setSplashDone(true)} />
              )}
            </View>
            <FloatingCreditAnimation />
          </SessionTimeout>

          {/* <NetworkBanner onRetry={handleNetworkRetry} /> */}
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}