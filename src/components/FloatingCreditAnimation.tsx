import React, { useEffect } from "react";
import { StyleSheet, View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
  withSpring,
} from "react-native-reanimated";
import { useCreditsStore, FloatingAnimation } from "@/src/store/useCreditsStore";
import { Colors } from "@/constants/colors";

// ─── Sparkle Particle ─────────────────────────────────────────────────────────
function SparkleParticle({ delay, angle }: { delay: number; angle: number }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const distance = 20 + Math.random() * 25;
  const targetX = Math.cos(angle) * distance;
  const targetY = Math.sin(angle) * distance;

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(1, { duration: 200 }),
        withTiming(0, { duration: 300 })
      )
    );
    scale.value = withDelay(
      delay,
      withSequence(
        withSpring(1.5, { damping: 8, stiffness: 200 }),
        withTiming(0.3, { duration: 400 })
      )
    );
    translateX.value = withDelay(delay, withTiming(targetX, { duration: 650, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(delay, withTiming(targetY, { duration: 650, easing: Easing.out(Easing.cubic) }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return <Animated.View style={[styles.sparkle, style]} />;
}

// ─── Floating Text + Sparkles ─────────────────────────────────────────────────
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

  const sparkleAngles = React.useMemo(() => {
    const count = 5;
    return Array.from({ length: count }, (_, i) => (i / count) * Math.PI * 2 + Math.random() * 0.5);
  }, []);

  useEffect(() => {
    opacity.value = withSequence(
      withTiming(1, { duration: 200 }),
      withTiming(1, { duration: 500 }),
      withTiming(0, { duration: 400 })
    );

    scale.value = withSpring(1.2, { damping: 10, stiffness: 100 }, () => {
      scale.value = withTiming(1, { duration: 200 });
    });

    translateY.value = withTiming(
      -70,
      {
        duration: 1100,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished) {
          runOnJS(onComplete)(anim.id);
        }
      }
    );
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
      <Text style={styles.floatingText}>+{anim.amount} 🪙</Text>
      {/* Sparkle burst */}
      {sparkleAngles.map((angle, i) => (
        <SparkleParticle key={i} delay={i * 40} angle={angle} />
      ))}
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
    alignItems: "center",
    justifyContent: "center",
  },
  floatingText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: Colors.primary,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  sparkle: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#FFD700",
  },
});
