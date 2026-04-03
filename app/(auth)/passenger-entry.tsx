/**
 * app/(auth)/passenger-entry.tsx
 *
 * Intermediate screen shown after passenger selects their role.
 * Three options:
 *  1. Pay Transport Fare → /(auth)/pay-fare  (then → /(passenger))
 *  2. Bolt a Ride        → coming soon modal
 *  3. Find Trip          → /(auth)/register  (then → /(passenger)/find-trip)
 */

import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
  Animated,
  Easing,
  Modal,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";

const { width: W } = Dimensions.get("window");

// ─── Option card data ─────────────────────────────────────────────────────────
const OPTIONS = [
  {
    id: "pay",
    icon: "card" as const,
    title: "Pay Transport Fare",
    desc: "Send payment to your driver seamlessly",
    gradient: [Colors.primary, Colors.primaryDark] as const,
    glow: Colors.primary,
    badge: null,
  },
  {
    id: "bolt",
    icon: "flash" as const,
    title: "Bolt a Ride",
    desc: "Instant ride booking, coming very soon",
    gradient: ["#7C3AED", "#5B21B6"] as const,
    glow: "#7C3AED",
    badge: "SOON",
  },
  {
    id: "find",
    icon: "search" as const,
    title: "Find Trip",
    desc: "Enter a trip code to join & track",
    gradient: ["#0284C7", "#0369A1"] as const,
    glow: "#0284C7",
    badge: null,
  },
] as const;

// ─── Animated option card ─────────────────────────────────────────────────────
function OptionCard({
  option,
  index,
  onPress,
}: {
  option: (typeof OPTIONS)[number];
  index: number;
  onPress: () => void;
}) {
  const translateY = useRef(new Animated.Value(60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        delay: 200 + index * 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 500,
        delay: 200 + index * 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  });

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
  };

  return (
    <Animated.View
      style={[
        cardStyles.wrap,
        { opacity, transform: [{ translateY }, { scale }] },
        option.id !== "bolt" && {
          shadowColor: option.glow,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.25,
          shadowRadius: 16,
          elevation: 10,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={cardStyles.pressable}
      >
        <LinearGradient
          colors={option.gradient}
          style={cardStyles.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Icon */}
          <View style={cardStyles.iconWrap}>
            <Ionicons name={option.icon} size={30} color="rgba(255,255,255,0.9)" />
          </View>

          {/* Text */}
          <View style={cardStyles.textBlock}>
            <Text style={cardStyles.title}>{option.title}</Text>
            <Text style={cardStyles.desc}>{option.desc}</Text>
          </View>

          {/* Badge or arrow */}
          {option.badge ? (
            <View style={cardStyles.badge}>
              <Text style={cardStyles.badgeText}>{option.badge}</Text>
            </View>
          ) : (
            <View style={cardStyles.arrow}>
              <Ionicons name="arrow-forward-circle" size={28} color="rgba(255,255,255,0.6)" />
            </View>
          )}

          {/* Decorative shapes */}
          <View style={cardStyles.decCircle1} />
          <View style={cardStyles.decCircle2} />
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function PassengerEntryScreen() {
  const insets = useSafeAreaInsets();
  const [boltModalVisible, setBoltModalVisible] = useState(false);

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerY = useRef(new Animated.Value(-24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(headerY, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  });

  const handleOption = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (id === "pay") {
      router.push("/(auth)/pay-fare");
    } else if (id === "bolt") {
      setBoltModalVisible(true);
    } else if (id === "find") {
      router.push("/(auth)/register");
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <LinearGradient
        colors={["#060606", "#0A0A0A", "#0E0E0E"]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Back button */}
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.7)" />
      </Pressable>

      {/* Header */}
      <Animated.View
        style={[
          styles.header,
          { opacity: headerOpacity, transform: [{ translateY: headerY }] },
        ]}
      >
        <View style={styles.passengerBadge}>
          <Ionicons name="person" size={14} color="#60A5FA" />
          <Text style={styles.passengerBadgeText}>PASSENGER</Text>
        </View>
        <Text style={styles.heading}>What would you{"\n"}like to do?</Text>
        <Text style={styles.sub}>Choose how you want to get started</Text>
      </Animated.View>

      {/* Options */}
      <View
        style={[
          styles.options,
          { paddingBottom: Math.max(insets.bottom, 24) + (Platform.OS === "web" ? 34 : 0) },
        ]}
      >
        {OPTIONS.map((opt, i) => (
          <OptionCard
            key={opt.id}
            option={opt}
            index={i}
            onPress={() => handleOption(opt.id)}
          />
        ))}
      </View>

      {/* Already have account */}
      <Pressable style={styles.signinLink} onPress={() => router.push("/(auth)/login")}>
        <Text style={styles.signinText}>
          Already have an account?{" "}
          <Text style={styles.signinHighlight}>Sign In</Text>
        </Text>
      </Pressable>

      {/* Bolt coming soon modal */}
      <Modal
        transparent
        visible={boltModalVisible}
        animationType="fade"
        onRequestClose={() => setBoltModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setBoltModalVisible(false)}
        >
          <View style={styles.comingSoonCard}>
            <View style={styles.comingSoonIcon}>
              <Ionicons name="flash" size={36} color="#A78BFA" />
            </View>
            <Text style={styles.comingSoonTitle}>Coming Soon!</Text>
            <Text style={styles.comingSoonDesc}>
              Bolt a Ride will let you instantly book drivers near you. Stay tuned!
            </Text>
            <Pressable
              style={styles.comingSoonBtn}
              onPress={() => setBoltModalVisible(false)}
            >
              <Text style={styles.comingSoonBtnText}>Got it</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 24,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  header: {
    gap: 10,
    marginBottom: 32,
    marginTop: 8,
  },
  passengerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(96,165,250,0.12)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.2)",
  },
  passengerBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10,
    color: "#60A5FA",
    letterSpacing: 2,
  },
  heading: {
    fontFamily: "Poppins_700Bold",
    fontSize: 30,
    color: "#fff",
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  sub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: "rgba(255,255,255,0.45)",
  },
  options: {
    flex: 1,
    gap: 14,
    justifyContent: "center",
  },
  signinLink: {
    alignItems: "center",
    paddingVertical: 16,
  },
  signinText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.35)",
  },
  signinHighlight: {
    fontFamily: "Poppins_600SemiBold",
    color: Colors.primary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  comingSoonCard: {
    backgroundColor: "#1A1A1A",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    gap: 14,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.2)",
  },
  comingSoonIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "rgba(167,139,250,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  comingSoonTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: "#fff",
  },
  comingSoonDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 22,
  },
  comingSoonBtn: {
    backgroundColor: "#7C3AED",
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 6,
  },
  comingSoonBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});

const cardStyles = StyleSheet.create({
  wrap: {
    borderRadius: 20,
    overflow: "hidden",
  },
  pressable: {
    borderRadius: 20,
    overflow: "hidden",
  },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: 22,
    gap: 16,
    minHeight: 90,
    position: "relative",
    overflow: "hidden",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textBlock: { flex: 1 },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#fff",
    marginBottom: 4,
  },
  desc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.65)",
    lineHeight: 18,
  },
  badge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10,
    color: "#fff",
    letterSpacing: 1.5,
  },
  arrow: {
    flexShrink: 0,
  },
  decCircle1: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.05)",
    top: -30,
    right: -20,
  },
  decCircle2: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.04)",
    bottom: -20,
    left: 40,
  },
});