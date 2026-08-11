// components/ios/RatingModal.tsx
//
// "Rate Us" — presented as a centred ALERT, not a bottom sheet, which is how
// X/Twitter prompts for a rating. An alert is the right call here: it's a short,
// interrupting, yes/no-shaped decision, and the HIG reserves sheets for tasks
// the user can partially complete or drag away from.
//
// Geometry matches UIAlertController exactly — 270pt wide, 14pt radius, blur
// material, hairline-divided 44pt buttons — with a custom content area holding
// the stars, which is the one thing a system alert can't express.
//
// Score branches:
//   4–5★ → hand off to the native App Store / Play review flow (expo-store-review).
//   1–3★ → switch to a private feedback form instead of sending an unhappy user
//          to a public review page.
//
// That branch is standard practice, and it's also why the low-rating path never
// silently discards the response — it goes to your feedback channel.
//
// The native iOS review sheet is rate-limited by the OS (roughly 3 prompts per
// 365 days) and shows nothing at all in a debug build, so `isAvailableAsync`
// is checked and there's an App Store URL fallback.

import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Linking,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SymbolView } from "expo-symbols";
import * as StoreReview from "expo-store-review";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from "react-native-reanimated";

import { haptics } from "@/src/utils/haptics";
import { Glass, GlassScrim } from "./Glass";
import { FeedbackModal } from "./FeedbackModal";
import { useIOSTheme, IOSFont, IOSMetrics } from "./theme";

/** Score at or above which we send the user to the public store listing. */
const HAPPY_THRESHOLD = 4;

/** Set these to your real listing IDs to enable the fallback deep links. */
const APP_STORE_ID = process.env.EXPO_PUBLIC_APP_STORE_ID;
const ANDROID_PACKAGE = process.env.EXPO_PUBLIC_ANDROID_PACKAGE;

function storeUrl(): string | null {
  if (Platform.OS === "ios" && APP_STORE_ID) {
    return `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
  }
  if (Platform.OS === "android" && ANDROID_PACKAGE) {
    return `market://details?id=${ANDROID_PACKAGE}`;
  }
  return null;
}

const LABELS = ["", "Not good", "Could be better", "It's okay", "Really good", "Love it!"];

// ─── Star ────────────────────────────────────────────────────────────────────

