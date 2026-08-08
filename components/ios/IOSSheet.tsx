// components/ios/IOSSheet.tsx
//
// An iOS-style sheet: rounded top corners, translucent material background,
// blurred + dimmed backdrop, a grabber, and swipe-to-dismiss with velocity.
//
// Deliberately self-contained (RN Modal + Reanimated + Gesture Handler) rather
// than built on @gorhom/bottom-sheet, so it drops into any screen without
// adding a provider to the app's composition root. It ships its own
// GestureHandlerRootView because gestures inside a native Modal need one.
//
// Detents mirror UISheetPresentationController: "medium" ≈ half height,
// "large" ≈ full height, or pass a 0–1 fraction.

import React, { useCallback, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView, Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useIOSTheme, IOSFont, IOSMetrics } from "./theme";

export type IOSSheetDetent = "medium" | "large" | number;

export interface IOSSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Sheet height. Default "medium". */
  detent?: IOSSheetDetent;
  title?: string;
  /** Trailing header action, e.g. a "Done" button. */
  headerRight?: React.ReactNode;
  /** Show the grabber pill. iOS shows it when the sheet is user-resizable. */
  showGrabber?: boolean;
  /** Allow tap-outside and swipe-down to close. */
  dismissible?: boolean;
  contentStyle?: ViewStyle;
}

/** Distance dragged past which the sheet closes instead of springing back. */
const CLOSE_DISTANCE_RATIO = 0.28;
/** Downward fling speed that closes regardless of distance. */
const CLOSE_VELOCITY = 900;

function resolveHeight(detent: IOSSheetDetent, screenH: number): number {
  if (typeof detent === "number") return screenH * Math.min(Math.max(detent, 0.15), 1);
  return detent === "large" ? screenH * 0.92 : screenH * 0.55;
}

export function IOSSheet({
  visible,
  onClose,
  children,
  detent = "medium",
  title,
  headerRight,
  showGrabber = true,
  dismissible = true,
  contentStyle,
}: IOSSheetProps) {
  const theme = useIOSTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  const sheetH = resolveHeight(detent, screenH);
  const translateY = useSharedValue(sheetH);

  // Animate in/out whenever visibility flips.
  useEffect(() => {
    translateY.value = visible
      ? withSpring(0, { damping: 30, stiffness: 320, mass: 0.9 })
      : withTiming(sheetH, { duration: 220 });
  }, [visible, sheetH, translateY]);

  const close = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  const animateClosed = useCallback(() => {
    translateY.value = withTiming(sheetH, { duration: 200 }, (finished) => {
      if (finished) runOnJS(close)();
    });
  }, [close, sheetH, translateY]);

  const pan = Gesture.Pan()
    .enabled(dismissible)
    // Only claim the gesture once it's clearly a vertical drag, so inner
    // ScrollViews and horizontal swipes still work.
    .activeOffsetY([-8, 8])
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      // Rubber-band upward drags instead of letting the sheet fly off-screen.
      translateY.value = e.translationY > 0 ? e.translationY : e.translationY * 0.15;
    })
    .onEnd((e) => {
      const shouldClose =
        e.translationY > sheetH * CLOSE_DISTANCE_RATIO || e.velocityY > CLOSE_VELOCITY;

      if (shouldClose) {
        translateY.value = withTiming(sheetH, { duration: 200 }, (finished) => {
          if (finished) runOnJS(close)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 30, stiffness: 320 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // The scrim fades with the drag, exactly like a system sheet.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, sheetH], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissible ? animateClosed : undefined}
    >
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        {/* Backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissible ? animateClosed : undefined}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <BlurView
              intensity={18}
              tint={theme.scheme === "dark" ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]} />
          </Pressable>
        </Animated.View>

        {/* Sheet */}
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.sheet,
              { height: sheetH, backgroundColor: "transparent" },
              sheetStyle,
            ]}
            accessibilityViewIsModal
          >
            <BlurView
              intensity={80}
              tint={theme.blurTint}
              style={StyleSheet.absoluteFill}
            />
            {/* Material tint over the blur so contrast holds on busy backdrops. */}
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    theme.scheme === "dark" ? "rgba(28,28,30,0.72)" : "rgba(255,255,255,0.72)",
                },
              ]}
            />

            {showGrabber && (
              <View style={styles.grabberWrap}>
                <View style={[styles.grabber, { backgroundColor: theme.tertiaryLabel }]} />
              </View>
            )}

            {(title || headerRight) && (
              <View style={[styles.header, { borderBottomColor: theme.separator }]}>
                <View style={styles.headerSide} />
                <Text style={[IOSFont.headline, { color: theme.label, flex: 1, textAlign: "center" }]}>
                  {title}
                </Text>
                <View style={[styles.headerSide, { alignItems: "flex-end" }]}>{headerRight}</View>
              </View>
            )}

            <View
              style={[
                styles.content,
                { paddingBottom: Math.max(insets.bottom, 16) },
                contentStyle,
              ]}
            >
              {children}
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: IOSMetrics.sheetRadius,
    borderTopRightRadius: IOSMetrics.sheetRadius,
    overflow: "hidden",
  },
  grabberWrap: { alignItems: "center", paddingTop: 5, paddingBottom: 2 },
  grabber: { width: 36, height: 5, borderRadius: 2.5, opacity: 0.5 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 48,
    borderBottomWidth: IOSMetrics.hairline,
  },
  headerSide: { width: 64, justifyContent: "center" },
  content: { flex: 1, paddingHorizontal: IOSMetrics.groupedInset, paddingTop: 12 },
});

export default IOSSheet;
