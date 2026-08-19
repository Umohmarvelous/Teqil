// components/chat/ChatDoodle.tsx
//
// The chat wallpaper: a tiling doodle drawn from EMILGO's own subject matter —
// road transport in Nigeria.
//
// ── Why it is drawn, not shipped as an image ────────────────────────────────
// WhatsApp and Telegram both ship a raster doodle, which means a fixed palette,
// a separate asset per density, and a visible seam if the tile is scaled. This
// is vector, so:
//   • it recolours itself for light and dark from the iOS palette, rather than
//     needing two exported PNGs;
//   • it costs a few kB of code instead of a few hundred kB of asset;
//   • it stays sharp at any density.
//
// ── Why these glyphs ───────────────────────────────────────────────────────
// A generic doodle of hearts and stars would say nothing about the app. Every
// mark here is something a driver or passenger deals with daily: a danfo bus, a
// keke, a fuel pump, a road sign, a naira coin, a route pin, a steering wheel,
// a traffic light. Someone glancing at a screenshot should be able to tell what
// the app is for.
//
// ── Why the opacity is so low ──────────────────────────────────────────────
// It is a WALLPAPER. At 0.05–0.07 it reads as texture; anything stronger and it
// competes with the message bubbles, which is the one thing a chat background
// must never do. Dark mode gets slightly more because a light mark on a dark
// field reads weaker at the same alpha.

import React from "react";
import { View, StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import Svg, { G, Path, Circle, Rect } from "react-native-svg";

import { useIOSTheme } from "@/components/ios";

/** Size of one repeat. Large enough that the eye does not catch the grid. */
const TILE = 132;

/**
 * One tile's worth of glyphs, positioned so the repeat does not read as rows.
 * Each path is drawn on a nominal 24×24 grid then placed with a transform, so
 * the shapes stay legible and easy to adjust.
 */
function DoodleTile({ colour }: { colour: string }) {
  const stroke = {
    stroke: colour,
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };

  return (
    <G>
      {/* Danfo — the yellow Lagos minibus, in outline. */}
      <G transform="translate(6,10) scale(0.86)">
        <Path {...stroke} d="M1 12h22v6H1z" />
        <Path {...stroke} d="M3 12l2-5h14l2 5" />
        <Circle {...stroke} cx="6" cy="18.5" r="2" />
        <Circle {...stroke} cx="18" cy="18.5" r="2" />
        <Path {...stroke} d="M9 7v5M15 7v5" />
      </G>

      {/* Fuel pump */}
      <G transform="translate(70,6) scale(0.78)">
        <Path {...stroke} d="M3 21V5a2 2 0 012-2h6a2 2 0 012 2v16" />
        <Path {...stroke} d="M1 21h14" />
        <Path {...stroke} d="M5 8h6" />
        <Path {...stroke} d="M16 9l3 2v7a2 2 0 01-4 0v-4" />
      </G>

      {/* Route pin */}
      <G transform="translate(100,48) scale(0.8)">
        <Path {...stroke} d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" />
        <Circle {...stroke} cx="12" cy="10" r="2.6" />
      </G>

      {/* Keke napep — the three-wheeler, front-on. */}
      <G transform="translate(14,58) scale(0.8)">
        <Path {...stroke} d="M5 17V9a5 5 0 0114 0v8" />
        <Path {...stroke} d="M3 17h18" />
        <Circle {...stroke} cx="7" cy="19.5" r="1.8" />
        <Circle {...stroke} cx="17" cy="19.5" r="1.8" />
        <Path {...stroke} d="M8 9h8" />
      </G>

      {/* Naira coin */}
      <G transform="translate(74,74) scale(0.72)">
        <Circle {...stroke} cx="12" cy="12" r="9" />
        <Path {...stroke} d="M9 8v8M15 8v8M9 8l6 8M7.5 10.5h9M7.5 13.5h9" />
      </G>

      {/* Traffic light */}
      <G transform="translate(46,96) scale(0.68)">
        <Rect {...stroke} x="7" y="2" width="10" height="18" rx="3" />
        <Circle {...stroke} cx="12" cy="7" r="1.6" />
        <Circle {...stroke} cx="12" cy="11.5" r="1.6" />
        <Circle {...stroke} cx="12" cy="16" r="1.6" />
        <Path {...stroke} d="M12 20v3" />
      </G>

      {/* Steering wheel */}
      <G transform="translate(104,100) scale(0.66)">
        <Circle {...stroke} cx="12" cy="12" r="9" />
        <Circle {...stroke} cx="12" cy="12" r="2.6" />
        <Path {...stroke} d="M12 3v6.4M4.2 16.5l5.5-3.2M19.8 16.5l-5.5-3.2" />
      </G>

      {/* Road, with its dashed centre line. */}
      <G transform="translate(0,40) scale(0.7)">
        <Path {...stroke} d="M2 22L8 2M22 22L16 2" />
        <Path {...stroke} strokeDasharray="2.5 3.5" d="M12 2v20" />
      </G>
    </G>
  );
}

export interface ChatDoodleProps {
  style?: StyleProp<ViewStyle>;
  /**
   * Override the wallpaper base. Defaults to the theme's grouped background,
   * which is what a chat should sit on.
   */
  backgroundColor?: string;
}

/**
 * Fills its parent. Drop it as the first child of the chat container and let
 * everything else stack on top.
 */
export function ChatDoodle({ style, backgroundColor }: ChatDoodleProps) {
  const t = useIOSTheme();
  const { width, height } = useWindowDimensions();
  const dark = t.scheme === "dark";

  // A tinted mark rather than plain grey: the doodle picks up the Nigerian
  // green so the wallpaper belongs to this app and not to a template.
  const colour = dark ? "#FFFFFF" : t.tint;
  const opacity = dark ? 0.07 : 0.055;

  const base = backgroundColor ?? (dark ? t.systemBackground : t.systemGroupedBackground);

  // Cover the whole window, not the measured parent: the keyboard resizes the
  // chat container, and a background sized to it would visibly re-tile on every
  // open and close.
  const cols = Math.ceil(width / TILE) + 1;
  const rows = Math.ceil(height / TILE) + 1;

  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: base }, style]}
      pointerEvents="none"
      // Decorative. Announcing "danfo bus, fuel pump, naira coin…" to a screen
      // reader on a chat screen would be actively hostile.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Tiled by hand rather than with an SVG <Pattern>: a pattern cannot
          offset alternate rows, and without that offset the repeat reads as an
          obvious grid. */}
      <Svg width={width} height={height} opacity={opacity}>
        {/* Every second row is nudged half a tile across, which is what stops
            the repeat reading as an obvious grid. */}
        {Array.from({ length: rows }).map((_, r) => (
          <G key={r} transform={`translate(${(r % 2) * (TILE / 2) - TILE / 2}, ${r * TILE})`}>
            {Array.from({ length: cols }).map((__, c) => (
              <G key={c} transform={`translate(${c * TILE}, 0)`}>
                <DoodleTile colour={colour} />
              </G>
            ))}
          </G>
        ))}
      </Svg>
    </View>
  );
}

export default ChatDoodle;
