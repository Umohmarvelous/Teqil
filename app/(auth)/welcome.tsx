/**
 * app/(auth)/welcome.tsx
 *
 * Full-screen onboarding carousel.
 * - Slides 0-2: brand/feature slides
 * - Slide 3 (last): full-screen role selection
 *
 * Role routing:
 *   driver     → /(auth)/login  (with role pre-selected)
 *   passenger  → /(auth)/passenger-entry  (3 options: Pay Fare, Book Ride, Find Trip)
 *   park_owner → /(auth)/login
 */

import React, { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
  ScrollView,
  Animated,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import type { UserRole } from "@/src/models/types";

const { width: W, height: H } = Dimensions.get("window");

// ─── Slide data ───────────────────────────────────────────────────────────────
const SLIDES = [
  {
    id: "earn",
    gradient: ["#003D1F", "#000"] as const,
    accentColor: "#99F3C6",
    icon: "car-sport" as const,
    iconBg: "rgba(74,222,128,0.15)",
    eyebrow: "FOR DRIVERS",
    title: "Earn While\nYou Drive",
    body: "Fuel coins stack automatically every trip. No forced ads — revenue shares directly into your wallet.",
    decorIcon1: "wallet" as const,
    decorIcon2: "star" as const,
  },
  {
    id: "safe",
    gradient: ["#0A0A2E", "#000"] as const,
    accentColor: "#60A5FA",
    icon: "shield-checkmark" as const,
    iconBg: "rgba(96,165,250,0.15)",
    eyebrow: "FOR PASSENGERS",
    title: "Travel Safe,\nAlways",
    body: "Live tracking, emergency contacts, and real-time arrival alerts — every trip, every time.",
    decorIcon1: "people" as const,
    decorIcon2: "location" as const,
  },
  // 00A651
  {
    id: "park",
    gradient: ["#1A0A00", "#000"] as const,
    accentColor: "#FB923C",
    icon: "business" as const,
    iconBg: "rgba(251,146,60,0.15)",
    eyebrow: "FOR PARK OWNERS",
    title: "Monitor Your\nPark Live",
    body: "Real-time trip stats, driver verification, emergency alerts, and park-wide broadcasts.",
    decorIcon1: "megaphone" as const,
    decorIcon2: "bar-chart" as const,
  },
];

// ─── Feature slide ────────────────────────────────────────────────────────────
function FeatureSlide({
  slide,
  index,
  scrollX,
}: {
  slide: (typeof SLIDES)[0];
  index: number;
  scrollX: Animated.Value;
}) {
  const inputRange = [(index - 1) * W, index * W, (index + 1) * W];

  const opacity = scrollX.interpolate({
    inputRange,
    outputRange: [0, 1, 0],
    extrapolate: "clamp",
  });
  const scale = scrollX.interpolate({
    inputRange,
    outputRange: [0.88, 1, 0.88],
    extrapolate: "clamp",
  });
  const translateY = scrollX.interpolate({
    inputRange,
    outputRange: [40, 0, 40],
    extrapolate: "clamp",
  });

  return (
    <View style={{ width: W, height: H }}>
      
      <LinearGradient
        colors={slide.gradient}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
      />

      {/* Decorative circles */}
      <View style={[decorStyles.circle1, { borderColor: slide.accentColor + "18" }]} />
      <View style={[decorStyles.circle2, { borderColor: slide.accentColor + "10" }]} />

      {/* Decor icons */}
      <Animated.View style={[decorStyles.iconFloat1, { opacity }]}>
        <View style={[decorStyles.floatIconBg, { backgroundColor: slide.accentColor + "12" }]}>
          <Ionicons name={slide.decorIcon1} size={28} color={slide.accentColor + "66"} />
        </View>
      </Animated.View>
      {/* <Animated.View style={[decorStyles.iconFloat2, { opacity }]}>
        <View style={[decorStyles.floatIconBg, { backgroundColor: slide.accentColor + "12" }]}>
          <Ionicons name={slide.decorIcon2} size={24} color={slide.accentColor + "55"} />
        </View>
      </Animated.View> */}

      {/* Main content */}
      <Animated.View
        style={[
          slideStyles.content,
          { opacity, transform: [{ scale }, { translateY }] },
        ]}
      >
        {/* Icon */}
        <View style={[slideStyles.mainIconWrap,
          // { backgroundColor: slide.iconBg }
        ]}>
          <Ionicons name={slide.icon} size={100} color={slide.accentColor} />
        </View>

        {/* Eyebrow */}
        <View style={[slideStyles.eyebrowPill, { backgroundColor: slide.accentColor + "18" }]}>
          <Text style={[slideStyles.eyebrow, { color: slide.accentColor }]}>{slide.eyebrow}</Text>
        </View>

        {/* Title */}
        <View>
          <Text style={slideStyles.title}>{slide.title}</Text>
        </View>

        {/* Body */}
        <Text style={slideStyles.body}>{slide.body}</Text>
      </Animated.View>
    </View>
  );
}

// ─── Role card ────────────────────────────────────────────────────────────────
function RoleCard({
  role,
  icon,
  title,
  desc,
  gradient,
  selected,
  onPress,
}: {
  role: UserRole;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  gradient: readonly [string, string];
  selected: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      {/* <StatusBar style="inverted" backgroundColor="transparent" animated/> */}
      <Pressable onPress={handlePress} style={[roleStyles.card, selected && roleStyles.cardSelected]}>
        <LinearGradient
          colors={selected ? gradient : [Colors.text, Colors.text]}
              
          style={roleStyles.cardGradient} 
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={[roleStyles.iconWrap, { backgroundColor: selected ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)" }]}>
            <Ionicons name={icon} size={22} color={selected ? "#fff" : "rgba(255,255,255,0.55)"} />
          </View>
          <View style={roleStyles.textWrap}>
            <Text style={[roleStyles.title, selected && roleStyles.titleSelected]}>{title}</Text>
            <Text style={[roleStyles.desc, selected && roleStyles.descSelected]}>{desc}</Text>
          </View>
          <View style={[roleStyles.checkCircle, selected && roleStyles.checkCircleSelected]}>
            {selected && <Ionicons name="checkmark" size={24} color="#fff" />}
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ─── Role selection slide (last full-screen slide) ────────────────────────────
function RoleSlide({ scrollX }: { scrollX: Animated.Value }) {
  const { isAuthenticated, user } = useAuthStore();

  const insets = useSafeAreaInsets();
  const { setSelectedRole, selectedRole } = useAuthStore();
  const [localRole, setLocalRole] = useState<UserRole | null>(selectedRole);

  const index = SLIDES.length; // last slide index
  const inputRange = [(index - 1) * W, index * W, (index + 1) * W];

  const opacity = scrollX.interpolate({
    inputRange,
    outputRange: [0, 1, 0],
    extrapolate: "clamp",
  });

  const handleSelect = (role: UserRole) => {
    setLocalRole(role);
    setSelectedRole(role);
  };

  const handleContinue = useCallback(() => {
    // if (!localRole) return;
    // Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // if (localRole === "driver") {
    //   router.push("/(auth)/login");
    // } else if (localRole === "passenger") {
    //   router.push("/(auth)/passenger-entry");
    // } else {
    //   router.push("/(auth)/login");
    // }


    if (!isAuthenticated || !user) {
      // First time or logged out — always go to login, not welcome
      // Welcome is only for brand new users (handled in login screen with a
      // "Don't have an account? Sign up" flow)
      router.replace("/(auth)/login");
      return;
    }
  }, []);

  const ROLES = [
    {
      role: "driver" as UserRole,
      icon: "car-sport" as const,
      title: "Driver",
      desc: "Earn fuel coins on every trip",
      gradient: [Colors.primary, Colors.primaryDark] as const,
    },
    {
      role: "passenger" as UserRole,
      icon: "person" as const,
      title: "Passenger",
      desc: "Find trips & travel safely",
      gradient: [Colors.primary, Colors.primaryDark] as const,
    },
    {
      role: "park_owner" as UserRole,
      icon: "business" as const,
      title: "Park Owner",
      desc: "Monitor and manage your park",
      gradient: [Colors.primary, Colors.primaryDark] as const,
    },
  ];

  return (
    <Animated.View style={{ width: W, height: H, opacity }}>
      <LinearGradient
        colors={["#080808", "#0D0D0D", "#111"]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Subtle green glow top-center */}
      {/* <View style={roleSlideStyles.glowTop} /> */}

      <View
        style={[
          roleSlideStyles.inner,
          { paddingTop: insets.top + 60, paddingBottom: Math.max(insets.bottom, 24) + (Platform.OS === "web" ? 34 : 0) },
        ]}
      >
        {/* Header */}
        <View style={roleSlideStyles.container}> 
        {/* {/*   <View style={roleSlideStyles.header}>
            <View style={roleSlideStyles.teqilBadge}>
              <Ionicons name="navigate" size={18} color={Colors.primary} />
              <Text style={roleSlideStyles.teqilText}>TEQIL</Text>
            </View> 
            <Text style={roleSlideStyles.heading}>Who are you?</Text>
            <Text style={roleSlideStyles.sub}>
              Choose your role to get started
            </Text>
          </View> */}

          {/* Role cards */}
          {/* <View style={roleSlideStyles.cards}>
            {ROLES.map((r) => (
              <RoleCard
                key={r.role}
                role={r.role}
                icon={r.icon}
                title={r.title}
                desc={r.desc}
                gradient={r.gradient}
                selected={localRole === r.role}
                onPress={() => handleSelect(r.role)}
              />
            ))}
          </View> */}
        </View>

        {/* Continue button */}
        <View style={roleSlideStyles.footer}>
          <Pressable
            style={({ pressed }) => [
              roleSlideStyles.continueBtn,
              !localRole && roleSlideStyles.continueBtnDisabled,
              pressed && localRole && { opacity: 0.88 },
            ]}
            onPress={handleContinue}
            // disabled={!localRole}
          >
            <View style={[roleSlideStyles.continueBtnGradient, { backgroundColor: Colors.primary}]}>
              <Text style={[roleSlideStyles.continueBtnText, !localRole && roleSlideStyles.continueBtnTextDisabled]}>
                {localRole ? "Continue" : "Get Started"}
              </Text>
              {localRole && <Ionicons name="arrow-forward" size={18} color="#fff" />}
            </View>
          </Pressable>

          {/* Already have account */}
          <Pressable
            style={roleSlideStyles.signinLink}
            onPress={() => router.push("/(auth)/login")}
          >
            <Text style={roleSlideStyles.signinLinkText}>
              Already have an account?{" "}
              <Text style={roleSlideStyles.signinLinkHighlight}>Sign In</Text>
            </Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Dot indicators ───────────────────────────────────────────────────────────
function Dots({ total, scrollX }: { total: number; scrollX: Animated.Value }) {
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: total }).map((_, i) => {
        const width = scrollX.interpolate({
          inputRange: [(i - 1) * W, i * W, (i + 1) * W],
          outputRange: [6, 22, 6],
          extrapolate: "clamp",
        });
        const opacity = scrollX.interpolate({
          inputRange: [(i - 1) * W, i * W, (i + 1) * W],
          outputRange: [0.35, 1, 0.35],
          extrapolate: "clamp",
        });
        const bg = scrollX.interpolate({
          inputRange: [(i - 1) * W, i * W, (i + 1) * W],
          outputRange: [
            "rgba(255,255,255,0.3)",
            Colors.textTertiary,
            "rgba(255,255,255,0.3)",
          ],
          extrapolate: "clamp",
        });
        return (
          <Animated.View
            key={i}
            style={[dotStyles.dot, { width, opacity, backgroundColor: bg as any }]}
          />
        );
      })}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [currentIndex, setCurrentIndex] = useState(0);

  const totalSlides = SLIDES.length + 1; // +1 for role slide

  const handleNext = () => {
    const next = Math.min(currentIndex + 1, totalSlides - 1);
    scrollRef.current?.scrollTo({ x: next * W, animated: true });
    setCurrentIndex(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: false,
      listener: (e: any) => {
        const idx = Math.round(e.nativeEvent.contentOffset.x / W);
        setCurrentIndex(idx);
      },
    }
  );

  const isLastSlide = currentIndex === totalSlides - 1;

  return (
    <View style={styles.root}>
      {/* Carousel */}
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, index) => (
          <FeatureSlide
            key={slide.id}
            slide={slide}
            index={index}
            scrollX={scrollX}
          />
        ))}
        <RoleSlide scrollX={scrollX} />
      </Animated.ScrollView>

      {/* Bottom nav: dots + next button (hidden on last slide) */}
      {!isLastSlide && (
        <View
          style={[
            styles.bottomNav,
            { bottom: Math.max(insets.bottom, 24) + (Platform.OS === "web" ? 34 : 0) },
          ]}
        >
          <Dots total={totalSlides} scrollX={scrollX} />
          <Pressable
            style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.85 }]}
            onPress={handleNext}
          >
            <LinearGradient
              colors={[Colors.text, Colors.text]}
              style={styles.nextBtnGradient}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
            </LinearGradient>
          </Pressable>
        </View>
      )}

      {/* Dots only on last slide (no next btn) */}
      {isLastSlide && (
        <View
          style={[
            styles.bottomNavCentered,
            { bottom: Math.max(insets.bottom, 24) + (Platform.OS === "web" ? 34 : 0) + 200 },
          ]}
        >
          <Dots total={totalSlides} scrollX={scrollX} />
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 32,
    gap: 100
  },
  bottomNavCentered: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 650,
    alignItems: "center",
  },
  nextBtn: {
    width: 56,
    height: 56,
    borderRadius: 30,
    overflow: "hidden",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
    alignSelf: 'flex-end',
  },
  nextBtnGradient: {
    flex: 1,
    // paddingRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});

const decorStyles = StyleSheet.create({
  circle1: {
    position: "absolute",
    width: W * 1.2,
    height: W * 1.2,
    borderRadius: W * 0.6,
    borderWidth: 1,
    top: -W * 0.4,
    left: -W * 0.1,
  },
  circle2: {
    position: "absolute",
    width: W * 0.8,
    height: W * 0.8,
    borderRadius: W * 0.4,
    borderWidth: 1,
    bottom: H * 0.1,
    right: -W * 0.3,
  },
  iconFloat1: {
    position: "absolute",
    top: H * 0.06,
    right: 35,
  },
  iconFloat2: {
    position: "absolute",
    bottom: H * 0.42,
    right: 38,
  },
  floatIconBg: {
    width: 56,
    height: 56,
    borderRadius: 76,
    alignItems: "center",
    justifyContent: "center",
  },
});

const slideStyles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 120,
    gap: 18,
  },
  mainIconWrap: {
    width: 188,
    height: 188,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    alignSelf: 'center'
  },
  eyebrowPill: {
    alignSelf: "center",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,

  },
  eyebrow: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    letterSpacing: 2,

  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 38,
    color: "#fff",
    lineHeight: 46,
    letterSpacing: -0.5,
    textAlign:"center"
  },
  body: {
    fontFamily: "Poppins_400Regular",
    fontSize: 16,
    color: "rgba(255,255,255,0.65)",
    lineHeight: 26,
    maxWidth: W * 0.82,
    textAlign: 'center'
  },
});

