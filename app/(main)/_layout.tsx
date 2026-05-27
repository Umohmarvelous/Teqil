import React, { useState, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  Platform,
  Animated,
  PanResponder,
  Dimensions,
  Image,
  ScrollView,
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
import DiscoverTab from "./discover";
import type { FeedItem } from "./discover";
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
import BottomSheet from "@gorhom/bottom-sheet";
import { CommentSheet } from "@/components/CommentSheet";
import MainTab from "./index";
import SidedBar from "@/components/Sidedbar";

type Tab = "home" | "profile" | "messages" | "settings";
type TopTab = "home" | "discover";

const TAB_HEIGHT = 60;
const SIDEBAR_WIDTH = 330;
const EDGE_WIDTH = 30;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function MainLayout() {
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const { user } = useAuthStore();
  const { conversations } = useMessagesStore();

  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [activeTopTab, setActiveTopTab] = useState<TopTab>("home");

  // ── Sidebar state ────────────────────────────────────────────
  const sidebarOpen = useRef(false);
  const sidebarAnim = useRef(new Animated.Value(0)).current; 

  const openSidebar = useCallback(() => {
    sidebarOpen.current = true;
    Animated.timing(sidebarAnim, {
      toValue: SIDEBAR_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [sidebarAnim]);

  const closeSidebar = useCallback(() => {
    sidebarOpen.current = false;
    Animated.timing(sidebarAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [sidebarAnim]);

  // ── PanResponder strictly for sidebar ─────────────────────────
  const isSidebarGesture = useRef(false);
  const panX = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        if (Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 5) {
          // Open gesture: started at left edge while closed
          if (!sidebarOpen.current && gesture.moveX <= EDGE_WIDTH && gesture.dx > 0) {
            isSidebarGesture.current = true;
            return true;
          }
          // Close gesture: anywhere on screen while open
          if (sidebarOpen.current) {
            isSidebarGesture.current = true;
            return true;
          }
        }
        // Let ScrollView handle all other horizontal gestures
        return false;
      },
      onPanResponderGrant: () => {
        panX.current = sidebarOpen.current ? SIDEBAR_WIDTH : 0;
        if (isSidebarGesture.current) {
          sidebarAnim.setOffset(panX.current);
          sidebarAnim.setValue(0);
        }
      },
      onPanResponderMove: (_, gesture) => {
        if (isSidebarGesture.current) {
          let newX = gesture.dx;
          if (!sidebarOpen.current) newX = Math.max(0, newX);
          else newX = Math.min(0, newX);
          const absolute = panX.current + newX;
          const clamped = Math.min(SIDEBAR_WIDTH, Math.max(0, absolute));
          sidebarAnim.setValue(clamped - panX.current);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (isSidebarGesture.current) {
          sidebarAnim.flattenOffset();
          const currentX = panX.current + gesture.dx;
          const threshold = SIDEBAR_WIDTH / 2;
          
          if (currentX > threshold || gesture.vx > 0.5) {
            openSidebar();
          } else {
            closeSidebar();
          }
        }
        isSidebarGesture.current = false;
      },
    })
  ).current;

  const overlayOpacity = sidebarAnim.interpolate({
    inputRange: [0, SIDEBAR_WIDTH],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  // ── Top Tabs State & Animation ────────────────────────────────
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const handleTopTabPress = (tab: TopTab) => {
    setActiveTopTab(tab);
    scrollViewRef.current?.scrollTo({
      x: tab === "home" ? 0 : SCREEN_WIDTH,
      animated: true,
    });
  };

  const indicatorTranslateX = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    // 0.20 and 0.70 center the 10% wide indicator perfectly under the 50% width tabs
    outputRange: [SCREEN_WIDTH * 0.20, SCREEN_WIDTH * 0.70],
    extrapolate: "clamp",
  });

  // ── Theme & Bottom Sheets ──────────────────────────────────────
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const tabBarBg = isDark ? Colors.background : Colors.textWhite;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "#E5E8EC";

  const [commentSheetPost, setCommentSheetPost] = useState<FeedItem | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const onAddCommentRef = useRef<(postId: string, text: string) => void>();

  const openCommentSheet = useCallback((post: FeedItem) => {
    setCommentSheetPost(post);
    bottomSheetRef.current?.snapToIndex(0);
  }, []);

  const handleAddComment = useCallback((postId: string, text: string) => {
    if (onAddCommentRef.current) {
      onAddCommentRef.current(postId, text);
    }
  }, []);

  const totalUnread = conversations.reduce(
    (s, c) => s + (c.unread_count ?? c.unreadCount ?? 0),
    0
  );

  const handleTabPress = (tab: Tab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };

  const renderMainContent = () => {
    if (activeTab !== "home") {
      switch (activeTab) {
        case "profile": return <ProfileTab />;
        case "messages": return <MessagesTab />;
        case "settings": return <SettingsTab />;
        default: return null;
      }
    }
    
    return (
      <Animated.ScrollView
        ref={scrollViewRef as any}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setActiveTopTab(page === 0 ? "home" : "discover");
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          <MainTab />
        </View>
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          <DiscoverTab
            onCommentPress={openCommentSheet}
            setCommentHandler={(handler) => {
              onAddCommentRef.current = handler;
            }}
          />
        </View>
      </Animated.ScrollView>
    );
  };

  return (
    <View style={styles.root}>
      {/* The Side-by-Side Wrapper 
        Starts shifted left by SIDEBAR_WIDTH so main content is in view initially.
        Translating it right brings the sidebar in from the edge and pushes main off-screen.
      */}
      <Animated.View
        style={[
          styles.sideBySideWrapper,
          { transform: [{ translateX: sidebarAnim }] },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Sidebar Container */}
        <View style={styles.sidebarContainer}>
          <SidedBar />
        </View>

        {/* Main Content Container */}
        <View style={styles.mainContainer}>
          {/* Overlay isolated to the main content area */}
          <Animated.View
            style={[styles.overlay, { opacity: overlayOpacity }]}
            pointerEvents={sidebarOpen.current ? "auto" : "none"}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={closeSidebar} />
          </Animated.View>

          {/* Header */}
          {activeTab === "home" && (
            <View style={[styles.header, { paddingTop: topPadding + 2, backgroundColor: tabBarBg }]}>
              <Pressable onPress={openSidebar} style={styles.menuBtn}>
                <HugeiconsIcon icon={Menu02Icon} size={22} color={textColor} />
              </Pressable>
              <Pressable style={styles.logoBtn}>
              <Image
  source={
    isDark
      ? require("@/assets/images/Logo_with_transparent_background.png") // Ensure this is the white version
      : require("@/assets/images/Black_logo_with_white_background.png") // Ensure this is the black version
  }
  style={styles.photoImg}
  resizeMode="contain" // Changed to contain to avoid cropping
  width={120}
/>
              </Pressable>
              <Pressable onPress={() => handleTabPress("profile")}>
                <Avatar name={user?.full_name || "U"} photoUri={user?.profile_photo} size={38} />
              </Pressable>
            </View>
          )}

          {/* Top Tab Bar (Home/For You) */}
          {activeTab === "home" && (
            <View style={[styles.topTabBar, { backgroundColor: tabBarBg, borderBottomColor: borderColor }]}>
              <View style={styles.topTabItemContainer}>
                <Pressable style={styles.topTabItem} onPress={() => handleTopTabPress("home")}>
                  <Text
                    style={[
                      styles.topTabText,
                      {
                        color: textColor,
                        fontFamily: activeTopTab === "home" ? "Poppins_700Bold" : "Poppins_400Medium",
                        opacity: activeTopTab === "home" ? 1 : 0.45,
                      },
                    ]}
                  >
                    Home
                  </Text>
                </Pressable>
                <Pressable style={styles.topTabItem} onPress={() => handleTopTabPress("discover")}>
                  <Text
                    style={[
                      styles.topTabText,
                      {
                        color: textColor,
                        fontFamily: activeTopTab === "discover" ? "Poppins_700Bold" : "Poppins_400Medium",
                        opacity: activeTopTab === "discover" ? 1 : 0.45,
                      },
                    ]}
                  >
                    For You
                  </Text>
                </Pressable>
              </View>
              {/* Scroll-driven animated indicator */}
              <Animated.View
                style={[
                  styles.topTabIndicator,
                  {
                    backgroundColor: Colors.primary,
                    transform: [{ translateX: indicatorTranslateX }],
                  },
                ]}
              />
            </View>
          )}

          {/* Content Area */}
          <View style={styles.content}>{renderMainContent()}</View>

          {/* Bottom Tab Bar */}
          <View
            style={[
              styles.tabBar,
              {
                height: TAB_HEIGHT + Math.max(insets.bottom, 16),
                backgroundColor: tabBarBg,
              },
            ]}
          >
            {Platform.OS === "ios" && (
              <BlurView intensity={0} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFillObject} />
            )}
            <View style={[styles.tabBarBorder, { backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "#E8ECF0" }]} />
            <View style={styles.tabBarInner}>
              <TabItem
                id="home"
                activeIcon={HomeIcon}
                inactiveIcon={Home01Icon}
                label="Home"
                active={activeTab === "home"}
                onPress={() => handleTabPress("home")}
                isDark={isDark}
              />
              <Pressable style={styles.tabItem} onPress={() => handleTabPress("profile")}>
                <View style={activeTab === "profile" ? styles.avatarActive : styles.avatarInactive}>
                  <Avatar name={user?.full_name || "U"} photoUri={user?.profile_photo} size={28} />
                </View>
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: activeTab === "profile" ? Colors.primary : isDark ? "#FFFFFF" : Colors.textSecondary,
                      fontFamily: activeTab === "profile" ? "Poppins_600SemiBold" : "Poppins_400Regular",
                    },
                  ]}
                >
                  You
                </Text>
              </Pressable>
              <Pressable style={styles.tabItem} onPress={() => handleTabPress("messages")}>
                <View style={{ position: "relative" }}>
                  <HugeiconsIcon
                    icon={activeTab === "messages" ? MessageIcon : Message01Icon}
                    size={24}
                    color={activeTab === "messages" ? Colors.primary : isDark ? "#FFFFFF" : Colors.textSecondary}
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
                      color: activeTab === "messages" ? Colors.primary : isDark ? "#FFFFFF" : Colors.textSecondary,
                      fontFamily: activeTab === "messages" ? "Poppins_600SemiBold" : "Poppins_400Regular",
                    },
                  ]}
                >
                  Messages
                </Text>
              </Pressable>
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
        </View>
      </Animated.View>

      <CommentSheet
        bottomSheetRef={bottomSheetRef}
        post={commentSheetPost}
        isDark={isDark}
        onClose={() => setCommentSheetPost(null)}
        onAddComment={handleAddComment}
      />
    </View>
  );
}

