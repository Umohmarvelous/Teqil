import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
// import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

// function NativePassengerTabs() {
//   return (
//     <NativeTabs>
//       <NativeTabs.Trigger name="index">
//         <Icon sf={{ default: "house", selected: "house.fill" }} />
//         <Label>Home</Label>
//       </NativeTabs.Trigger>
//       <NativeTabs.Trigger name="find-trip">
//         <Icon sf={{ default: "magnifyingglass", selected: "magnifyingglass" }} role="search" />
//         <Label>Find Trip</Label>
//       </NativeTabs.Trigger>
//       <NativeTabs.Trigger name="history">
//         <Icon sf={{ default: "clock", selected: "clock.fill" }} />
//         <Label>History</Label>
//       </NativeTabs.Trigger>
//     </NativeTabs>
//   );
// }

function ClassicPassengerTabs() {
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.tabBarInactive,
        tabBarLabelStyle: {
          fontFamily: "Poppins_500Medium",
          fontSize: 11,
        },
        
        
        tabBarPosition: "bottom",
        tabBarStyle: {
          position: "absolute",
          // bottom: 20,
          left: 0,
          right: 0,
          maxWidth: 'auto',
          alignSelf: 'center',
          // marginHorizontal: 60,
          paddingTop: 12,
          height: 90,
          backgroundColor: isIOS ? "transparent" : Colors.surface,
          // borderRadius: 35,
          overflow: "hidden",
          // borderWidth: 1,
          borderColor: "transparent",
          // elevation: 16,
          // shadowColor: "#000",
          // shadowOpacity: 0.12,
          // shadowRadius: 12,
          // shadowOffset: { width: 0, height: 8 },
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint="dark"
              style={[StyleSheet.absoluteFill, {  }]}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.surface }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="find-trip"
        options={{
          title: "Find Trip",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function PassengerTabLayout() {
  if (isLiquidGlassAvailable()) {
    // return <NativePassengerTabs />;
  }
  return <ClassicPassengerTabs />;
}
