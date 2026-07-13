import React, { useEffect } from "react";
import { StyleSheet, View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  runOnJS,
  Easing,
  withSpring
} from "react-native-reanimated";
import { useCreditsStore, FloatingAnimation } from "@/src/store/useCreditsStore";
import { Colors } from "@/constants/colors";

function FloatingText({
  anim,
  onComplete,
}: {
  anim: FloatingAnimation;
  onComplete: (id: string) => void;
}) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withSequence(
      withTiming(1, { duration: 200 }),
      withTiming(1, { duration: 400 }),
      withTiming(0, { duration: 400 })
    );

    scale.value = withSpring(1.2, { damping: 10, stiffness: 100 }, () => {
      scale.value = withTiming(1, { duration: 200 });
    });

    translateY.value = withTiming(-60, {
      duration: 1000,
      easing: Easing.out(Easing.cubic),
    }, (finished) => {
      if (finished) {
        runOnJS(onComplete)(anim.id);
      }
    });
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.floatingContainer,
        { left: anim.x, top: anim.y },
        style,
      ]}
      pointerEvents="none"
    >
      <Text style={styles.floatingText}>+{anim.amount}</Text>
    </Animated.View>
  );
}

export default function FloatingCreditAnimation() {
  const { floatingAnimations, removeFloatingAnimation } = useCreditsStore();

  if (floatingAnimations.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {floatingAnimations.map((anim) => (
        <FloatingText
          key={anim.id}
          anim={anim}
          onComplete={removeFloatingAnimation}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: "absolute",
    zIndex: 9999,
  },
  floatingText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
    color: Colors.primary, // Green
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});
