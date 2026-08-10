// components/ios/IOSScreen.tsx
//
// The standard iOS screen scaffold: semantic background, a collapsing
// large-title nav bar with a frosted backdrop, a back button that matches the
// system chevron, and scroll plumbing that already accounts for the translucent
// tab bar.
//
// This exists so migrating an existing screen is a wrap rather than a rewrite:
//
//   export default function SavedRoutes() {
//     return (
//       <IOSScreen title="Saved Routes" back>
//         <IOSListSection>…</IOSListSection>
//       </IOSScreen>
//     );
//   }
//
// Screens that own their own scrolling (FlatList, MapView, a pager) pass
// `scrollable={false}` and render whatever they like; they still get the
// background and the header.

import React from "react";
import {
  View,
  Pressable,
  StyleSheet,
  type ViewStyle,
  type StyleProp,
  type RefreshControlProps,
} from "react-native";
import Animated from "react-native-reanimated";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";

import { useIOSTheme } from "./theme";
import {
  CollapsibleHeader,
  useCollapsibleScroll,
  type CollapsibleScroll,
} from "./CollapsibleHeader";
import { useTabBarInset } from "./IOSTabBar";

export interface IOSScreenProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;

  /** Show the system back chevron. */
  back?: boolean;
  /** Called instead of router.back() when the chevron is tapped. */
  onBack?: () => void;
  /** Right-hand nav bar slot. */
  right?: React.ReactNode;

  /**
   * Wrap children in a scroll view (default). Turn off for screens that own
   * their scrolling — a FlatList, a map, a pager.
   */
  scrollable?: boolean;
  /**
   * Grouped background (#F2F2F7 light) for list-style screens, which is the
   * default. `false` gives the plain systemBackground used by content screens.
   */
  grouped?: boolean;
  /** Leave room for the translucent tab bar. On for screens inside the shell. */
  tabBarInset?: boolean;

  /**
   * For `scrollable={false}` screens that own a FlatList/SectionList: pass the
   * scroll object from `useCollapsibleScroll()` and wire its `onScroll` to your
   * list. Without it the header renders STATIC rather than collapsible, because
   * a collapsing header nothing ever scrolls is just a large title that lies
   * about being interactive.
   */
  scroll?: CollapsibleScroll;

  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

function BackChevron({ onPress }: { onPress: () => void }) {
  const theme = useIOSTheme();
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
      <SymbolView
        name="chevron.backward"
        size={22}
        tintColor={theme.tint}
        resizeMode="scaleAspectFit"
        fallback={<View style={{ width: 22, height: 22 }} />}
      />
    </Pressable>
  );
}

export function IOSScreen({
  title,
  subtitle,
  children,
  back,
  onBack,
  right,
  scrollable = true,
  grouped = true,
  tabBarInset = false,
  contentContainerStyle,
  refreshControl,
  scroll: externalScroll,
}: IOSScreenProps) {
  const theme = useIOSTheme();
  const internalScroll = useCollapsibleScroll();
  const bottomInset = useTabBarInset();

  const scroll = externalScroll ?? internalScroll;
  // Collapse only when something genuinely drives the offset: our own
  // ScrollView, or a list the caller wired up.
  const collapsible = scrollable || !!externalScroll;

  const background = grouped ? theme.systemGroupedBackground : theme.systemBackground;

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      {/* Status bar text flips with the palette, never hard-coded. */}
      <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />

      <CollapsibleHeader
        title={title}
        subtitle={subtitle}
        collapsible={collapsible}
        scrollY={scroll.value}
        left={back ? <BackChevron onPress={onBack ?? (() => router.back())} /> : undefined}
        right={right}
      />

      {scrollable ? (
        <Animated.ScrollView
          onScroll={scroll.onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          // Large-title screens keep the indicator clear of the header.
          scrollIndicatorInsets={{ top: scroll.contentInset }}
          contentContainerStyle={[
            {
              paddingTop: scroll.contentInset,
              paddingBottom: (tabBarInset ? bottomInset : 0) + 32,
            },
            contentContainerStyle,
          ]}
        >
          {children}
        </Animated.ScrollView>
      ) : (
        <View style={[styles.body, { paddingTop: scroll.contentInset }]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
});

export default IOSScreen;
