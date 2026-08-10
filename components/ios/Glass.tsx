// components/ios/Glass.tsx
//
// The Liquid Glass primitive (iOS 26), with a real fallback everywhere else.
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
// this is genuine system glass on iOS 26.
//
// ── The four rendering paths ─────────────────────────────────────────────────
//   1. iOS 26 + native module present  → real UIGlassEffect.
//   2. iOS 25 and below, or Expo Go    → expo-blur + a material veil.
//   3. Android / web                   → expo-blur (weaker) + a heavier veil.
//   4. Reduce Transparency enabled     → flat opaque surface, no blur at all.
//
// Paths 2–4 are not degraded stand-ins bolted on afterwards: every component in
// this kit passes its own `fallbackTint`, so the non-glass path renders the
// exact material the design called for before glass existed.
//
// ── Why capability detection is defensive ────────────────────────────────────
// `isLiquidGlassAvailable()` calls `requireNativeModule('ExpoGlassEffect')`,
// which THROWS when the module isn't in the binary — Expo Go, or any build made
// before the package was added. Called at module scope that would take the whole
// app down at import time, so it is wrapped.
//
// `isGlassEffectAPIAvailable()` is a second, separate check that Expo added
// because some iOS 26 betas report the new design but don't ship the API, and
// rendering a GlassView on those builds crashes (expo/expo#40911). Both must
// pass before a GlassView is ever mounted.
//
// ── The rule that matters most ───────────────────────────────────────────────
// Apple is explicit: "limit Liquid Glass to the most important elements of your
// app", and never overlap glass on glass — that breaks the illusion of a single
// floating layer. So this belongs on the NAVIGATION AND CONTROL layer (bars,
// buttons, sheets, floating actions). Content surfaces (list groups, cards) can
// opt in where a design calls for it, but they don't get it by default.

import React from "react";
import {
  View,
  Platform,
  StyleSheet,
  AccessibilityInfo,
  type ViewProps,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { BlurView } from "expo-blur";
import {
  GlassView,
  GlassContainer,
  isLiquidGlassAvailable,
  isGlassEffectAPIAvailable,
  type GlassStyle,
} from "expo-glass-effect";

import { useIOSTheme } from "./theme";

// ─── Capability detection ────────────────────────────────────────────────────

function detectLiquidGlass(): boolean {
  // The native module only exists on iOS; on Android and web the package's
  // stubs return false, but bailing early keeps the try/catch honest.
  if (Platform.OS !== "ios") return false;
  try {
    // Is the app running with the iOS 26 design at all?
    if (!isLiquidGlassAvailable()) return false;
    // …and does this specific OS build actually expose the API? Some iOS 26
    // betas answer yes to the first question and crash on the second.
    return isGlassEffectAPIAvailable();
  } catch {
    // Native module absent — Expo Go, or a dev build predating the package.
    return false;
  }
}

/**
 * True when the real UIGlassEffect is available: iOS 26+, in a dev or
 * production build that includes `expo-glass-effect`.
 *
 * Never gate layout on this — only materials. The kit is laid out identically
 * on every path so a screen looks the same shape everywhere.
 */
export const LIQUID_GLASS = detectLiquidGlass();

// ─── Reduce Transparency, shared ─────────────────────────────────────────────
//
// One subscription for the whole app rather than one per Glass instance. A
// busy screen mounts a dozen glass surfaces, and a dozen AccessibilityInfo
// listeners for a single boolean is waste that shows up as jank on mount.

let reduceTransparency = false;
let reduceTransparencyLoaded = false;
const reduceTransparencyListeners = new Set<() => void>();
let reduceTransparencySub: { remove: () => void } | null = null;

function setReduceTransparency(value: boolean) {
  if (value === reduceTransparency && reduceTransparencyLoaded) return;
  reduceTransparency = value;
  reduceTransparencyLoaded = true;
  reduceTransparencyListeners.forEach((l) => l());
}

function subscribeReduceTransparency(listener: () => void): () => void {
  reduceTransparencyListeners.add(listener);

  if (!reduceTransparencySub) {
    reduceTransparencySub = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduceTransparency,
    );
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then(setReduceTransparency)
      .catch(() => setReduceTransparency(false));
  }

  return () => {
    reduceTransparencyListeners.delete(listener);
    if (reduceTransparencyListeners.size === 0) {
      reduceTransparencySub?.remove();
      reduceTransparencySub = null;
    }
  };
}

function getReduceTransparency() {
  return reduceTransparency;
}

/** The user's Reduce Transparency setting, live. */
export function useReduceTransparency(): boolean {
  return React.useSyncExternalStore(
    subscribeReduceTransparency,
    getReduceTransparency,
    getReduceTransparency,
  );
}

export interface GlassCapability {
  /** Render real UIGlassEffect. False when unavailable or transparency is off. */
  glass: boolean;
  /** Render a flat opaque surface — no glass, no blur. */
  flat: boolean;
  /** Render the expo-blur approximation. */
  blur: boolean;
}

/**
 * Which of the three material paths this device should take right now.
 * Components use it to decide whether to draw their own veil on top.
 */
