// components/ReplayTutorialButton.tsx
//
// A pressable row that resets the onboarding state so the tutorial replays
// on next app launch (or immediately if you pass onReset that triggers
// the overlay in-place).
//
// Usage inside the Settings screen:
//
//   import ReplayTutorialButton from "@/components/ReplayTutorialButton";
//
//   <ReplayTutorialButton onReset={resetOnboarding} />
//
// Where resetOnboarding comes from:
//   const { reset } = useOnboarding();  // in whichever parent manages overlay state

import React, { useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSettingsStore } from "@/src/store/useSettingsStore";

interface Props {
  /** Called after the key is cleared — parent should re-show the overlay. */
  onReset: () => void;
}

export default function ReplayTutorialButton({ onReset }: Props) {
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";

  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.95, damping: 10, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1,    damping: 8,  useNativeDriver: true }),
    ]).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onReset();
  };

  const bg       = isDark ? "rgba(0,166,81,0.08)"  : "rgba(0,166,81,0.06)";
  const border   = isDark ? "rgba(0,166,81,0.2)"   : "rgba(0,166,81,0.18)";
  const txtColor = isDark ? "#a8d5b8" : "#1a6b3c";
  const subColor = isDark ? "#608c6e" : "#5a8c6e";

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={[S.row, { backgroundColor: bg, borderColor: border }]}
        onPress={handlePress}
      >
        <View style={S.iconWrap}>
          <Ionicons name="play-circle-outline" size={22} color="#00A651" />
        </View>
        <View style={S.textBlock}>
          <Text style={[S.label, { color: txtColor }]}>Replay app tutorial</Text>
          <Text style={[S.sub,   { color: subColor }]}>
            Walk through the feature overview again
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={subColor} />
      </Pressable>
    </Animated.View>
  );
}

const S = StyleSheet.create({
  row: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              14,
    borderRadius:     16,
    paddingHorizontal:16,
    paddingVertical:   14,
    borderWidth:      1,
  },
  iconWrap: {
    width:        38,
    height:       38,
    borderRadius: 10,
    backgroundColor: "rgba(0,166,81,0.12)",
    alignItems:   "center",
    justifyContent:"center",
  },
  textBlock: { flex: 1 },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize:   14,
  },
  sub: {
    fontFamily: "Poppins_400Regular",
    fontSize:   12,
    marginTop:  1,
    lineHeight: 16,
  },
});