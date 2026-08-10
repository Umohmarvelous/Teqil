// components/ios/IOSAlert.tsx
//
// UIAlertController, reproduced: both the centred `alert` style and the bottom
// `actionSheet` style, on a blurred backdrop with the standard button treatment.
//
// iOS button conventions encoded here:
//   • `cancel` is bold and, in an action sheet, sits in its own detached group.
//   • `destructive` is systemRed.
//   • Two-button alerts lay out side by side; three or more stack vertically.
//   • Separators are hairlines, and buttons are full-bleed (no padding gaps).

import React, { useEffect } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useIOSTheme, IOSFont, IOSMetrics } from "./theme";
import { Glass } from "./Glass";

export type IOSAlertActionStyle = "default" | "cancel" | "destructive";

export interface IOSAlertAction {
  label: string;
  onPress?: () => void;
  style?: IOSAlertActionStyle;
  /** Dim and block the action without hiding it. */
  disabled?: boolean;
}

export interface IOSAlertProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  actions: IOSAlertAction[];
  /** "alert" = centred dialog, "actionSheet" = bottom sheet of choices. */
  variant?: "alert" | "actionSheet";
}

export function IOSAlert({
  visible,
  onClose,
  title,
  message,
  actions,
  variant = "alert",
}: IOSAlertProps) {
  const theme = useIOSTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = visible
      ? withSpring(1, { damping: 26, stiffness: 340 })
      : withTiming(0, { duration: 150 });
  }, [visible, progress]);

  const containerStyle = useAnimatedStyle(() =>
    variant === "alert"
      ? {
          opacity: progress.value,
          // Alerts scale down from slightly-large, like UIKit.
          transform: [{ scale: 1.08 - progress.value * 0.08 }],
        }
      : {
          opacity: progress.value,
          transform: [{ translateY: (1 - progress.value) * 60 }],
        },
  );

  const run = (action: IOSAlertAction) => {
    if (action.disabled) return;
    Haptics.impactAsync(
      action.style === "destructive"
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );
    onClose();
    // Let the dismissal animation start before the handler pushes a screen.
    setTimeout(() => action.onPress?.(), 60);
  };

  const colorFor = (style?: IOSAlertActionStyle) =>
    style === "destructive" ? theme.systemRed : theme.tint;

  const cancelActions = actions.filter((a) => a.style === "cancel");
  const otherActions = actions.filter((a) => a.style !== "cancel");

  // A two-button alert is the only case iOS lays out horizontally.
  const horizontal = variant === "alert" && actions.length === 2;

  const materialBg =
    theme.scheme === "dark" ? "rgba(44,44,46,0.82)" : "rgba(250,250,250,0.82)";

  const renderButton = (action: IOSAlertAction, i: number, group: IOSAlertAction[]) => (
    <Pressable
      key={`${action.label}-${i}`}
      onPress={() => run(action)}
      disabled={action.disabled}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ disabled: !!action.disabled }}
      style={({ pressed }) => [
        styles.button,
        variant === "actionSheet" && styles.sheetButton,
        horizontal && { flex: 1 },
        // Hairline between buttons; none after the last.
        horizontal
          ? i > 0 && { borderLeftWidth: IOSMetrics.hairline, borderLeftColor: theme.separator }
          : i < group.length - 1 && {
              borderBottomWidth: IOSMetrics.hairline,
              borderBottomColor: theme.separator,
            },
        pressed && !action.disabled && { backgroundColor: theme.systemFill },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          variant === "actionSheet" ? IOSFont.title3 : IOSFont.body,
          {
            color: colorFor(action.style),
            fontWeight: action.style === "cancel" ? "600" : "400",
            opacity: action.disabled ? 0.35 : 1,
          },
        ]}
      >
        {action.label}
      </Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss">
          <BlurView intensity={12} tint={theme.scheme === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]} />
        </Pressable>

        {variant === "alert" ? (
          <Animated.View
            style={[styles.alertCard, { width: Math.min(width - 96, 270) }, containerStyle]}
            accessibilityViewIsModal
          >
            <Glass variant="regular" style={StyleSheet.absoluteFill as never} pointerEvents="none" fallbackIntensity={70} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: materialBg }]} />

            <View style={styles.alertHead}>
              {title ? (
                <Text style={[IOSFont.headline, { color: theme.label, textAlign: "center" }]}>{title}</Text>
              ) : null}
              {message ? (
                <Text
                  style={[
                    IOSFont.footnote,
                    { color: theme.label, textAlign: "center", marginTop: title ? 4 : 0 },
                  ]}
                >
                  {message}
                </Text>
              ) : null}
            </View>

            <View style={[styles.divider, { backgroundColor: theme.separator }]} />
            <View style={horizontal ? styles.rowButtons : undefined}>
              {actions.map((a, i) => renderButton(a, i, actions))}
            </View>
          </Animated.View>
        ) : (
          <Animated.View
            style={[styles.sheetWrap, { paddingBottom: Math.max(insets.bottom, 10) }, containerStyle]}
            accessibilityViewIsModal
          >
            <View style={styles.sheetGroup}>
              <Glass variant="regular" style={StyleSheet.absoluteFill as never} pointerEvents="none" fallbackIntensity={70} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: materialBg }]} />

              {(title || message) && (
                <>
                  <View style={styles.sheetHead}>
                    {title ? (
                      <Text style={[IOSFont.footnote, { color: theme.secondaryLabel, textAlign: "center" }]}>
                        {title}
                      </Text>
                    ) : null}
                    {message ? (
                      <Text
                        style={[
                          IOSFont.caption1,
                          { color: theme.secondaryLabel, textAlign: "center", marginTop: 2 },
                        ]}
                      >
                        {message}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.divider, { backgroundColor: theme.separator }]} />
                </>
              )}

              {otherActions.map((a, i) => renderButton(a, i, otherActions))}
            </View>

            {/* Cancel is a visually separate group in an action sheet. */}
            {cancelActions.length > 0 && (
              <View style={[styles.sheetGroup, { marginTop: 8 }]}>
                <Glass variant="regular" style={StyleSheet.absoluteFill as never} pointerEvents="none" fallbackIntensity={70} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: materialBg }]} />
                {cancelActions.map((a, i) => renderButton(a, i, cancelActions))}
              </View>
            )}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },

  alertCard: {
    borderRadius: IOSMetrics.alertRadius,
    overflow: "hidden",
  },
  alertHead: { paddingHorizontal: 16, paddingTop: 19, paddingBottom: 16 },
  divider: { height: IOSMetrics.hairline, width: "100%" },
  rowButtons: { flexDirection: "row" },
  button: {
    minHeight: IOSMetrics.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  sheetWrap: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 0,
  },
  sheetGroup: { borderRadius: IOSMetrics.alertRadius, overflow: "hidden" },
  sheetHead: { paddingHorizontal: 16, paddingVertical: 14 },
  sheetButton: { minHeight: 57 },
});

export default IOSAlert;