function TabItem({ activeIcon, inactiveIcon, label, active, onPress, isDark }: any) {
  const color = active ? Colors.primary : isDark ? "#FFFFFF" : Colors.textSecondary;
  return (
    <Pressable style={styles.tabItem} onPress={onPress}>
      <HugeiconsIcon icon={active ? activeIcon : inactiveIcon} size={24} color={color} />
      <Text style={[styles.tabLabel, { color, fontFamily: active ? "Poppins_600SemiBold" : "Poppins_400Regular" }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  sideBySideWrapper: {
    flex: 1,
    flexDirection: 'row',
    width: SCREEN_WIDTH + SIDEBAR_WIDTH,
    marginLeft: -SIDEBAR_WIDTH, 
  },
  sidebarContainer: {
    width: SIDEBAR_WIDTH,
    height: "100%",
  },
  mainContainer: {
    width: SCREEN_WIDTH,
    height: "100%",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 10,
  },
  content: { flex: 1 },
  header: {
    gap: 10,
    paddingHorizontal: 37,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  photoImg: { width: 50, height: 50, alignSelf: "center" },
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
  topTabBar: {
    flexDirection: "column",
    paddingBottom: 0,
    borderBottomWidth: 0.5,
    position: "relative",
    paddingTop: 20,
  },
  topTabItemContainer: { flexDirection: "row" },
  topTabItem: {
    flex: 1,
    alignItems: "center",
    paddingBottom: 14,
  },
  topTabText: { fontSize: 16, letterSpacing: 0 },
  topTabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0, // Left bounds strictly mapped by interpolation
    height: 3.5,
    width: "10%",
    borderRadius: 2,
  },
  tabBar: { position: "relative", overflow: "hidden" },
  tabBarBorder: { height: 1, position: "absolute", top: 0, left: 0, right: 0 },
  tabBarInner: { flexDirection: "row", paddingTop: 8, paddingHorizontal: 8 },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 6 },
  tabLabel: { fontSize: 10, letterSpacing: 0.2 },
  avatarActive: { borderRadius: 16, borderWidth: 2.5, borderColor: Colors.primary },
  avatarInactive: { borderRadius: 16, borderWidth: 2, borderColor: "transparent" },
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
  unreadBadgeText: { fontFamily: "Poppins_700Bold", fontSize: 9, color: "#fff" },
});