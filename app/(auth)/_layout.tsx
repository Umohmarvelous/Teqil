import { Stack } from "expo-router";
import React from "react";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="welcome" options={{ animation: "fade" }} />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="driver-profile" />
      <Stack.Screen name="passenger-entry" options={{ animation: "slide_from_bottom" }} />
      <Stack.Screen name="pay-fare" options={{ animation: "slide_from_right" }} />
    </Stack>
  );
}