function Star({
  index,
  filled,
  onPress,
}: {
  index: number;
  filled: boolean;
  onPress: () => void;
}) {
  const theme = useIOSTheme();
  const scale = useSharedValue(0.5);

  // Stagger the stars in as the alert appears.
  useEffect(() => {
    scale.value = withDelay(60 + index * 50, withSpring(1, { damping: 11, stiffness: 240 }));
  }, [index, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={() => {
        scale.value = withSpring(1.3, { damping: 8, stiffness: 420 }, () => {
          scale.value = withSpring(1, { damping: 12, stiffness: 300 });
        });
        onPress();
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${index + 1} star${index ? "s" : ""}`}
    >
      <Animated.View style={style}>
        <SymbolView
          name={filled ? "star.fill" : "star"}
          size={32}
          tintColor={filled ? "#FFB800" : theme.systemGray3}
          fallback={
            <Text style={{ fontSize: 29, color: filled ? "#FFB800" : theme.systemGray3 }}>
              {filled ? "★" : "☆"}
            </Text>
          }
        />
      </Animated.View>
    </Pressable>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

export interface RatingModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Fires with the score once the user submits. */
  onRated?: (rating: number) => void;
}

export function RatingModal({
  visible,
  onClose,
  title = "Enjoying Emilgo?",
  subtitle = "Tap a star to rate your experience.",
  onRated,
}: RatingModalProps) {
  const theme = useIOSTheme();
  const { width } = useWindowDimensions();

  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  // Alert presentation: scale-and-fade, matching UIAlertController.
  const progress = useSharedValue(0);
  const open = visible && !showFeedback;

  useEffect(() => {
    progress.value = open
      ? withSpring(1, { damping: 26, stiffness: 340 })
      : withTiming(0, { duration: 150 });
  }, [open, progress]);

  useEffect(() => {
    if (visible) {
      setRating(0);
      setBusy(false);
      setShowFeedback(false);
    }
  }, [visible]);

  // Motion only. The card's surface is a GlassView, and opacity on a
  // GlassView's ancestor renders the effect incorrectly (expo/expo#41024), so
  // the glass materialises via `present` and the content fades on top of it.
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1.16 - progress.value * 0.16 }],
  }));

  const contentStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const pick = useCallback((value: number) => {
    haptics.select();
    setRating(value);
  }, []);

  const submit = useCallback(async () => {
    if (!rating) return;
    onRated?.(rating);

    if (rating < HAPPY_THRESHOLD) {
      // Unhappy: keep it private, collect detail instead of a public review.
      haptics.press();
      setShowFeedback(true);
      return;
    }

    setBusy(true);
    haptics.success();

    try {
      // Preferred: the OS-native review sheet, which never leaves the app.
      if (await StoreReview.isAvailableAsync()) {
        if (await StoreReview.hasAction()) {
          await StoreReview.requestReview();
          setBusy(false);
          onClose();
          return;
        }
      }
      // Fallback: open the listing's review page directly.
      const url = storeUrl();
      if (url) await Linking.openURL(url);
    } catch {
      /* the prompt is best-effort — never block the user on it */
    }

    setBusy(false);
    onClose();
  }, [rating, onRated, onClose]);

  const primaryLabel = rating >= HAPPY_THRESHOLD ? "Rate on the App Store" : "Send feedback";

  return (
    <>
      <Modal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        <View style={styles.root}>
          {/* Dimmed, lightly blurred backdrop — tapping it dismisses. */}
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <GlassScrim intensity={12} />
            </Pressable>
          </Animated.View>

          {/* Alert card */}
          <Animated.View
            style={[styles.card, { width: Math.min(width - 96, 270) }, cardStyle]}
            accessibilityViewIsModal
          >
            {/* Same material as a system alert: real Liquid Glass on iOS 26,
                the original blur-and-tint everywhere else. */}
            <Glass
              variant="regular"
              radius={IOSMetrics.alertRadius}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
              fallbackIntensity={70}
              fallbackTint={
                theme.scheme === "dark" ? "rgba(44,44,46,0.78)" : "rgba(250,250,250,0.78)"
              }
              present={open}
              animated
            />

            <Animated.View style={contentStyle}>
              {/* Content */}
              <View style={styles.content}>
                <Text style={[IOSFont.headline, styles.centered, { color: theme.label }]}>
                  {title}
                </Text>
                <Text
                  style={[IOSFont.footnote, styles.centered, { color: theme.label, marginTop: 3 }]}
                >
                  {subtitle}
                </Text>

                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} index={n - 1} filled={n <= rating} onPress={() => pick(n)} />
                  ))}
                </View>

                {/* Reserved height so the card doesn't resize when a label appears. */}
                <View style={styles.labelSlot}>
                  {rating > 0 && (
                    <Text style={[IOSFont.footnote, { color: theme.secondaryLabel }]}>
                      {LABELS[rating]}
                    </Text>
                  )}
                </View>
              </View>

              {/* Buttons — hairline-divided, 44pt, exactly like a system alert. */}
              <View style={[styles.divider, { backgroundColor: theme.separator }]} />

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && { backgroundColor: theme.systemFill },
                ]}
                onPress={submit}
                disabled={!rating || busy}
                accessibilityRole="button"
              >
                {busy ? (
                  <ActivityIndicator color={theme.systemBlue} />
                ) : (
                  <Text
                    style={[
                      IOSFont.body,
                      {
                        color: rating ? theme.systemBlue : theme.tertiaryLabel,
                        fontWeight: "600",
                      },
                    ]}
                  >
                    {primaryLabel}
                  </Text>
                )}
              </Pressable>

              <View style={[styles.divider, { backgroundColor: theme.separator }]} />

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && { backgroundColor: theme.systemFill },
                ]}
                onPress={onClose}
                accessibilityRole="button"
              >
                <Text style={[IOSFont.body, { color: theme.systemBlue }]}>Not now</Text>
              </Pressable>
            </Animated.View>
          </Animated.View>
        </View>
      </Modal>

      {/* Low ratings land here instead of the public store page. */}
      <FeedbackModal
        visible={showFeedback}
        onClose={() => {
          setShowFeedback(false);
          onClose();
        }}
        kind="rating"
        title="Help us improve"
        prompt={`You rated us ${rating} star${rating === 1 ? "" : "s"}. What went wrong? We read every message.`}
        placeholder="What could be better?"
        context={{ rating }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    borderRadius: IOSMetrics.alertRadius,
    overflow: "hidden",
  },
  content: { paddingHorizontal: 16, paddingTop: 19, paddingBottom: 14, alignItems: "center" },
  centered: { textAlign: "center" },
  stars: { flexDirection: "row", gap: 6, marginTop: 16 },
  labelSlot: { height: 22, justifyContent: "center", marginTop: 6 },
  divider: { height: IOSMetrics.hairline, width: "100%" },
  button: {
    height: IOSMetrics.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default RatingModal;