const roleSlideStyles = StyleSheet.create({
  inner: {
    flex: 1,
    paddingHorizontal: 24,    
  },
  glowTop: {
    position: "absolute",
    top: -190,
    left: W / 2 - 130,
    width: 580,
    height: 580,
    borderRadius: 620,
    backgroundColor: Colors.primary,
    opacity: 0.20,
  },
  container: {
    marginTop: 40,
    flex: 1,
    // justifyContent: "center",
  },
  header: {
    marginBottom: 23,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teqilBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,166,81,0.12)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(0,166,81,0.2)",
  },
  teqilText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: Colors.primary,
    letterSpacing: 2,
  },

  heading: {
    fontFamily: "Poppins_700Bold",
    fontSize: 30,
    color: Colors.primaryLight,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  sub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: Colors.primaryLight,
    lineHeight: 22,
  },
  cards: {
    gap: 22,
  },
  footer: {
    gap: 44,
  },
  continueBtn: {
    borderRadius: 30,
    overflow: "hidden",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
    
  },
  continueBtnDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  continueBtnGradient: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  continueBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  continueBtnTextDisabled: {
    color: "rgba(255,255,255,0.3)",
  },
  signinLink: {
    alignItems: "center",
    paddingVertical: 6,
  },
  signinLinkText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.4)",
  },
  signinLinkHighlight: {
    fontFamily: "Poppins_600SemiBold",
    color: Colors.primary,
  },
});

const roleStyles = StyleSheet.create({
  card: {
    borderRadius: 100,
    overflow: "hidden",
    // borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.06)",
  },
  cardSelected: {
    borderColor: "transparent",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  cardGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    gap: 14,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 100,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textWrap: { flex: 1 },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "rgba(255,255,255,0.55)",
  },
  titleSelected: { color: "#fff" },
  desc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.3)",
    marginTop: 3,
  },
  descSelected: { color: "rgba(255,255,255,0.75)" },
  checkCircle: {
    width: 30,
    height: 30,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleSelected: {
    borderColor: "transparent",
    backgroundColor: "rgba(255,255,255,0.25)",
  },
});

const dotStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,

  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});