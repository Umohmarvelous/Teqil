import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  Platform,
  Animated,
  Dimensions,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useMessagesStore } from "@/src/store/useMessagesStore";
import { Colors } from "@/constants/colors";
import Avatar from "@/components/Avatar";
import Sidebar from "@/components/Sidebar";
import ProfileTab from "./profile";
import MessagesTab from "./messages";
import SettingsTab from "./settings";
import DiscoverTab from "./discover";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  HomeIcon,
  Home01Icon,
  SettingsIcon,
  Settings01Icon,
  MessageIcon,
  Message01Icon,
  Menu02Icon,
} from "@hugeicons/core-free-icons";
import HomeTab from "./index";
import SwipeableSidebar from "@/components/SwipeSidebar";
import FeedScreen from "./feed";

type Tab = "home" | "profile" | "messages" | "settings";
type TopTab = "home" | "discover";

const TAB_HEIGHT = 60;
const { width: SCREEN_WIDTH } = Dimensions.get("window");


interface MainLayoutProps {
  onOpenSidebar: () => void;
}


export default function MainLayout({ onOpenSidebar }: MainLayoutProps) {
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const { user } = useAuthStore();
  const { theme } = useSettingsStore();
  const { conversations } = useMessagesStore();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [activeTopTab, setActiveTopTab] = useState<TopTab>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const indicatorAnim = useRef(new Animated.Value(0)).current;

  const isDark = theme === "dark";
  
  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count ?? c.unreadCount ?? 0), 0);
  const tabBarBg = isDark ? Colors.primaryDarker : Colors.textWhite;
  
  const handleTabPress = (tab: Tab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };
  
  const handleTopTabPress = (tab: TopTab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTopTab(tab);
    Animated.spring(indicatorAnim, {
      toValue: tab === "home" ? 0 : 1,
      useNativeDriver: false,
      damping: 20,
      stiffness: 200,
    }).start();
  };

  const indicatorLeft = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCREEN_WIDTH / 2],
  });
  
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const topTabTextColor = isDark ? Colors.textWhite : Colors.text;
  const topTabBg = isDark ? Colors.primaryDarker : Colors.textWhite;
  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "#E8ECF0";

  const renderMainContent = () => {
    if (activeTab !== "home") {
      switch (activeTab) {
        case "profile":
          return <ProfileTab />;
        case "messages":
          return <MessagesTab />;
        case "settings":
          return <SettingsTab />;
        default:
          return null;
      }
    }

    // Home tab respects top tab selection
    return activeTopTab === "home"
      ? <HomeTab /> 
      : <DiscoverTab /> 
      // : <FeedScreen/>
  };

  return (
    <SwipeableSidebar>
        {/* Top Tab Bar — only visible when bottom tab is "home" */}
        {/* Header */}
      <View style={[styles.root, { backgroundColor: cardBg }]}>
        
        {activeTab === "home" && (
          <View style={[styles.header, { paddingTop: topPadding + 2 }]}>
          {/* Logo Image – now pressable to refresh */}
            <Pressable onPress={onOpenSidebar} style={styles.menuBtn}>
              <HugeiconsIcon icon={Menu02Icon} size={22} color={textColor} />
            </Pressable>
            <Pressable
              // onPress={onRefresh}
              style={styles.logoBtn}>
              <Image
                source={isDark ? require("@/assets/images/Logo_with_transparent_background.png") : require("@/assets/images/Black_logo_with_white_background.png")}
                style={styles.photoImg} 
                resizeMode="cover"
                width={120}
              />
            </Pressable>

            <Pressable
              onPress={() => {
                  }}>
                <Avatar
                  name={user?.full_name || "U"}
                  photoUri={user?.profile_photo}
                  size={38}
                />
            </Pressable>
          </View>
        )}


        {activeTab === "home" && (
          <View
            style={[
              styles.topTabBar,
              {
                backgroundColor: topTabBg,
                borderBottomColor: borderColor,
              },
            ]}
          >
            <Pressable
              style={styles.topTabItem}
              onPress={() => handleTopTabPress("home")}
            >
              <Text
                style={[
                  styles.topTabText,
                  {
                    color: topTabTextColor,
                    fontFamily:
                      activeTopTab === "home"
                        ? "Poppins_700Bold"
                        : "Poppins_400Medium",
                    opacity: activeTopTab === "home" ? 1 : 0.45,
                  },
                ]}
              >
                Home
              </Text>
            </Pressable>

            <Pressable
              style={styles.topTabItem}
              onPress={() => handleTopTabPress("discover")}
            >
              <Text
                style={[
                  styles.topTabText,
                  {
                    color: topTabTextColor,
                    fontFamily:
                      activeTopTab === "discover"
                        ? "Poppins_700Bold"
                        : "Poppins_400Medium",
                    opacity: activeTopTab === "discover" ? 1 : 0.45,
                  },
                ]}
              >
                For You
              </Text>
            </Pressable>

            {/* Sliding indicator */}
            <Animated.View
              style={[
                styles.topTabIndicator,
                {
                  left: indicatorLeft,
                  backgroundColor: Colors.primary,
                },
              ]}
            />
          </View>
        )}

        {/* Content */}
        <View style={styles.content}>{renderMainContent()}</View>

        {/* Bottom Tab Bar */}
        <View
          style={[
            styles.tabBar,
            {
              height: TAB_HEIGHT + Math.max(insets.bottom, 16),
              backgroundColor: Platform.OS === "ios" ? tabBarBg : tabBarBg,
            },
          ]}
        >
          {Platform.OS === "ios" && (
            <BlurView
              intensity={0}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFillObject}
            />
          )}

          <View
            style={[
              styles.tabBarBorder,
              { backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "#E8ECF0" },
            ]}
          />

          <View style={styles.tabBarInner}>
            {/* Home */}
            <TabItem
              id="home"
              activeIcon={HomeIcon}
              inactiveIcon={Home01Icon}
              label="Home"
              active={activeTab === "home"}
              onPress={() => handleTabPress("home")}
              isDark={isDark}
            />

            {/* Profile */}
            <Pressable
              style={styles.tabItem}
              onPress={() => handleTabPress("profile")}
            >
              <View
                style={
                  activeTab === "profile"
                    ? styles.avatarActive
                    : styles.avatarInactive
                }
              >
                <Avatar
                  name={user?.full_name || "U"}
                  photoUri={user?.profile_photo}
                  size={28}
                />
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color:
                      activeTab === "profile"
                        ? Colors.primary
                        : isDark
                        ? "#6B7280"
                        : "#9CA3AF",
                    fontFamily:
                      activeTab === "profile"
                        ? "Poppins_600SemiBold"
                        : "Poppins_400Regular",
                  },
                ]}
              >
                You
              </Text>
            </Pressable>

            {/* Messages */}
            <Pressable
              style={styles.tabItem}
              onPress={() => handleTabPress("messages")}
            >
              <View style={{ position: "relative" }}>
                <HugeiconsIcon
                  icon={activeTab === "messages" ? MessageIcon : Message01Icon}
                  size={24}
                  color={
                    activeTab === "messages"
                      ? Colors.primary
                      : isDark
                      ? "#6B7280"
                      : "#9CA3AF"
                  }
                />
                {totalUnread > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {totalUnread > 9 ? "9+" : totalUnread}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color:
                      activeTab === "messages"
                        ? Colors.primary
                        : isDark
                        ? "#6B7280"
                        : "#9CA3AF",
                    fontFamily:
                      activeTab === "messages"
                        ? "Poppins_600SemiBold"
                        : "Poppins_400Regular",
                  },
                ]}
              >
                Messages
              </Text>
            </Pressable>

            {/* Settings */}
            <TabItem
              id="settings"
              activeIcon={SettingsIcon}
              inactiveIcon={Settings01Icon}
              label="Settings"
              active={activeTab === "settings"}
              onPress={() => handleTabPress("settings")}
              isDark={isDark}
            />
          </View>
        </View>

        {/* Sidebar */}
        <Sidebar visible={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </View>
    </SwipeableSidebar>
  );
}

