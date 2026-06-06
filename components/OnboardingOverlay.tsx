// components/OnboardingOverlay.tsx
//
// Full-screen tutorial overlay that walks first-time users through Teqil's UI.
//
// Architecture:
//   – Role-aware: shows relevant steps for driver / passenger / park_owner.
//   – Each step describes a real UI region with a SpotlightRing that morphs
//     between positions via Animated.spring.
//   – A bottom card slides up with step content, icon, and nav controls.
//   – "Skip" is always visible in the top-right — one tap exits entirely.
//   – After the final step a "Let's go" button calls onComplete.
//
// Integration: render once inside RootLayout, conditionally based on
// useOnboarding().shouldShow. Pass onComplete to mark it done.

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  Dimensions,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";

const { width: W, height: H } = Dimensions.get("window");

// ─── Color tokens (inline to avoid import issues) ────────────────────────────
const C = {
  primary:     "#00A651",
  primaryDark: "#007a3d",
  primaryLight:"rgba(0,166,81,0.15)",
  gold:        "#F59E0B",
  error:       "#EF4444",
  surface:     "#FFFFFF",
  text:        "#0F172A",
  textSec:     "#64748B",
  dark:        "#0a1210",
  darkCard:    "#111c15",
  darkBorder:  "rgba(0,166,81,0.2)",
};

// ─── Step definitions ─────────────────────────────────────────────────────────

export type UserRole = "driver" | "passenger" | "park_owner";

interface SpotlightRegion {
  // Describes WHERE on screen the spotlight should appear.
  // All values are fractions of W / H so they work on any screen size.
  cx: number; // centre X (0–1)
  cy: number; // centre Y (0–1)
  rx: number; // half-width of ellipse  (0–1)
  ry: number; // half-height of ellipse (0–1)
}

interface TutorialStep {
  id:         string;
  icon:       string; // Ionicons name
  iconColor?: string;
  title:      string;
  body:       string;
  tip?:       string; // optional highlighted tip line
  region:     SpotlightRegion;
}

// Steps shared across all roles
const COMMON_STEPS: TutorialStep[] = [
  {
    id:    "welcome",
    icon:  "sparkles",
    iconColor: C.gold,
    title: "Welcome to Teqil",
    body:  "Nigeria's trusted ride network for drivers, passengers, and park owners. This quick tour takes under a minute.",
    tip:   "You can skip at any time — just tap Skip above.",
    region: { cx: 0.5, cy: 0.35, rx: 0.38, ry: 0.12 },
  },
  {
    id:    "header",
    icon:  "menu-outline",
    title: "Navigation header",
    body:  "The ☰ menu icon opens your personal sidebar with account info, quick links, and settings. Your avatar in the top-right goes to your profile.",
    tip:   "Swipe from the left edge to open the sidebar.",
    region: { cx: 0.5, cy: 0.07, rx: 0.48, ry: 0.055 },
  },
  {
    id:    "top-tabs",
    icon:  "albums-outline",
    title: "Home & For You tabs",
    body:  'The "Home" tab shows your dashboard and core actions. "For You" is a social feed of trip updates and park announcements.',
    region: { cx: 0.5, cy: 0.15, rx: 0.46, ry: 0.045 },
  },
  {
    id:    "bottom-tabs",
    icon:  "grid-outline",
    title: "Bottom navigation",
    body:  "Four tabs live here: Home (your dashboard), You (profile & history), Messages (chats), and Settings.",
    region: { cx: 0.5, cy: 0.93, rx: 0.48, ry: 0.055 },
  },
  {
    id:    "messages",
    icon:  "chatbubble-ellipses-outline",
    title: "Messages tab",
    body:  "Start a direct conversation with any driver by their badge ID. All your chats live here with real-time delivery ticks.",
    tip:   "Tap + inside Messages to find a driver by ID.",
    region: { cx: 0.72, cy: 0.93, rx: 0.14, ry: 0.055 },
  },
  {
    id:    "settings",
    icon:  "settings-outline",
    title: "Settings",
    body:  "Customise theme (light/dark), language (English/Pidgin), notifications, privacy, and biometric lock.",
    region: { cx: 0.89, cy: 0.93, rx: 0.1, ry: 0.055 },
  },
];

