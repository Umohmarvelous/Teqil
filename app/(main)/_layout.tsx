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
  Search02Icon,
} from "@hugeicons/core-free-icons";
import BottomSheet from "@gorhom/bottom-sheet";
import { CommentSheet } from "@/components/CommentSheet";
import MainTab from "./index";
import SidedBar from "@/components/Sidedbar";
import FindDriverModal from "@/components/FindDriverModal";
import OnboardingOverlay from "@/components/OnboardingOverlay";
import { useOnboarding } from "@/src/hooks/useOnboarding";

type Tab = "home" | "profile" | "messages" | "settings";
type TopTab = "home" | "discover";

const TAB_HEIGHT = 60;
const SIDEBAR_WIDTH = 330;
const EDGE_WIDTH = 60;
// How far to pull the home screen LEFT of the fully-open position.
// Positive = home rests further left (overlaps sidebar's right edge); negative = further right; 0 = flush with sidebar width.
const HOME_OPEN_SHIFT = 30;

// ── Sidebar gesture "feel" — tweak these to taste ────────────────────────────
// Drag the home screen right by more than this many px, then let go, and the
// sidebar snaps fully OPEN. Small number = very easy to open (a ~1cm pull is
// enough) and it will NOT spring back closed after a short drag.
const OPEN_THRESHOLD = 15;
// While open, drag back left by more than this many px to snap it CLOSED.
const CLOSE_THRESHOLD = 40;
// A quick flick faster than this (px per ms) opens/closes regardless of distance.
const FLICK_VELOCITY = 0.15;

