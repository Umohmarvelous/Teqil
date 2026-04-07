/**
 * app/index.tsx
 *
 * Routing logic:
 * - Authenticated user  → dashboard (based on role)
 * - Seen app before     → /(auth)/login
 * - First time ever     → /(auth)/welcome
 *
 * "First time" is tracked by a persisted boolean in AsyncStorage.
 */

import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";

const HAS_LAUNCHED_KEY = "teqil_has_launched";

export default function IndexScreen() {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;

    (async () => {
      // Already authenticated — go straight to dashboard
      if (isAuthenticated && user) {
        if (user.role === "driver") {
          // router.replace(user.profile_complete ? "/(driver)" : "/(auth)/driver-profile");
          router.replace("/(main)");
        } else if (user.role === "passenger") {
          router.replace("/(main)");
        } else if (user.role === "park_owner") {
          router.replace("/(main)");
        } else {
          router.replace("/(auth)/login");
        }
        return;
          // router.replace("/(main)");
      }

      // Not authenticated — check if they've ever launched the app
      const hasLaunched = await AsyncStorage.getItem(HAS_LAUNCHED_KEY);
      if (!hasLaunched) {
        // First ever launch → welcome/onboarding
        await AsyncStorage.setItem(HAS_LAUNCHED_KEY, "true");
        router.replace("/(auth)/welcome");
      } else {
        // Returning user who signed out → go to login, not welcome
        router.replace("/(auth)/login");
      }
    })();
  }, [isAuthenticated, isLoading, user]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primaryLight} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});