const DRIVER_STEPS: TutorialStep[] = [
  {
    id:    "driver-balance",
    icon:  "star",
    iconColor: C.gold,
    title: "Your coin balance",
    body:  "Coins accumulate every 30 seconds during an active trip. 70 % of ad revenue goes directly to you. The 👁 icon hides your balance.",
    tip:   "₦1 ≈ 1.43 coins. Coins are redeemable in the rewards section.",
    region: { cx: 0.5, cy: 0.38, rx: 0.42, ry: 0.14 },
  },
  {
    id:    "driver-start",
    icon:  "navigate-circle",
    iconColor: C.primary,
    title: "START TRIP button",
    body:  "Creates a new trip from your current GPS location. You'll get a unique 6-character code — share it with passengers so they can join and track you live.",
    tip:   "Your location is only shared while a trip is active.",
    region: { cx: 0.5, cy: 0.62, rx: 0.44, ry: 0.07 },
  },
  {
    id:    "driver-qr",
    icon:  "qr-code",
    title: "Your QR code",
    body:  "Passengers scan this to pay the fare directly. Your badge ID  is embedded in the QR — it never changes.",
    region: { cx: 0.5, cy: 0.5, rx: 0.35, ry: 0.12 },
  },
  {
    id:    "driver-history",
    icon:  "time-outline",
    title: "Trip history",
    body:  'Filter trips by "All", "Active", or "Completed". Each card shows passengers carried, duration, and estimated coins earned.',
    region: { cx: 0.5, cy: 0.5, rx: 0.44, ry: 0.15 },
  },
];

const PASSENGER_STEPS: TutorialStep[] = [
  {
    id:    "passenger-find",
    icon:  "search-circle",
    iconColor: C.primary,
    title: "FIND TRIP",
    body:  "Enter the 6-character trip code your driver shares with you. You'll see the live route, driver details, and can add emergency contacts.",
    tip:   "Codes are case-insensitive — ABC123 = abc123.",
    region: { cx: 0.5, cy: 0.62, rx: 0.44, ry: 0.07 },
  },
  {
    id:    "passenger-pay",
    icon:  "card-outline",
    iconColor: C.gold,
    title: "Pay Fare",
    body:  "Tap the ₦ button to pay your driver. Scan their QR code or type their badge ID. Quick-amount buttons (₦500, ₦1000…) speed things up.",
    region: { cx: 0.5, cy: 0.5, rx: 0.44, ry: 0.10 },
  },
  {
    id:    "passenger-driver-search",
    icon:  "people-circle-outline",
    title: "Find a driver",
    body:  "Search any driver by their 6-character badge ID or partial name. See their vehicle, city, and rating before messaging them directly.",
    tip:   "Badge IDs are the first 6 letters of the driver's username.",
    region: { cx: 0.5, cy: 0.5, rx: 0.44, ry: 0.10 },
  },
  {
    id:    "passenger-sos",
    icon:  "warning",
    iconColor: C.error,
    title: "SOS alert",
    body:  "During a live trip, the red SOS button immediately notifies your emergency contacts and the park owner with your live location.",
    tip:   "Add emergency contacts when joining a trip — they get SMS updates.",
    region: { cx: 0.85, cy: 0.55, rx: 0.12, ry: 0.055 },
  },
];

const PARK_OWNER_STEPS: TutorialStep[] = [
  {
    id:    "park-dashboard",
    icon:  "stats-chart",
    iconColor: C.primary,
    title: "Park dashboard",
    body:  "Monitor active trips, total drivers, and completion rate in real time. The numbers update automatically as drivers start and finish trips.",
    region: { cx: 0.5, cy: 0.38, rx: 0.44, ry: 0.18 },
  },
  {
    id:    "park-alerts",
    icon:  "alert-circle",
    iconColor: C.error,
    title: "Emergency alerts",
    body:  "SOS signals from passengers on trips departing your park appear here instantly. Tap any alert to see the live location and driver details.",
    region: { cx: 0.5, cy: 0.50, rx: 0.44, ry: 0.12 },
  },
  {
    id:    "park-broadcast",
    icon:  "megaphone",
    iconColor: C.gold,
    title: "Broadcast messages",
    body:  "Send an announcement to all drivers registered to your park. Great for price changes, road closures, or safety notices.",
    region: { cx: 0.5, cy: 0.65, rx: 0.44, ry: 0.08 },
  },
  {
    id:    "park-verify",
    icon:  "shield-checkmark",
    iconColor: C.primary,
    title: "Verify drivers",
    body:  "Review driver profiles and mark them as verified. Verified drivers display a trust badge to passengers — it increases booking confidence.",
    region: { cx: 0.5, cy: 0.55, rx: 0.44, ry: 0.10 },
  },
];

