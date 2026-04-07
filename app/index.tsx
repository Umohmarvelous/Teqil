import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";

export default function IndexScreen() {
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    // if (isLoading) return;

    if (!isAuthenticated || !user) {
      // First time or logged out — always go to login, not welcome
      // Welcome is only for brand new users (handled in login screen with a
      // "Don't have an account? Sign up" flow)
      router.replace("/(main)");
      return;
    }

    // Authenticated: drivers need profile completion first, everyone else
    // goes to the unified (main) dashboard
    if (user.role === "driver" && !user.profile_complete) {
      router.replace("/(driver)");
    } else {
      router.replace("/(main)");
    }
  }, [isAuthenticated, user]);

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