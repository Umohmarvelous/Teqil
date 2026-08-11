// components/ios/IOSSearchBar.tsx
//
// The iOS search field, with Telegram's focus behaviour layered on top.
//
// Resting: a full-width translucent capsule with a centred magnifying glass and
// placeholder — the standard UISearchBar look.
//
// Focused: the glass + placeholder slide left, the field shrinks to make room,
// and a "Cancel" button slides in from the right. That left-shift is the detail
// people recognise as "a real iOS search bar" and it's usually the first thing
// an approximation gets wrong.
//
// The material is a real blur, not a flat grey, so it sits correctly over
// scrolling content the way a system search field does.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Keyboard,
  type TextInputProps,
} from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
  Easing,
} from "react-native-reanimated";

import { haptics } from "@/src/utils/haptics";
import { useIOSTheme, IOSFont, IOSMetrics } from "./theme";
import { Glass } from "./Glass";

const CANCEL_WIDTH = 66;
const FIELD_HEIGHT = 45;
/** UISearchBar's field radius. */
const FIELD_RADIUS = 50;
/** iOS uses a quick, flat ease for this — not a spring. */
const TIMING = { duration: 250, easing: Easing.bezier(0.25, 0.1, 0.25, 1) };

export interface IOSSearchBarProps extends Omit<TextInputProps, "style" | "value" | "onChangeText"> {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  /** Fires when the field gains focus — use it to show the results overlay. */
  onFocusChange?: (focused: boolean) => void;
  /** Fires when Cancel is tapped. */
  onCancel?: () => void;
  /** Force the focused (cancel-visible) layout, e.g. while results are showing. */
  active?: boolean;
  autoFocusOnMount?: boolean;
}

export function IOSSearchBar({
  value,
  onChangeText,
  placeholder = "Search",
  onFocusChange,
  onCancel,
  active,
  autoFocusOnMount,
  ...inputProps
}: IOSSearchBarProps) {
  const theme = useIOSTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const isActive = active ?? focused;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(isActive ? 1 : 0, TIMING);
  }, [isActive, progress]);

  useEffect(() => {
    if (autoFocusOnMount) {
      // Let the screen transition settle before raising the keyboard.
      const t = setTimeout(() => inputRef.current?.focus(), 260);
      return () => clearTimeout(t);
    }
  }, [autoFocusOnMount]);

  const handleFocus = useCallback(() => {
    setFocused(true);
    onFocusChange?.(true);
  }, [onFocusChange]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    onFocusChange?.(false);
  }, [onFocusChange]);

  const cancel = useCallback(() => {
    haptics.tap();
    onChangeText("");
    inputRef.current?.blur();
    Keyboard.dismiss();
    setFocused(false);
    onFocusChange?.(false);
    onCancel?.();
  }, [onCancel, onChangeText, onFocusChange]);

  // The field gives up width so Cancel can slide in beside it.
  const fieldStyle = useAnimatedStyle(() => ({
    marginRight: interpolate(progress.value, [0, 1], [0, CANCEL_WIDTH], Extrapolation.CLAMP),
  }));

  const cancelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [CANCEL_WIDTH, 0], Extrapolation.CLAMP) },
    ],
  }));

  // Unfocused and empty, the glass + placeholder sit centred as a pair; once
  // focused or filled they snap to the leading edge. That shift is the detail
  // people recognise as a real iOS search bar.
  const contentStyle = useAnimatedStyle(() => ({
    justifyContent: (progress.value > 0.5 || value
      ? "flex-start"
      : "flex-start") as "flex-start" | "flex-start",
  }));

  return (
    <View style={styles.row}>
      <Animated.View style={[styles.fieldWrap, fieldStyle]}>
        <View style={styles.field}>
          {/* Search fields sit on the control layer, so they take glass. */}
          <Glass
            variant="regular"
            radius={FIELD_RADIUS}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            fallbackIntensity={40}
            fallbackTint={theme.tertiarySystemFill}
          />

          <Animated.View style={[styles.fieldInner, contentStyle]}>
            <SymbolView
              name="magnifyingglass"
              size={20}
              tintColor={theme.secondaryLabel}
              fallback={null}
            />

            <TextInput
              ref={inputRef}
              value={value}
              onChangeText={onChangeText}
              placeholder={placeholder}
              placeholderTextColor={theme.secondaryLabel}
              onFocus={handleFocus}
              onBlur={handleBlur}
              returnKeyType="search"
              clearButtonMode="never"
              autoCorrect={false}
              autoCapitalize="none"
              style={[
                IOSFont.body,
                styles.input,
                { color: theme.label },
                // Unfocused and empty, the field is only as wide as its text so
                // the glass + placeholder can sit centred together.
                !isActive && !value ? styles.inputCollapsed : styles.inputExpanded,
              ]}
              {...inputProps}
            />

            {value.length > 0 && (
              <Pressable
                onPress={() => onChangeText("")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <SymbolView
                  name="xmark.circle.fill"
                  size={24}
                  tintColor={theme.tertiaryLabel}
                  fallback={<Text style={{ color: theme.tertiaryLabel }}>✕</Text>}
                />
              </Pressable>
            )}
          </Animated.View>
        </View>
      </Animated.View>

      <Animated.View style={[styles.cancelWrap, cancelStyle]} pointerEvents={isActive ? "auto" : "none"}>
        <Pressable onPress={cancel} hitSlop={8} accessibilityRole="button">
          <Text style={[IOSFont.body, { color: theme.tint }]}>Cancel</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: IOSMetrics.groupedInset,
  },
  fieldWrap: { flex: 1 },
  field: {
    height: FIELD_HEIGHT,
    borderRadius: FIELD_RADIUS,
    overflow: "hidden",
    justifyContent: "center",
    padding: 10
  },
  fieldInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    height: "100%",
  },
  input: { padding: 0, height: "100%" },
  inputCollapsed: { flexGrow: 0, flexShrink: 1, minWidth: 60 },
  inputExpanded: { flex: 1 },
  cancelWrap: {
    position: "absolute",
    right: IOSMetrics.groupedInset,
    width: CANCEL_WIDTH,
    alignItems: "flex-end",
  },
});

export default IOSSearchBar;