function buildSteps(role: UserRole | null): TutorialStep[] {
  const roleSteps =
    role === "driver"     ? DRIVER_STEPS :
    role === "park_owner" ? PARK_OWNER_STEPS :
    PASSENGER_STEPS;
  return [...COMMON_STEPS, ...roleSteps];
}

// ─── Spotlight ring ───────────────────────────────────────────────────────────

interface SpotlightProps {
  region:    SpotlightRegion;
  animating: boolean;
}

function SpotlightRing({ region, animating }: SpotlightProps) {
  const cx = region.cx * W;
  const cy = region.cy * H;
  const rw = region.rx * W;
  const rh = region.ry * H;

  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in
    Animated.timing(opacityAnim, {
      toValue:  1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Pulse loop
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue:  1.06,
          duration: 900,
          easing:   Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue:  1,
          duration: 900,
          easing:   Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => { pulse.stop(); };
  }, []);

  const pad = 10;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        spotStyles.ring,
        {
          opacity:   opacityAnim,
          left:      cx - rw - pad,
          top:       cy - rh - pad,
          width:     (rw + pad) * 2,
          height:    (rh + pad) * 2,
          borderRadius: (rh + pad) * 1.2,
          transform: [{ scale: pulseAnim }],
        },
      ]}
    />
  );
}

const spotStyles = StyleSheet.create({
  ring: {
    position:    "absolute",
    borderWidth: 2.5,
    borderColor: C.primary,
    shadowColor: C.primary,
    shadowOffset:{ width: 0, height: 0 },
    shadowOpacity:0.9,
    shadowRadius:12,
    // Glow tint fill
    backgroundColor: "rgba(0,166,81,0.06)",
  },
});

// ─── Step card ────────────────────────────────────────────────────────────────

interface StepCardProps {
  step:       TutorialStep;
  index:      number;
  total:      number;
  onNext:     () => void;
  onBack:     () => void;
  onComplete: () => void;
  isLast:     boolean;
  isDark:     boolean;
}

