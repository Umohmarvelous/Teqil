// components/ios/CollapsibleHeader.tsx
//
// The iOS large-title navigation bar and its collapse behaviour.
//
// At rest: the title sits LEFT in a large font, over a transparent bar.
// On scroll: the large title fades and slides up while a small CENTRED title
// fades in, and the bar background transitions to frosted glass with a hairline
// separator — the same choreography as Settings, Mail or Messages.
//
// Runs entirely on the UI thread via Reanimated's scroll handler, so it never
// stutters even while a list is being flung.
//
// Usage
// ─────
//   const scrollY = useCollapsibleScroll();
//
//   <CollapsibleHeader title="Route History" scrollY={scrollY.value} />
//   <Animated.FlatList onScroll={scrollY.onScroll} scrollEventThrottle={16}
//     contentContainerStyle={{ paddingTop: scrollY.contentInset }} … />
//
// Works with Animated.ScrollView and Animated.FlatList alike — anything that
// accepts an animated `onScroll`.

import React from "react";
import {
  View,
  Pressable,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  type SharedValue,
} from "react-native-reanimated";

import { useIOSTheme, IOSFont, IOSMetrics } from "./theme";
import { Glass } from "./Glass";

/** Height of the compact bar, excluding the status bar. */
export const NAV_BAR_HEIGHT = 44;
/** Extra height the large title occupies below the compact bar. */
export const LARGE_TITLE_HEIGHT = 52;
/** Scroll distance over which the collapse completes. */
const COLLAPSE_DISTANCE = LARGE_TITLE_HEIGHT;


export interface CollapsibleScroll {
  /** Pass to `<CollapsibleHeader scrollY={…} />`. */
  value: SharedValue<number>;
  /** Spread onto the animated scrollable. */
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  /** Top padding the scrollable needs so content starts below the header. */
  contentInset: number;
}

/**
 * Scroll plumbing for a collapsible screen. Returns the shared value, the
 * handler, and the content inset to apply.
 */
export function useCollapsibleScroll(): CollapsibleScroll {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  return {
    value: scrollY,
    onScroll,
    contentInset: insets.top + NAV_BAR_HEIGHT + LARGE_TITLE_HEIGHT,
  };
}

export interface CollapsibleHeaderProps {
  title: string;
  scrollY: SharedValue<number>;
  /**
   * When false the header renders in its resting large-title state and never
   * animates. Use it on screens with nothing scrollable — a collapsing header
   * that can't collapse reads as broken.
   */
  collapsible?: boolean;
  /** Left slot — typically a back button. */
  left?: React.ReactNode;
  /** Right slot — typically an action button. */
  right?: React.ReactNode;
  /** Subtitle shown under the large title; fades out with it. */
  subtitle?: string;
  /** Tap the compact bar to scroll back to top (iOS status-bar behaviour). */
  onTitlePress?: () => void;
  style?: ViewStyle;
}

