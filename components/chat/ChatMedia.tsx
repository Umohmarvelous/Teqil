// components/chat/ChatMedia.tsx
//
// What a photo, a video and a document look like inside a bubble, plus the
// full-screen viewer they open into.
//
// ── The one thing that is easy to get wrong here ───────────────────────────
// `media_url` is a PATH in a private bucket. It cannot be handed to <Image>.
// Everything in this file goes through `useSignedMedia`, and the placeholder
// while that resolves is a sized box — not a spinner in a zero-height view,
// which is what makes a chat jump as photos arrive.

import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  PlayIcon,
  Cancel01Icon,
  File01Icon,
  Download01Icon,
  Alert02Icon,
} from "@hugeicons/core-free-icons";

import { useIOSTheme, IOSAppFont } from "@/components/ios";
import { useSignedMedia } from "@/src/hooks/useSignedMedia";
import { humanFileSize } from "@/src/services/chat";

/** Widest a bubble's media may be, and the aspect it falls back to. */
const MAX_W = 250;
const DEFAULT_RATIO = 4 / 3;

function sizeFor(w?: number | null, h?: number | null) {
  const ratio = w && h && h > 0 ? w / h : DEFAULT_RATIO;
  // Very tall images become a narrow strip if only the width is capped, so the
  // height is capped too and the width follows from it.
  const height = Math.min(320, MAX_W / Math.max(0.5, Math.min(2.2, ratio)));
  return { width: Math.min(MAX_W, height * ratio), height };
}

export interface ChatMediaProps {
  stored: string | null | undefined;
  kind: "image" | "video";
  width?: number | null;
  height?: number | null;
  /** Rendered over the media, e.g. the timestamp. */
  overlay?: React.ReactNode;
  onOpen?: () => void;
  onLongPress?: () => void;
}

export function ChatMediaThumb({
  stored, kind, width, height, overlay, onOpen, onLongPress,
}: ChatMediaProps) {
  const t = useIOSTheme();
  const { url, loading, failed } = useSignedMedia(stored);
  const box = sizeFor(width, height);

  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={[styles.thumb, box, { backgroundColor: t.tertiarySystemFill }]}
    >
      {url ? (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : null}

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={t.secondaryLabel} />
        </View>
      ) : null}

      {failed ? (
        <View style={styles.centre}>
          <HugeiconsIcon icon={Alert02Icon} size={22} color={t.secondaryLabel} />
          <Text style={[styles.failText, { color: t.secondaryLabel }]}>Unavailable</Text>
        </View>
      ) : null}

      {kind === "video" && url ? (
        <View style={styles.playBadge}>
          <HugeiconsIcon icon={PlayIcon} size={20} color="#fff" />
        </View>
      ) : null}

      {overlay ? <View style={styles.mediaOverlay}>{overlay}</View> : null}
    </Pressable>
  );
}

export interface ChatFileRowProps {
  stored: string | null | undefined;
  name?: string | null;
  size?: number | null;
  isMe: boolean;
  tint: string;
  onLongPress?: () => void;
}

/** A document. Opening one hands it to the OS — the app is not a file viewer. */
export function ChatFileRow({ stored, name, size, isMe, tint, onLongPress }: ChatFileRowProps) {
  const t = useIOSTheme();
  const { url, loading } = useSignedMedia(stored);

  const open = async () => {
    if (!url) return;
    Haptics.selectionAsync();
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Pressable
      onPress={open}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={[
        styles.fileRow,
        { backgroundColor: isMe ? "rgba(255,255,255,0.16)" : t.tertiarySystemFill },
      ]}
    >
      <View style={[styles.fileIcon, { backgroundColor: isMe ? "rgba(255,255,255,0.2)" : t.systemBackground }]}>
        <HugeiconsIcon icon={File01Icon} size={20} color={tint} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.fileName, { color: tint }]} numberOfLines={1}>
          {name || "Document"}
        </Text>
        <Text style={[styles.fileMeta, { color: tint, opacity: 0.7 }]} numberOfLines={1}>
          {humanFileSize(size) || "File"}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <HugeiconsIcon icon={Download01Icon} size={18} color={tint} />
      )}
    </Pressable>
  );
}

export interface MediaViewerProps {
  visible: boolean;
  onClose: () => void;
  stored: string | null;
  kind: "image" | "video";
  caption?: string | null;
  /** Shown under the caption, e.g. "Ada · 14:02". */
  subtitle?: string;
}

/**
 * Full screen, black, chrome floating over the media.
 *
 * Deliberately its own Modal rather than a route: an image opened from a bubble
 * has to come back to the same scroll position, and pushing a route puts the
 * chat through a remount to get there.
 */
export function MediaViewer({ visible, onClose, stored, kind, caption, subtitle }: MediaViewerProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { url, loading } = useSignedMedia(visible ? stored : null);

  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        {loading ? <ActivityIndicator color="#fff" size="large" /> : null}

        {url && kind === "image" ? (
          <Image
            source={{ uri: url }}
            style={{ width, height: height - insets.top - insets.bottom }}
            contentFit="contain"
            transition={120}
          />
        ) : null}

        {url && kind === "video" ? <ViewerVideo uri={url} width={width} height={height * 0.7} /> : null}

        <Pressable
          onPress={onClose}
          style={[styles.viewerClose, { top: insets.top + 8 }]}
          hitSlop={10}
          accessibilityLabel="Close"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={22} color="#fff" />
        </Pressable>

        {caption || subtitle ? (
          <View style={[styles.viewerCaption, { paddingBottom: insets.bottom + 16 }]}>
            {subtitle ? <Text style={styles.viewerSub}>{subtitle}</Text> : null}
            {caption ? <Text style={styles.viewerCaptionText}>{caption}</Text> : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

/** Its own component because `useVideoPlayer` needs a source at mount time. */
function ViewerVideo({ uri, width, height }: { uri: string; width: number; height: number }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  return <VideoView player={player} style={{ width, height }} contentFit="contain" allowsFullscreen nativeControls />;
}

/** The upload progress ring drawn over a still-sending photo. */
export function UploadVeil({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.veil]}>
      <ActivityIndicator color="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { borderRadius: 12, overflow: "hidden", justifyContent: "center", alignItems: "center" },
  centre: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 6 },
  failText: { ...IOSAppFont.caption2 },
  playBadge: {
    position: "absolute",
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  mediaOverlay: {
    position: "absolute", right: 6, bottom: 5,
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8, backgroundColor: "rgba(0,0,0,0.38)",
  },
  veil: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },

  fileRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 10, padding: 8, minWidth: 210,
  },
  fileIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fileName: { ...IOSAppFont.subheadline, fontFamily: "Poppins_500Medium" },
  fileMeta: { ...IOSAppFont.caption2 },

  viewer: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  viewerClose: {
    position: "absolute", left: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center", justifyContent: "center",
  },
  viewerCaption: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, gap: 4 },
  viewerSub: { ...IOSAppFont.caption1, color: "rgba(255,255,255,0.7)" },
  viewerCaptionText: { ...IOSAppFont.subheadline, color: "#fff" },
});
