



// components/Sidebar.tsx
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import Avatar from "@/components/Avatar";
import { Colors } from "@/constants/colors";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  Cancel01Icon,
  Sun01Icon,
  Moon02Icon,
  MoreHorizontalCircleIcon,
  Alert01Icon,
  Home01Icon,
  UserIcon,
  Message02Icon,
  Navigation01Icon,
  Settings01Icon,
  GiftIcon,
  HelpCircleIcon,
  Logout01Icon,
  ChevronRight,
} from "@hugeicons/core-free-icons";

const SIDEBAR_WIDTH = 310;

interface SidebarItem {
  id: string;
  icon: React.ComponentType<any>;
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
      icon: Home01Icon as any,
      label: "Home",
      onPress: () => { onClose(); },
    },
    {
      id: "profile",
      icon: UserIcon as any,
      label: "My Profile",
      onPress: () => { onClose(); },
    },
    {
      id: "messages",
      icon: Message02Icon as any,
      label: "Messages",
      onPress: () => { onClose(); },
    },
    {
      id: "trips",
      icon: Navigation01Icon as any,
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
      icon: Settings01Icon as any,
      label: "Settings",
      onPress: () => { onClose(); },
    },
    {
      id: "referral",
      icon: GiftIcon as any,
      label: "Refer a Friend",
      onPress: () => {
        onClose();
        Alert.alert("Refer a Friend", "Share Teqil with friends and earn coins!");
      },
    },
    {
      id: "help",
      icon: HelpCircleIcon as any,
      label: "Help Centre",
      onPress: () => {
        onClose();
        Alert.alert("Help", "Support coming soon.");
      },
    },
    {
      id: "logout",
      icon: Logout01Icon as any,
      label: "Sign Out",
      danger: true,
      onPress: handleLogout,
    },
  ];

  const filteredNavItems = !isAuthenticated 
    ? navItems.filter(item => item.id !== 'logout')
    : navItems;

  const isDark = theme === "dark";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const bg = isDark ? Colors.background : Colors.border;

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents="auto"
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>
      <View style={[styles.drawerTop, {
        backgroundColor: bg,
        paddingTop: insets.top + 0,
        paddingBottom: Math.max(insets.bottom, 0)
      }]}>
        <Animated.View style={[styles.drawer,{ transform: [{ translateX }] }]}>
          <View style={[styles.drawerHeader, {backgroundColor: cardBg}]}>
            <View style={styles.headerTop}>
              <Avatar
                name={user?.full_name || "User"}
                photoUri={user?.profile_photo}
                size={54}
              />
              <View style={styles.drawerRightIcon}>
                <Pressable style={[styles.menuList]}>
                  <HugeiconsIcon icon={MoreHorizontalCircleIcon} size={20} color={textColor} />
                </Pressable>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <HugeiconsIcon icon={Cancel01Icon} size={20} color={textColor} />
                </Pressable>
              </View>
            </View>
            <Text style={[styles.userName, { color: textColor }]} numberOfLines={1}>
              {user?.full_name || "Teqil User"}
            </Text>
            <Text style={[styles.userRole, { color: Colors.primary }]}>
              {user?.role === "driver"
                ? "Driver"
                : user?.role === "park_owner"
                ? "Park Owner"
                : user?.role 
                ? "Passenger" 
                : "No role"
              }
              {user?.driver_id ? ` · ${user.driver_id}` : ""}
            </Text>
          </View>

          <View style={[styles.darkModeRow, { backgroundColor: cardBg }]}>
            <View style={styles.darkModeLeft}>
              <HugeiconsIcon icon={isDark ? Moon02Icon : Sun01Icon} size={24} color={textColor} />
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

          <ScrollView style={[]}>
            {isAuthenticated ? (
              <ScrollView
                style={[styles.navList, styles.navListcontainer, { backgroundColor: cardBg }]}>
                {filteredNavItems.map((item) => (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [
                      styles.navItem,
                      pressed && { backgroundColor: cardBg },
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
                            : cardBg,
                        },
                      ]}
                    >
                      <HugeiconsIcon
                        icon={item.icon as any}
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
                        color={subTextColor}
                        style={styles.navChevron} />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Pressable
                style={[styles.signInContainer, { backgroundColor: 'rgba(255 149 0 / 0.28)' }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onClose();
                  router.push("/(auth)/login");
                }}
              >
                <HugeiconsIcon icon={Alert01Icon} size={45} color={Colors.gold} />
                <View style={styles.signInTextContent}>
                  <Text style={[styles.signInText, { color: textColor }]}>
                    You are signed in as {user?.full_name || "User"}
                  </Text>
                  <Text style={[styles.signInSubText, { color: subTextColor }]}>
                    Sign in with a different account
                  </Text>
                </View>
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
              </Pressable>
            )}
          </ScrollView>
        </Animated.View>
        <Text style={[styles.version, { color: textColor }]}>
          Teqil v1.0.0
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0 0 0 / 0.45)",
    zIndex: 1,
  },
  drawerTop: {
    flex:1,
    width: SIDEBAR_WIDTH,
    position: "absolute",
    left: 0,
    top: 0,
    bottom:0,
    zIndex: 2,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 30,
    paddingHorizontal: 7,
    shadowColor: "#000",
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  drawer: {
    zIndex: 2,
  },
  drawerHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 15,
    gap: 6,
    borderRadius: 30,
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
  darkModeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 23,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 15,
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
  navListcontainer: {
    borderRadius: 30,
    padding: 10
  },
  navList: {
    paddingHorizontal: 10,
    flex: 1,
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
    marginBottom: 18,
    marginHorizontal:10,
    borderRadius: 30,
    justifyContent: 'flex-end',
    alignSelf: 'center',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 30,
  },
  signInContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
    borderRadius: 20,
    borderWidth: .4,
    borderColor: Colors.gold,
    gap: 20
  },
  signInTextContent: {
    gap:5
  },
  signInText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    textAlign: "center",
  },
  signInSubText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 24,
  },
  signInButton: {
    borderRadius: 30,
    width: "100%",
    alignItems: "center",
  },
  signInButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.gold,
  },
});