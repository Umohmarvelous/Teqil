import React, { useState, useRef, useCallback } from "react"; // <-- added useCallback
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
import ProfileTab from "./profile";
import MessagesTab from "./messages";
import SettingsTab from "./settings";
import DiscoverTab from "./discover"; // default export
import type { FeedItem } from "./discover"; // <-- import type FeedItem
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
import BottomSheet from "@gorhom/bottom-sheet"; // <-- import BottomSheet class
import { CommentSheet } from "@/components/CommentSheet";
import MainTab from "./index";
import SwipeableSidebar from "@/components/SwipeSidebar";

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
  const { conversations } = useMessagesStore();
  
  // Tabs
  const [Tabs, setTabs] = useState<Tab>("home");
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [activeTopTab, setActiveTopTab] = useState<TopTab>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Theme
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const tabBarBg = isDark ? Colors.background : Colors.textWhite;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const topTabTextColor = isDark ? Colors.textWhite : Colors.text;
  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "#E5E8EC";

  // ── Comment Sheet state & ref ────────────────────────────────────
  const [commentSheetPost, setCommentSheetPost] = useState<FeedItem | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null); // <-- initialised with null
  const onAddCommentRef = useRef<(postId: string, text: string) => void>();

  const openCommentSheet = useCallback((post: FeedItem) => {
    setCommentSheetPost(post);
    bottomSheetRef.current?.snapToIndex(0);
  }, []);

  const handleAddComment = useCallback(
    (postId: string, text: string) => {
      if (onAddCommentRef.current) {
        onAddCommentRef.current(postId, text);
      }
    },
    []
  );

  const indicatorAnim = useRef(new Animated.Value(0)).current;

  
  const totalUnread = conversations.reduce(
    (s, c) => s + (c.unread_count ?? c.unreadCount ?? 0),
    0
  );
  
  const handleTabPress = (tab: Tab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
    setTabs(tab);    
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
    outputRange: [SCREEN_WIDTH / 5.1, SCREEN_WIDTH / 1.43],
  });

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

    if (activeTopTab === "home") {
      return <MainTab />;
    }
    // Pass the comment handlers to DiscoverTab
    return (
      <DiscoverTab
        onCommentPress={openCommentSheet}
        setCommentHandler={(handler) => {
          onAddCommentRef.current = handler;
        }}
      />
    );
  };

  return (
    <>
      <View style={[styles.root]}>
        {/* Header */}
        { Tabs === "home" ? (
            <SwipeableSidebar
              isOpen={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
            >
              {activeTab === "home" && (
                <View style={[styles.header, { paddingTop: topPadding + 2 }, { backgroundColor: tabBarBg }]}>
                  <Pressable onPress={onOpenSidebar} style={styles.menuBtn}>
                    <HugeiconsIcon icon={Menu02Icon} size={22} color={textColor} />
                  </Pressable>
                  <Pressable style={styles.logoBtn}>
                    <Image
                      source={
                        isDark
                          ? require("@/assets/images/Logo_with_transparent_background.png")
                          : require("@/assets/images/Black_logo_with_white_background.png")
                      }
                      style={styles.photoImg}
                      resizeMode="cover"
                      width={120}
                    />
                  </Pressable>
                  <Pressable onPress={() => {}}>
                    <Avatar
                      name={user?.full_name || "U"}
                      photoUri={user?.profile_photo}
                      size={38}
                    />
                  </Pressable>
                </View>
              )} 

              {/* Top Tab Bar — only visible when home tab is selected */}
              {activeTab === "home" && (
                <View
                  style={[
                    styles.topTabBar,
                    {
                      backgroundColor: tabBarBg,
                      borderBottomColor: borderColor,
                    },
                  ]}
                >
                  <View style={ styles.topTabItemContainer}>
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
                  </View>

                  <View style={{}}>
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
                    {
                      backgroundColor: isDark
                        ? "rgba(33 33 33 / 0.56)"
                        : "#E8ECF0",
                    },
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
                              ? "rgb(255 255 255)"
                              : Colors.textSecondary,
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
                        icon={
                          activeTab === "messages" ? MessageIcon : Message01Icon
                        }
                        size={24}
                        color={
                          activeTab === "messages"
                            ? Colors.primary
                            : isDark
                            ? "#FFFFFF"
                            : Colors.textSecondary
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
                              ? "#FFFFFF"
                              : Colors.textSecondary,
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
            </SwipeableSidebar>
        ) : (
            <>
              {/* Content */}
              <View style={styles.content}>{renderMainContent()}</View>
              
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
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.07)"
                        : "#E8ECF0",
                    },
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
                              ? "#FFFFFF"
                              : Colors.textSecondary,
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
                        icon={
                          activeTab === "messages" ? MessageIcon : Message01Icon
                        }
                        size={24}
                        color={
                          activeTab === "messages"
                            ? Colors.primary
                            : isDark
                            ? "#FFFFFF"
                            : "#FFFFFF"
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
                              ? "#FFFFFF"
                              : "#FFFFFF",
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
            </>
          )}

          {/* Sidebar */}
          {/* <Sidebar
            visible={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          /> */}

          {/* ── Global Comment Sheet (covers everything, even the tab bar) ── */}
          <CommentSheet
            bottomSheetRef={bottomSheetRef}
            post={commentSheetPost}
            isDark={isDark}
            onClose={() => setCommentSheetPost(null)}
            onAddComment={handleAddComment}
          />
        </View>
    </>
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
    ? "#FFFFFF"
    : Colors.textSecondary;

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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  photoImg: {
    width: 50,
    height: 50,
    alignSelf: "center",
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
    justifyContent: "center",
    alignItems: "center",
  },

  // Top tab bar
  topTabBar: {
    flexDirection: "column",
    paddingBottom: 0,
    borderBottomWidth: .5,
    position: "relative",
    paddingTop: 20,
  },
  topTabItemContainer: {
    flexDirection: 'row',
  },
  topTabItem: {
    flex: 1,
    alignItems: "center",
    paddingBottom: 14,
  },
  topTabText: {
    fontSize: 16,
    letterSpacing: 0,
  },
  topTabIndicator: {
  
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