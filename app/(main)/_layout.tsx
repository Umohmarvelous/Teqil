import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useMessagesStore } from "@/src/store/useMessagesStore";
import { Colors } from "@/constants/colors";
import Avatar from "@/components/Avatar";
import Sidebar from "@/components/Sidebar";
import HomeTab from "./index";
import ProfileTab from "./profile";
import MessagesTab from "./messages";
import SettingsTab from "./settings";

type Tab = "home" | "profile" | "messages" | "settings";

const TAB_HEIGHT = 72;

export default function MainLayout() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { theme } = useSettingsStore();
  const { conversations } = useMessagesStore();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isDark = theme === "dark";
  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0);
  const tabBarBg = isDark ? "#0D1117" : "#FFFFFF";

  const handleTabPress = (tab: Tab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "home": return <HomeTab onOpenSidebar={() => setSidebarOpen(true)} />;
      case "profile": return <ProfileTab />;
      case "messages": return <MessagesTab />;
      case "settings": return <SettingsTab />;
    }
  };

  return (
    <View style={styles.root}>
      {/* Content */}
      <View style={styles.content}>{renderContent()}</View>

      {/* Tab bar */}
      <View
        style={[
          styles.tabBar,
          {
            height: TAB_HEIGHT + Math.max(insets.bottom, 16),
            backgroundColor: Platform.OS === "ios" ? "transparent" : tabBarBg,
          },
        ]}
      >
        {Platform.OS === "ios" && (
          <BlurView
            intensity={90}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFillObject}
          />
        )}

        {/* Border top */}
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
            icon="home-outline"
            iconActive="home"
            label="Home"
            active={activeTab === "home"}
            onPress={() => handleTabPress("home")}
            isDark={isDark}
          />

          {/* Profile — shows avatar */}
          <Pressable
            style={styles.tabItem}
            onPress={() => handleTabPress("profile")}
          >
            <View style={activeTab === "profile" ? styles.avatarActive : styles.avatarInactive}>
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
              <Ionicons
                name={activeTab === "messages" ? "chatbubbles" : "chatbubbles-outline"}
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
            icon="settings-outline"
            iconActive="settings"
            label="Settings"
            active={activeTab === "settings"}
            onPress={() => handleTabPress("settings")}
            isDark={isDark}
          />
        </View>
      </View>

      {/* Sidebar */}
      <Sidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
    </View>
  );
}

function TabItem({
  id,
  icon,
  iconActive,
  label,
  active,
  onPress,
  isDark,
}: {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
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
      <Ionicons name={active ? iconActive : icon} size={24} color={color} />
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