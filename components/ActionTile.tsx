// components/ActionTile.tsx
import React, { useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FB } from "@/constants/fbPalette";
import { Dimensions } from "react-native";

const { width: W } = Dimensions.get("window");

interface ActionTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}

export default function ActionTile({ icon, label, color, onPress }: ActionTileProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateIn = () => {
    Animated.spring(scale, {
      toValue: 0.92,
      damping: 12,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  };

  const animateOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      damping: 10,
      stiffness: 180,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[styles.actionTile, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={animateIn}
        onPressOut={animateOut}
        style={styles.actionTileInner}
      >
        <View style={[styles.actionIconWrap, { backgroundColor: color + "18" }]}>
          <Ionicons name={icon} size={22} color={color} />
        </View>
        <Text style={styles.actionLabel}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  actionTile: {
    width: (W - 32 - 36 - 24) / 3,
  },
  actionTileInner: { alignItems: "center", gap: 8 },
  actionIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: FB.textPrimary,
    textAlign: "center",
    lineHeight: 16,
  },
});