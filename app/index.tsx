import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";

export default function IndexScreen() {
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !user) {
      // Not logged in → go to login screen
      // router.replace("/(main)");
      router.navigate("/(driver)/create-trip");
      return;
    }

    // Authenticated: drivers need profile completion first, everyone else
    // goes to the unified (main) dashboard
    if (user.role === "driver" && !user.profile_complete) {
      router.replace("/(auth)/driver-profile");
    } else {
      // router.replace("/(main)");
      router.navigate("/(driver)/create-trip");
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