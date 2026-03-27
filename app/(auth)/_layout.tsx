import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";

export default function AuthLayout() {
  return (
    <>
      {/* <StatusBar style="inverted" backgroundColor="red" animated/> */}

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
      </Stack>
    </>
  );
}
