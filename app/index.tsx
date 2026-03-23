import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";

export default function IndexScreen() {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace("/(park-owner)/alerts");
      return;
    }

    if (!user) {
      router.replace("/(auth)/welcome");
      return;
    }

    if (user.role === "driver") {
      if (!user.profile_complete) {
        router.replace("/(auth)/driver-profile");
      } else {
        router.replace("/(driver)");
      }
    } else if (user.role === "passenger") {
      router.replace("/(passenger)");
    } else if (user.role === "park_owner") {
      router.replace("/(park-owner)");
    } else {
      router.replace("/(auth)/welcome");
    }
  }, [isAuthenticated, isLoading, user]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
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
