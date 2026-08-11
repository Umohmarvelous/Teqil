// components/ios/IOSSegmentedTabs.tsx
//
// A segmented tab strip that reads as ONE control rather than a row of pills.
//
// The distinction matters and is easy to get wrong: if every segment carries
// its own corner radius, you get separate buttons sitting next to each other.
// What we want is a single surface whose OUTER corners are rounded and whose
// inner edges are square — so the first segment rounds only on its leading
// side, the last only on its trailing side, and everything between is flush.
//
//        ╭───────────┬───────────╮      one control
//        │    NIN    │    BVN    │
//        ╰───────────┴───────────╯
//
// By default only the TOP corners round, because this sits at the head of a
// card and its bottom edge continues into the card body. Pass `rounded="all"`
// where it stands alone.
//
// Sizing is intrinsic: segments share the width equally via flex, so the strip
// fills whatever container it's given and adapts to any screen without
// hard-coded widths.

import React from "react";
import { View, Text, Pressable, StyleSheet, type ViewStyle, type StyleProp } from "react-native";

import { haptics } from "@/src/utils/haptics";
import { useIOSTheme, IOSAppFont } from "./theme";
import { Glass } from "./Glass";

export interface IOSSegment<T extends string = string> {
  key: T;
  label: string;
}

export interface IOSSegmentedTabsProps<T extends string = string> {
  segments: IOSSegment<T>[];
  active: T;
  onChange: (key: T) => void;
  /** Corner radius of the control's outer corners. */
  radius?: number;
  /** Which corners round. 'top' suits a strip at the head of a card. */
  rounded?: "top" | "all";
  /** Underline the active segment, as an iOS tab bar does. */
  underline?: boolean;
  /** Accent for the active label and underline. Defaults to the app tint. */
  tint?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export function IOSSegmentedTabs<T extends string = string>({
  segments,
  active,
  onChange,
  radius = 30,
  rounded = "top",
  underline = true,
  tint,
  height,
  style,
}: IOSSegmentedTabsProps<T>) {
  const theme = useIOSTheme();
  const accent = tint ?? theme.tint;
  const last = segments.length - 1;

  const outer: ViewStyle =
    rounded === "all"
      ? { borderRadius: radius }
      : { borderTopLeftRadius: radius, borderTopRightRadius: radius };

  return (
    <View style={[styles.row, outer, styles.clip, height ? { height } : null, style]}>
      {segments.map((segment, i) => {
        const isActive = segment.key === active;

        // Only the outermost corners round — inner edges stay square so the
        // segments read as one surface rather than as separate buttons.
        const corners: ViewStyle = {
          borderTopLeftRadius: i === 0 ? radius : 0,
          borderBottomLeftRadius: i === 0 && rounded === "all" ? radius : 0,
          borderTopRightRadius: i === last ? radius : 0,
          borderBottomRightRadius: i === last && rounded === "all" ? radius : 0,
        };

        return (
          <Pressable
            key={segment.key}
            onPress={() => {
              if (isActive) return;
              haptics.select();
              onChange(segment.key);
            }}
            style={[styles.segment, corners]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={segment.label}
          >
            {/* Active segments take the fuller material so the selection is
                legible; inactive ones stay clear and recede. */}
            <Glass
              variant={isActive ? "regular" : "clear"}
              interactive
              style={[StyleSheet.absoluteFill, corners]}
              pointerEvents="none"
              fallbackIntensity={isActive ? 40 : 18}
              fallbackTint={isActive ? theme.systemFill : "transparent"}
            />

            <Text
              numberOfLines={1}
              style={[
                IOSAppFont.label,
                styles.label,
                { color: isActive ? accent : theme.secondaryLabel },
                isActive && styles.labelActive,
              ]}
            >
              {segment.label}
            </Text>

            {underline && (
              <View
                style={[
                  styles.underline,
                  { backgroundColor: isActive ? accent : "transparent" },
                ]}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  clip: { overflow: "hidden" },
  segment: {
    // Equal shares of whatever width the container gives us, so the strip is
    // responsive without measuring anything.
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  label: { textAlign: "center", paddingHorizontal: 6 },
  labelActive: { fontFamily: "Poppins_600SemiBold" },
  underline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
  },
});

export default IOSSegmentedTabs;