export function useGlassCapability(): GlassCapability {
  const flat = useReduceTransparency();
  return React.useMemo(
    () => ({ glass: LIQUID_GLASS && !flat, flat, blur: !LIQUID_GLASS && !flat }),
    [flat],
  );
}

// ─── Glass ───────────────────────────────────────────────────────────────────

export interface GlassProps extends Omit<ViewProps, "style"> {
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
  /**
   * Animate a change of `variant` rather than swapping it instantly — this is
   * how Apple materialises and dematerialises glass, by animating the EFFECT
   * rather than the view's alpha.
   */
  animated?: boolean;
  /** Blur strength used only on the expo-blur path. */
  fallbackIntensity?: number;
  /**
   * The material colour to lay over the blur when real glass isn't available,
   * and to fill the surface with when Reduce Transparency is on.
   *
   * Pass the exact colour the design used before glass. This is why the
   * fallback isn't a visible downgrade: the caller keeps ownership of it, and
   * it is never drawn on top of real glass.
   */
  fallbackTint?: string;
  /** Extra veil applied only on Android/web, where the blur is much weaker. */
  androidTint?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * A Liquid Glass surface.
 *
 * On iOS 26 this is a real UIGlassEffect view; elsewhere it degrades to a
 * blurred, tinted surface, and to a flat one under Reduce Transparency. Layout
 * and geometry are identical on all three paths.
 */
export function Glass({
  variant = "regular",
  tint,
  interactive = false,
  radius,
  animated = false,
  fallbackIntensity = 60,
  fallbackTint,
  androidTint,
  style,
  children,
  ...rest
}: GlassProps) {
  const theme = useIOSTheme();
  const { glass, flat } = useGlassCapability();

  const shape: ViewStyle = radius !== undefined ? { borderRadius: radius } : {};

  // ── Flattened: no glass, no blur — a solid surface that still meets contrast.
  if (flat) {
    return (
      <View
        style={[
          shape,
          styles.clip,
          { backgroundColor: tint ?? fallbackTint ?? theme.secondarySystemBackground },
          style,
        ]}
        {...rest}
      >
        {children}
      </View>
    );
  }

  // ── Real Liquid Glass (iOS 26+). Nothing is layered on top of it: Apple's
  //    guidance is to adopt glass and drop the custom background, because a
  //    translucent fill over glass cancels out the effect you just asked for.
  if (glass && variant !== "none") {
    return (
      <GlassView
        glassEffectStyle={animated ? { style: variant, animate: true } : variant}
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

  // ── Fallback: blur plus the caller's material tint.
  //
  // Precedence runs most-specific first. `tint` is the LAST resort rather than
  // the first, because it describes how real glass should be coloured; a caller
  // that wants a different material off the glass path says so with
  // `fallbackTint`, and one that wants a different material on Android says so
  // with `androidTint`.
  const veil =
    (Platform.OS !== "ios" ? androidTint : undefined) ??
    fallbackTint ??
    tint ??
    (theme.scheme === "dark" ? "rgba(28,28,30,0.62)" : "rgba(255,255,255,0.62)");

  return (
    <View style={[shape, styles.clip, style]} {...rest}>
      <BlurView
        intensity={Platform.OS === "ios" ? fallbackIntensity : Math.round(fallbackIntensity * 0.5)}
        tint={theme.blurTint}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: veil }]} />
      {children}
    </View>
  );
}

// ─── Scrim ───────────────────────────────────────────────────────────────────

export interface GlassScrimProps extends Omit<ViewProps, "style"> {
  /** Blur strength behind the presented surface. */
  intensity?: number;
  /**
   * Darken as well as blur. Off for popovers, which iOS blurs without dimming
   * so the content behind stays readable while the menu is open.
   */
  dim?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The dimmed, blurred backdrop behind a presented surface.
 *
 * Deliberately NOT glass. Liquid Glass is the interactive layer; a scrim is
 * neither interactive nor a control, and glassing it would put glass behind
 * glass — the exact thing Apple says breaks the single-floating-layer illusion.
 * It lives here so every modal in the kit dims identically and so Reduce
 * Transparency is honoured in one place rather than five.
 */
export function GlassScrim({ intensity = 14, dim = true, style, ...rest }: GlassScrimProps) {
  const theme = useIOSTheme();
  const { flat } = useGlassCapability();

  if (flat) {
    // No blur to hide the content behind, so the scrim has to carry the
    // separation on its own — including for popovers, which normally don't dim.
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.scheme === "dark" ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0.45)" },
          style,
        ]}
        {...rest}
      />
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, style]} {...rest}>
      <BlurView
        intensity={intensity}
        tint={theme.scheme === "dark" ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />
      {dim && <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]} />}
    </View>
  );
}

// ─── Group ───────────────────────────────────────────────────────────────────

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
 * A plain passthrough wherever real glass isn't available, so it's safe to leave
 * in the tree unconditionally.
 */
export function GlassGroup({ spacing = 12, children, style, ...rest }: GlassGroupProps) {
  const { glass } = useGlassCapability();

  if (!glass) {
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
