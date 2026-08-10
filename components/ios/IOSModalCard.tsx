// components/ios/IOSModalCard.tsx
//
// A centred card modal with an iOS blur backdrop and swipe-to-dismiss.
//
// This exists for modals whose card design is the point — the paper-style
// Receipt, the QR scanner — where converting them into a bottom sheet would
// throw away the very thing that makes them recognisable. IOSModalCard adds the
// two behaviours a modern iOS modal needs (real material behind it, drag to
// dismiss) while leaving the card's own visuals entirely to the caller.
//
// Use IOSSheet instead when the content is a list or a task; use this when it's
// a document or a viewfinder.

import React, { useCallback, useEffect } from "react";
import { Modal, View, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { BlurView } from "expo-blur";
import { GestureHandlerRootView, Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";

import { haptics } from "@/src/utils/haptics";
import { useIOSTheme } from "./theme";

/** Drag distance past which the card dismisses rather than springing back. */
const CLOSE_DISTANCE = 130;
/** Fling speed that dismisses regardless of distance. */
const CLOSE_VELOCITY = 850;

export interface IOSModalCardProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Allow backdrop tap and drag to dismiss. */
  dismissible?: boolean;
  /** Blur strength behind the card. */
  intensity?: number;
}

export function IOSModalCard({
  visible,
  onClose,
  children,
  dismissible = true,
  intensity = 22,
}: IOSModalCardProps) {
  const theme = useIOSTheme();
  const { height } = useWindowDimensions();

  const translateY = useSharedValue(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      progress.value = withSpring(1, { damping: 26, stiffness: 320 });
    } else {
      progress.value = withTiming(0, { duration: 160 });
    }
  }, [visible, progress, translateY]);

  const close = useCallback(() => {
    haptics.tap();
    onClose();
  }, [onClose]);

  const animateClosed = useCallback(() => {
    progress.value = withTiming(0, { duration: 180 }, (finished) => {
      if (finished) runOnJS(close)();
    });
  }, [close, progress]);

  // Vertical drag in EITHER direction dismisses — a centred card has no
  // "collapsed" state to snap back to, so up and down both mean "get rid of it".
  const pan = Gesture.Pan()
    .enabled(dismissible)
    .activeOffsetY([-10, 10])
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      const far = Math.abs(e.translationY) > CLOSE_DISTANCE;
      const fast = Math.abs(e.velocityY) > CLOSE_VELOCITY;

      if (far || fast) {
        const dir = e.translationY > 0 ? 1 : -1;
        translateY.value = withTiming(dir * height, { duration: 200 });
        progress.value = withTiming(0, { duration: 200 }, (finished) => {
          if (finished) runOnJS(close)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 28, stiffness: 340 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: translateY.value },
      { scale: 1.08 - progress.value * 0.08 },
    ],
  }));

  // The backdrop thins out as the card is dragged away, so the gesture feels
  // connected to the dismissal rather than happening on top of a static scrim.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity:
      progress.value *
      interpolate(Math.abs(translateY.value), [0, CLOSE_DISTANCE * 2], [1, 0.3], Extrapolation.CLAMP),
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
        {/* Backdrop stays a plain blurred scrim on purpose: Liquid Glass is the
            INTERACTIVE layer, and a dimming scrim is neither interactive nor a
            control. Glassing it would put glass behind glass. */}
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissible ? animateClosed : undefined}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <BlurView
              intensity={intensity}
              tint={theme.scheme === "dark" ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]} />
          </Pressable>
        </Animated.View>

        <View style={styles.center} pointerEvents="box-none">
          <GestureDetector gesture={pan}>
            <Animated.View style={cardStyle} accessibilityViewIsModal>
              {children}
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});

export default IOSModalCard;
