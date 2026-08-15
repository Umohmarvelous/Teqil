// components/ios/SwipeableRow.tsx
//
// Swipe a row left to reveal actions, or keep going to commit the destructive
// one — the WhatsApp / Mail gesture.
//
//   ┌────────────────────────────────┬────────┬────────┐
//   │  row content                   │  More  │ Delete │
//   └────────────────────────────────┴────────┴────────┘
//     ← drag                           revealed at rest
//
// Three outcomes, which is what makes the gesture feel right:
//
//   · a short drag springs back                     (nothing happens)
//   · a drag past ~40% of the panel rests open      (you choose an action)
//   · a drag past the commit point runs the         (the shortcut everyone
//     destructive action on release                  who uses it daily wants)
//
// ── Details that are easy to get wrong ───────────────────────────────────────
// `activeOffsetX([-12, 12])` and `failOffsetY([-10, 10])` mean a vertical drag
// never gets claimed here, so the list still scrolls normally through the row.
// Without the failOffsetY, every scroll that starts on a row fights the swipe.
//
// The action panel is sized to its buttons and pinned to the right edge, so the
// buttons stay put while the content slides over them, rather than sliding in
// from off-screen at a different rate — the panel is revealed, not animated.
//
// No opacity is animated anywhere: rows carry glass, and animating alpha above
// a GlassView renders it wrong (expo/expo#41024). The panel is a plain fill and
// everything moves on transform.

import React, { useCallback, useImperativeHandle, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

import { haptics } from "@/src/utils/haptics";
import { IOSAppFont } from "./theme";

const SCREEN_WIDTH = Dimensions.get("window").width;

/** Width of one action button. Matches the iOS list-row action metric. */
const ACTION_WIDTH = 78;
/** Fraction of the panel you must pass for it to rest open. */
const OPEN_AT = 0.4;
/** Past this fraction of the screen, releasing commits the destructive action. */
const COMMIT_AT = 0.45;

const SPRING = { damping: 22, stiffness: 260, mass: 0.7 } as const;

export interface SwipeAction {
  key: string;
  label: string;
  /** SF Symbol name. */
  symbol?: string;
  /** Panel background for this action. */
  color: string;
  onPress: () => void;
  /**
   * The action a full swipe runs. At most one action should set this — it is
   * also the one drawn furthest from the content, so the full swipe visually
   * grows out of it.
   */
  destructive?: boolean;
}

export interface SwipeableRowHandle {
  close: () => void;
}

export interface SwipeableRowProps {
  children: React.ReactNode;
  /**
   * Revealed by swiping left, laid out in array order and pinned to the right
   * edge. Put the destructive action LAST so it sits against the screen edge,
   * which is where the full swipe grows from.
   */
  actions: SwipeAction[];
  /** Disable the gesture (e.g. while the row is in an editing mode). */
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Fires when the row opens or closes, for close-the-others coordination. */
  onOpenChange?: (open: boolean) => void;
}

export const SwipeableRow = React.forwardRef<SwipeableRowHandle, SwipeableRowProps>(
  function SwipeableRow({ children, actions, enabled = true, style, onOpenChange }, ref) {
    const panelWidth = actions.length * ACTION_WIDTH;
    const translateX = useSharedValue(0);
    const startX = useSharedValue(0);
    const isOpen = useRef(false);

    const setOpen = useCallback(
      (open: boolean) => {
        if (isOpen.current === open) return;
        isOpen.current = open;
        onOpenChange?.(open);
      },
      [onOpenChange],
    );

    const close = useCallback(() => {
      translateX.value = withSpring(0, SPRING);
      setOpen(false);
    }, [translateX, setOpen]);

    useImperativeHandle(ref, () => ({ close }), [close]);

    const destructive = actions.find((a) => a.destructive) ?? actions[actions.length - 1];

    const commit = useCallback(
      (action: SwipeAction) => {
        haptics.success();
        action.onPress();
      },
      [],
    );

    const runAction = useCallback(
      (action: SwipeAction) => {
        haptics.tap();
        close();
        action.onPress();
      },
      [close],
    );

    const pan = Gesture.Pan()
      .enabled(enabled)
      // Claim only clear horizontal movement, and give up immediately on
      // vertical — otherwise every scroll starting on a row fights this.
      .activeOffsetX([-12, 12])
      .failOffsetY([-10, 10])
      .onBegin(() => {
        startX.value = translateX.value;
      })
      .onUpdate((e) => {
        const next = startX.value + e.translationX;
        // Rightward past closed is rubber-banded to a stop: there is nothing
        // revealed on that side, so it must not look like there could be.
        translateX.value = next > 0 ? next * 0.15 : next;
      })
      .onEnd((e) => {
        const x = translateX.value;

        if (destructive && (x < -SCREEN_WIDTH * COMMIT_AT || e.velocityX < -1200)) {
          translateX.value = withTiming(-SCREEN_WIDTH, { duration: 180 }, (done) => {
            if (done) runOnJS(commit)(destructive);
          });
          return;
        }

        if (x < -panelWidth * OPEN_AT) {
          translateX.value = withSpring(-panelWidth, SPRING);
          runOnJS(setOpen)(true);
        } else {
          translateX.value = withSpring(0, SPRING);
          runOnJS(setOpen)(false);
        }
      });

    const contentStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }],
    }));

    return (
      // The destructive colour is the ROOT's background, not an animated width
      // on the panel. Over-swiping past the buttons then reveals it for free —
      // no layout animation per frame, and no gap where the content used to be.
      <View
        style={[styles.root, destructive ? { backgroundColor: destructive.color } : null, style]}
      >
        <View style={[styles.panel, { width: panelWidth }]}>
          {actions.map((action) => (
            <Pressable
              key={action.key}
              onPress={() => runAction(action)}
              style={[styles.action, { backgroundColor: action.color }]}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              {action.symbol ? (
                <SymbolView
                  name={action.symbol as SymbolViewProps["name"]}
                  size={20}
                  tintColor="#FFFFFF"
                  fallback={null}
                />
              ) : null}
              <Text style={[IOSAppFont.description, styles.actionLabel]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        <GestureDetector gesture={pan}>
          <Animated.View style={contentStyle}>{children}</Animated.View>
        </GestureDetector>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: { overflow: "hidden" },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    flexDirection: "row",
  },
  action: {
    width: ACTION_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  actionLabel: { color: "#FFFFFF", marginTop: 0, fontFamily: "Poppins_500Medium" },
});

export default SwipeableRow;
