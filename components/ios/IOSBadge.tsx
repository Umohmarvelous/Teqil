// components/ios/IOSBadge.tsx
//
// The red count that sits on a tab, a bell or an avatar.
//
// One component so every badge in the app is the same size, the same red and
// caps the same way. Badges drawn ad-hoc per screen drift immediately: one shows
// "100", the next shows "99+", a third renders a 0 because nobody checked.
//
// Rules, matching iOS:
//   · zero renders NOTHING — a badge showing 0 is a bug, not a state
//   · counts above `max` render "99+" rather than growing the pill
//   · a `dot` variant for "something changed" where the number doesn't matter
//
// It positions itself against the parent, so the caller wraps the icon in a
// relatively-positioned view and drops this in beside it.

import React from "react";
import { View, Text, StyleSheet, type ViewStyle, type StyleProp } from "react-native";

import { Colors } from "@/constants/colors";

export interface IOSBadgeProps {
  count?: number;
  /** Render a plain dot instead of a number. */
  dot?: boolean;
  /** Counts above this show as "<max>+". */
  max?: number;
  /** Ring colour, so the badge reads as lifted off whatever is behind it. */
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
}

export function IOSBadge({ count = 0, dot, max = 99, borderColor, style }: IOSBadgeProps) {
  if (!dot && count <= 0) return null;

  if (dot) {
    return (
      <View
        style={[
          styles.dot,
          borderColor ? { borderWidth: 2, borderColor } : null,
          style,
        ]}
        accessibilityLabel="New"
      />
    );
  }

  const label = count > max ? `${max}+` : String(count);

  return (
    <View
      style={[styles.badge, borderColor ? { borderWidth: 2, borderColor } : null, style]}
      accessibilityLabel={`${count} unread`}
    >
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: Colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10,
    lineHeight: 13,
    color: "#FFFFFF",
  },
  dot: {
    position: "absolute",
    top: -2,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.error,
  },
});

export default IOSBadge;
