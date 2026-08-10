// components/ios/IOSToggle.tsx
//
// A Liquid Glass switch.
//
// React Native's <Switch> renders UISwitch, which is opaque: `trackColor` fills
// it with a flat colour and there is no way to make the track translucent. So a
// glass toggle has to be drawn rather than configured.
//
// Geometry is UISwitch's, to the point: 51×31 track, 27pt thumb, 2pt inset,
// capsule corners. The travel and spring are tuned to match the real thing —
// it settles quickly with a small overshoot, which is what makes a hand-built
// switch feel like a system one rather than a slider.
//
// The track is glass: neutral when off, accent-tinted when on. The thumb stays
// opaque white, exactly as UISwitch does, because a translucent thumb over a
// translucent track loses the edge that tells you where the control is.

import React, { useCallback } from "react";
import { Pressable, View, StyleSheet, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, withSpring, withTiming } from "react-native-reanimated";

import { haptics } from "@/src/utils/haptics";
import { useIOSTheme } from "./theme";
import { Glass } from "./Glass";

const TRACK_W = 51;
const TRACK_H = 31;
const INSET = 2;
const THUMB = TRACK_H - INSET * 2;
const TRAVEL = TRACK_W - THUMB - INSET * 2;

/** UISwitch settles fast with a touch of overshoot. */
const SPRING = { damping: 18, stiffness: 320, mass: 0.7 };

export interface IOSToggleProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  /** Track tint when on. Defaults to the app accent. */
  tint?: string;
  /** Suppress the selection haptic. */
  noHaptics?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

export function IOSToggle({
  value,
  onValueChange,
  disabled,
  tint,
  noHaptics,
  accessibilityLabel,
  style,
}: IOSToggleProps) {
  const theme = useIOSTheme();
  const accent = tint ?? theme.tint;

  const toggle = useCallback(() => {
    if (disabled) return;
    if (!noHaptics) haptics.select();
    onValueChange(!value);
  }, [disabled, noHaptics, onValueChange, value]);

  // Driven straight off the prop rather than a shared value, so the switch can
  // never disagree with the state it represents — a controlled switch that
  // animates from its own copy is how you get a toggle stuck in the wrong spot.
  const thumbStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: withSpring(value ? TRAVEL : 0, SPRING) }] }),
    [value],
  );

  const onTrackStyle = useAnimatedStyle(
    () => ({ opacity: withTiming(value ? 1 : 0, { duration: 180 }) }),
    [value],
  );

  return (
    <Pressable
      onPress={toggle}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={[styles.track, disabled && styles.disabled, style]}
    >
      {/* Off state: neutral glass. */}
      <Glass
        variant="regular"
        radius={TRACK_H / 2}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        fallbackIntensity={30}
        fallbackTint={theme.systemFill}
      />

      {/* On state: the same surface tinted with the accent, faded in over it.
          Two stacked surfaces rather than one changing colour, so the
          transition crossfades instead of stepping. */}
      <Animated.View style={[StyleSheet.absoluteFill, onTrackStyle]} pointerEvents="none">
        <Glass
          variant="regular"
          tint={accent}
          radius={TRACK_H / 2}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={30}
          fallbackTint={accent}
        />
      </Animated.View>

      <Animated.View style={[styles.thumb, thumbStyle]} pointerEvents="none">
        <View style={styles.thumbFace} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    justifyContent: "center",
    padding: INSET,
    overflow: "hidden",
  },
  disabled: { opacity: 0.5 },
  thumb: { width: THUMB, height: THUMB },
  thumbFace: {
    flex: 1,
    borderRadius: THUMB / 2,
    backgroundColor: "#FFFFFF",
    // UISwitch's thumb sits proud of the track; without the shadow it reads as
    // a hole punched in the glass rather than a knob resting on it.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
});

export default IOSToggle;