function TabItem({
  activeIcon,
  inactiveIcon,
  label,
  active,
  onPress,
  isDark,
}: {
  id: string;
  activeIcon: any;
  inactiveIcon: any;
  label: string;
  active: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  const color = active
    ? Colors.primary
    : isDark
    ? "#6B7280"
    : "#9CA3AF";

  return (
    <Pressable style={styles.tabItem} onPress={onPress}>
      <HugeiconsIcon
        icon={active ? activeIcon : inactiveIcon}
        size={24}
        color={color}
      />
      <Text
        style={[
          styles.tabLabel,
          {
            color,
            fontFamily: active ? "Poppins_600SemiBold" : "Poppins_400Regular",
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },

  header: {
    gap: 10,
    paddingHorizontal: 37,
    // paddingBottom: 10,
    flexDirection: 'row',
    alignItems: "center",
    justifyContent: 'space-between'
  },

  photoImg: {
    width: 50,
    height: 50,
    alignSelf: 'center',
  },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  logoBtn: {
    width: 25,
    height: 25,
    marginVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },


  // Top tab bar
  topTabBar: {
    flexDirection: "row",
    paddingBottom: 0,
    borderBottomWidth: 1,
    position: "relative",
    paddingTop: 20
  },
  topTabItem: {
    flex: 1,
    alignItems: "center",
    // paddingVertical: 12,
    paddingBottom: 14,
  },
  topTabText: {
    fontSize: 16,
    letterSpacing: 0,
  },
  topTabIndicatorContainer: {
    borderWidth: 1, borderColor: 'red',
    // flex: 1,
    // position: 'absolute',
    // right: 0,
    // left: 0,
    // alignItems: 'center'
  },
  topTabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    marginLeft: 90,
    // flex: 1,
    height: 3.5,
    width: "10%",
    borderRadius: 2,
  },

  // Bottom tab bar
  tabBar: {
    position: "relative",
    overflow: "hidden",
  },
  tabBarBorder: {
    height: 1,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  tabBarInner: {
    flexDirection: "row",
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
  avatarActive: {
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: Colors.primary,
  },
  avatarInactive: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  unreadBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    backgroundColor: Colors.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  unreadBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9,
    color: "#fff",
  },
});