import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
  StatusBar,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import type { UserRole } from "@/src/models/types";
import { useTranslation } from "react-i18next";

const { width } = Dimensions.get("window");

// ─── Role Card ────────────────────────────────────────────────────────────────

interface RoleCardProps {
  role: UserRole;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  selected: boolean;
  onPress: () => void;
  delay: number;
}

function RoleCard({
  icon,
  title,
  desc,
  selected,
  onPress,
  delay,
}: RoleCardProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);
  const scale = useSharedValue(1);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.96, { damping: 20 }, () => {
      scale.value = withSpring(1, { damping: 15 });
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Animated.View style={cardStyle}>
      <StatusBar barStyle={"dark-content"} backgroundColor={"red"} animated/>

      <Pressable
        onPress={handlePress}
        style={[styles.roleCard, selected && styles.roleCardSelected]}
      >
        {/* Icon */}
        <View
          style={[styles.roleIconWrap, selected && styles.roleIconWrapSelected]}
        >
          <Ionicons
            name={icon}
            size={24}
            color={selected ? Colors.surface : Colors.primary}
          />
        </View>

        {/* Text */}
        <View style={styles.roleTextWrap}>
          <Text
            style={[styles.roleTitle, selected && styles.roleTitleSelected]}
          >
            {title}
          </Text>
          <Text style={[styles.roleDesc, selected && styles.roleDescSelected]}>
            {desc}
          </Text>
        </View>

        {/* Checkmark */}
        {selected ? (
          <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
        ) : (
          <View style={styles.roleCheck} />
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── Welcome Screen ───────────────────────────────────────────────────────────

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { selectedRole, setSelectedRole } = useAuthStore();
  const { t } = useTranslation();

  // Entrance animations
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.7);
  const headingOpacity = useSharedValue(0);
  const headingY = useSharedValue(-24);
  const actionsOpacity = useSharedValue(0);
  const actionsY = useSharedValue(24);

  useEffect(() => {
    logoOpacity.value = withDelay(100, withTiming(1, { duration: 600 }));
    logoScale.value = withDelay(100, withSpring(1, { damping: 12 }));
    headingOpacity.value = withDelay(
      350,
      withTiming(1, { duration: 500 })
    );
    headingY.value = withDelay(
      350,
      withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) })
    );
    actionsOpacity.value = withDelay(850, withTiming(1, { duration: 400 }));
    actionsY.value = withDelay(
      850,
      withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));
  const headingStyle = useAnimatedStyle(() => ({
    opacity: headingOpacity.value,
    transform: [{ translateY: headingY.value }],
  }));
  const actionsStyle = useAnimatedStyle(() => ({
    opacity: actionsOpacity.value,
    transform: [{ translateY: actionsY.value }],
  }));

  const handleGetStarted = () => {
    if (!selectedRole) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/(auth)/register");
  };

  const handleSignIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(auth)/login");
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const roles: {
    role: UserRole;
    icon: keyof typeof Ionicons.glyphMap;
    titleKey: string;
    descKey: string;
  }[] = [
    {
      role: "driver",
      icon: "car-sport",
      titleKey: "welcome.driver",
      descKey: "welcome.driverDesc",
    },
    {
      role: "passenger",
      icon: "person",
      titleKey: "welcome.passenger",
      descKey: "welcome.passengerDesc",
    },
    {
      role: "park_owner",
      icon: "business",
      titleKey: "welcome.parkOwner",
      descKey: "welcome.parkOwnerDesc",
    },
  ];

  return (
    <View style={styles.container}>
      {/* ── Hero gradient top ── */}
      <LinearGradient
        colors={["#006B35", Colors.primary, "#00C862"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: topPadding + 24 }]}
      >
        {/* Logo */}
        <Animated.View style={[styles.logoWrap, logoStyle]}>
          <View style={styles.logoCircle}>
            <Ionicons name="navigate" size={36} color={Colors.primary} />
          </View>
          <View style={styles.logoBadge}>
            <Ionicons name="star" size={11} color={Colors.gold} />
          </View>
        </Animated.View>

        {/* Heading */}
        <Animated.View style={headingStyle}>
          <Text style={styles.appName}>Teqil</Text>
          <Text style={styles.tagline}>{t("welcome.tagline")}</Text>
          <Text style={styles.subtitle}>{t("welcome.subtitle")}</Text>
        </Animated.View>
      </LinearGradient>

      {/* ── Bottom sheet ── */}
      <View
        style={[
          styles.sheet,
          {
            paddingBottom:
              Math.max(insets.bottom, 20) + (Platform.OS === "web" ? 34 : 0),
          },
        ]}
      >
        {/* Handle */}
        <View style={styles.handle} />

        <Text style={styles.sectionTitle}>{t("welcome.selectRole")}</Text>
        <Text style={styles.sectionSubtitle}>
          {t("welcome.selectRoleDesc")}
        </Text>

        {/* Role cards */}
        <View style={styles.roles}>
          {roles.map((r, i) => (
            <RoleCard
              key={r.role}
              role={r.role}
              icon={r.icon}
              title={t(r.titleKey)}
              desc={t(r.descKey)}
              selected={selectedRole === r.role}
              onPress={() => setSelectedRole(r.role)}
              delay={200 + i * 80}
            />
          ))}
        </View>

        {/* Actions */}
        <Animated.View style={[styles.actions, actionsStyle]}>
          {/* Get Started */}
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              !selectedRole && styles.primaryBtnDisabled,
              pressed && selectedRole && styles.primaryBtnPressed,
            ]}
            onPress={handleGetStarted}
            disabled={!selectedRole}
          >
            <Text style={styles.primaryBtnText}>
              {t("welcome.getStarted")}
            </Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.surface} />
          </Pressable>

          {/* Already have account */}
          <Pressable style={styles.secondaryBtn} onPress={handleSignIn}>
            <Text style={styles.secondaryBtnText}>
              Already have an account?{" "}
              <Text style={styles.secondaryBtnLink}>{t("welcome.signIn")}</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },

  // Hero
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  logoWrap: {
    marginBottom: 28,
    position: "relative",
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  logoBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.gold,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  appName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 42,
    color: Colors.surface,
    textAlign: "center",
    letterSpacing: -1,
    lineHeight: 50,
  },
  tagline: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 17,
    color: "rgba(255,255,255,0.95)",
    textAlign: "center",
    lineHeight: 26,
    marginTop: 8,
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 10,
    paddingHorizontal: 12,
  },

  // Sheet
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 22,
  },
  sectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 21,
    color: Colors.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 18,
  },

  // Roles
  roles: {
    gap: 10,
  },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: "transparent",
    gap: 14,
    // Subtle elevation
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  roleCardSelected: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  roleIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  roleIconWrapSelected: {
    backgroundColor: Colors.primary,
  },
  roleTextWrap: {
    flex: 1,
  },
  roleTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  roleTitleSelected: {
    color: Colors.primaryDark,
  },
  roleDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  roleDescSelected: {
    color: Colors.primary,
  },
  roleCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
  },

  // Actions
  actions: {
    marginTop: 22,
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryBtnDisabled: {
    backgroundColor: Colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryBtnPressed: {
    opacity: 0.92,
  },
  primaryBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.surface,
  },
  secondaryBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  secondaryBtnText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  secondaryBtnLink: {
    fontFamily: "Poppins_600SemiBold",
    color: Colors.primary,
  },
});