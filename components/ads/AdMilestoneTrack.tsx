// components/ads/AdMilestoneTrack.tsx
//
// The daily reward ladder: tiles for each milestone, a rail underneath showing
// how far along the day you are.
//
// ── What it is copying, and what it changes ─────────────────────────────────
// The structure is TeraBox's "Daily Benefits" rail — reward tiles sitting above
// a progress track with a dot under each one. That layout is worth copying
// because it answers the two questions a rewards screen has to answer at a
// glance: what do I get, and how far away is it.
//
// Two deliberate departures:
//
//   1. TeraBox wraps to a second row, which breaks the rail into two disjoint
//      segments and makes "how far along am I" genuinely hard to read. This
//      scrolls horizontally instead, so the rail is one continuous line and
//      auto-scrolls to keep the next unclaimed tile in view.
//   2. The reward is cs into the user's pool. A number
//      someone can spend on a real trip does not need a gold-coin metaphor,
//      and inventing one would obscure what they are actually earning.

import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Tick02Icon, FuelStationIcon } from "@hugeicons/core-free-icons";

import { useIOSTheme, IOSAppFont } from "@/components/ios";
import { formatReward, type AdMilestone } from "@/src/services/ads";

const TILE_W = 84;
const TILE_GAP = 10;

export interface AdMilestoneTrackProps {
  milestones: AdMilestone[];
  /** Ads watched today — where the rail's fill stops. */
  watched: number;
}

export function AdMilestoneTrack({ milestones, watched }: AdMilestoneTrackProps) {
  const t = useIOSTheme();
  const scroller = React.useRef<ScrollView>(null);

  // Every hook runs before the early return, and that ordering is load-bearing.
  // `milestones` arrives from `ad_reward_config` over the network, so this
  // component's FIRST render is always with an empty array. Bailing out above
  // the hooks meant the second render — the one with real data — called four
  // more hooks than the first, which is the "rendered more hooks than during
  // the previous render" crash, on the ads screen, every time it loaded.
  const last = milestones.length ? milestones[milestones.length - 1].at : 0;
  // Fill is measured against the FINAL rung, so the rail is a picture of the
  // whole day rather than of the current gap.
  const fraction = Math.min(1, watched / Math.max(1, last));

  const fill = useSharedValue(0);
  React.useEffect(() => {
    fill.value = withTiming(fraction, { duration: 520, easing: Easing.out(Easing.cubic) });
  }, [fraction, fill]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  // Keep the next tile the user is working towards on screen without yanking
  // the view on every render.
  const nextIndex = milestones.findIndex((m) => !m.reached);
  React.useEffect(() => {
    if (nextIndex < 0) return;
    const x = Math.max(0, (nextIndex - 1) * (TILE_W + TILE_GAP));
    const h = setTimeout(() => scroller.current?.scrollTo({ x, animated: true }), 350);
    return () => clearTimeout(h);
  }, [nextIndex]);

  if (!milestones.length) return null;

  return (
    <View>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {milestones.map((m) => (
          <Tile key={m.at} milestone={m} />
        ))}
      </ScrollView>

      {/* The rail sits under the tiles, inset by half a tile so its ends line
          up with the first and last tile's centre rather than the row's edge. */}
      <View style={styles.railWrap}>
        <View style={[styles.rail, { backgroundColor: t.tertiarySystemFill }]}>
          <Animated.View style={[styles.railFill, { backgroundColor: t.tint }, fillStyle]} />
        </View>
        <View style={styles.dots}>
          {milestones.map((m) => (
            <View
              key={m.at}
              style={[
                styles.dot,
                {
                  backgroundColor: m.reached ? t.tint : t.tertiarySystemFill,
                  borderColor: t.systemBackground,
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function Tile({ milestone }: { milestone: AdMilestone }) {
  const t = useIOSTheme();
  const on = milestone.reached;

  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: on ? t.tint + "1F" : t.secondarySystemFill,
          borderColor: on ? t.tint : "transparent",
        },
      ]}
    >
      {/* The "Collected" ribbon in the reference is a diagonal band across the
          tile. A corner tick reads the same at this size and does not fight the
          number for space. */}
      {on ? (
        <View style={[styles.ribbon, { backgroundColor: t.tint }]}>
          <HugeiconsIcon icon={Tick02Icon} size={9} color="#fff" strokeWidth={3} />
        </View>
      ) : null}

      <HugeiconsIcon
        icon={FuelStationIcon}
        size={19}
        color={on ? t.tint : t.tertiaryLabel}
        strokeWidth={2}
      />
      <Text style={[styles.amount, { color: on ? t.label : t.secondaryLabel }]} numberOfLines={1}>
        {formatReward(milestone.naira)}
      </Text>
      <Text style={[styles.at, { color: t.tertiaryLabel }]} numberOfLines={1}>
        {milestone.at} {milestone.at === 1 ? "ad" : "ads"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: TILE_GAP, paddingHorizontal: 2, paddingBottom: 10 },
  tile: {
    width: TILE_W,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 3,
    overflow: "hidden",
  },
  ribbon: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    borderBottomLeftRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  amount: { ...IOSAppFont.subheadline, fontFamily: "Poppins_700Bold" },
  at: { ...IOSAppFont.caption2 },

  railWrap: { justifyContent: "center", height: 14 },
  rail: { height: 5, borderRadius: 3, overflow: "hidden", marginHorizontal: TILE_W / 2 },
  railFill: { height: "100%", borderRadius: 3 },
  dots: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    gap: TILE_GAP,
    paddingHorizontal: 2,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    marginLeft: TILE_W / 2 - 5.5,
    marginRight: TILE_W / 2 - 5.5,
  },
});