function StepCard({
  step, index, total, onNext, onBack, onComplete, isLast, isDark,
}: StepCardProps) {
  const slideY  = useRef(new Animated.Value(60)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Reset and re-animate every time step changes
    slideY.setValue(50);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(slideY,  { toValue: 0, damping: 22, stiffness: 180, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [step.id]);

  const cardBg     = isDark ? C.darkCard  : C.surface;
  const textColor  = isDark ? "#F1F5F0"   : C.text;
  const subColor   = isDark ? "#8da898"   : C.textSec;
  const borderCol  = isDark ? C.darkBorder: "rgba(0,166,81,0.12)";

  return (
    <Animated.View
      style={[
        cardStyles.card,
        {
          backgroundColor: cardBg,
          borderColor:     borderCol,
          opacity,
          transform: [{ translateY: slideY }],
        },
      ]}
    >
      {/* Progress dots */}
      <View style={cardStyles.dotsRow}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[
              cardStyles.dot,
              i === index && cardStyles.dotActive,
              i < index  && cardStyles.dotDone,
            ]}
          />
        ))}
      </View>

      {/* Icon + counter */}
      <View style={cardStyles.iconRow}>
        <View style={[cardStyles.iconCircle, { backgroundColor: isDark ? "rgba(0,166,81,0.15)" : C.primaryLight }]}>
          <Ionicons
            name={step.icon as any}
            size={26}
            color={step.iconColor || C.primary}
          />
        </View>
        <Text style={[cardStyles.counter, { color: subColor }]}>
          {index + 1} / {total}
        </Text>
      </View>

      {/* Title */}
      <Text style={[cardStyles.title, { color: textColor }]}>{step.title}</Text>

      {/* Body */}
      <Text style={[cardStyles.body, { color: subColor }]}>{step.body}</Text>

      {/* Tip pill */}
      {step.tip && (
        <View style={[cardStyles.tipRow, { backgroundColor: isDark ? "rgba(0,166,81,0.1)" : "rgba(0,166,81,0.08)", borderColor: borderCol }]}>
          <Ionicons name="bulb-outline" size={13} color={C.primary} />
          <Text style={cardStyles.tipText}>{step.tip}</Text>
        </View>
      )}

      {/* Navigation buttons */}
      <View style={cardStyles.btnRow}>
        {index > 0 ? (
          <Pressable
            style={({ pressed }) => [cardStyles.backBtn, pressed && { opacity: 0.7 }]}
            onPress={onBack}
          >
            <Ionicons name="arrow-back" size={16} color={isDark ? "#8da898" : C.textSec} />
            <Text style={[cardStyles.backBtnText, { color: isDark ? "#8da898" : C.textSec }]}>Back</Text>
          </Pressable>
        ) : (
          <View style={cardStyles.backBtn} />
        )}

        <Pressable
          style={({ pressed }) => [
            cardStyles.nextBtn,
            isLast && cardStyles.nextBtnFinal,
            pressed && { opacity: 0.85 },
          ]}
          onPress={isLast ? onComplete : onNext}
        >
          <Text style={cardStyles.nextBtnText}>
            {isLast ? "Let's go 🎉" : "Next"}
          </Text>
          {!isLast && <Ionicons name="arrow-forward" size={16} color="#fff" />}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    position:     "absolute",
    bottom:       0,
    left:         0,
    right:        0,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    padding:      24,
    paddingBottom:36,
    borderWidth:  1,
    gap:          12,
    shadowColor:  "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity:0.25,
    shadowRadius: 20,
    elevation:    24,
  },
  dotsRow: {
    flexDirection: "row",
    gap:           5,
    alignSelf:     "center",
    marginBottom:  4,
  },
  dot: {
    width:        6,
    height:       6,
    borderRadius: 3,
    backgroundColor: "rgba(100,116,139,0.35)",
  },
  dotActive: {
    width:           18,
    backgroundColor: C.primary,
  },
  dotDone: {
    backgroundColor: "rgba(0,166,81,0.45)",
  },
  iconRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
  },
  iconCircle: {
    width:        48,
    height:       48,
    borderRadius: 14,
    alignItems:   "center",
    justifyContent:"center",
  },
  counter: {
    fontFamily: "Poppins_500Medium",
    fontSize:   12,
    letterSpacing:0.5,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize:   19,
    lineHeight: 26,
  },
  body: {
    fontFamily: "Poppins_400Regular",
    fontSize:   14,
    lineHeight: 22,
  },
  tipRow: {
    flexDirection:    "row",
    alignItems:       "flex-start",
    gap:              8,
    borderRadius:     12,
    padding:          12,
    borderWidth:      1,
  },
  tipText: {
    fontFamily: "Poppins_400Regular",
    fontSize:   12,
    color:      C.primary,
    flex:       1,
    lineHeight: 18,
  },
  btnRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    marginTop:      4,
  },
  backBtn: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           5,
    padding:       10,
    minWidth:      60,
  },
  backBtnText: {
    fontFamily: "Poppins_500Medium",
    fontSize:   14,
  },
  nextBtn: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             7,
    backgroundColor: C.primary,
    borderRadius:    14,
    paddingHorizontal:22,
    paddingVertical:  13,
    shadowColor:     C.primary,
    shadowOffset:    { width: 0, height: 5 },
    shadowOpacity:   0.4,
    shadowRadius:    10,
    elevation:       6,
  },
  nextBtnFinal: {
    backgroundColor: C.gold,
    shadowColor:     C.gold,
  },
  nextBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize:   15,
    color:      "#fff",
  },
});

// ─── Dimmed overlay ───────────────────────────────────────────────────────────

