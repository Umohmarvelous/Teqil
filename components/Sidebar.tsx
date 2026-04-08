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
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Cancel, ChevronRight, Light,  Moon02Icon, MoreHorizontalCircleIcon } from "@hugeicons/core-free-icons";


const SIDEBAR_WIDTH = 350;

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
  const { isAuthenticated, user, logout } = useAuthStore();
  const insets = useSafeAreaInsets();
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

  // Filter out logout item when user is not authenticated
  const filteredNavItems = !isAuthenticated 
    ? navItems.filter(item => item.id !== 'logout')
    : navItems;

  const isDark = theme === "dark";
  const bg = isDark ? "#000e0a" : Colors.primary;
  const container = isDark ? Colors.overlay : Colors.overlayLight
  const textColor = isDark ? Colors.textInverse : Colors.text;
  const subColor = isDark ? "#9CA3AF" : "#000";
  const itemBg = isDark ? Colors.primaryDark : Colors.overlayLight;
  const dividerColor = isDark ? "rgba(255,255,255,0.06)" : "#2A7B3E";

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
              size={54}
            />
            <View style={styles.drawerRightIcon}>
              <Pressable style={[styles.menuList]}>
                <HugeiconsIcon icon={MoreHorizontalCircleIcon}  size={20} color={"#000"}  />
              </Pressable>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <HugeiconsIcon icon={Cancel}  size={20} color={"#000"}  />
              </Pressable>
            </View>
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
        <View style={[styles.darkModeRow,
          { backgroundColor: itemBg }
        ]}>
          <View style={styles.darkModeLeft}>
            {/* <Ionicons
              name={isDark ? "moon" : "sunny-outline"}
              size={18}
              color={isDark ? "#60A5FA" : Colors.gold}
            /> */}
            <HugeiconsIcon icon={isDark ? Moon02Icon : Light}  size={24}   color={isDark ? "#fff" : '#000'}/>

            <Text style={[styles.darkModeText, { color: textColor }]}>
              {isDark ? 'Dark Mode' : 'Light Mode'}
            </Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={(val) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTheme(val ? "dark" : "light");
            }}
            trackColor={{ false: "#E5E7EB", true: Colors.surface + "50" }}
            thumbColor={isDark ? Colors.surface : "#000"}
          />
        </View>

        {/* Conditional Content: Show buttons when NOT authenticated, else show Sign In button */}
        {isAuthenticated ? (
          <ScrollView
            style={styles.navList}
            showsVerticalScrollIndicator={false}
          >
            {filteredNavItems.map((item) => (
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
                  <HugeiconsIcon
                    icon={ChevronRight}
                    size={14}
                    color={subColor}
                    style={styles.navChevron} />
                )}
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.signInContainer, { backgroundColor: container }]}>
            <Text style={[styles.signInText, { color: textColor }]}>
              You are signed in as {user?.full_name || "User"}
            </Text>
            <Text style={[styles.signInSubText, { color: subColor }]}>
              Sign in with a different account
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.signInButton,
                { backgroundColor: 'transparent' },
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
                router.push("/(auth)/login");
              }}
            >
              <Text style={styles.signInButtonText}>Sign In</Text>
            </Pressable>
          </View>
        )}

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
    backgroundColor: "rgba(0,0,0, 0.55)",
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
    borderTopRightRadius: 30,
    borderBottomRightRadius: 30,
    paddingHorizontal: 10
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
  drawerRightIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  menuList: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
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
    marginVertical: 15,
    marginTop: 5
  },
  darkModeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    borderRadius: 24,
    paddingHorizontal: 20,
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
    // marginBottom: 38,
    // marginHorizontal: 4,
    justifyContent: 'flex-end',
    alignSelf: 'center',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    // backgroundColor: Colors.overlayLight,
    padding: 30,
    // borderRadius: 20,
    opacity: .42,
    // borderWidth: 1,
    // borderColor: Colors.textInverse
  },
  signInContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
    // backgroundColor: Colors.primary,
    borderRadius: 20,
    marginHorizontal: 20,
    marginTop: 30,
    borderWidth: .4,
    borderColor: Colors.primaryLight
  },
  signInText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 8,
  },
  signInSubText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 24,
  },
  signInButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 30,
    width: "100%",
    alignItems: "center",
  },
  signInButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
  },
});