

// components/Sidebar.tsx
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  ScrollView,
  Alert,
  Dimensions,
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

const SIDEBAR_WIDTH = 330;

interface SidebarItem {
  id: string;
  icon: React.ComponentType<any>;
  label: string;
  badge?: number;
  onPress: () => void;
  danger?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function SidedBar() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { theme, setTheme } = useSettingsStore();

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
      onPress: () => { },
    },
    {
      id: "profile",
      icon: UserIcon as any,
      label: "My Profile",
      onPress: () => { },
    },
    {
      id: "messages",
      icon: Message02Icon as any,
      label: "Messages",
      onPress: () => { },
    },
    {
      id: "trips",
      icon: Navigation01Icon as any,
      label: "Trip History",
      onPress: () => {
        const role = user?.role;
        if (role === "driver") router.push("/(driver)/history");
        else if (role === "passenger") router.push("/(passenger)/history");
      },
    },
    {
      id: "settings",
      icon: Settings01Icon as any,
      label: "Settings",
      onPress: () => { },
    },
    {
      id: "referral",
      icon: GiftIcon as any,
      label: "Refer a Friend",
      onPress: () => {
        Alert.alert("Refer a Friend", "Share Teqil with friends and earn coins!");
      },
    },
    {
      id: "help",
      icon: HelpCircleIcon as any,
      label: "Help Centre",
      onPress: () => {
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

  return (
    <View style={[styles.drawerTop, {
      backgroundColor: bg,
      // marginTop: -100,
      // paddingBottom: insets.bottom + 20,
      // paddingTop: insets.top + 0,
    }]}>
      <View style={styles.drawer}>
        <View style={[styles.drawerHeader, { paddingTop: insets.top + 27 }]}>
          <View style={{flexDirection:'row', gap: 10}}>
            <View style={styles.headerTop}>
              <Avatar
                name={user?.full_name || "User"}
                photoUri={user?.profile_photo}
                size={54}
              />
            </View>
            <View style={{flexDirection:'column', justifyContent: 'flex-end'}}>
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
          </View>
          <View style={styles.drawerRightIcon}>
              <Pressable style={styles.menuList}>
                <HugeiconsIcon icon={MoreHorizontalCircleIcon} fill={'#000'} size={27} color={textColor} />
              </Pressable>
              {/* <Pressable style={styles.closeBtn}>
                <HugeiconsIcon icon={Cancel01Icon} size={20} color={textColor} />
              </Pressable> */}
            </View>
        </View>

        <View style={styles.darkModeRow}>
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
              style={[styles.navList, styles.navListcontainer, ]}>
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
                      
                    ]}
                  >
                    <HugeiconsIcon
                      icon={item.icon as any}
                      size={18}
                      color={Colors.text}
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
              style={styles.signInContainer}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                  router.push("/(auth)/login");
                }}
              >
                <Text style={styles.signInButtonText}>Sign In</Text>
              </Pressable>
            </Pressable>
          )}
        </ScrollView>
      </View>
      <Text style={[styles.version, { color: textColor }]}>
        Teqil v1.0.0
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  drawerTop: {
    position: 'absolute',
    top: -170,       
    bottom: 0,         
    left: 0,
    height: SCREEN_HEIGHT,
    width: SIDEBAR_WIDTH,
    zIndex: 2,
    paddingHorizontal: 0,
  },
  drawer: {
    flex: 1,
  },
  drawerHeader: {
    paddingHorizontal: 20,
    paddingVertical: 26,
    flexDirection: 'row',
    justifyContent:'space-between',
    backgroundColor: '#fff',    marginBottom: 25
    // borderWidth: 2, borderColor:'red'
  },
  headerTop: {
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "flex-start",  
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
    borderBottomWidth: .5, borderBottomColor: 'rgb(204 203 203)0000'
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
    marginHorizontal: 10,
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
    gap: 20
  },
  signInTextContent: {
    gap: 5
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