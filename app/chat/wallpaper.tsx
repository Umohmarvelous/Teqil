// app/chat/wallpaper.tsx
//
// The wallpaper picker. Reached from a chat's overflow menu, and from Settings
// with no conversation id — the same screen, one scope switch.
//
// ── Two scopes, and why both exist ─────────────────────────────────────────
// Per-chat is what people actually want a wallpaper FOR: telling one thread
// apart from another at a glance. An app-wide default is what stops that
// becoming a chore — set it once and every chat that has not been given its own
// follows. `resolveWallpaper()` is the whole rule: per-chat, then default, then
// the built-in doodle.
//
// ── The preview is the real thing ──────────────────────────────────────────
// Each swatch renders `ChatWallpaper` itself with two sample bubbles on top,
// not a flat colour chip. A background is only judged against the bubbles that
// have to be legible on it, and a chip cannot show that.

import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { ImageAdd01Icon, CheckmarkCircle02Icon, Delete02Icon } from "@hugeicons/core-free-icons";

import { IOSScreen, useIOSTheme, IOSAppFont, iosAlert, IOSToggle } from "@/components/ios";
import ChatWallpaper from "@/components/chat/ChatWallpaper";
import { WALLPAPERS, DEFAULT_WALLPAPER } from "@/components/chat/wallpapers";
import { useMessagesStore } from "@/src/store/useMessagesStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { uploadChatMedia } from "@/src/services/chat";

/** A swatch: the real wallpaper with the two bubbles that have to sit on it. */
function Swatch({
  value, label, selected, onPress,
}: { value: string; label: string; selected: boolean; onPress: () => void }) {
  const t = useIOSTheme();
  return (
    <Pressable onPress={onPress} style={styles.swatchCell}>
      <View style={[styles.swatch, selected && { borderColor: t.tint, borderWidth: 2.5 }]}>
        <ChatWallpaper value={value} overrideOnly />
        <View style={styles.sampleThem}>
          <View style={[styles.sampleBubble, { backgroundColor: t.secondarySystemGroupedBackground }]} />
        </View>
        <View style={styles.sampleMe}>
          <View style={[styles.sampleBubble, { backgroundColor: t.tint, width: 46 }]} />
        </View>
        {selected ? (
          <View style={[styles.tick, { backgroundColor: t.tint }]}>
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} color="#fff" strokeWidth={2.4} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.swatchLabel, { color: t.secondaryLabel }]}>{label}</Text>
    </Pressable>
  );
}

