// components/OnboardingOverlay.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  Easing,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  QrCodeIcon,
  History,
  Warning,
  MessageIcon,
} from "@hugeicons/core-free-icons";
import { Colors } from "@/constants/colors";
import Svg, { Line, Polygon, Path } from "react-native-svg";

const { width: SCREEN_W } = Dimensions.get("window");

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type GhostType = "top-tab" | "action" | "bottom-tab";

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  ghostType: GhostType;
  ghostLabel: string;
  ghostIcon?: any;
  isActive?: boolean;
  targetX: number;
  targetY: number;
  /* ---- Arrow config — change these per step ---------------------- */
  arrowDirection: number; // 0=right, 90=up, 180=left, 270=down, etc.
  arrowLength: number;
  /* ---- Description position relative to arrow tail --------------- */
  descriptionOffsetX?: number; // +right, -left  from arrow tail
  descriptionOffsetY?: number; // +down,  -up    from arrow tail
  ArrowShape?: React.FC<{ length: number }>;
}

interface OnboardingOverlayProps {
  onComplete: () => void;
}

/* ------------------------------------------------------------------ */
/*  SVG Arrow Shapes — swap these freely per step or globally          */
/* ------------------------------------------------------------------ */

export const ArrowDefault = ({ length }: { length: number }) => (
  <Svg width={length} height={24} viewBox={`0 0 ${length} 24`}>
    <Line
      x1="0" y1="12"
      x2={length - 10} y2="12"
      stroke="rgb(105 104 104)"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <Polygon
      points={`${length},12 ${length - 10},4 ${length - 10},20`}
      fill="rgb(105 104 104)"
    />
  </Svg>
);

export const ArrowOutline = ({ length }: { length: number }) => (
  <Svg width={length} height={24} viewBox={`0 0 ${length} 24`}>
    <Line
      x1="0" y1="12"
      x2={length - 12} y2="12"
      stroke="#FFFFFF"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <Path
      d={`M${length},12 L${length - 12},5 L${length - 12},19 Z`}
      stroke="#FFFFFF"
      strokeWidth="2.5"
      fill="none"
      strokeLinejoin="round"
    />
  </Svg>
);

