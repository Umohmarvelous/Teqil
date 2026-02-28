import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
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
  interpolate,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import type { UserRole } from "@/src/models/types";
import { useTranslation } from "react-i18next";

const { width, height } = Dimensions.get("window");

interface RoleCardProps {
  role: UserRole;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  selected: boolean;
  onPress: () => void;
  delay: number;
}

function RoleCard({ role, icon, title, desc, selected, onPress, delay }: RoleCardProps) {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
    scale.value = withDelay(delay, withSpring(1, { damping: 15 }));
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value * pressScale.value },
    ],
  }));

  const handlePress = () => {
    pressScale.value = withSpring(0.95, { damping: 20 }, () => {
      pressScale.value = withSpring(1, { damping: 15 });
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Animated.View style={cardStyle}>
      <Pressable onPress={handlePress}>
        <View
          style={[
            styles.roleCard,
            selected && styles.roleCardSelected,
          ]}
        >
          <View style={[styles.roleIconBg, selected && styles.roleIconBgSelected]}>
            <Ionicons
              name={icon}
              size={26}
              color={selected ? Colors.surface : Colors.primary}
            />
          </View>
          <View style={styles.roleText}>
            <Text style={[styles.roleTitle, selected && styles.roleTitleSelected]}>
              {title}
            </Text>
            <Text style={[styles.roleDesc, selected && styles.roleDescSelected]}>
              {desc}
            </Text>
          </View>
          {selected && (
            <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { selectedRole, setSelectedRole } = useAuthStore();
  const { t } = useTranslation();

  const headerOpacity = useSharedValue(0);
  const headerY = useSharedValue(-30);
  const logoScale = useSharedValue(0.6);
  const logoOpacity = useSharedValue(0);
  const buttonsOpacity = useSharedValue(0);
  const buttonsY = useSharedValue(30);

  useEffect(() => {
    logoScale.value = withDelay(100, withSpring(1, { damping: 12 }));
    logoOpacity.value = withDelay(100, withTiming(1, { duration: 600 }));
    headerOpacity.value = withDelay(300, withTiming(1, { duration: 500 }));
    headerY.value = withDelay(300, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));
    buttonsOpacity.value = withDelay(900, withTiming(1, { duration: 400 }));
    buttonsY.value = withDelay(900, withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) }));
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerY.value }],
  }));

  const buttonsStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
    transform: [{ translateY: buttonsY.value }],
  }));

  const handleContinue = () => {
    if (!selectedRole) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/(auth)/register");
  };

  const handleSignIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(auth)/login");
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#006B35", Colors.primary, "#00C862"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.topSection, { paddingTop: topPadding + 24 }]}>
        <Animated.View style={[styles.logoContainer, logoStyle]}>
          <View style={styles.logoCircle}>
            <Ionicons name="navigate" size={36} color={Colors.primary} />
          </View>
          <View style={styles.coinBadge}>
            <Ionicons name="star" size={12} color={Colors.gold} />
          </View>
        </Animated.View>

        <Animated.View style={headerStyle}>
          <Text style={styles.appName}>Teqil</Text>
          <Text style={styles.tagline}>{t("welcome.tagline")}</Text>
          <Text style={styles.subtitle}>{t("welcome.subtitle")}</Text>
        </Animated.View>
      </View>

      <View style={styles.bottomSheet}>
        <View style={styles.handle} />

        <Text style={styles.roleTitle2}>{t("welcome.selectRole")}</Text>
        <Text style={styles.roleSubtitle}>{t("welcome.selectRoleDesc")}</Text>

        <View style={styles.rolesContainer}>
          <RoleCard
            role="driver"
            icon="car-sport"
            title={t("welcome.driver")}
            desc={t("welcome.driverDesc")}
            selected={selectedRole === "driver"}
            onPress={() => setSelectedRole("driver")}
            delay={200}
          />
          <RoleCard
            role="passenger"
            icon="person"
            title={t("welcome.passenger")}
            desc={t("welcome.passengerDesc")}
            selected={selectedRole === "passenger"}
            onPress={() => setSelectedRole("passenger")}
            delay={300}
          />
          <RoleCard
            role="park_owner"
            icon="business"
            title={t("welcome.parkOwner")}
            desc={t("welcome.parkOwnerDesc")}
            selected={selectedRole === "park_owner"}
            onPress={() => setSelectedRole("park_owner")}
            delay={400}
          />
        </View>

        <Animated.View style={[styles.actionsContainer, buttonsStyle]}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              !selectedRole && styles.primaryBtnDisabled,
              pressed && selectedRole && styles.primaryBtnPressed,
            ]}
            onPress={handleContinue}
            disabled={!selectedRole}
          >
            <Text style={styles.primaryBtnText}>{t("welcome.getStarted")}</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.surface} />
          </Pressable>

          <Pressable style={styles.secondaryBtn} onPress={handleSignIn}>
            <Text style={styles.secondaryBtnText}>
              Already have an account?{" "}
              <Text style={styles.secondaryBtnLink}>{t("welcome.signIn")}</Text>
            </Text>
          </Pressable>
        </Animated.View>

        <View style={{ height: Math.max(insets.bottom, 20) + (Platform.OS === "web" ? 34 : 0) }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  topSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  logoContainer: {
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
  coinBadge: {
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
    fontSize: 18,
    color: "rgba(255,255,255,0.95)",
    textAlign: "center",
    lineHeight: 28,
    marginTop: 8,
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 10,
    paddingHorizontal: 16,
  },
  bottomSheet: {
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
    marginBottom: 24,
  },
  roleTitle2: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: Colors.text,
    marginBottom: 4,
  },
  roleSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  rolesContainer: {
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
  },
  roleCardSelected: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  roleIconBg: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  roleIconBgSelected: {
    backgroundColor: Colors.primary,
  },
  roleText: {
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
  actionsContainer: {
    marginTop: 24,
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
    transform: [{ scale: 0.98 }],
  },
  primaryBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.surface,
  },
  secondaryBtn: {
    alignItems: "center",
    padding: 12,
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