export default function WallpaperScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();
  const t = useIOSTheme();

  const conversations = useMessagesStore((s) => s.conversations);
  const setPrefs = useMessagesStore((s) => s.setPrefs);
  const appDefault = useSettingsStore((s) => s.chatWallpaper);
  const setAppDefault = useSettingsStore((s) => s.setChatWallpaper);

  const conv = conversations.find((c) => c.id === conversationId);
  const perChat = !!conversationId;

  // With no conversation this screen can only be editing the default, so the
  // switch is forced on rather than offered and ignored.
  const [applyToAll, setApplyToAll] = useState(!perChat);
  const [busy, setBusy] = useState(false);

  const current = perChat ? (conv?.wallpaper ?? appDefault ?? DEFAULT_WALLPAPER) : (appDefault ?? DEFAULT_WALLPAPER);

  const apply = async (value: string) => {
    Haptics.selectionAsync();
    if (applyToAll || !perChat) setAppDefault(value);
    if (perChat && conversationId) await setPrefs(conversationId, { wallpaper: value });
  };

  const reset = async () => {
    Haptics.selectionAsync();
    if (applyToAll || !perChat) setAppDefault(null);
    if (perChat && conversationId) await setPrefs(conversationId, { clearWallpaper: true });
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      iosAlert("Photo access needed", "Allow photo access in Settings to use one of your pictures.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (res.canceled || !res.assets?.length) return;

    // A wallpaper has to live somewhere both this device and the next one can
    // reach, and the only private bucket the user can write to is keyed by
    // conversation. Without a conversation there is nowhere to put it, so the
    // app-wide case keeps the local uri — it is a device preference either way.
    if (!perChat || !conversationId) {
      await apply(res.assets[0].uri);
      return;
    }

    setBusy(true);
    try {
      const up = await uploadChatMedia(conversationId, res.assets[0].uri, "image");
      await apply(up.path);
    } catch (e: any) {
      iosAlert("Could not set wallpaper", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <IOSScreen
      title="Wallpaper"
      subtitle={perChat ? conv?.participant_name ?? undefined : "All chats"}
      back
      tabBarInset={false}
    >
      {perChat ? (
        <View style={[styles.allRow, { backgroundColor: t.secondarySystemGroupedBackground }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.allTitle, { color: t.label }]}>Set for all chats</Text>
            <Text style={[styles.allText, { color: t.tertiaryLabel }]}>
              Chats with their own wallpaper keep it.
            </Text>
          </View>
          <IOSToggle value={applyToAll} onValueChange={setApplyToAll} />
        </View>
      ) : null}

      <Text style={[styles.section, { color: t.tertiaryLabel }]}>PRESETS</Text>
      <View style={styles.grid}>
        {WALLPAPERS.map((w) => (
          <Swatch
            key={w.key}
            value={w.key}
            label={w.label}
            selected={current === w.key}
            onPress={() => apply(w.key)}
          />
        ))}
      </View>

      <Text style={[styles.section, { color: t.tertiaryLabel }]}>YOUR PHOTOS</Text>
      <Pressable
        onPress={pickPhoto}
        disabled={busy}
        style={[styles.photoBtn, { backgroundColor: t.secondarySystemGroupedBackground }]}
      >
        {busy ? (
          <ActivityIndicator color={t.tint} />
        ) : (
          <HugeiconsIcon icon={ImageAdd01Icon} size={22} color={t.tint} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.photoTitle, { color: t.label }]}>Choose a photo</Text>
          <Text style={[styles.photoText, { color: t.tertiaryLabel }]}>
            {perChat
              ? "Stored privately with this conversation, so it follows you to a new device."
              : "Kept on this device only."}
          </Text>
        </View>
      </Pressable>

      <Pressable onPress={reset} style={[styles.resetBtn, { borderColor: t.separator }]}>
        <HugeiconsIcon icon={Delete02Icon} size={17} color={t.systemRed} />
        <Text style={[styles.resetText, { color: t.systemRed }]}>
          {perChat && !applyToAll ? "Use the default for this chat" : "Reset to the default"}
        </Text>
      </Pressable>

      <View style={{ height: 40 }} />
    </IOSScreen>
  );
}

const styles = StyleSheet.create({
  allRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginTop: 4, padding: 14, borderRadius: 14,
  },
  allTitle: { ...IOSAppFont.subheadline, fontFamily: "Poppins_500Medium" },
  allText: { ...IOSAppFont.caption1, marginTop: 1 },

  section: { ...IOSAppFont.caption1, letterSpacing: 0.6, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, rowGap: 14 },
  swatchCell: { width: "25%", alignItems: "center", gap: 6, paddingHorizontal: 4 },
  swatch: {
    width: "100%", aspectRatio: 0.62, borderRadius: 12, overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(120,120,128,0.3)",
    justifyContent: "flex-end", paddingBottom: 8, gap: 5,
  },
  sampleThem: { alignItems: "flex-start", paddingLeft: 6 },
  sampleMe: { alignItems: "flex-end", paddingRight: 6 },
  sampleBubble: { width: 34, height: 11, borderRadius: 5 },
  tick: { position: "absolute", top: 5, right: 5, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  swatchLabel: { ...IOSAppFont.caption2 },

  photoBtn: {
    flexDirection: "row", alignItems: "center", gap: 14,
    marginHorizontal: 16, padding: 16, borderRadius: 14,
  },
  photoTitle: { ...IOSAppFont.subheadline, fontFamily: "Poppins_500Medium" },
  photoText: { ...IOSAppFont.caption1, marginTop: 2, lineHeight: 16 },

  resetBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginHorizontal: 16, marginTop: 22, paddingVertical: 14,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
  },
  resetText: { ...IOSAppFont.subheadline, fontFamily: "Poppins_500Medium" },
});
