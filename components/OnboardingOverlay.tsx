import { Colors } from "@/constants/colors";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import Svg, { Defs, Mask, Rect, Circle, Path } from "react-native-svg";

const { width: W, height: H } = Dimensions.get("window");

interface TutorialStep {
  id: string;
  title: string;
  body: string;
  type: "none" | "circle";
  x: number;
  y: number;
  radius?: number;
  arrowDirection: "up" | "down" | "left" | "right";
  displayText?: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "home",
    title: "Home",
    body: "Tap here to return to your primary dashboard instantly.",
    type: "none",
    x: 0.3,
    y: 0.13,
    arrowDirection: "left",
    displayText: "Home",
  },
  {
    id: "for-you",
    title: "For You",
    body: "Explore tailor-made updates and personalized network recommendations.",
    type: "none",
    x: 0.78,
    y: 0.13,
    arrowDirection: "right",
    displayText: "For You",
  },
  {
    id: "scan-code",
    title: "Scan Code",
    body: "Instantly scan passenger or driver QR codes to pair devices seamlessly.",
    type: "circle",
    x: 0.134,
    y: 0.2154,
    radius: 26,
    arrowDirection: "left",
  },
  {
    id: "history",
    title: "History",
    body: "Review your detailed log of completed trips and overall metrics.",
    type: "circle",
    x: 0.622,
    y: 0.2154,
    radius: 26,
    arrowDirection: "up",
  },
  {
    id: "emergency-contact",
    title: "Emergency Contact",
    body: "One-tap trigger to alert dispatch and close contacts during crisis.",
    type: "circle",
    x: 0.866,
    y: 0.2154,
    radius: 26,
    arrowDirection: "right",
  },
  {
    id: "messaging-icon",
    title: "Messages",
    body: "Open secure real-time chats with connected drivers or dispatchers.",
    type: "none",
    x: 0.622,
    y: 0.95,
    arrowDirection: "down",
    displayText: "Messages",
  },
];

const GamingArrow = ({ direction }: { direction: string }) => {
  let rotation = "0deg";
  if (direction === "down") rotation = "180deg";
  if (direction === "left") rotation = "-90deg";
  if (direction === "right") rotation = "90deg";

  return (
    <View style={{ transform: [{ rotate: rotation }] }}>
      <Svg width="28" height="28" viewBox="0 0 28 28">
        <Path d="M14 2 L26 22 L14 17 L2 22 Z" fill={Colors.primary || "#E5C531"} />
      </Svg>
    </View>
  );
};

interface OnboardingOverlayProps {
  onComplete: () => void;
}

