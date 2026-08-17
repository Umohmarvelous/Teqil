// components/feed/PostMedia.tsx
//
// Attached media: the in-feed gallery, and the fullscreen viewer it opens.
//
// ── Layout ──────────────────────────────────────────────────────────────────
// One image gets its own aspect ratio (capped, so a very tall screenshot cannot
// push the next post off screen). Two, three and four use fixed mosaics, the way
// Twitter and Instagram both do it, because a ragged grid makes a timeline feel
// unstable while scrolling.
//
// ── Video ───────────────────────────────────────────────────────────────────
// In-feed video is muted, looping, and only plays while its cell is on screen —
// the parent list drives that through `active`. Tapping opens the fullscreen
// player, which is where sound and controls live. Playing several videos at once
// off screen is the single fastest way to kill a feed's frame rate and a phone's
// battery.
//
// ── Why no opacity animation anywhere near the glass ────────────────────────
// The controls bar sits on Glass, and animating opacity on a GlassView or any
// ancestor renders the effect wrong (expo/expo#41024). Controls therefore
// materialise via `present` and move on translate only.

import React from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Modal,
  Dimensions,
  ActivityIndicator,
  StatusBar,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { useEvent } from "expo";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  PlayIcon,
  PauseIcon,
  Cancel01Icon,
  VolumeHighIcon,
  VolumeOffIcon,
} from "@hugeicons/core-free-icons";
import * as Haptics from "expo-haptics";
import { Glass } from "@/components/ios";
import { IOSAppFont } from "@/components/ios/theme";
import type { PostMedia as Media } from "@/src/services/feed";

const SCREEN = Dimensions.get("window");

/** A single image may not eat more than this share of the screen height. */
const MAX_SINGLE_RATIO = 0.62;

function clampRatio(m: Media, width: number) {
  const natural = m.width && m.height ? m.width / m.height : 4 / 5;
  const maxH = SCREEN.height * MAX_SINGLE_RATIO;
  const h = width / natural;
  return h > maxH ? width / maxH : natural;
}

function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// IN-FEED VIDEO
// ═════════════════════════════════════════════════════════════════════════════