export function CollapsibleHeader({
  title,
  scrollY,
  collapsible = true,
  left,
  right,
  subtitle,
  onTitlePress,
  style,
}: CollapsibleHeaderProps) {
  const theme = useIOSTheme();
  const insets = useSafeAreaInsets();

  const totalHeight = insets.top + NAV_BAR_HEIGHT + LARGE_TITLE_HEIGHT;

  // Frosted background + hairline fade in together as the title collapses.
  const backgroundStyle = useAnimatedStyle(() => ({
    opacity: collapsible
      ? interpolate(scrollY.value, [0, COLLAPSE_DISTANCE], [0, 1], Extrapolation.CLAMP)
      : 0,
  }));

  // Large title: fades out over the first 60% of the travel and drifts upward.
  const largeTitleStyle = useAnimatedStyle(() => {
    if (!collapsible) return { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] };
    return {
    opacity: interpolate(
      scrollY.value,
      [0, COLLAPSE_DISTANCE * 0.6],
      [1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, COLLAPSE_DISTANCE],
          [0, -12],
          Extrapolation.CLAMP,
        ),
      },
      {
        // Slight shrink as it goes, so it reads as the same title moving.
        scale: interpolate(scrollY.value, [0, COLLAPSE_DISTANCE], [1, 0.92], Extrapolation.CLAMP),
      },
    ],
    };
  });

  // Compact centred title: only appears once the large one is mostly gone.
  const compactTitleStyle = useAnimatedStyle(() => {
    if (!collapsible) return { opacity: 0, transform: [{ translateY: 8 }] };
    return {
    opacity: interpolate(
      scrollY.value,
      [COLLAPSE_DISTANCE * 0.55, COLLAPSE_DISTANCE],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [COLLAPSE_DISTANCE * 0.55, COLLAPSE_DISTANCE],
          [8, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
    };
  });

  // The whole header shrinks to just the compact bar as you scroll.
  const containerStyle = useAnimatedStyle(() => ({
    height: collapsible
      ? interpolate(
          scrollY.value,
          [0, COLLAPSE_DISTANCE],
          [totalHeight, insets.top + NAV_BAR_HEIGHT],
          Extrapolation.CLAMP,
        )
      : totalHeight,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle, style]} pointerEvents="box-none">
      {/* Frosted background, revealed on scroll */}
      <Animated.View style={[StyleSheet.absoluteFill, backgroundStyle]} pointerEvents="none">
        {/* Liquid Glass nav bar. The opacity animation lives on the wrapper
            above, so the glass itself simply fades in as content passes under
            it — which is exactly the iOS 26 behaviour. */}
        <Glass
          variant="regular"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={100}
          fallbackTint={
            theme.scheme === "dark" ? "rgba(0,0,0,0.62)" : "rgba(255,255,255,0.72)"
          }
          // Android's blur is much weaker, so its veil carries more of the load.
          androidTint={
            theme.scheme === "dark" ? "rgba(0,0,0,0.80)" : "rgba(255,255,255,0.85)"
          }
        />
        <View
          style={[styles.hairline, { backgroundColor: theme.separator, top: undefined, bottom: 0 }]}
        />
      </Animated.View>

      {/* Compact bar: back / centred title / action */}
      <View style={[styles.bar, { marginTop: insets.top }]} pointerEvents="box-none">
        <View style={styles.barSide}>{left}</View>

        <Pressable
          style={styles.barCenter}
          onPress={onTitlePress}
          disabled={!onTitlePress}
          accessibilityRole="header"
        >
          <Animated.Text
            numberOfLines={1}
            style={[IOSFont.headline, { color: theme.label }, compactTitleStyle]}
          >
            {title}
          </Animated.Text>
        </Pressable>

        <View style={[styles.barSide, { alignItems: "flex-end" }]}>{right}</View>
      </View>

      {/* Large title, left-aligned */}
      <Animated.View style={[styles.largeWrap, largeTitleStyle]} pointerEvents="none">
        <Animated.Text
          numberOfLines={1}
          // Large titles are the one place iOS caps Dynamic Type growth, to
          // stop a long title truncating at accessibility sizes.
          maxFontSizeMultiplier={1.4}
          style={[IOSFont.largeTitle, { color: theme.label }]}
        >
          {title}
        </Animated.Text>
        {subtitle ? (
          <Animated.Text
            numberOfLines={1}
            style={[IOSFont.footnote, { color: theme.secondaryLabel, marginTop: 1 }]}
          >
            {subtitle}
          </Animated.Text>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: "hidden",
  },
  hairline: { position: "absolute", left: 0, right: 0, height: IOSMetrics.hairline },
  bar: {
    height: NAV_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  barSide: { minWidth: 60, justifyContent: "center" },
  barCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  largeWrap: {
    paddingHorizontal: IOSMetrics.groupedInset,
    justifyContent: "center",
    height: LARGE_TITLE_HEIGHT,
  },
});

export default CollapsibleHeader;