function DimOverlay({ opacity: opacityValue }: { opacity: Animated.Value }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: "rgba(0,0,0,0.72)", opacity: opacityValue },
      ]}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface OnboardingOverlayProps {
  onComplete: () => void;
}

export default function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const insets       = useSafeAreaInsets();
  const { user }     = useAuthStore();
  const { theme }    = useSettingsStore();
  const isDark       = theme === "dark";

  const role  = (user?.role ?? "passenger") as UserRole;
  const steps = useMemo(() => buildSteps(role), [role]);

  const [stepIndex, setStepIndex] = useState(0);

  const dimOpacity   = useRef(new Animated.Value(0)).current;
  const skipOpacity  = useRef(new Animated.Value(0)).current;
  const exitScale    = useRef(new Animated.Value(1)).current;

  const currentStep = steps[stepIndex];
  const isLast      = stepIndex === steps.length - 1;

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(dimOpacity,  { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(skipOpacity, { toValue: 1, duration: 500, delay: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleComplete = useCallback(() => {
    // Exit animation
    Animated.parallel([
      Animated.timing(dimOpacity,  { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(skipOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.spring(exitScale, { toValue: 1.05, damping: 10, useNativeDriver: true }),
    ]).start(() => onComplete());
  }, [onComplete, dimOpacity, skipOpacity, exitScale]);

  const handleNext = useCallback(() => {
    if (stepIndex < steps.length - 1) setStepIndex((i) => i + 1);
  }, [stepIndex, steps.length]);

  const handleBack = useCallback(() => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }, [stepIndex]);

  const topPad = Platform.OS === "web" ? 20 : insets.top;

  return (
    <Animated.View
      style={[styles.root, { transform: [{ scale: exitScale }] }]}
      pointerEvents="box-none"
    >
      {/* Dimmed background */}
      <DimOverlay opacity={dimOpacity} />

      {/* Spotlight ring — morphs to new position on each step change */}
      <SpotlightRing
        key={currentStep.id}      // remount = re-animate on step change
        region={currentStep.region}
        animating={true}
      />

      {/* Skip button — always top-right */}
      <Animated.View
        style={[
          styles.skipWrap,
          { top: topPad + 12, opacity: skipOpacity },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          style={({ pressed }) => [
            styles.skipBtn,
            { backgroundColor: isDark ? "rgba(10,18,16,0.85)" : "rgba(255,255,255,0.92)" },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleComplete}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[
            styles.skipText,
            { color: isDark ? "rgba(255,255,255,0.75)" : C.textSec },
          ]}>
            Skip tutorial
          </Text>
          <Ionicons
            name="close"
            size={14}
            color={isDark ? "rgba(255,255,255,0.6)" : C.textSec}
          />
        </Pressable>
      </Animated.View>

      {/* Step counter badge (top-center) */}
      <Animated.View
        style={[
          styles.stepBadge,
          { top: topPad + 14, opacity: skipOpacity },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.stepBadgeText}>
          {stepIndex + 1} of {steps.length}
        </Text>
      </Animated.View>

      {/* Step card */}
      <StepCard
        step={currentStep}
        index={stepIndex}
        total={steps.length}
        onNext={handleNext}
        onBack={handleBack}
        onComplete={handleComplete}
        isLast={isLast}
        isDark={isDark}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  skipWrap: {
    position: "absolute",
    right:    16,
    zIndex:   10000,
  },
  skipBtn: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              6,
    paddingHorizontal:14,
    paddingVertical:   8,
    borderRadius:     20,
    borderWidth:      1,
    borderColor:      "rgba(0,166,81,0.25)",
    shadowColor:      "#000",
    shadowOffset:     { width: 0, height: 2 },
    shadowOpacity:    0.15,
    shadowRadius:     6,
    elevation:        4,
  },
  skipText: {
    fontFamily: "Poppins_500Medium",
    fontSize:   13,
  },
  stepBadge: {
    position:         "absolute",
    alignSelf:        "center",
    left:             0,
    right:            0,
    alignItems:       "center",
    zIndex:           10000,
    pointerEvents:    "none",
  },
  stepBadgeText: {
    fontFamily:      "Poppins_600SemiBold",
    fontSize:        12,
    color:           "rgba(255,255,255,0.45)",
    letterSpacing:   0.5,
  },
});