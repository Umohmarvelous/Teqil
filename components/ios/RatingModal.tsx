// components/ios/RatingModal.tsx
//
// "Rate Us", in the style X/Twitter uses: a single large prompt, animated stars,
// and a branch on the score.
//
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
import { View, Text, Pressable, StyleSheet, Platform, Linking } from "react-native";
import { SymbolView } from "expo-symbols";
import * as StoreReview from "expo-store-review";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from "react-native-reanimated";

import { IOSSheet } from "./IOSSheet";
import { IOSButton } from "./IOSButton";
import { FeedbackModal } from "./FeedbackModal";
import { useIOSTheme, IOSFont } from "./theme";

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
  const scale = useSharedValue(0.6);

  // Stagger the stars in as the sheet appears.
  useEffect(() => {
    scale.value = withDelay(index * 55, withSpring(1, { damping: 11, stiffness: 220 }));
  }, [index, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={() => {
        scale.value = withSpring(1.25, { damping: 8, stiffness: 400 }, () => {
          scale.value = withSpring(1, { damping: 12, stiffness: 300 });
        });
        onPress();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${index + 1} star${index ? "s" : ""}`}
    >
      <Animated.View style={style}>
        <SymbolView
          name={filled ? "star.fill" : "star"}
          size={40}
          tintColor={filled ? "#FFB800" : theme.systemGray3}
          fallback={
            <Text style={{ fontSize: 36, color: filled ? "#FFB800" : theme.systemGray3 }}>
              {filled ? "★" : "☆"}
            </Text>
          }
        />
      </Animated.View>
    </Pressable>
  );
}

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

  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    if (visible) {
      setRating(0);
      setBusy(false);
      setShowFeedback(false);
    }
  }, [visible]);

  const pick = useCallback((value: number) => {
    Haptics.selectionAsync();
    setRating(value);
  }, []);

  const submit = useCallback(async () => {
    if (!rating) return;
    onRated?.(rating);

    if (rating < HAPPY_THRESHOLD) {
      // Unhappy: keep it private, collect detail instead of a public review.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setShowFeedback(true);
      return;
    }

    setBusy(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

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

  return (
    <>
      <IOSSheet
        visible={visible && !showFeedback}
        onClose={onClose}
        detent={0.52}
        showGrabber
      >
        <View style={styles.wrap}>
          <View style={[styles.iconCircle, { backgroundColor: theme.tint + "1A" }]}>
            <SymbolView name="star.bubble.fill" size={34} tintColor={theme.tint} fallback={null} />
          </View>

          <Text style={[IOSFont.title2, { color: theme.label, textAlign: "center" }]}>{title}</Text>
          <Text
            style={[IOSFont.subheadline, { color: theme.secondaryLabel, textAlign: "center" }]}
          >
            {subtitle}
          </Text>

          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} index={n - 1} filled={n <= rating} onPress={() => pick(n)} />
            ))}
          </View>

          {/* Reserve the row height so the sheet doesn't jump when a label appears. */}
          <View style={styles.labelSlot}>
            {rating > 0 && (
              <Text style={[IOSFont.headline, { color: theme.tint }]}>{LABELS[rating]}</Text>
            )}
          </View>

          <View style={styles.actions}>
            <IOSButton
              title={rating >= HAPPY_THRESHOLD ? "Rate on the App Store" : "Continue"}
              variant="filled"
              size="large"
              fullWidth
              disabled={!rating}
              loading={busy}
              onPress={submit}
            />
            <IOSButton title="Not now" variant="borderless" fullWidth onPress={onClose} />
          </View>
        </View>
      </IOSSheet>

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
  wrap: { flex: 1, alignItems: "center", gap: 8, paddingTop: 6 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  stars: { flexDirection: "row", gap: 12, marginTop: 16 },
  labelSlot: { height: 26, justifyContent: "center" },
  actions: { width: "100%", marginTop: "auto", gap: 4 },
});

export default RatingModal;
