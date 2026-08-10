// components/ios/IOSButton.tsx
//
// The four UIButton.Configuration styles from iOS, plus the standard tap
// feedback (brief opacity dip + light haptic) that system buttons use.
//
//   filled     — solid tint, white label. The one primary action on a screen.
//   tinted     — translucent tint fill, tint label. Secondary emphasis.
//   bordered   — hairline tint border, tint label.
//   borderless — label only, no chrome. The default for toolbar/nav actions.
//
// `role="destructive"` swaps the accent to systemRed everywhere, matching how
// iOS marks destructive actions.

import React, { useCallback } from "react";
import {
  Pressable,
  Text,
  View,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
  type PressableProps,
} from "react-native";
import * as Haptics from "expo-haptics";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

import { useIOSTheme, IOSFont, IOSMetrics } from "./theme";
import { Glass } from "./Glass";

/**
 * The four classic styles, plus the two iOS 26 glass configurations:
 *   glass          → UIKit's `.glass()`         — plain Liquid Glass
 *   prominentGlass → UIKit's `.prominentGlass()` — glass tinted with the app accent
 */
export type IOSButtonVariant =
  | "filled"
  | "tinted"
  | "bordered"
  | "borderless"
  | "glass"
  | "prominentGlass";
export type IOSButtonRole = "normal" | "destructive";
export type IOSButtonSize = "small" | "medium" | "large";

// `role` is omitted from the inherited props because RN reuses that name for the
// ARIA role; here it means the iOS button role (normal / destructive).
export interface IOSButtonProps extends Omit<PressableProps, "style" | "children" | "role"> {
  title: string;
  variant?: IOSButtonVariant;
  role?: IOSButtonRole;
  size?: IOSButtonSize;
  /** SF Symbol name shown before the label, e.g. "paperplane.fill". */
  symbol?: SymbolViewProps["name"];
  loading?: boolean;
  /** Stretch to the container width — standard for a sheet's primary action. */
  fullWidth?: boolean;
  /** Suppress the light haptic on press. */
  noHaptics?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const SIZES: Record<IOSButtonSize, { height: number; padH: number; font: TextStyle; radius: number; icon: number }> = {
  small:  { height: 34, padH: 14, font: IOSFont.subheadline, radius: 8,  icon: 15 },
  medium: { height: 44, padH: 18, font: IOSFont.body,        radius: 10, icon: 17 },
  large:  { height: 50, padH: 22, font: IOSFont.headline,    radius: 12, icon: 19 },
};

export function IOSButton({
  title,
  variant = "filled",
  role = "normal",
  size = "medium",
  symbol,
  loading = false,
  fullWidth = false,
  noHaptics = false,
  disabled,
  onPress,
  style,
  textStyle,
  ...rest
}: IOSButtonProps) {
  const theme = useIOSTheme();
  const metrics = SIZES[size];

  const accent = role === "destructive" ? theme.systemRed : theme.tint;
  const isDisabled = disabled || loading;

  const isGlass = variant === "glass" || variant === "prominentGlass";

  // Filled and prominent-glass buttons carry the accent behind the label, so the
  // label goes white; everything else tints the label itself.
  const labelColor =
    variant === "filled" || variant === "prominentGlass" ? "#FFFFFF" : accent;

  const container: ViewStyle = {
    height: metrics.height,
    paddingHorizontal: variant === "borderless" ? 6 : metrics.padH,
    borderRadius: metrics.radius,
    minWidth: IOSMetrics.minTouchTarget,
    alignSelf: fullWidth ? "stretch" : "flex-start",
    ...(variant === "filled"   && { backgroundColor: accent }),
    ...(variant === "tinted"   && { backgroundColor: accent + "1F" }),
    ...(variant === "bordered" && {
      borderWidth: 1,
      borderColor: accent + "80",
      backgroundColor: "transparent",
    }),
    // Glass supplies its own surface — a background colour here would sit on top
    // of it and defeat the effect.
    ...(isGlass && { backgroundColor: "transparent" }),
  };

  const handlePress = useCallback<NonNullable<PressableProps["onPress"]>>(
    (e) => {
      if (!noHaptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress?.(e);
    },
    [noHaptics, onPress],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      accessibilityLabel={title}
      disabled={isDisabled}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        container,
        // iOS dims rather than scales on tap for standard buttons. Glass handles
        // its own press feedback natively (scale + bounce), so don't dim it too.
        pressed && !isGlass && { opacity: 0.4 },
        isDisabled && { opacity: 0.35 },
        style,
      ]}
      {...rest}
    >
      {isGlass && (
        <Glass
          variant="regular"
          tint={variant === "prominentGlass" ? accent : undefined}
          interactive
          radius={metrics.radius}
          style={StyleSheet.absoluteFill as never}
          pointerEvents="none"
        />
      )}
      {loading ? (
        <ActivityIndicator size="small" color={labelColor} />
      ) : (
        <View style={styles.row}>
          {symbol && (
            <SymbolView
              name={symbol}
              size={metrics.icon}
              tintColor={labelColor}
              resizeMode="scaleAspectFit"
              // Android/web have no SF Symbols; the label alone still reads fine.
              fallback={null}
            />
          )}
          <Text
            numberOfLines={1}
            style={[
              metrics.font,
              { color: labelColor, fontWeight: variant === "filled" ? "600" : "400" },
              textStyle,
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
});

export default IOSButton;