export const ArrowChevron = ({ length }: { length: number }) => (
  <Svg width={length} height={24} viewBox={`0 0 ${length} 24`}>
    <Path
      d={`M0,12 L${length - 8},12 M${length - 14},6 L${length - 8},12 L${length - 14},18`}
      stroke="#FFFFFF"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

/* ------------------------------------------------------------------ */
/*  SVG Arrow — straight, 10 px gap, auto-rotation from tail→head       */
/* ------------------------------------------------------------------ */

const SvgArrow = ({
  tailX,
  tailY,
  headX,
  headY,
  ArrowShape = ArrowDefault,
}: {
  tailX: number;
  tailY: number;
  headX: number;
  headY: number;
  ArrowShape?: React.FC<{ length: number }>;
}) => {
  const dx = headX - tailX;
  const dy = headY - tailY;
  const arrowLength = Math.sqrt(dx * dx + dy * dy);

  const midX = (tailX + headX) / 2;
  const midY = (tailY + headY) / 2;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return (
    <View
      style={{
        position: "absolute",
        left: midX - arrowLength / 2,
        top: midY - 12,
        width: arrowLength,
        height: 24,
        transform: [{ rotate: `${angle}deg` }],
      }}
      pointerEvents="none"
    >
      <ArrowShape length={arrowLength} />
    </View>
  );
};

/* ------------------------------------------------------------------ */
/*  Ghost element builders — completely static                         */
/* ------------------------------------------------------------------ */

const GhostTopTab = ({
  label,
  isActive,
}: {
  label: string;
  isActive?: boolean;
}) => (
  <View style={{ alignItems: "center" }}>
    <Text
      style={{
        fontFamily: isActive ? "Poppins_700Bold" : "Poppins_400Medium",
        fontSize: 16,
        color: "#FFFFFF",
        opacity: isActive ? 1 : 0.55,
        letterSpacing: 0,
      }}
    >
      {label}
    </Text>
    {isActive && (
      <View
        style={{
          marginTop: 8,
          width: 42,
          height: 3.5,
          borderRadius: 2,
          backgroundColor: Colors.primary,
        }}
      />
    )}
  </View>
);

const GhostActionButton = ({
  icon,
  label,
}: {
  icon: any;
  label: string;
}) => (
  <View style={{ alignItems: "center", width: 80 }}>
    <View
      style={{
        width: 60,
        height: 60,
        borderRadius: 32,
        backgroundColor: "#2C2C2E",
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
      }}
    >
      <HugeiconsIcon icon={icon} size={24} color="#FFFFFF" />
    </View>
    <Text
      style={{
        fontFamily: "Poppins_500Medium",
        fontSize: 11,
        color: "#FFFFFF",
        textAlign: "center",
        marginTop: 0,
        lineHeight: 14,
      }}
    >
      {label}
    </Text>
  </View>
);

const GhostBottomTab = ({ icon, label }: { icon: any; label: string }) => (
  <View style={{ alignItems: "center", width: 70 }}>
    <HugeiconsIcon icon={icon} size={24} color="#FFFFFF" />
    <Text
      style={{
        fontFamily: "Poppins_400Regular",
        fontSize: 10,
        color: "#FFFFFF",
        marginTop: 4,
        letterSpacing: 0.2,
      }}
    >
      {label}
    </Text>
  </View>
);

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const steps: TutorialStep[] = useMemo(() => {
    const topTabY = insets.top + 73;
    const actionY = insets.top + 167;
    const bottomTabY = height - insets.bottom - 45;

    return [
      /* ── Home ─────────────────────────────────────────────── */
      {
        id: "home",
        title: "Home",
        description: "Your main dashboard with quick actions and trip overview.",
        ghostType: "top-tab",
        ghostLabel: "Home",
        isActive: true,
        targetX: width * 0.25,   // responsive: first tab at 25 % width
        targetY: topTabY,
        arrowDirection: 225,      // ↙ down-left  (45° toward bottom from left)
        arrowLength: 80,
        descriptionOffsetX: 0,    // card left edge sits at arrow tail
        descriptionOffsetY: 0,   // card sits below arrow tail
      },
      /* ── For You ────────────────────────────────────────────── */
      {
        id: "for-you",
        title: "For You",
        description: "Discover personalized content and updates.",
        ghostType: "top-tab",
        ghostLabel: "For You",
        isActive: true,
        targetX: width * 0.75,    // responsive: second tab at 75 % width
        targetY: topTabY,
        arrowDirection: -50,     // ← straight left
        arrowLength: 90,
        descriptionOffsetX: -16,  // card sits to the right of arrow tail
        descriptionOffsetY: 0, // vertically centered near tail
      },
      /* ── Scan Code ──────────────────────────────────────────── */
      {
        id: "scan-code",
        title: "Scan Code",
        description: "Scan driver QR codes to verify and join trips instantly.",
        ghostType: "action",
        ghostLabel: "Scan code",
        ghostIcon: QrCodeIcon,
        targetX: width * 0.134,
        targetY: actionY,
        arrowDirection: -120,       // → straight right
        arrowLength: 80,
        descriptionOffsetX: -220,// card sits to the left of arrow tail
        descriptionOffsetY: 0,
      },
      /* ── History ────────────────────────────────────────────── */
      {
        id: "history",
        title: "History",
        description: "View all your past trips and ride history.",
        ghostType: "action",
        ghostLabel: "History",
        ghostIcon: History,
        targetX: width * 0.622,
        targetY: actionY,
        arrowDirection: -90,      // ↑ straight up
        arrowLength: 85,
        descriptionOffsetX: -110,// center card horizontally on tail
        descriptionOffsetY: 0,
      },
      /* ── Emergency ──────────────────────────────────────────── */
      {
        id: "emergency",
        title: "Emergency Contact",
        description: "Quick access to emergency contacts and SOS features.",
        ghostType: "action",
        ghostLabel: "Emergency\nContact",
        ghostIcon: Warning,
        targetX: width * 0.858,
        targetY: actionY,
        arrowDirection: -450,     // ← straight left
        arrowLength: 80,
        descriptionOffsetX: 16,
        descriptionOffsetY: 0,
      },
      /* ── Messages ─────────────────────────────────────────── */
      {
        id: "messages",
        title: "Messages",
        description: "Chat with drivers and passengers in real-time.",
        ghostType: "bottom-tab",
        ghostLabel: "Messages",
        ghostIcon: MessageIcon,
        targetX: width * 0.625,
        targetY: bottomTabY,
        arrowDirection: 90,     // ↓ straight down
        arrowLength: 120,
        descriptionOffsetX: -190,
        descriptionOffsetY: -80,// card sits above arrow tail
      },
    ];
  }, [insets.top, insets.bottom, width, height]);

  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;

  /* Entrance fade */
  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
  }, [overlayOpacity]);

  /* Step transition */
  const goToStep = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= steps.length) return;

      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
        easing: Easing.ease,
      }).start(() => {
        setStepIndex(nextIndex);
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }).start();
      });
    },
    [contentOpacity, steps.length]
  );

  const handleNext = useCallback(() => {
    if (isLastStep) {
      handleDismiss();
    } else {
      goToStep(stepIndex + 1);
    }
  }, [isLastStep, stepIndex, goToStep]);

  const handleDismiss = useCallback(() => {
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
      easing: Easing.ease,
    }).start(() => {
      onComplete();
    });
  }, [overlayOpacity, onComplete]);

  /* -- Arrow geometry (single unified formula) -- */
  const arrowGeometry = useMemo(() => {
    const offset = 35; // px gap between arrow head and target
    const rad = (currentStep.arrowDirection * Math.PI) / 180;

    // Head sits just before the target, back along the arrow direction
    const headX = currentStep.targetX - Math.cos(rad) * offset;
    const headY = currentStep.targetY - Math.sin(rad) * offset;

    // Tail sits behind the head by arrowLength
    const tailX = headX - Math.cos(rad) * currentStep.arrowLength;
    const tailY = headY - Math.sin(rad) * currentStep.arrowLength;

    return { tailX, tailY, headX, headY };
  }, [currentStep]);

  /* -- Description position (anchored to arrow tail) -- */
  const descPosition = useMemo(() => {
    const { tailX, tailY } = arrowGeometry;
    const cardWidth = 220;

    const left =
      tailX + (currentStep.descriptionOffsetX || 0);
    const top =
      tailY + (currentStep.descriptionOffsetY || 0);

    return {
      left: Math.max(16, Math.min(width - cardWidth - 36, left)),
      top: Math.max(insets.top + 10, Math.min(height - 180, top)),
    };
  }, [arrowGeometry, currentStep, width, height, insets.top]);

  const renderGhost = () => {
    const { ghostType, ghostLabel, ghostIcon, isActive, targetX, targetY } = currentStep;
    const left = targetX - (ghostType === "action" ? 40 : ghostType === "bottom-tab" ? 35 : 25);
    const top = targetY - (ghostType === "action" ? 50 : ghostType === "bottom-tab" ? -2 : 20);

    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{ position: "absolute", left, top }}>
          {ghostType === "top-tab" && <GhostTopTab label={ghostLabel} isActive={isActive} />}
          {ghostType === "action" && <GhostActionButton icon={ghostIcon} label={ghostLabel} />}
          {ghostType === "bottom-tab" && <GhostBottomTab icon={ghostIcon} label={ghostLabel} />}
        </View>
      </View>
    );
  };

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity: overlayOpacity, zIndex: 999 }]}
      pointerEvents="box-none"
    >
      {/* Dimming layer */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => {}} pointerEvents="auto">
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.78)" }]} />
      </Pressable>

      {/* Tutorial content */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: contentOpacity }]}
        pointerEvents="box-none"
      >
        {renderGhost()}

        <SvgArrow
          tailX={arrowGeometry.tailX}
          tailY={arrowGeometry.tailY}
          headX={arrowGeometry.headX}
          headY={arrowGeometry.headY}
          ArrowShape={currentStep.ArrowShape || ArrowDefault}
        />

        {/* Description card — tail tip (accent bar) sits flush to arrow tail */}
        <View
          style={{
            position: "absolute",
            left: descPosition.left,
            top: descPosition.top,
            // maxWidth: 230,
            backgroundColor: "rgb(105 104 104)",
            // borderWidth: 2, borderColor: 'blue',
            flexDirection: "row",
            justifyContent: 'center'
          }}
        >
          {/* Accent bar — the "tail tip" of the description card */}
          <View
            style={{
              alignItems: 'center',
              justifyContent:'center'
            }}
          ><View style={{backgroundColor: Colors.textWhite, padding: 0, width: 4, height: 30, borderRadius: 50}}/></View>
          <View
            style={{
              flexDirection: "column",
              paddingHorizontal: 16,
              paddingVertical: 12,
              maxWidth: 230,
            }}
          >
            <Text
              style={{
                fontFamily: "Poppins_600SemiBold",
                fontSize: 15,
                color: "#141313",
              }}
            >
              {currentStep.title}
            </Text>
            <Text
              style={{
                fontFamily: "Poppins_400Regular",
                fontSize: 12,
                color: "#141313",
                marginTop: 4,
                lineHeight: 18,
              }}
            >
              {currentStep.description}
            </Text>
          </View>
          
          <View
            style={{
              alignItems: 'center',
              justifyContent:'center'
            }}
          ><View style={{backgroundColor: Colors.textWhite, padding: 0, width: 4, height: 30, borderRadius: 50}}/></View>
        </View>
      </Animated.View>

      {/* Bottom controls */}
      <View
        style={{
          position: "absolute",
          bottom: insets.bottom + 64,
          left: 60,
          right: 40,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 1000,
        }}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={handleDismiss}
          hitSlop={16}
          style={{ paddingVertical: 8, paddingHorizontal: 4 }}
        >
          <Text
            style={{
              fontFamily: "Poppins_500Medium",
              fontSize: 16,
              color: "#fff",
              // borderBottomWidth: 2,
              // borderBottomColor: 'white',
            }}
          >
            Skip
          </Text>
        </Pressable>

        <Pressable
          onPress={handleNext}
          hitSlop={16}
          style={{
            paddingVertical: 12,
            paddingHorizontal: 28,    
          }}
        >
          <Text
            style={{
              fontFamily: "Poppins_600SemiBold",
              fontSize: 15,
              color: "#FFFFFF",
              borderBottomWidth: 2,
              borderBottomColor: 'white',
            }}
          >
            {isLastStep ? "Done" : "Next"}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}