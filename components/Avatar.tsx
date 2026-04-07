import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";

const COLORS = [
  "#1A6B3A", "#2D5FA6", "#8B2252", "#C0621A",
  "#1A5C6B", "#5A2D82", "#6B3A1A", "#1A4A6B",
  "#3A6B1A", "#6B1A3A",
];

function getColorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

function getInitials(name: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface AvatarProps {
  name: string;
  photoUri?: string | null;
  size?: number;
  fontSize?: number;
  style?: object;
}

export default function Avatar({
  name,
  photoUri,
  size = 44,
  fontSize,
  style,
}: AvatarProps) {
  const bg = getColorForName(name || "?");
  const initials = getInitials(name || "?");
  const computedFontSize = fontSize ?? Math.floor(size * 0.38);

  if (photoUri) {
    return (
      <Image
        source={{ uri: photoUri }}
        style={[
          styles.image,
          { width: size, height: size, borderRadius: size / 2 },
          style,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        style,
      ]}
    >
      <Text style={[styles.text, { fontSize: computedFontSize }]}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    resizeMode: "cover",
  },
  text: {
    color: "#FFFFFF",
    fontFamily: "Poppins_700Bold",
    letterSpacing: 0.5,
  },
});