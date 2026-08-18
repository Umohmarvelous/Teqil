// components/ios/IOSFilterChips.tsx
//
// A scrolling row of glass filter chips — the control iOS uses above a result
// list to narrow it by kind ("All · Settings · Activity").
//
// Two details that make it read as a system control rather than a row of
// buttons:
//
//   · The active chip takes the tint as a FILL, not just a coloured label. A
//     tinted label alone is too weak to survive over glass, where the
//     background behind each chip is different.
//   · Counts are part of the chip, so the list's shape is legible before you
//     tap anything. A filter that leads to nothing should say so up front.
//
// Chips size to their content and scroll horizontally, so any number of them
// fits any screen without wrapping or truncating.

import React from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  type ViewStyle,
  type StyleProp,
} from "react-native";

import { haptics } from "@/src/utils/haptics";
import { useIOSTheme, IOSAppFont } from "./theme";
import { Glass } from "./Glass";

export interface IOSFilterChip<T extends string = string> {
  key: T;
  label: string;
  /** Shown after the label. Omit where a count is meaningless. */
  count?: number;
}

export interface IOSFilterChipsProps<T extends string = string> {
  chips: IOSFilterChip<T>[];
  active: T;
  onChange: (key: T) => void;
  /** Accent for the selected chip. Defaults to the app tint. */
  tint?: string;
  /** Side gutter matching the list the chips sit above. */
  inset?: number;
  style?: StyleProp<ViewStyle>;
}

export function IOSFilterChips<T extends string = string>({
  chips,
  active,
  onChange,
  tint,
  inset = 16,
  style,
}: IOSFilterChipsProps<T>) {
  const theme = useIOSTheme();
  const accent = tint ?? theme.systemGray2;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.row, { paddingHorizontal: inset }]}
      style={style}
    >
      {chips.map((chip) => {
        const isActive = chip.key === active;
        const empty = chip.count === 0;

        return (
          <Pressable
            key={chip.key}
            onPress={() => {
              if (isActive) return;
              haptics.tap();
              onChange(chip.key);
            }}
            style={[styles.chip, {borderWidth: .5, borderColor: theme.opaqueSeparator}]}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={
              chip.count === undefined ? chip.label : `${chip.label}, ${chip.count}`
            }
          >
            <Glass
              variant={isActive ? "regular" : "clear"}
              radius={CHIP_RADIUS}
              interactive
              tint={isActive ? accent : undefined}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
              fallbackIntensity={isActive ? 60 : 24}
              fallbackTint={isActive ? accent : theme.secondarySystemBackground}
            />

            <Text
              style={[
                IOSAppFont.label,
                {
                  color: isActive
                    ? "#FFFFFF"
                    : empty
                      ? theme.tertiaryLabel
                      : theme.secondaryLabel,
                  fontFamily: isActive ? "Poppins_600SemiBold" : "Poppins_500Medium",
                },
              ]}
            >
              {chip.label}
            </Text>

            {chip.count !== undefined && (
              <Text
                style={[
                  IOSAppFont.description,
                  styles.count,
                  { color: isActive ? "rgba(255,255,255,0.85)" : theme.tertiaryLabel },
                ]}
              >
                {chip.count > 99 ? "99+" : chip.count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const CHIP_RADIUS = 30;

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: CHIP_RADIUS,
    overflow: "hidden",
  },
  count: { marginTop: 0 },
});

export default IOSFilterChips;
