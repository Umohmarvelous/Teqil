// components/ios/Glass.tsx
//
// The Liquid Glass primitive (iOS 26), with an honest fallback.
//
// ── What Liquid Glass actually is ────────────────────────────────────────────
// Per WWDC25 "Build a UIKit app with the new design", Liquid Glass is NOT just a
// stronger blur. UIBlurEffect is a visual treatment; Liquid Glass is an
// INTERACTIVE LAYER that floats above content, adapts its own light/dark
// appearance to whatever is behind it, gets more opaque as it grows and clearer
// as it shrinks, and can materialise/dematerialise and merge with neighbouring
// glass like droplets.
//
// `expo-glass-effect` binds the real UIGlassEffect / UIGlassContainerEffect, so
// this is genuine system glass on iOS 26 — not an approximation. Everywhere else
// (iOS 25 and below, Android, Expo Go, or when the user has Reduce Transparency
// on) it falls back to expo-blur, which is the closest honest approximation.
//
// ── The rule that matters most ───────────────────────────────────────────────
// Apple is explicit: "limit Liquid Glass to the most important elements of your
// app", and never overlap glass on glass — that breaks the illusion of a single
// floating layer. So this belongs on the NAVIGATION AND CONTROL layer (bars,
// buttons, sheets, floating actions) and NOT on content (list rows, cards,
// table cells). Wrapping everything in glass is the failure mode, not the goal.

import React from "react";
import { View, StyleSheet, AccessibilityInfo, type ViewProps, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import {
  GlassView,
  GlassContainer,
  isLiquidGlassAvailable,
  type GlassStyle,
} from "expo-glass-effect";

import { useIOSTheme } from "./theme";

/** True when the real UIGlassEffect is available (iOS 26+, dev/production build). */
export const LIQUID_GLASS = isLiquidGlassAvailable();

export interface GlassProps extends ViewProps {
  /**
   * 'regular' — the default; adapts opacity to size and background.
   * 'clear'   — maximum transparency, for glass over rich imagery.
   * 'none'    — no effect (use to disable per-instance without unmounting).
   */
  variant?: GlassStyle;
  /**
   * Tint. Supplying one gives "prominent" glass — the equivalent of UIKit's
   * `.prominentGlass()` button configuration. Leave undefined for plain glass.
   */
  tint?: string;
  /**
   * Scale/bounce on touch. Apple enables this for glass the user actually
   * presses; leave it off for passive chrome like a bar background.
   */
  interactive?: boolean;
  /** Corner radius. Glass defaults to a capsule, so pass one for anything else. */
  radius?: number;
  /** Blur strength used only by the non-glass fallback. */
  fallbackIntensity?: number;
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
}

/**
 * A Liquid Glass surface.
 *
 * On iOS 26 this is a real UIGlassEffect view; elsewhere it degrades to a
 * blurred, lightly tinted surface so layout and contrast stay identical.
 */
export function Glass({
  variant = "regular",
  tint,
  interactive = false,
  radius,
  fallbackIntensity = 60,
  style,
  children,
  ...rest
}: GlassProps) {
  const theme = useIOSTheme();
  const [reduceTransparency, setReduceTransparency] = React.useState(false);

  // Reduce Transparency is an accessibility setting, not a preference we can
  // ignore: when it's on, the system flattens glass and so must we.
  React.useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((v) => {
      if (alive) setReduceTransparency(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", (v) =>
      setReduceTransparency(v),
    );
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);

  const shape: ViewStyle = radius !== undefined ? { borderRadius: radius } : {};

  // ── Flattened: no glass, no blur — a solid surface that still meets contrast.
  if (reduceTransparency) {
    return (
      <View
        style={[
          shape,
          styles.clip,
          { backgroundColor: tint ?? theme.secondarySystemBackground },
          style,
        ]}
        {...rest}
      >
        {children}
      </View>
    );
  }

  // ── Real Liquid Glass (iOS 26+).
  if (LIQUID_GLASS && variant !== "none") {
    return (
      <GlassView
        glassEffectStyle={variant}
        tintColor={tint}
        isInteractive={interactive}
        // The app has its own theme toggle, so the glass must follow that
        // rather than the system appearance, or the two can disagree.
        colorScheme={theme.scheme}
        style={[shape, styles.clip, style]}
        {...rest}
      >
        {children}
      </GlassView>
    );
  }

  // ── Fallback: blur + a material tint, matching the kit's existing surfaces.
  return (
    <View style={[shape, styles.clip, style]} {...rest}>
      <BlurView intensity={fallbackIntensity} tint={theme.blurTint} style={StyleSheet.absoluteFill} />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor:
              tint ??
              (theme.scheme === "dark" ? "rgba(28,28,30,0.62)" : "rgba(255,255,255,0.62)"),
          },
        ]}
      />
      {children}
    </View>
  );
}

export interface GlassGroupProps extends ViewProps {
  /**
   * Distance at which neighbouring glass children begin to merge. Apple's
   * container effect makes nearby glass flow together like droplets; without a
   * container, adjacent glass elements just overlap — which Apple calls out as
   * the thing that breaks the single-floating-layer illusion.
   */
  spacing?: number;
  children?: React.ReactNode;
}

/**
 * Groups multiple Glass surfaces so they blend and merge correctly.
 * Wrap clusters of glass controls (a toolbar's buttons, a segmented row) in one.
 * A no-op passthrough wherever real glass isn't available.
 */
export function GlassGroup({ spacing = 12, children, style, ...rest }: GlassGroupProps) {
  if (!LIQUID_GLASS) {
    return (
      <View style={style} {...rest}>
        {children}
      </View>
    );
  }
  return (
    <GlassContainer spacing={spacing} style={style} {...rest}>
      {children}
    </GlassContainer>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
});

export default Glass;
