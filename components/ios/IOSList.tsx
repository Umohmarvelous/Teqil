// components/ios/IOSList.tsx
//
// The inset-grouped table view — the single most recognisable iOS layout, used
// by Settings and most system apps.
//
//   <IOSListSection header="Privacy" footer="Free rides always track.">
//     <IOSListRow symbol="location.fill" label="Share Location"
//                 accessory={{ type: "switch", value: on, onValueChange: setOn }} />
//     <IOSListRow symbol="map" label="Route History" accessory={{ type: "disclosure" }}
//                 onPress={…} />
//   </IOSListSection>
//
// Separators are inset to align with the label (not the icon), corners are
// rounded only on the first and last row, and rows meet the 44pt touch target —
// all the details that make a list read as native rather than approximated.

import React, { Children, isValidElement, cloneElement } from "react";
import {
  View,
  Text,
  Pressable,
  Switch,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import * as Haptics from "expo-haptics";

import { useIOSTheme, IOSFont, IOSMetrics } from "./theme";

// ─── Row ─────────────────────────────────────────────────────────────────────

export type IOSListAccessory =
  | { type: "disclosure" }
  | { type: "switch"; value: boolean; onValueChange: (v: boolean) => void }
  | { type: "checkmark"; checked: boolean }
  | { type: "detail"; text: string }
  | { type: "none" };

export interface IOSListRowProps {
  label: string;
  /** Secondary line under the label. */
  detail?: string;
  symbol?: SymbolViewProps["name"];
  /** Tint of the rounded icon tile. Defaults to the app tint. */
  symbolColor?: string;
  accessory?: IOSListAccessory;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Injected by IOSListSection — don't set manually. */
  __isLast?: boolean;
}

export function IOSListRow({
  label,
  detail,
  symbol,
  symbolColor,
  accessory = { type: "none" },
  onPress,
  destructive,
  disabled,
  __isLast,
}: IOSListRowProps) {
  const theme = useIOSTheme();
  const labelColor = destructive ? theme.systemRed : theme.label;

  const interactive = !!onPress && accessory.type !== "switch";

  const body = (
    <View style={styles.rowInner}>
      {symbol && (
        <View style={[styles.iconTile, { backgroundColor: symbolColor ?? theme.tint }]}>
          <SymbolView name={symbol} size={16} tintColor="#FFFFFF" fallback={null} />
        </View>
      )}

      <View style={styles.rowText}>
        <Text
          numberOfLines={1}
          style={[IOSFont.body, { color: labelColor, opacity: disabled ? 0.4 : 1 }]}
        >
          {label}
        </Text>
        {detail ? (
          <Text numberOfLines={2} style={[IOSFont.footnote, { color: theme.secondaryLabel, marginTop: 1 }]}>
            {detail}
          </Text>
        ) : null}
      </View>

      {accessory.type === "switch" && (
        <Switch
          value={accessory.value}
          onValueChange={(v) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            accessory.onValueChange(v);
          }}
          disabled={disabled}
          trackColor={{ true: theme.tint }}
        />
      )}
      {accessory.type === "detail" && (
        <Text style={[IOSFont.body, { color: theme.secondaryLabel }]}>{accessory.text}</Text>
      )}
      {accessory.type === "checkmark" && accessory.checked && (
        <SymbolView name="checkmark" size={16} tintColor={theme.tint} fallback={null} />
      )}
      {accessory.type === "disclosure" && (
        <SymbolView name="chevron.right" size={14} tintColor={theme.tertiaryLabel} fallback={null} />
      )}
    </View>
  );

  return (
    <View>
      {interactive ? (
        <Pressable
          onPress={onPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={detail}
          accessibilityState={{ disabled: !!disabled }}
          style={({ pressed }) => [
            styles.row,
            pressed && { backgroundColor: theme.systemFill },
          ]}
        >
          {body}
        </Pressable>
      ) : (
        <View style={styles.row}>{body}</View>
      )}

      {/* Separator inset to the label, iOS-style — not full bleed. */}
      {!__isLast && (
        <View
          style={[
            styles.separator,
            { backgroundColor: theme.separator, marginLeft: symbol ? 56 : 16 },
          ]}
        />
      )}
    </View>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────

export interface IOSListSectionProps {
  children: React.ReactNode;
  /** Uppercase grey caption above the group. */
  header?: string;
  /** Explanatory text below the group. */
  footer?: string;
  style?: ViewStyle;
}

export function IOSListSection({ children, header, footer, style }: IOSListSectionProps) {
  const theme = useIOSTheme();

  const rows = Children.toArray(children).filter(isValidElement);
  const lastIndex = rows.length - 1;

  return (
    <View style={[styles.section, style]}>
      {header ? (
        <Text style={[IOSFont.footnote, styles.header, { color: theme.secondaryLabel }]}>
          {header.toUpperCase()}
        </Text>
      ) : null}

      <View
        style={[
          styles.group,
          { backgroundColor: theme.secondarySystemGroupedBackground },
        ]}
      >
        {rows.map((child, i) =>
          cloneElement(child as React.ReactElement<IOSListRowProps>, {
            key: i,
            __isLast: i === lastIndex,
          }),
        )}
      </View>

      {footer ? (
        <Text style={[IOSFont.footnote, styles.footer, { color: theme.secondaryLabel }]}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 28 },
  header: { marginHorizontal: IOSMetrics.groupedInset + 4, marginBottom: 7, letterSpacing: 0.3 },
  footer: { marginHorizontal: IOSMetrics.groupedInset + 4, marginTop: 7, lineHeight: 16 },
  group: {
    marginHorizontal: IOSMetrics.groupedInset,
    borderRadius: IOSMetrics.groupedRadius,
    overflow: "hidden",
  },
  row: { minHeight: IOSMetrics.minTouchTarget, justifyContent: "center" },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 12,
  },
  iconTile: {
    width: 29,
    height: 29,
    borderRadius: 6.5,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  separator: { height: IOSMetrics.hairline },
});

export default IOSListSection;