// ── Rounded "card" look of the home screen while the sidebar is open ─────────
const HOME_BORDER_RADIUS = 40;
const HOME_BORDER_WIDTH = 1.7;

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function MainLayout() {
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const { user } = useAuthStore();
  const { conversations } = useMessagesStore();

  const { shouldShow, isLoaded, complete } = useOnboarding();

  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [activeTopTab, setActiveTopTab] = useState<TopTab>("home");
  const [finderVisible, setFinderVisible] = useState(false);

  const sidebarOpen = useRef(false);
  const sidebarAnim = useRef(new Animated.Value(0)).current;
  // State mirror of the ref so the dim overlay's pointerEvents actually re-renders.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // --- Horizontal Top Tab Scroll Setup ---
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  // --- Scroll Animation Setup for "For You" Feed ---
  const feedScrollY = useRef(new Animated.Value(0)).current;

  // Prevent iOS bounce from causing erratic clamping
  const clampedScrollY = feedScrollY.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolateLeft: "clamp",
  });

  const scrollClamp = Animated.diffClamp(clampedScrollY, 0, 150);

  const rawHeaderTranslateY = scrollClamp.interpolate({
    inputRange: [0, 150],
    outputRange: [0, -150],
    extrapolate: "clamp",
  });

  const rawBottomTranslateY = scrollClamp.interpolate({
    inputRange: [0, 150],
    outputRange: [0, 150],
    extrapolate: "clamp",
  });

  // Conditionally multiply the clamping so it ONLY applies when scrollX is looking at Discover tab
  const hideMultiplier = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const actualHeaderTranslateY = Animated.multiply(
    rawHeaderTranslateY,
    hideMultiplier,
  );
  const actualBottomTranslateY = Animated.multiply(
    rawBottomTranslateY,
    hideMultiplier,
  );
  // -----------------------------

  const openSidebar = useCallback(() => {
    sidebarOpen.current = true;
    setIsSidebarOpen(true);
    Animated.spring(sidebarAnim, {
      toValue: SIDEBAR_WIDTH,
      speed: 22,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [sidebarAnim]);

  const closeSidebar = useCallback(() => {
    sidebarOpen.current = false;
    Animated.spring(sidebarAnim, {
      toValue: 0,
      speed: 22,
      bounciness: 0,
      useNativeDriver: true,
    }).start(() => setIsSidebarOpen(false));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [sidebarAnim]);

  const isSidebarGesture = useRef(false);
  const panX = useRef(0);

  /**
   * panResponder — the low-level touch tracker for the sidebar swipe.
   *
   * A PanResponder is just a bundle of callbacks that React Native calls while
   * a finger is dragging on screen. We use it to (1) recognise a horizontal
   * "open the sidebar" swipe, (2) move the sidebar 1-to-1 with the finger, and
   * (3) on release, snap it fully OPEN or fully CLOSED. The comments beside each
   * callback below explain exactly what that callback does and when it fires.
   */
  const panResponder = useRef(
    PanResponder.create({
      // Fires the instant a finger touches down. We return false so a plain tap
      // is never captured here — we only ever care about movement (handled in
      // onMoveShouldSetPanResponder below), so taps pass through to buttons.
      onStartShouldSetPanResponder: () => false,

      // Fires repeatedly as the finger MOVES, before we own the gesture. Return
      // true to "claim" this drag as ours. We only claim a mostly-horizontal
      // drag (dx bigger than dy) that is either: starting from the left screen
      // edge while the sidebar is closed, OR any horizontal drag while it's
      // already open (so the user can swipe it back closed).
      onMoveShouldSetPanResponder: (_, gesture) => {
        const isHorizontal =
          Math.abs(gesture.dx) > Math.abs(gesture.dy) &&
          Math.abs(gesture.dx) > 2;
        if (!isHorizontal) return false;

        // Closed → only begin if the finger started near the left edge and is
        // moving to the right (dx > 0). This is the classic "edge swipe".
        if (
          !sidebarOpen.current &&
          gesture.moveX <= EDGE_WIDTH &&
          gesture.dx > 0
        ) {
          isSidebarGesture.current = true;
          return true;
        }
        // Open → claim any horizontal drag so the user can swipe to close.
        if (sidebarOpen.current) {
          isSidebarGesture.current = true;
          return true;
        }
        return false;
      },

      // Fires ONCE, the moment we win/claim the gesture. We "freeze" the current
      // sidebar position into an offset so that the upcoming finger movement is
      // added on top of wherever the sidebar already is (0 when closed,
      // SIDEBAR_WIDTH when open) instead of jumping to a new spot.
      onPanResponderGrant: () => {
        panX.current = sidebarOpen.current ? SIDEBAR_WIDTH : 0;
        if (isSidebarGesture.current) {
          sidebarAnim.setOffset(panX.current);
          sidebarAnim.setValue(0);
        }
      },

      // Fires on EVERY movement while we own the gesture. gesture.dx is how far
      // the finger has travelled since it went down. We convert that into a
      // sidebar position and clamp it between 0 (closed) and SIDEBAR_WIDTH
      // (open) so the sidebar can never be dragged past either end.
      onPanResponderMove: (_, gesture) => {
        if (!isSidebarGesture.current) return;
        let newX = gesture.dx;
        if (!sidebarOpen.current) newX = Math.max(0, newX); // closed: only allow rightward drag
        else newX = Math.min(0, newX); // open: only allow leftward drag
        const absolute = panX.current + newX;
        const clamped = Math.min(SIDEBAR_WIDTH, Math.max(0, absolute));
        sidebarAnim.setValue(clamped - panX.current);
      },

      // Fires when the finger LIFTS. We merge the offset back in, then decide
      // where to snap. Opening only needs a tiny drag past OPEN_THRESHOLD (or a
      // quick flick) — there is no "drag it halfway" rule, so a short pull will
      // NOT spring back closed. Adjust OPEN_THRESHOLD / CLOSE_THRESHOLD /
      // FLICK_VELOCITY at the top of this file to change how easy it feels.
      onPanResponderRelease: (_, gesture) => {
        if (!isSidebarGesture.current) return;
        sidebarAnim.flattenOffset();

        if (!sidebarOpen.current) {
          // Was closed → open on a small rightward drag or a rightward flick.
          const shouldOpen =
            gesture.dx > OPEN_THRESHOLD || gesture.vx > FLICK_VELOCITY;
          if (shouldOpen) openSidebar();
          else closeSidebar();
        } else {
          // Was open → close on a leftward drag or a leftward flick.
          const shouldClose =
            gesture.dx < -CLOSE_THRESHOLD || gesture.vx < -FLICK_VELOCITY;
          if (shouldClose) closeSidebar();
          else openSidebar();
        }
        isSidebarGesture.current = false;
      },
    }),
  ).current;

  const overlayOpacity = sidebarAnim.interpolate({
    inputRange: [0, SIDEBAR_WIDTH],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  // Sidebar "zoom in" — scales up and fades in only as it's revealed.
  const sidebarScale = sidebarAnim.interpolate({
    inputRange: [0, SIDEBAR_WIDTH],
    outputRange: [0.9, 1],
    extrapolate: "clamp",
  });
  const sidebarContentOpacity = sidebarAnim.interpolate({
    inputRange: [0, SIDEBAR_WIDTH * 0.4, SIDEBAR_WIDTH],
    outputRange: [0, 0.6, 1],
    extrapolate: "clamp",
  });

  // Home screen stops short of the full sidebar width so it rests a little further left when open.
  const mainTranslateX = sidebarAnim.interpolate({
    inputRange: [0, SIDEBAR_WIDTH],
    outputRange: [0, SIDEBAR_WIDTH - HOME_OPEN_SHIFT],
    extrapolate: "clamp",
  });

  const handleTopTabPress = (tab: TopTab) => {
    setActiveTopTab(tab);
    scrollViewRef.current?.scrollTo({
      x: tab === "home" ? 0 : SCREEN_WIDTH,
      animated: true,
    });
  };

  const indicatorTranslateX = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [SCREEN_WIDTH * 0.2, SCREEN_WIDTH * 0.7],
    extrapolate: "clamp",
  });

  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const tabBarBg = isDark ? Colors.background : Colors.textWhite;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "#E5E8EC";
  const sideBorderColor = isDark ? Colors.overlayLight : Colors.border;


  const [commentSheetPost, setCommentSheetPost] = useState<FeedItem | null>(
    null,
  );
  const bottomSheetRef = useRef<BottomSheet>(null);
  const onAddCommentRef = useRef<
    ((postId: string, text: string) => void) | null
  >(null);

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
    0,
  );

  const handleTabPress = (tab: Tab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };

  const toggleSearch = () => {
    setFinderVisible(true);
  };

  const HEADER_HEIGHT = topPadding + 85;
  // const HEADER_HEIGHT = topPadding + 110;
  const BOTTOM_HEIGHT = TAB_HEIGHT + Math.max(insets.bottom, 16);

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

    return (
      <Animated.ScrollView
        ref={scrollViewRef as any}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setActiveTopTab(page === 0 ? "home" : "discover");
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            width: SCREEN_WIDTH,
            flex: 1,
            paddingTop: HEADER_HEIGHT,
            paddingBottom: BOTTOM_HEIGHT,
          }}
        >
          <MainTab />
        </View>
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          <DiscoverTab
            onCommentPress={openCommentSheet}
            setCommentHandler={(handler: any) => {
              onAddCommentRef.current = handler;
            }}
            scrollY={feedScrollY}
          />
        </View>
      </Animated.ScrollView>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: tabBarBg }]}>
      {/* Static sidebar behind the main screen; zooms in as it's revealed */}
      <Animated.View
        style={[
          styles.sidebarBehind,
          {
            backgroundColor: tabBarBg,
            opacity: sidebarContentOpacity,
            transform: [{ scale: sidebarScale }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <SidedBar />
      </Animated.View>

      {/* Main screen slides to the right to uncover the static sidebar */}
      <Animated.View
        style={[
          styles.mainSlider,
          { transform: [{ translateX: mainTranslateX }] },
        ]}
        {...panResponder.panHandlers}
      >
        {/* The whole home screen (top bar + content + bottom bar) lives inside
            this card. It clips to rounded corners (overflow: hidden) so the
            animated border below hugs it neatly. */}
        <View style={styles.homeCard}>
          {/* Dim overlay: covers the ENTIRE home screen (top bar, content AND
              bottom bar) while the sidebar is open. Tapping anywhere on it
              closes the sidebar. zIndex 200 keeps it above the top/bottom bars,
              which sit at zIndex 100 — otherwise those areas wouldn't dim or
              catch the close-tap. */}
          <Animated.View
            style={[styles.overlay, { opacity: overlayOpacity }]}
            pointerEvents={isSidebarOpen ? "auto" : "none"}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={closeSidebar} />
          </Animated.View>

          {/* Rounded border that fades IN together with the overlay when the
              sidebar opens, and is fully invisible when closed. It's purely
              decorative and never intercepts touches (pointerEvents="none"), so
              the overlay underneath still receives the tap-to-close. Adjust its
              look via HOME_BORDER_WIDTH / HOME_BORDER_RADIUS up top. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.homeBorder,
              { opacity: overlayOpacity, borderColor: sideBorderColor },
            ]}
          />

          {/* Absolute Top Bar */}
          {activeTab === "home" && (
            <Animated.View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                zIndex: 100,
                backgroundColor: tabBarBg,
                borderTopLeftRadius: 45,
                transform: [{ translateY: actualHeaderTranslateY }],
              }}
            >
              <View
                style={[
                  styles.header,
                  {
                    paddingTop: topPadding + 5,
                    backgroundColor: tabBarBg,
                  },
                ]}
              >
                <Pressable onPress={openSidebar} style={styles.menuBtn}>
                  <HugeiconsIcon
                    icon={Menu02Icon}
                    size={22}
                    color={textColor}
                  />
                </Pressable>
                <Pressable style={styles.logoBtn}>
                  <Image
                    source={
                      isDark
                        ? require("../../assets/images/emilgo_logo_white.png")
                        : require("../../assets/images/emilgo_logo_black.png")
                    }
                    style={styles.photoImg}
                    resizeMode="contain"
                    width={25}
                  />
                </Pressable>
                <Pressable
                  onPress={toggleSearch}
                  style={[
                    styles.menuList,
                    {
                      backgroundColor: isDark
                        ? Colors.overlayLight
                        : Colors.border,
                      borderColor,
                    },
                  ]}
                >
                  <HugeiconsIcon
                    icon={Search02Icon}
                    size={20}
                    color={textColor}
                  />
                </Pressable>
              </View>

              <View
                style={[
                  styles.topTabBar,
                  {
                    backgroundColor: tabBarBg,
                    borderBottomColor: borderColor,
                  },
                ]}
              >
                <View style={styles.topTabItemContainer}>
                  <Pressable
                    style={styles.topTabItem}
                    onPress={() => handleTopTabPress("home")}
                  >
                    <Text
                      style={[
                        styles.topTabText,
                        {
                          color: textColor,
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
                          color: textColor,
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
            </Animated.View>
          )}

          <View style={[styles.content]}>{renderMainContent()}</View>

          {/* Absolute Bottom Bar */}
          <Animated.View
            style={[
              styles.tabBar,
              {
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 100,
                height: BOTTOM_HEIGHT,
                backgroundColor: tabBarBg,
                // Make sure bottom bar isn't tucked when visiting profile, settings, etc
                transform: [
                  {
                    translateY:
                      activeTab === "home" ? actualBottomTranslateY : 0,
                  },
                ],
              },
              { borderBottomLeftRadius: 40 },
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
            <View style={[styles.tabBarInner]}>
              <TabItem
                id="home"
                activeIcon={HomeIcon}
                inactiveIcon={Home01Icon}
                label="Home"
                active={activeTab === "home"}
                onPress={() => handleTabPress("home")}
                isDark={isDark}
              />
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
          </Animated.View>
        </View>
      </Animated.View>

      <CommentSheet
        bottomSheetRef={bottomSheetRef}
        post={commentSheetPost}
        isDark={isDark}
        onClose={() => setCommentSheetPost(null)}
        onAddComment={handleAddComment}
      />

      <FindDriverModal
        visible={finderVisible}
        onClose={() => setFinderVisible(false)}
      />

      {isLoaded && shouldShow && <OnboardingOverlay onComplete={complete} />}
    </View>
  );
}

function TabItem({
  activeIcon,
  inactiveIcon,
  label,
  active,
  onPress,
  isDark,
}: any) {
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
  root: {
    flex: 1,
  },
  sidebarBehind: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    zIndex: 0,
  },
  mainSlider: {
    flex: 1,
    width: SCREEN_WIDTH,
    zIndex: 1,
    // Subtle left-edge shadow so the sliding screen reads as "above" the sidebar.
    shadowColor: "#000",
    shadowOffset: { width: -20, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 17,
    elevation: 16,
  },
  // The card that holds the entire home screen (top bar + content + bottom bar).
  // Rounded + clipped so the animated border below sits flush with its corners.
  homeCard: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: "100%",
    borderRadius: HOME_BORDER_RADIUS,
    overflow: "hidden",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: HOME_BORDER_RADIUS,
    // Above the top/bottom bars (zIndex 100) so it dims and covers them too.
    zIndex: 200,
  },
  // Decorative outline that fades in with the overlay when the sidebar opens.
  homeBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: HOME_BORDER_WIDTH,
    borderRadius: HOME_BORDER_RADIUS,
    zIndex: 201,
  },
  content: {
    flex: 1,
    height: "100%",
  },
  header: {
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 50,
  },
  menuList: {
    borderRadius: 30,
    padding: 9,
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    // borderWidth: 1,
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
    flex: 1,
  },
  photoImg: { width: 50, height: 50, alignSelf: "center" },
  topTabBar: {
    flexDirection: "column",
    paddingBottom: 0,
    borderBottomWidth: 0.5,
    position: "relative",
    paddingTop: 15,
  },
  topTabItemContainer: { flexDirection: "row" },
  topTabItem: {
    flex: 1,
    alignItems: "center",
    paddingBottom: 9,
  },
  topTabText: { fontSize: 16, letterSpacing: 0 },
  topTabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 3.5,
    width: "10%",
    borderRadius: 50,
  },
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
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
  },
  tabLabel: { fontSize: 10, letterSpacing: 0.2 },
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
