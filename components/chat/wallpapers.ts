// components/chat/wallpapers.ts
//
// The wallpaper catalogue, and the one function that decides what a chat is
// actually sitting on.
//
// ── Why a key and not a colour ─────────────────────────────────────────────
// `conversation_prefs.wallpaper` stores a KEY ('doodle', 'sunset', …) or a
// storage path for a picked photo. Storing a colour instead would freeze the
// choice against one theme: "plain" has to be near-white in light mode and
// near-black in dark, and a stored `#FFFFFF` cannot do that. The key survives a
// palette change; a hex does not.
//
// ── Resolution order ───────────────────────────────────────────────────────
//   this chat's wallpaper → the app-wide default → 'doodle'
// which is what makes "set for all chats" in the picker meaningful without
// having to write a row for every conversation the user has ever opened.

export type WallpaperKey =
  | "doodle"
  | "plain"
  | "ocean"
  | "sunset"
  | "forest"
  | "midnight"
  | "sand"
  | "ink";

export interface WallpaperPreset {
  key: WallpaperKey;
  label: string;
  /** Two stops, light mode then dark mode. A single-colour preset repeats it. */
  light: [string, string];
  dark: [string, string];
  /** Draw the transport doodle on top. */
  doodle: boolean;
  /** Tint for the doodle marks; falls back to the app tint. */
  doodleColour?: string;
}

export const WALLPAPERS: WallpaperPreset[] = [
  // The default, and the app's own identity: danfos, keke, fuel pumps.
  { key: "doodle",   label: "Emilgo",   light: ["#F2F4F7", "#F2F4F7"], dark: ["#0B0F14", "#0B0F14"], doodle: true },
  { key: "plain",    label: "Plain",    light: ["#FFFFFF", "#FFFFFF"], dark: ["#000000", "#000000"], doodle: false },
  { key: "ocean",    label: "Ocean",    light: ["#DDF0FF", "#EAF7FF"], dark: ["#06192B", "#0A2338"], doodle: true, doodleColour: "#1B7FBF" },
  { key: "sunset",   label: "Sunset",   light: ["#FFE7D3", "#FFD9E0"], dark: ["#2A1410", "#3A1A22"], doodle: true, doodleColour: "#D9743C" },
  { key: "forest",   label: "Forest",   light: ["#DFF3E4", "#EDF9EF"], dark: ["#08200F", "#0D2C17"], doodle: true, doodleColour: "#009A43" },
  { key: "sand",     label: "Sand",     light: ["#F6EEDC", "#FBF6EA"], dark: ["#241E12", "#2E2718"], doodle: true, doodleColour: "#A9873F" },
  { key: "midnight", label: "Midnight", light: ["#20242C", "#161A21"], dark: ["#0A0C10", "#05070A"], doodle: true, doodleColour: "#7C8BA1" },
  { key: "ink",      label: "Ink",      light: ["#E7E7EE", "#F1F1F6"], dark: ["#101018", "#17171F"], doodle: false },
];

export const DEFAULT_WALLPAPER: WallpaperKey = "doodle";

const BY_KEY = new Map(WALLPAPERS.map((w) => [w.key, w]));

/** A picked photo is stored as a bucket path; presets never contain a slash. */
export function isPhotoWallpaper(value: string | null | undefined): boolean {
  return !!value && value.includes("/");
}

export function presetFor(value: string | null | undefined): WallpaperPreset {
  if (!value || isPhotoWallpaper(value)) return BY_KEY.get(DEFAULT_WALLPAPER)!;
  return BY_KEY.get(value as WallpaperKey) ?? BY_KEY.get(DEFAULT_WALLPAPER)!;
}

/**
 * What this chat should render, given the per-chat setting and the app default.
 * Returns the raw value, so a photo path survives — `ChatWallpaper` decides.
 */
export function resolveWallpaper(
  perChat: string | null | undefined,
  appDefault: string | null | undefined,
): string {
  return perChat ?? appDefault ?? DEFAULT_WALLPAPER;
}