export default function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);

  const dimOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  const currentStep = TUTORIAL_STEPS[stepIndex];

  const animCX = useRef(new Animated.Value(TUTORIAL_STEPS[0].x * W)).current;
  const animCY = useRef(new Animated.Value(TUTORIAL_STEPS[0].y * H)).current;
  const animR = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(dimOpacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: false,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: 1, duration: 500, useNativeDriver: false }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 500, useNativeDriver: false }),
      ])
    ).start();
  }, [dimOpacity, bounceAnim]);

  useEffect(() => {
    const targetX = currentStep.x * W;
    const targetY = currentStep.y * H;
    const targetR = currentStep.type === "circle" ? (currentStep.radius ?? 40) : 0;

    Animated.sequence([
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 120,
        useNativeDriver: false,
      }),
      Animated.parallel([
        Animated.spring(animCX, { toValue: targetX, friction: 9, tension: 60, useNativeDriver: false }),
        Animated.spring(animCY, { toValue: targetY, friction: 9, tension: 60, useNativeDriver: false }),
        Animated.spring(animR, { toValue: targetR, friction: 9, tension: 60, useNativeDriver: false }),
      ]),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [stepIndex, currentStep, contentOpacity, animCX, animCY, animR]);

  const handleComplete = useCallback(() => {
    Animated.parallel([
      Animated.timing(dimOpacity, { toValue: 0, duration: 250, useNativeDriver: false }),
      Animated.timing(contentOpacity, { toValue: 0, duration: 250, useNativeDriver: false }),
    ]).start(() => onComplete());
  }, [onComplete, dimOpacity, contentOpacity]);

  const handleNext = useCallback(() => {
    if (stepIndex < TUTORIAL_STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      handleComplete();
    }
  }, [stepIndex, handleComplete]);

  const renderTooltipContent = () => {
    const offset = (currentStep.radius ?? 0) + 15;
    const TOOLTIP_W = 280;

    let containerStyle: any = {};
    let flexDir: any = "column";

    if (currentStep.arrowDirection === "up") {
      containerStyle = { top: offset, width: TOOLTIP_W, left: -TOOLTIP_W / 2, alignItems: "center" };
      flexDir = "column";
    } else if (currentStep.arrowDirection === "down") {
      containerStyle = { bottom: offset, width: TOOLTIP_W, left: -TOOLTIP_W / 2, alignItems: "center" };
      flexDir = "column-reverse";
    } else if (currentStep.arrowDirection === "left") {
      containerStyle = { top: -20, left: offset, width: TOOLTIP_W, alignItems: "center" };
      flexDir = "row";
    } else if (currentStep.arrowDirection === "right") {
      containerStyle = { top: -20, right: offset, width: TOOLTIP_W, justifyContent: "flex-end", alignItems: "center" };
      flexDir = "row-reverse";
    }

    const bounceDistance = 8;
    let translateY = bounceAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0] });
    let translateX = bounceAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0] });

    if (currentStep.arrowDirection === "up") translateY = bounceAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -bounceDistance] });
    if (currentStep.arrowDirection === "down") translateY = bounceAnim.interpolate({ inputRange: [0, 1], outputRange: [0, bounceDistance] });
    if (currentStep.arrowDirection === "left") translateX = bounceAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -bounceDistance] });
    if (currentStep.arrowDirection === "right") translateX = bounceAnim.interpolate({ inputRange: [0, 1], outputRange: [0, bounceDistance] });

    return (
      <View style={[styles.tooltipWrapper, containerStyle, { flexDirection: flexDir }]}>
        <Animated.View style={{ transform: [{ translateX }, { translateY }] }}>
          <GamingArrow direction={currentStep.arrowDirection} />
        </Animated.View>

        <View 
          style={[
            styles.gamingTextBox, 
            currentStep.arrowDirection === "left" || currentStep.arrowDirection === "right" 
              ? { marginHorizontal: 12 } 
              : { marginVertical: 8 }
          ]}
        >
          <Text style={styles.stepBody}>{currentStep.body}</Text>
        </View>
      </View>
    );
  };

  const AnimatedCircle = Animated.createAnimatedComponent(Circle);

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: dimOpacity }]}>
        <Svg width="100%" height="100%">
          <Defs>
            <Mask id="gamingSpotlight">
              <Rect x="0" y="0" width="100%" height="100%" fill="white" />
              <AnimatedCircle cx={animCX} cy={animCY} r={animR} fill="black" />
            </Mask>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="rgba(6, 9, 20, 0.88)" mask="url(#gamingSpotlight)" />
        </Svg>
      </Animated.View>

      {currentStep.type === "none" && currentStep.displayText && (
        <Animated.View
          style={[
            styles.foregroundItemAnchor,
            { opacity: contentOpacity, left: currentStep.x * W, top: currentStep.y * H },
          ]}
        >
          <Text style={styles.itemRawText}>{currentStep.displayText}</Text>
        </Animated.View>
      )}

      <Animated.View
        style={[
          styles.dynamicAnchor,
          {
            transform: [{ translateX: animCX }, { translateY: animCY }],
          },
        ]}
        pointerEvents="box-none"
      >
        <Animated.View style={{ opacity: contentOpacity }} pointerEvents="box-none">
          {renderTooltipContent()}
        </Animated.View>
      </Animated.View>

      <View style={styles.footerContainer} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [styles.navBtn, pressed && styles.btnPressed]}
          onPress={handleComplete}
        >
          <Text style={styles.skipBtnText}>Skip</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.navBtn, pressed && styles.btnPressed]}
          onPress={handleNext}
        >
          <Text style={styles.nextBtnText}>Next</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
  },
  foregroundItemAnchor: {
    position: "absolute",
    width: 0,
    height: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100000,
  },
  itemRawText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: Colors.primary,
    position: "absolute",
  },
  dynamicAnchor: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    zIndex: 100001,
  },
  tooltipWrapper: {
    position: "absolute",
  },
  gamingTextBox: {
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    maxWidth: 240,
  },
  stepBody: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#FFFFFF",
    lineHeight: 20,
    textAlign: "left",
  },
  footerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingBottom: Platform.OS === "ios" ? 50 : 30,
  },
  navBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  btnPressed: {
    opacity: 0.6,
  },
  skipBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#7E8494",
    letterSpacing: 0.5,
  },
  nextBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.primary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});