// components/ios/theme.ts
//
// iOS semantic design tokens for the native-feel component kit.
//
// Mirrors UIKit's semantic colour system (label / systemBackground / separator /
// fill levels) rather than hard-coding hexes at call sites, so every component
// adapts to light and dark automatically and stays consistent with system apps.
//
// Font: iOS system apps use San Francisco. Passing `undefined` as fontFamily
// makes React Native fall back to the system face, which IS SF on iOS and Roboto
// on Android — that's what "looks like a system app" requires. The rest of Emilgo
// uses Poppins; these components deliberately don't, so they read as native
// chrome. Override per-component with the `fontFamily` prop where you want the
// brand face instead.

import { useMemo } from "react";
import { Platform } from "react-native";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { Colors } from "@/constants/colors";

export type IOSColorScheme = "light" | "dark";

export interface IOSPalette {
  scheme: IOSColorScheme;

  /** Primary text. */
  label: string;
  secondaryLabel: string;
  tertiaryLabel: string;
  quaternaryLabel: string;

  /** Base surfaces. */
  systemBackground: string;
  secondarySystemBackground: string;
  tertiarySystemBackground: string;

  /** Grouped-table surfaces (Settings-style inset lists). */
  systemGroupedBackground: string;
  secondarySystemGroupedBackground: string;

  /** Hairlines and fills. */
  separator: string;
  opaqueSeparator: string;
  systemFill: string;
  secondarySystemFill: string;
  tertiarySystemFill: string;

  /** Standard system accents. */
  systemBlue: string;
  systemRed: string;
  systemGreen: string;
  systemOrange: string;
  systemGray: string;
  systemGray2: string;
  systemGray3: string;

  /** App accent — Emilgo green, used where a system app would use systemBlue. */
  tint: string;
  /** Scrim behind sheets and alerts. */
  scrim: string;
  /** Blur tint to pass to expo-blur. */
  blurTint: "light" | "dark" | "systemChromeMaterialLight" | "systemChromeMaterialDark";
}

const LIGHT: IOSPalette = {
  scheme: "light",

  label: "#000000",
  secondaryLabel: "rgba(60,60,67,0.60)",
  tertiaryLabel: "rgba(60,60,67,0.30)",
  quaternaryLabel: "rgba(60,60,67,0.18)",

  systemBackground: "#FFFFFF",
  secondarySystemBackground: "#F2F2F7",
  tertiarySystemBackground: "#FFFFFF",

  systemGroupedBackground: "#F2F2F7",
  secondarySystemGroupedBackground: "#FFFFFF",

  separator: "rgba(60,60,67,0.29)",
  opaqueSeparator: "#C6C6C8",
  systemFill: "rgba(120,120,128,0.20)",
  secondarySystemFill: "rgba(120,120,128,0.16)",
  tertiarySystemFill: "rgba(118,118,128,0.12)",

  systemBlue: "#007AFF",
  systemRed: "#FF3B30",
  systemGreen: "#34C759",
  systemOrange: "#FF9500",
  systemGray: "#8E8E93",
  systemGray2: "#AEAEB2",
  systemGray3: "#C7C7CC",

  tint: Colors.primary,
  scrim: "rgba(0,0,0,0.25)",
  blurTint: "systemChromeMaterialLight",
};

const DARK: IOSPalette = {
  scheme: "dark",

  label: "#FFFFFF",
  secondaryLabel: "rgba(235,235,245,0.60)",
  tertiaryLabel: "rgba(235,235,245,0.30)",
  quaternaryLabel: "rgba(235,235,245,0.18)",

  systemBackground: "#000000",
  secondarySystemBackground: "#1C1C1E",
  tertiarySystemBackground: "#2C2C2E",

  systemGroupedBackground: "#000000",
  secondarySystemGroupedBackground: "#1C1C1E",

  separator: "rgba(84,84,88,0.60)",
  opaqueSeparator: "#38383A",
  systemFill: "rgba(120,120,128,0.36)",
  secondarySystemFill: "rgba(120,120,128,0.32)",
  tertiarySystemFill: "rgba(118,118,128,0.24)",

  systemBlue: "#0A84FF",
  systemRed: "#FF453A",
  systemGreen: "#30D158",
  systemOrange: "#FF9F0A",
  systemGray: "#8E8E93",
  systemGray2: "#636366",
  systemGray3: "#48484A",

  tint: "#30D158",
  scrim: "rgba(0,0,0,0.45)",
  blurTint: "systemChromeMaterialDark",
};

/**
 * Current palette. Reads the app's own theme store (which ThemeSync already
 * keeps in step with the OS appearance) so the kit never disagrees with the
 * rest of Emilgo.
 */
export function useIOSTheme(): IOSPalette {
  const theme = useSettingsStore((s) => s.theme);
  return theme === "dark" ? DARK : LIGHT;
}

/** Non-hook read, for use outside React. */
export function getIOSTheme(): IOSPalette {
  return useSettingsStore.getState().theme === "dark" ? DARK : LIGHT;
}

// ─── Typography ──────────────────────────────────────────────────────────────
//
// The iOS text-style ramp at the default Dynamic Type size. Leave RN's
// `allowFontScaling` at its default (true) so these scale with the user's
// accessibility text-size setting — that's the Dynamic Type requirement.

export const IOSFont = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: "700" as const, letterSpacing: 0.37 },
  title1:     { fontSize: 28, lineHeight: 34, fontWeight: "700" as const, letterSpacing: 0.36 },
  title2:     { fontSize: 22, lineHeight: 28, fontWeight: "700" as const, letterSpacing: 0.35 },
  title3:     { fontSize: 20, lineHeight: 25, fontWeight: "600" as const, letterSpacing: 0.38 },
  headline:   { fontSize: 17, lineHeight: 22, fontWeight: "600" as const, letterSpacing: -0.41 },
  body:       { fontSize: 17, lineHeight: 22, fontWeight: "400" as const, letterSpacing: -0.41 },
  callout:    { fontSize: 16, lineHeight: 21, fontWeight: "400" as const, letterSpacing: -0.32 },
  subheadline:{ fontSize: 15, lineHeight: 20, fontWeight: "400" as const, letterSpacing: -0.24 },
  footnote:   { fontSize: 13, lineHeight: 18, fontWeight: "400" as const, letterSpacing: -0.08 },
  caption1:   { fontSize: 12, lineHeight: 16, fontWeight: "400" as const, letterSpacing: 0 },
  caption2:   { fontSize: 11, lineHeight: 13, fontWeight: "400" as const, letterSpacing: 0.07 },
};

export type IOSFontStyle = keyof typeof IOSFont;

/** Standard iOS metrics. */
export const IOSMetrics = {
  /** Inset-grouped list side margin. */
  groupedInset: 16,
  /** Corner radius of an inset-grouped card. */
  groupedRadius: 10,
  /** Sheet / large modal corner radius. */
  sheetRadius: 12,
  /** Alert corner radius. */
  alertRadius: 14,
  /** Minimum tappable target per the HIG. */
  minTouchTarget: 44,
  /** Standard row height. */
  rowHeight: 44,
  hairline: Platform.select({ ios: 0.33, default: 0.5 }) as number,
};

/** Convenience: a text style object for a given ramp entry + colour. */
export function useIOSTextStyle(style: IOSFontStyle, color?: string) {
  const theme = useIOSTheme();
  return useMemo(
    () => ({ ...IOSFont[style], color: color ?? theme.label }),
    [style, color, theme.label],
  );
}
