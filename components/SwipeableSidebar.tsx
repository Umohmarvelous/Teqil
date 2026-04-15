// components/SwipeableSidebar.tsx
import React, { useRef, useState } from 'react';
import { Dimensions, StyleSheet, Pressable } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Sidebar from './Sidebar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = 310;
const SWIPE_THRESHOLD = DRAWER_WIDTH * 0.3;

interface SwipeableSidebarProps {
  children: React.ReactNode;
  onOpen?: () => void;
  onClose?: () => void;
}

export default function SwipeableSidebar({ children, onOpen, onClose }: SwipeableSidebarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const translateX = useSharedValue(-DRAWER_WIDTH);
  const backdropOpacity = useSharedValue(0);
  const startX = useSharedValue(0);

  const openDrawer = () => {
    setIsVisible(true);
    translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
    backdropOpacity.value = withSpring(1, { damping: 20, stiffness: 200 });
    onOpen?.();
  };

  const closeDrawer = () => {
    translateX.value = withSpring(-DRAWER_WIDTH, { damping: 20, stiffness: 200 }, () => {
      runOnJS(setIsVisible)(false);
    });
    backdropOpacity.value = withSpring(0, { damping: 20, stiffness: 200 });
    onClose?.();
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startX.value = translateX.value;
      if (!isVisible) {
        runOnJS(setIsVisible)(true);
      }
    })
    .onUpdate((event) => {
      const newX = startX.value + event.translationX;
      translateX.value = Math.min(0, Math.max(-DRAWER_WIDTH, newX));
      backdropOpacity.value = 1 - Math.abs(translateX.value / DRAWER_WIDTH);
    })
    .onEnd((event) => {
      const velocity = event.velocityX;
      if (event.translationX > SWIPE_THRESHOLD || velocity > 500) {
        runOnJS(openDrawer)();
      } else if (event.translationX < -SWIPE_THRESHOLD || velocity < -500) {
        runOnJS(closeDrawer)();
      } else {
        if (isVisible) {
          translateX.value = withSpring(0);
          backdropOpacity.value = withSpring(1);
        } else {
          translateX.value = withSpring(-DRAWER_WIDTH);
          backdropOpacity.value = withSpring(0);
        }
      }
    });

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    backgroundColor: 'rgba(0,0,0,0.5)',
  }));

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={{ flex: 1 }}>
          {children}
        </Animated.View>
      </GestureDetector>

      {isVisible && (
        <>
          <Animated.View
            style={[StyleSheet.absoluteFill, backdropStyle]}
            pointerEvents="box-none"
          >
            <Pressable style={{ flex: 1 }} onPress={closeDrawer} />
          </Animated.View>
          <Animated.View style={[styles.drawer, drawerStyle]}>
            <Sidebar visible={isVisible} onClose={closeDrawer} />
          </Animated.View>
        </>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    zIndex: 10,
  },
});