function InlineVideo({
  media,
  active,
  onPress,
  radius,
}: {
  media: Media;
  active: boolean;
  onPress: () => void;
  radius: number;
}) {
  const player = useVideoPlayer(media.url, (p) => {
    p.loop = true;
    p.muted = true;
  });

  React.useEffect(() => {
    // Guarded because the player is torn down when the cell unmounts and a
    // late effect would call into a released native object.
    try {
      if (active) player.play();
      else player.pause();
    } catch {}
  }, [active, player]);

  return (
    <Pressable onPress={onPress} style={[styles.fill, { borderRadius: radius }]}>
      <VideoView
        player={player}
        style={styles.fill}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
      <View style={styles.mutedPill} pointerEvents="none">
        <HugeiconsIcon icon={VolumeOffIcon} size={13} color="#fff" strokeWidth={2} />
      </View>
      {media.duration ? (
        <View style={styles.durationPill} pointerEvents="none">
          <Text style={styles.durationText}>{fmtTime(media.duration)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FULLSCREEN VIDEO — controls pinned to the bottom
// ═════════════════════════════════════════════════════════════════════════════

function FullscreenVideo({ url, onClose }: { url: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const player: VideoPlayer = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.muted = false;
    p.timeUpdateEventInterval = 0.2;
    p.play();
  });

  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const time = useEvent(player, "timeUpdate", {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });

  const [muted, setMuted] = React.useState(false);
  const [controls, setControls] = React.useState(true);
  const [barWidth, setBarWidth] = React.useState(0);
  /** Local scrub position; null means "follow the player". */
  const [scrub, setScrub] = React.useState<number | null>(null);

  const duration = player.duration || 0;
  const current = scrub ?? time.currentTime ?? 0;
  const progress = duration > 0 ? Math.min(1, Math.max(0, current / duration)) : 0;

  // Controls fade out while playing and come straight back on a tap. The timer
  // is cleared on every re-arm so a tap during the countdown resets it.
  React.useEffect(() => {
    if (!controls || !isPlaying) return;
    const t = setTimeout(() => setControls(false), 3200);
    return () => clearTimeout(t);
  }, [controls, isPlaying, current]);

  const seekTo = React.useCallback(
    (fraction: number) => {
      if (duration <= 0) return;
      try {
        player.currentTime = Math.min(duration, Math.max(0, fraction * duration));
      } catch {}
    },
    [duration, player],
  );

  const scrubGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => {
          if (barWidth <= 0) return;
          runOnJS(setScrub)((e.x / barWidth) * duration);
        })
        .onUpdate((e) => {
          if (barWidth <= 0) return;
          const f = Math.min(1, Math.max(0, e.x / barWidth));
          runOnJS(setScrub)(f * duration);
        })
        .onEnd((e) => {
          if (barWidth <= 0) return;
          const f = Math.min(1, Math.max(0, e.x / barWidth));
          runOnJS(seekTo)(f);
        })
        .onFinalize(() => {
          runOnJS(setScrub)(null);
        }),
    [barWidth, duration, seekTo],
  );

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (player.playing) player.pause();
      else player.play();
    } catch {}
    setControls(true);
  };

  return (
    <View style={styles.viewerRoot}>
      <StatusBar hidden />
      <Pressable style={styles.fill} onPress={() => setControls((c) => !c)}>
        <VideoView
          player={player}
          style={styles.fill}
          contentFit="contain"
          nativeControls={false}
          allowsPictureInPicture
        />
      </Pressable>

      {status === "loading" ? (
        <View style={styles.viewerSpinner} pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : null}

      {/* Close is always available — a hidden close button in a fullscreen
          player traps the user. */}
      <Pressable
        onPress={onClose}
        hitSlop={14}
        style={[styles.viewerClose, { top: insets.top + 8 }]}
      >
        <Glass variant="clear" radius={20} style={styles.viewerCloseGlass} fallbackTint="rgba(0,0,0,0.5)">
          <HugeiconsIcon icon={Cancel01Icon} size={20} color="#fff" strokeWidth={2} />
        </Glass>
      </Pressable>

      {controls ? (
        <View style={[styles.controlsWrap, { paddingBottom: insets.bottom + 14 }]}>
          <Glass
            variant="regular"
            radius={22}
            style={styles.controlsBar}
            fallbackIntensity={50}
            fallbackTint="rgba(20,20,22,0.72)"
          >
            <Pressable onPress={toggle} hitSlop={10} style={styles.controlBtn}>
              <HugeiconsIcon
                icon={isPlaying ? PauseIcon : PlayIcon}
                size={22}
                color="#fff"
                strokeWidth={2}
              />
            </Pressable>

            <Text style={styles.timeText}>{fmtTime(current)}</Text>

            <GestureDetector gesture={scrubGesture}>
              <View
                style={styles.scrubHit}
                onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
              >
                <View style={styles.scrubTrack}>
                  <View style={[styles.scrubFill, { width: `${progress * 100}%` }]} />
                </View>
                <View style={[styles.scrubKnob, { left: `${progress * 100}%` }]} />
              </View>
            </GestureDetector>

            <Text style={styles.timeText}>{fmtTime(duration)}</Text>

            <Pressable
              onPress={() => {
                const next = !muted;
                setMuted(next);
                try {
                  player.muted = next;
                } catch {}
              }}
              hitSlop={10}
              style={styles.controlBtn}
            >
              <HugeiconsIcon
                icon={muted ? VolumeOffIcon : VolumeHighIcon}
                size={20}
                color="#fff"
                strokeWidth={2}
              />
            </Pressable>
          </Glass>
        </View>
      ) : null}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FULLSCREEN IMAGE — pinch, pan, swipe down to dismiss
// ═════════════════════════════════════════════════════════════════════════════

function FullscreenImage({ media, onClose }: { media: Media; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(6, Math.max(1, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.02) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        tx.value = withSpring(0);
        ty.value = withSpring(0);
        savedTx.value = 0;
        savedTy.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1) {
        tx.value = savedTx.value + e.translationX;
        ty.value = savedTy.value + e.translationY;
      } else {
        // Unzoomed, a vertical drag is a dismiss gesture, not a pan.
        ty.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (scale.value > 1) {
        savedTx.value = tx.value;
        savedTy.value = ty.value;
        return;
      }
      if (Math.abs(e.translationY) > 120 || Math.abs(e.velocityY) > 900) {
        ty.value = withTiming(e.translationY > 0 ? SCREEN.height : -SCREEN.height, {
          duration: 180,
        });
        runOnJS(onClose)();
      } else {
        ty.value = withSpring(0);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = scale.value > 1.05 ? 1 : 2.5;
      scale.value = withSpring(next);
      savedScale.value = next;
      if (next === 1) {
        tx.value = withSpring(0);
        ty.value = withSpring(0);
        savedTx.value = 0;
        savedTy.value = 0;
      }
    });

  const composed = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, pan));

  const imgStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <View style={styles.viewerRoot}>
      <StatusBar hidden />
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.fill, styles.center, imgStyle]}>
          <Image
            source={{ uri: media.url }}
            style={styles.fullImage}
            resizeMode="contain"
            accessibilityLabel={media.alt}
          />
        </Animated.View>
      </GestureDetector>

      <Pressable
        onPress={onClose}
        hitSlop={14}
        style={[styles.viewerClose, { top: insets.top + 8 }]}
      >
        <Glass variant="clear" radius={20} style={styles.viewerCloseGlass} fallbackTint="rgba(0,0,0,0.5)">
          <HugeiconsIcon icon={Cancel01Icon} size={20} color="#fff" strokeWidth={2} />
        </Glass>
      </Pressable>

      {media.alt ? (
        <View style={[styles.altBar, { paddingBottom: insets.bottom + 14 }]}>
          <Text style={styles.altText}>{media.alt}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// THE GALLERY
// ═════════════════════════════════════════════════════════════════════════════

export interface PostMediaGalleryProps {
  media: Media[];
  /** True while the owning cell is on screen — gates inline video playback. */
  active?: boolean;
  radius?: number;
}

function GalleryInner({ media, active = false, radius = 16 }: PostMediaGalleryProps) {
  const [width, setWidth] = React.useState(0);
  const [viewing, setViewing] = React.useState<number | null>(null);

  if (!media.length) return null;

  const open = (i: number) => setViewing(i);
  const shown = media.slice(0, 4);
  const extra = media.length - shown.length;

  const cell = (m: Media, i: number, style: any, r: number) => (
    <View key={`${m.url}-${i}`} style={[style, { borderRadius: r, overflow: "hidden" }]}>
      {m.type === "video" ? (
        <InlineVideo media={m} active={active && i === 0} onPress={() => open(i)} radius={r} />
      ) : (
        <Pressable onPress={() => open(i)} style={styles.fill}>
          <Image
            source={{ uri: m.url }}
            style={styles.fill}
            resizeMode="cover"
            accessibilityLabel={m.alt}
          />
          {m.alt ? (
            <View style={styles.altBadge} pointerEvents="none">
              <Text style={styles.altBadgeText}>ALT</Text>
            </View>
          ) : null}
        </Pressable>
      )}
      {i === 3 && extra > 0 ? (
        <View style={styles.moreOverlay} pointerEvents="none">
          <Text style={styles.moreText}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );

  let body: React.ReactNode = null;
  const gap = 3;

  if (shown.length === 1) {
    const m = shown[0];
    body = width > 0 ? cell(m, 0, { width, aspectRatio: clampRatio(m, width) }, radius) : null;
  } else if (shown.length === 2) {
    const w = (width - gap) / 2;
    body = (
      <View style={{ flexDirection: "row", gap }}>
        {shown.map((m, i) => cell(m, i, { width: w, aspectRatio: 1 }, radius))}
      </View>
    );
  } else if (shown.length === 3) {
    const w = (width - gap) / 2;
    body = (
      <View style={{ flexDirection: "row", gap }}>
        {cell(shown[0], 0, { width: w, aspectRatio: 0.86 }, radius)}
        <View style={{ gap }}>
          {cell(shown[1], 1, { width: w, aspectRatio: 1.72 }, radius)}
          {cell(shown[2], 2, { width: w, aspectRatio: 1.72 }, radius)}
        </View>
      </View>
    );
  } else {
    const w = (width - gap) / 2;
    body = (
      <View style={{ gap }}>
        <View style={{ flexDirection: "row", gap }}>
          {cell(shown[0], 0, { width: w, aspectRatio: 1.3 }, radius)}
          {cell(shown[1], 1, { width: w, aspectRatio: 1.3 }, radius)}
        </View>
        <View style={{ flexDirection: "row", gap }}>
          {cell(shown[2], 2, { width: w, aspectRatio: 1.3 }, radius)}
          {cell(shown[3], 3, { width: w, aspectRatio: 1.3 }, radius)}
        </View>
      </View>
    );
  }

  const open_ = viewing != null ? media[viewing] : null;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.gallery}>
      {body}
      <Modal
        visible={open_ != null}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setViewing(null)}
        supportedOrientations={["portrait", "landscape"]}
      >
        {open_ ? (
          open_.type === "video" ? (
            <FullscreenVideo url={open_.url} onClose={() => setViewing(null)} />
          ) : (
            <FullscreenImage media={open_} onClose={() => setViewing(null)} />
          )
        ) : null}
      </Modal>
    </View>
  );
}

export const PostMediaGallery = React.memo(GalleryInner);

const styles = StyleSheet.create({
  fill: { width: "100%", height: "100%" },
  center: { alignItems: "center", justifyContent: "center" },
  gallery: { marginTop: 10 },

  mutedPill: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  durationPill: {
    position: "absolute",
    left: 8,
    bottom: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  durationText: { ...IOSAppFont.caption2, color: "#fff", fontVariant: ["tabular-nums"] },

  altBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  altBadgeText: { ...IOSAppFont.caption2, color: "#fff", fontSize: 9 },

  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  moreText: { ...IOSAppFont.title3, color: "#fff" },

  viewerRoot: { flex: 1, backgroundColor: "#000" },
  viewerSpinner: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  viewerClose: { position: "absolute", right: 14, zIndex: 10 },
  viewerCloseGlass: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  fullImage: { width: SCREEN.width, height: SCREEN.height },

  altBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 14 },
  altText: { ...IOSAppFont.footnote, color: "rgba(255,255,255,0.85)", textAlign: "center" },

  controlsWrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  controlsBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 22,
  },
  controlBtn: { width: 30, alignItems: "center", justifyContent: "center" },
  timeText: {
    ...IOSAppFont.caption2,
    color: "#fff",
    fontVariant: ["tabular-nums"],
    width: 38,
    textAlign: "center",
  },
  // A tall transparent hit area around a thin track: a 3px-tall touch target is
  // unusable, but a 3px-tall line is what the design wants to see.
  scrubHit: { flex: 1, height: 28, justifyContent: "center" },
  scrubTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.28)",
    overflow: "hidden",
  },
  scrubFill: { height: "100%", backgroundColor: "#fff" },
  scrubKnob: {
    position: "absolute",
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#fff",
    marginLeft: -5.5,
  },
});
