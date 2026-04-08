
import React, {
  useEffect,
  useRef,
} from "react";

import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  Animated, Modal,
  PanResponder,
} from "react-native";
// ========== REUSABLE SWIPEABLE MODAL COMPONENT ==========
interface SwipeableModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  sheetHeight?: number;          // optional, defaults to 70% of screen height
  backdropColor?: string;        // defaults to "rgba(0,0,0,0.7)"
  handleVisible?: boolean;       // show drag handle, default true
}

export default function SwipeableModal({
  visible,
  onClose,
  children,
  sheetHeight,
  backdropColor = "rgba(0,0,0,0.7)",
  handleVisible = true,
}: SwipeableModalProps) {
  const defaultHeight = Math.min(Dimensions.get("window").height * 0.72, 560);
  const height = sheetHeight ?? defaultHeight;

  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 22,
          stiffness: 180,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: height,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, height, translateY, backdropOpacity]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          translateY.setValue(gs.dy);
          backdropOpacity.setValue(Math.max(0, 1 - gs.dy / height));
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > height * 0.35 || gs.vy > 0.6) {
          onClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            damping: 22,
            stiffness: 180,
            useNativeDriver: true,
          }).start();
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: backdropColor, opacity: backdropOpacity },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.swipeableSheet,
          { height, transform: [{ translateY }] },
        ]}
      >
        {handleVisible && (
          <View {...panResponder.panHandlers} style={styles.swipeableHandleArea}>
            <View style={styles.swipeableHandle} />
          </View>
        )}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.swipeableScrollContent}
          bounces={false}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// Add these styles to the existing StyleSheet or create a new one
const styles = StyleSheet.create({
  swipeableSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#111A14",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 24,
  },
  swipeableHandleArea: {
    paddingTop: 12,
    paddingBottom: 4,
    alignItems: "center",
  },
  swipeableHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  swipeableScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 14,
  },
});