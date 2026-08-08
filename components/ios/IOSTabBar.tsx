// components/ios/IOSTabBar.tsx
//
// The frosted translucent tab bar used by WhatsApp / Instagram / every system
// app: content scrolls *under* it, the blur picks up what's behind, and a
// hairline separates it from the content.
//
// Purely presentational — it takes tabs + active + onChange. That matters here
// because Emilgo's (main)/_layout.tsx is a hand-rolled tab shell rather than an
// expo-router <Tabs>, so a navigator-coupled component wouldn't drop in.
//
// Use with the existing custom shell:
//   <IOSTabBar tabs={TABS} active={tab} onChange={setTab} />
//
// Or with an expo-router / React Navigation navigator:
//   <Tabs
//     screenOptions={{ headerShown: false, tabBarStyle: { position: "absolute" } }}
//     tabBar={(props) => (
//       <IOSTabBar
//         tabs={props.state.routes.map((r) => ({ key: r.key, label: …, symbol: … }))}
//         active={props.state.routes[props.state.index].key}
//         onChange={(key) => props.navigation.navigate(
//           props.state.routes.find((r) => r.key === key)!.name)}
//       />
//     )}
//   />
//
// Screens must pad their scroll content by TAB_BAR_TOTAL_HEIGHT (or use
// useTabBarInset()) so the last row isn't trapped under the bar.

import React, { useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, withSpring, useSharedValue } from "react-native-reanimated";

import { useIOSTheme, IOSFont, IOSMetrics } from "./theme";

/** Bar height above the home indicator. */
export const TAB_BAR_HEIGHT = 49;

export interface IOSTab {
  key: string;
  label: string;
  /** SF Symbol for the inactive state, e.g. "house". */
  symbol: SymbolViewProps["name"];
  /** SF Symbol when active — iOS uses the `.fill` variant, e.g. "house.fill". */
  symbolActive?: SymbolViewProps["name"];
  /** Red badge count. 0 or undefined hides it. */
  badge?: number;
}

export interface IOSTabBarProps {
  tabs: IOSTab[];
  active: string;
  onChange: (key: string) => void;
  /** Hide labels for an icon-only bar. */
  hideLabels?: boolean;
}

/** Padding a screen needs at the bottom of its scroll content. */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + insets.bottom;
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
  const scale = useSharedValue(1);

  const color = active ? theme.tint : theme.systemGray;
  const symbol = active ? tab.symbolActive ?? tab.symbol : tab.symbol;

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      style={styles.item}
      onPress={onPress}
      // The subtle press-in bounce a system tab bar has.
      onPressIn={() => {
        scale.value = withSpring(0.88, { damping: 18, stiffness: 400 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 350 });
      }}
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: active }}
    >
      <Animated.View style={[styles.itemInner, animStyle]}>
        <View>
          <SymbolView
            name={symbol}
            size={26}
            tintColor={color}
            resizeMode="scaleAspectFit"
            // Android / web get no SF Symbols; the label carries the meaning.
            fallback={<View style={{ width: 26, height: 26 }} />}
          />
          {!!tab.badge && tab.badge > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.systemRed }]}>
              <Text style={styles.badgeText} numberOfLines={1}>
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
            style={[styles.label, { color }]}
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
      if (key !== active) Haptics.selectionAsync();
      onChange(key);
    },
    [active, onChange],
  );

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <BlurView
        intensity={Platform.OS === "ios" ? 100 : 60}
        tint={theme.blurTint}
        style={StyleSheet.absoluteFill}
      />
      {/* Android's blur is much weaker — back it so the bar stays legible. */}
      {Platform.OS !== "ios" && (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor:
                theme.scheme === "dark" ? "rgba(0,0,0,0.86)" : "rgba(255,255,255,0.90)",
            },
          ]}
        />
      )}

      <View style={[styles.hairline, { backgroundColor: theme.separator }]} />

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
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  hairline: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: IOSMetrics.hairline,
  },
  row: { flexDirection: "row", height: TAB_BAR_HEIGHT },
  item: { flex: 1, alignItems: "center", justifyContent: "center" },
  itemInner: { alignItems: "center", justifyContent: "center", gap: 2 },
  label: { ...IOSFont.caption2, fontSize: 10, fontWeight: "500" },
  badge: {
    position: "absolute",
    top: -3,
    right: -9,
    minWidth: 17,
    height: 17,
    borderRadius: 8.5,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
});

export default IOSTabBar;
