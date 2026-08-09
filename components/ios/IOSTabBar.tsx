// components/ios/IOSTabBar.tsx
//
// The floating, fully-rounded tab bar — the shape WhatsApp uses on current iOS:
// a translucent capsule inset from the screen edges, sitting above the home
// indicator, with the selected tab marked by a filled rounded highlight behind
// it rather than by a colour change.
//
// Icons are supplied by the caller (Emilgo uses its Hugeicons set) or drawn with
// a `render` callback, which is how the profile tab shows the user's avatar.
// SF Symbols are deliberately NOT used here: the app's own icon set is part of
// its identity, and a capsule bar reads as native on its shape and material.
//
// Purely presentational — takes tabs + active + onChange. That matters because
// Emilgo's (main)/_layout.tsx is a hand-rolled tab shell, not an expo-router
// <Tabs>, so a navigator-coupled component wouldn't drop in.
//
// Screens must pad their scroll content by useTabBarInset() so the last row
// isn't trapped under the floating bar.

import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HugeiconsIcon } from "@hugeicons/react-native";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";

import { haptics } from "@/src/utils/haptics";
import { useIOSTheme, IOSFont } from "./theme";

/** Height of the capsule itself. */
export const TAB_BAR_HEIGHT = 64;
/** Gap between the capsule and the safe-area bottom. */
export const TAB_BAR_BOTTOM_GAP = 8;
/** Inset from the left/right screen edges. */
const H_MARGIN = 12;

export interface IOSTab {
  key: string;
  label: string;
  /** Hugeicons glyph for the inactive state. */
  icon?: unknown;
  /** Hugeicons glyph when selected. Falls back to `icon`. */
  iconActive?: unknown;
  /**
   * Draw something other than an icon — used for the profile tab's avatar.
   * Takes precedence over `icon`.
   */
  render?: (opts: { active: boolean; color: string; size: number }) => React.ReactNode;
  /** Badge count. 0 or undefined hides it. */
  badge?: number;
}

export interface IOSTabBarProps {
  tabs: IOSTab[];
  active: string;
  onChange: (key: string) => void;
  /** Hide labels for an icon-only bar. */
  hideLabels?: boolean;
}

/** Bottom padding a screen needs so content clears the floating bar. */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_GAP + insets.bottom;
}

function TabItem({
  tab,
  active,
  hideLabel,
  onPress,
}: {
  tab: IOSTab;
  active: boolean;
  hideLabel?: boolean;
  onPress: () => void;
}) {
  const theme = useIOSTheme();
  const [pressed, setPressed] = useState(false);

  // The capsule marks selection by the highlight behind the item, so the glyph
  // stays legible in both states rather than dimming to near-invisible.
  const color = active ? theme.label : theme.secondaryLabel;

  // Driven from state rather than by writing a shared value in the press
  // handlers: the same spring, but no mutation for the compiler to flag.
  const animStyle = useAnimatedStyle(
    () => ({
      transform: [{ scale: withSpring(pressed ? 0.9 : 1, { damping: 16, stiffness: 380 }) }],
    }),
    [pressed],
  );

  const glyph = active ? (tab.iconActive ?? tab.icon) : tab.icon;

  return (
    <Pressable
      style={styles.item}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: active }}
    >
      {/* Selected highlight — the rounded fill behind the active tab. */}
      {active && (
        <View
          pointerEvents="none"
          style={[styles.highlight, { backgroundColor: theme.tertiarySystemFill }]}
        />
      )}

      <Animated.View style={[styles.itemInner, animStyle]}>
        <View>
          {tab.render
            ? tab.render({ active, color, size: 26 })
            : glyph
              ? <HugeiconsIcon icon={glyph as never} size={25} color={color} />
              : <View style={{ width: 25, height: 25 }} />}

          {!!tab.badge && tab.badge > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.tint }]}>
              <Text style={styles.badgeText} numberOfLines={1} maxFontSizeMultiplier={1.1}>
                {tab.badge > 99 ? "99+" : tab.badge}
              </Text>
            </View>
          )}
        </View>

        {!hideLabel && (
          <Text
            numberOfLines={1}
            // Tab labels don't grow with Dynamic Type on iOS — they'd truncate.
            maxFontSizeMultiplier={1.2}
            style={[styles.label, { color, fontWeight: active ? "600" : "400" }]}
          >
            {tab.label}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

export function IOSTabBar({ tabs, active, onChange, hideLabels }: IOSTabBarProps) {
  const theme = useIOSTheme();
  const insets = useSafeAreaInsets();

  const handlePress = useCallback(
    (key: string) => {
      if (key !== active) haptics.select();
      onChange(key);
    },
    [active, onChange],
  );

  return (
    <View
      style={[
        styles.container,
        { bottom: insets.bottom + TAB_BAR_BOTTOM_GAP },
      ]}
      // The capsule floats over content; only the capsule itself takes touches.
      pointerEvents="box-none"
    >
      <View style={[styles.capsule, { shadowColor: theme.scheme === "dark" ? "#000" : "#1B2B22" }]}>
        <BlurView
          intensity={Platform.OS === "ios" ? 80 : 40}
          tint={theme.blurTint}
          style={StyleSheet.absoluteFill}
        />
        {/* Blur alone is too transparent for a floating bar (and much weaker on
            Android), so back it with the system surface colour. */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor:
                theme.scheme === "dark" ? "rgba(28,28,30,0.82)" : "rgba(255,255,255,0.86)",
            },
          ]}
        />

        <View style={styles.row}>
          {tabs.map((tab) => (
            <TabItem
              key={tab.key}
              tab={tab}
              active={tab.key === active}
              hideLabel={hideLabels}
              onPress={() => handlePress(tab.key)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  capsule: {
    marginHorizontal: H_MARGIN,
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    overflow: "hidden",
    // Lifts the capsule off the content behind it.
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 10,
  },
  row: {
    flexDirection: "row",
    height: "100%",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  highlight: {
    position: "absolute",
    left: 4,
    right: 4,
    top: 6,
    bottom: 6,
    borderRadius: 22,
  },
  itemInner: { alignItems: "center", justifyContent: "center", gap: 3 },
  label: { ...IOSFont.caption2, fontSize: 11 },
  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});

export default IOSTabBar;
