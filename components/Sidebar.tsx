import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Modal,
  Switch,
  ScrollView,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import Avatar from "@/components/Avatar";
import { Colors } from "@/constants/colors";

const SIDEBAR_WIDTH = 300;

interface SidebarItem {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  badge?: number;
  onPress: () => void;
  danger?: boolean;
}

interface SidebarProps {
  visible: boolean;
  onClose: () => void;
}

export default function Sidebar({ visible, onClose }: SidebarProps) {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useSettingsStore();

  const translateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          damping: 24,
          stiffness: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -SIDEBAR_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          const { signOut } = await import("@/src/services/supabase");
          await signOut();
          logout();
          onClose();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const navItems: SidebarItem[] = [
    {
      id: "home",
      icon: "home-outline",
      label: "Home",
      onPress: () => { onClose(); },
    },
    {
      id: "profile",
      icon: "person-outline",
      label: "My Profile",
      onPress: () => { onClose(); },
    },
    {
      id: "messages",
      icon: "chatbubbles-outline",
      label: "Messages",
      onPress: () => { onClose(); },
    },
    {
      id: "trips",
      icon: "navigate-outline",
      label: "Trip History",
      onPress: () => {
        onClose();
        const role = user?.role;
        if (role === "driver") router.push("/(driver)/history");
        else if (role === "passenger") router.push("/(passenger)/history");
      },
    },
    {
      id: "settings",
      icon: "settings-outline",
      label: "Settings",
      onPress: () => { onClose(); },
    },
    {
      id: "referral",
      icon: "gift-outline",
      label: "Refer a Friend",
      onPress: () => {
        onClose();
        Alert.alert("Refer a Friend", "Share Teqil with friends and earn coins!");
      },
    },
    {
      id: "help",
      icon: "help-circle-outline",
      label: "Help Centre",
      onPress: () => {
        onClose();
        Alert.alert("Help", "Support coming soon.");
      },
    },
    {
      id: "logout",
      icon: "log-out-outline",
      label: "Sign Out",
      danger: true,
      onPress: handleLogout,
    },
  ];

  const isDark = theme === "dark";
  const bg = isDark ? "#0D1117" : "#FFFFFF";
  const textColor = isDark ? "#F0F0F0" : "#0D1B3E";
  const subColor = isDark ? "#6B7280" : "#9CA3AF";
  const itemBg = isDark ? "#161B22" : "#F4F6FA";
  const dividerColor = isDark ? "rgba(255,255,255,0.06)" : "#E8ECF0";

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents="auto"
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: bg,
            paddingTop: insets.top + 16,
            paddingBottom: Math.max(insets.bottom, 24),
            transform: [{ translateX }],
          },
        ]}
      >
        {/* Header */}
        <View style={styles.drawerHeader}>
          <View style={styles.headerTop}>
            <Avatar
              name={user?.full_name || "User"}
              photoUri={user?.profile_photo}
              size={64}
            />
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={subColor} />
            </Pressable>
          </View>
          <Text style={[styles.userName, { color: textColor }]} numberOfLines={1}>
            {user?.full_name || "Teqil User"}
          </Text>
          <Text style={[styles.userRole, { color: subColor }]}>
            {user?.role === "driver"
              ? "Driver"
              : user?.role === "park_owner"
              ? "Park Owner"
              : "Passenger"}
            {user?.driver_id ? ` · ${user.driver_id}` : ""}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: dividerColor }]} />

        {/* Dark mode toggle */}
        <View style={[styles.darkModeRow, { backgroundColor: itemBg }]}>
          <View style={styles.darkModeLeft}>
            <Ionicons
              name={isDark ? "moon" : "sunny-outline"}
              size={18}
              color={isDark ? "#60A5FA" : Colors.gold}
            />
            <Text style={[styles.darkModeText, { color: textColor }]}>
              Dark Mode
            </Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={(val) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTheme(val ? "dark" : "light");
            }}
            trackColor={{ false: "#E5E7EB", true: Colors.primary + "60" }}
            thumbColor={isDark ? Colors.primary : "#fff"}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: dividerColor }]} />

        {/* Nav items */}
        <ScrollView
          style={styles.navList}
          showsVerticalScrollIndicator={false}
        >
          {navItems.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [
                styles.navItem,
                pressed && { backgroundColor: itemBg },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                item.onPress();
              }}
            >
              <View
                style={[
                  styles.navIconBox,
                  {
                    backgroundColor: item.danger
                      ? "rgba(239,68,68,0.1)"
                      : itemBg,
                  },
                ]}
              >
                <Ionicons
                  name={item.icon}
                  size={18}
                  color={item.danger ? "#EF4444" : Colors.primary}
                />
              </View>
              <Text
                style={[
                  styles.navLabel,
                  {
                    color: item.danger ? "#EF4444" : textColor,
                  },
                ]}
              >
                {item.label}
              </Text>
              {item.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={subColor}
                  style={styles.navChevron}
                />
              )}
            </Pressable>
          ))}
        </ScrollView>

        {/* Footer */}
        <Text style={[styles.version, { color: subColor }]}>
          Teqil v1.0.0
        </Text>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    zIndex: 1,
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    zIndex: 2,
    shadowColor: "#000",
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  drawerHeader: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 6,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  userName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
  },
  userRole: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
  },
  divider: {
    height: 1,
    marginHorizontal: 20,
    marginVertical: 8,
  },
  darkModeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  darkModeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  darkModeText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
  },
  navList: {
    flex: 1,
    paddingHorizontal: 10,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
    marginBottom: 2,
  },
  navIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
  },
  navChevron: {
    marginLeft: "auto",
  },
  badge: {
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10,
    color: "#fff",
  },
  version: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    textAlign: "center",
    paddingBottom: 8,
  },
});