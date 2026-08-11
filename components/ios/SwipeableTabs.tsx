// components/ios/SwipeableTabs.tsx
//
// Twitter-style profile tabs: a header that scrolls away, a tab strip that
// pins to the top with blur when it reaches it, and panes you can swipe
// between horizontally.
//
// ── Why this isn't a PagerView ───────────────────────────────────────────────
// The obvious build is a vertical ScrollView containing a horizontal pager, but
// a pager has no intrinsic height — it must be told one — and these panes differ
// wildly (a settings list is several screens tall, a stats pane is barely one).
// Fixing a height either clips the tall pane or leaves dead space under the
// short one.
//
// So only the ACTIVE pane is mounted, inside the normal vertical scroll, and it
// sizes itself. Horizontal swiping comes from a pan gesture that fails fast on
// vertical movement, which hands the scroll straight back to the ScrollView. The
// result behaves like a pager without inheriting its layout problem.
//
// Pinning uses `stickyHeaderIndices` — the platform's own mechanism, so the
// strip sticks exactly at the top with no measurement and no jitter.

import React, { useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  type ViewStyle,
  type StyleProp,
  type RefreshControlProps,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS } from "react-native-reanimated";

import { haptics } from "@/src/utils/haptics";
import { useIOSTheme } from "./theme";
import { Glass } from "./Glass";
import { IOSSegmentedTabs, type IOSSegment } from "./IOSSegmentedTabs";

/** Horizontal travel before a swipe counts as a tab change. */
const SWIPE_DISTANCE = 60;
/** Fling speed that changes tab regardless of distance. */
const SWIPE_VELOCITY = 500;

export interface SwipeableTabsProps<T extends string = string> {
  segments: IOSSegment<T>[];
  active: T;
  onChange: (key: T) => void;
  /** Rendered above the tab strip; scrolls away. */
  header?: React.ReactNode;
  /** Pane for the active tab. */
  children: React.ReactNode;
  /** Passed to the underlying scroll view — pull-to-refresh, insets, handlers. */
  scrollProps?: object;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Corner radius on the strip's outer corners. */
  radius?: number;
}

export function SwipeableTabs<T extends string = string>({
  segments,
  active,
  onChange,
  header,
  children,
  scrollProps,
  refreshControl,
  contentContainerStyle,
  radius = 30,
}: SwipeableTabsProps<T>) {
  const theme = useIOSTheme();

  const activeIndex = useMemo(() => {
    const i = segments.findIndex((s) => s.key === active);
    return i === -1 ? 0 : i;
  }, [segments, active]);

  const step = useCallback(
    (direction: 1 | -1) => {
      const next = activeIndex + direction;
      if (next < 0 || next >= segments.length) return;
      haptics.select();
      onChange(segments[next].key);
    },
    [activeIndex, onChange, segments],
  );

  // Claims the gesture only once it's clearly horizontal; anything vertical
  // fails immediately and the ScrollView takes over, so scrolling never fights
  // the swipe.
  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onEnd((e) => {
      const far = Math.abs(e.translationX) > SWIPE_DISTANCE;
      const fast = Math.abs(e.velocityX) > SWIPE_VELOCITY;
      if (!far && !fast) return;
      runOnJS(step)(e.translationX < 0 ? 1 : -1);
    });

  return (
    <Animated.ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      // Index 1 is the tab strip: header at 0, strip at 1, pane at 2.
      stickyHeaderIndices={header ? [1] : [0]}
      contentContainerStyle={contentContainerStyle}
      refreshControl={refreshControl}
      {...scrollProps}
    >
      {header}

      {/* Pinned strip. It carries its own glass because once stuck it sits
          over scrolling content and needs a material to separate them. */}
      <View style={styles.stripWrap}>
        <Glass
          variant="regular"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={90}
          fallbackTint={theme.systemGroupedBackground}
        />
        <IOSSegmentedTabs
          segments={segments}
          active={active}
          onChange={onChange}
          radius={radius}
          rounded="top"
        />
        <View style={[styles.hairline, { backgroundColor: theme.separator }]} />
      </View>

      <GestureDetector gesture={pan}>
        <View style={styles.pane} collapsable={false}>
          {children}
        </View>
      </GestureDetector>
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  stripWrap: { overflow: "hidden" },
  hairline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  pane: { flex: 1 },
});

export default SwipeableTabs;
