// components/chat/ChatWallpaper.tsx
//
// The bottom layer of the chat. Resolves the per-chat wallpaper, falls back to
// the app-wide default, and renders one of three things: a preset gradient, a
// preset gradient with the transport doodle on it, or a photo the user picked.
//
// ── The rule this replaces ─────────────────────────────────────────────────
// `ChatDoodle` was hard-wired into `ChatScreen`, so "wallpaper" was one
// wallpaper. Everything about a chat's background now comes through here, which
// is why the picker only has to write a string.
//
// ── Opacity ────────────────────────────────────────────────────────────────
// A photo wallpaper is dimmed with a scrim VIEW, never by animating opacity on
// anything glass-adjacent (CLAUDE.md §4 rule 1). It also has to be dimmed at
// all: message bubbles have to win, and a full-brightness photo behind them
// makes both unreadable.

import React from "react";
import { View, StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { useIOSTheme } from "@/components/ios";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useSignedMedia } from "@/src/hooks/useSignedMedia";
import ChatDoodle from "@/components/chat/ChatDoodle";
import { isPhotoWallpaper, presetFor, resolveWallpaper } from "@/components/chat/wallpapers";

export interface ChatWallpaperProps {
  /** `conversation_prefs.wallpaper` for this chat, if it has one. */
  value?: string | null;
  /** Ignore the app-wide default — used by the picker to preview one swatch. */
  overrideOnly?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ChatWallpaper({ value, overrideOnly = false, style }: ChatWallpaperProps) {
  const t = useIOSTheme();
  const appDefault = useSettingsStore((s) => s.chatWallpaper);
  const { width, height } = useWindowDimensions();

  const resolved = overrideOnly ? (value ?? "doodle") : resolveWallpaper(value, appDefault);
  const photo = isPhotoWallpaper(resolved);
  const preset = presetFor(resolved);
  const dark = t.scheme === "dark";
  const stops = dark ? preset.dark : preset.light;

  const { url } = useSignedMedia(photo ? resolved : null);

  return (
    // Sized to the WINDOW, not the parent: the keyboard resizes the chat
    // container, and a background measured against it visibly re-tiles on every
    // open and close.
    <View
      style={[StyleSheet.absoluteFill, { width, height }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {photo ? (
        <>
          {url ? (
            <Image
              source={{ uri: url }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={180}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: stops[0] }]} />
          )}
          {/* Bubbles have to win. A photo at full brightness makes both it and
              the conversation unreadable. */}
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: dark ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.34)" },
            ]}
          />
        </>
      ) : (
        <LinearGradient
          colors={stops}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {!photo && preset.doodle ? (
        <ChatDoodle backgroundColor="transparent" tint={preset.doodleColour} />
      ) : null}
    </View>
  );
}

export default ChatWallpaper;
