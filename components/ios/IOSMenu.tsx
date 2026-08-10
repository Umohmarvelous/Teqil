// components/ios/IOSMenu.tsx
//
// A UIMenu-style popover: the compact, blurred, rounded card iOS shows when you
// tap an ellipsis button or long-press a row.
//
// Supports the three item decorations iOS uses — a trailing checkmark for
// selected state, a leading SF Symbol, and systemRed for destructive items —
// plus inline toggles, which appear in menus like Safari's page settings.
//
// The menu measures its anchor and positions itself against it, flipping above
// the anchor when there isn't room below, exactly like a real popover.

import React, { useCallback, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type LayoutRectangle,
} from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useIOSTheme, IOSFont, IOSMetrics } from "./theme";
import { Glass, GlassScrim } from "./Glass";
import { IOSToggle } from "./IOSToggle";

export interface IOSMenuItem {
  label: string;
  /** SF Symbol shown on the trailing edge, as iOS menus do. */
  symbol?: SymbolViewProps["name"];
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Shows a leading checkmark. */
  selected?: boolean;
  /** Renders an inline switch instead of a tappable row. */
  toggle?: { value: boolean; onValueChange: (v: boolean) => void };
  /** Draws a group separator above this item. */
  startsNewSection?: boolean;
}

export interface IOSMenuProps {
  /** The control that opens the menu. Cloned with an onPress handler. */
  anchor: React.ReactElement;
  items: IOSMenuItem[];
  /** Menu width. iOS menus are ~250pt. */
  width?: number;
}

const MENU_WIDTH = 250;
const ROW_HEIGHT = 44;
const EDGE_MARGIN = 8;
/** iOS menu popovers use a 13pt radius. */
const MENU_RADIUS = 13;

export function IOSMenu({ anchor, items, width = MENU_WIDTH }: IOSMenuProps) {
  const theme = useIOSTheme();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<LayoutRectangle | null>(null);

  const progress = useSharedValue(0);

  const show = useCallback(() => {
    // Measure in window coordinates so the popover lands on the anchor.
    anchorRef.current?.measureInWindow((x, y, w, h) => {
      setRect({ x, y, width: w, height: h });
      setOpen(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      progress.value = withSpring(1, { damping: 24, stiffness: 360 });
    });
  }, [progress]);

  const hide = useCallback(() => {
    progress.value = withTiming(0, { duration: 130 });
    setTimeout(() => setOpen(false), 130);
  }, [progress]);

  const estimatedHeight = items.length * ROW_HEIGHT + 8;
  // Flip above the anchor when the menu wouldn't fit below it.
  const opensUpward = rect ? rect.y + rect.height + estimatedHeight > screenH - 40 : false;

  const top = rect
    ? opensUpward
      ? Math.max(rect.y - estimatedHeight - 6, EDGE_MARGIN)
      : rect.y + rect.height + 6
    : 0;

  const left = rect
    ? Math.min(Math.max(rect.x + rect.width / 2 - width / 2, EDGE_MARGIN), screenW - width - EDGE_MARGIN)
    : 0;

  const menuStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: 0.86 + progress.value * 0.14 },
      { translateY: (1 - progress.value) * (opensUpward ? 8 : -8) },
    ],
  }));

  const run = (item: IOSMenuItem) => {
    if (item.disabled) return;
    if (item.toggle) {
      item.toggle.onValueChange(!item.toggle.value);
      Haptics.selectionAsync();
      return; // toggles keep the menu open, as on iOS
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    hide();
    setTimeout(() => item.onPress?.(), 60);
  };

  // Pre-glass material. Real UIGlassEffect supplies the surface on iOS 26 and
  // this is never drawn; on every other path it IS the surface.
  const materialBg =
    theme.scheme === "dark" ? "rgba(44,44,46,0.80)" : "rgba(249,249,249,0.80)";

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        {React.cloneElement(anchor as React.ReactElement<any>, { onPress: show })}
      </View>

      <Modal visible={open} transparent animationType="none" statusBarTranslucent onRequestClose={hide}>
        <Pressable style={StyleSheet.absoluteFill} onPress={hide} accessibilityLabel="Dismiss menu">
          {/* Popovers blur without dimming — the content behind stays readable. */}
          <GlassScrim intensity={8} dim={false} />
        </Pressable>

        <Animated.View
          style={[styles.menu, { top, left, width }, menuStyle]}
          accessibilityViewIsModal
        >
          <Glass
            variant="regular"
            radius={MENU_RADIUS}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            fallbackIntensity={80}
            fallbackTint={materialBg}
          />

          {items.map((item, i) => {
            const color = item.destructive ? theme.systemRed : theme.label;
            return (
              <React.Fragment key={`${item.label}-${i}`}>
                {(item.startsNewSection || i > 0) && (
                  <View
                    style={{
                      height: item.startsNewSection ? 7 : IOSMetrics.hairline,
                      backgroundColor: item.startsNewSection ? theme.systemFill : theme.separator,
                    }}
                  />
                )}
                <Pressable
                  onPress={() => run(item)}
                  disabled={item.disabled}
                  accessibilityRole={item.toggle ? "switch" : "menuitem"}
                  accessibilityLabel={item.label}
                  accessibilityState={{
                    disabled: !!item.disabled,
                    checked: item.toggle ? item.toggle.value : item.selected,
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && !item.disabled && { backgroundColor: theme.systemFill },
                  ]}
                >
                  {item.selected !== undefined && (
                    <View style={styles.checkSlot}>
                      {item.selected && (
                        <SymbolView name="checkmark" size={15} tintColor={theme.tint} fallback={null} />
                      )}
                    </View>
                  )}

                  <Text
                    numberOfLines={1}
                    style={[
                      IOSFont.body,
                      { color, flex: 1, opacity: item.disabled ? 0.35 : 1 },
                    ]}
                  >
                    {item.label}
                  </Text>

                  {item.toggle ? (
                    <IOSToggle
                      value={item.toggle.value}
                      onValueChange={item.toggle.onValueChange}
                      accessibilityLabel={item.label}
                      style={styles.switch}
                    />
                  ) : item.symbol ? (
                    <SymbolView
                      name={item.symbol}
                      size={17}
                      tintColor={item.destructive ? theme.systemRed : theme.label}
                      fallback={null}
                    />
                  ) : null}
                </Pressable>
              </React.Fragment>
            );
          })}
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    borderRadius: MENU_RADIUS,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  row: {
    minHeight: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  checkSlot: { width: 18, alignItems: "flex-start" },
  switch: { transform: [{ scale: 0.78 }] },
});

export default IOSMenu;
