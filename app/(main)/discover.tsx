/**
 * app/(main)/discover.tsx
 *
 * Instagram‑style feed with:
 * - Shimmer skeleton loading
 * - Real Reddit data from transport subreddits
 * - Dynamic image/video sizing
 * - Full‑screen expand on tap
 * - Video auto‑play with mute/duration
 * - Real comment fetching (moved to layout)
 * - Like / Save / Share actions
 */

import React, { useState, useCallback, useEffect} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  RefreshControl,
  Platform,
  FlatList,
  Share,
  Dimensions,
  Modal,
  ScrollView,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Video, ResizeMode } from "expo-av";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { Colors } from "@/constants/colors";
import { router } from "expo-router";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  Comment01Icon,
  Share01Icon,
  Bookmark01Icon,
  MoreVerticalCircle01Icon,
  FlashIcon,
  Heart,
  VolumeMuteIcon,
  VolumeHighIcon,
} from "@hugeicons/core-free-icons";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { FeedSkeletonList } from "@/components/ShimmerSkeleton";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";

// ----------------------------------------------------------------------
// Types (same as before)
// ----------------------------------------------------------------------
interface User {
  id: string;
  username: string;
  avatarUrl: string;
}

export interface Comment {
  id: string;
  user: User;
  text: string;
  timestamp: string;
  likes: number;
}

export interface FeedItem {
  id: string;
  type: "content" | "ad";
  user?: User;
  imageUrl?: string;
  videoUrl?: string;
  isVideo?: boolean;
  caption?: string;
  likes: number;
  comments: Comment[];
  timestamp: string;
  location?: string;
  isLiked?: boolean;
  isSaved?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ----------------------------------------------------------------------
// TRANSPORT SUBREDDITS
// ----------------------------------------------------------------------
const SUBREDDITS = ["cars", "driving", "roadtrip", "motorcycles", "travel", "carcamping", "autos"];
const REDDIT_BASE = "https://api.reddit.com/r";

// ----------------------------------------------------------------------
// Ad Card (unchanged)
// ----------------------------------------------------------------------
function NativeAdCard({ isDark }: { isDark: boolean }) {
  const bg = isDark ? "#1A1A2E" : "#FFFFFF";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;

  return (
    <View style={[styles.igCard, { backgroundColor: bg }]}>
      <View style={styles.igHeader}>
        <View style={styles.igHeaderLeft}>
          <View style={[styles.igAvatar, { backgroundColor: Colors.primaryLight }]}>
            <HugeiconsIcon icon={FlashIcon} size={20} color={Colors.primary} />
          </View>
          <View>
            <Text style={[styles.igUsername, { color: textColor }]}>Teqil</Text>
            <Text style={[styles.igLocation, { color: subColor }]}>Sponsored</Text>
          </View>
        </View>
        <Pressable hitSlop={8}>
          <HugeiconsIcon icon={MoreVerticalCircle01Icon} size={20} color={subColor} />
        </Pressable>
      </View>
      <View style={[styles.adImageContainer, { backgroundColor: isDark ? "#111" : "#F5F5F5" }]}>
        <HugeiconsIcon icon={FlashIcon} size={48} color={Colors.primary} />
        <Text style={[styles.adImageText, { color: subColor }]}>Grow your earnings</Text>
        <Pressable style={styles.adCtaButton} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
          <Text style={styles.adCtaButtonText}>Learn More</Text>
        </Pressable>
      </View>
      <View style={styles.igActions}>
        <View style={styles.igActionLeft}>
          <Pressable hitSlop={10} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
            <HugeiconsIcon icon={Heart} size={24} color={subColor} />
          </Pressable>
          <Pressable hitSlop={10}>
            <HugeiconsIcon icon={Comment01Icon} size={24} color={subColor} />
          </Pressable>
          <Pressable hitSlop={10}>
            <HugeiconsIcon icon={Share01Icon} size={24} color={subColor} />
          </Pressable>
        </View>
        <Pressable hitSlop={10}>
          <HugeiconsIcon icon={Bookmark01Icon} size={24} color={subColor} />
        </Pressable>
      </View>
    </View>
  );
}

// ----------------------------------------------------------------------
// Full‑Screen Modal (unchanged)
// ----------------------------------------------------------------------
function FullScreenPost({ item, visible, onClose, isDark }: { item: FeedItem | null; visible: boolean; onClose: () => void; isDark: boolean }) {
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);
  const [isMuted, setIsMuted] = useState(true);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1);
      opacity.value = withTiming(1);
    } else {
      scale.value = withSpring(0.9);
      opacity.value = withTiming(0);
    }
  }, [visible, scale, opacity]);

  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.fullScreenOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.fullScreenContent, animatedStyle]}>
          {item.isVideo ? (
            <View style={styles.fullScreenVideoContainer}>
              <Video
                source={{ uri: item.videoUrl! }}
                style={styles.fullScreenVideo}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                isMuted={isMuted}
                useNativeControls={false}
              />
              <Pressable style={styles.muteButton} onPress={() => setIsMuted(!isMuted)}>
                <HugeiconsIcon icon={isMuted ? VolumeMuteIcon : VolumeHighIcon} size={28} color="#FFF" />
              </Pressable>
            </View>
          ) : (
            <Image source={{ uri: item.imageUrl }} style={styles.fullScreenImage} resizeMode="contain" />
          )}
          <View style={styles.fullScreenActions}>
            <Text style={styles.fullScreenCaption}>{item.caption}</Text>
            <Text style={styles.fullScreenUsername}>@{item.user?.username}</Text>
          </View>
        </Animated.View>
        <Pressable style={styles.closeFullScreen} onPress={onClose}>
          <Text style={{ color: "#FFF", fontSize: 18 }}>✕</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ----------------------------------------------------------------------
// Content Card (updated with video auto‑play)
// ----------------------------------------------------------------------
function ContentCard({
  item,
  isDark,
  onLikeToggle,
  onSaveToggle,
  onCommentPress,
  onSharePress,
  onFullScreen,
  isPlaying,
}: {
  item: FeedItem;
  isDark: boolean;
  onLikeToggle: (id: string) => void;
  onSaveToggle: (id: string) => void;
  onCommentPress: (item: FeedItem) => void;
  onSharePress: (item: FeedItem) => void;
  onFullScreen: (item: FeedItem) => void;
  isPlaying?: boolean;
}) {
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const iconColor = isDark ? Colors.textWhite : Colors.text;

  const handleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLikeToggle(item.id);
  };

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSaveToggle(item.id);
  };

  const [imageHeight, setImageHeight] = useState(350);
  useEffect(() => {
    if (item.imageUrl && !item.isVideo) {
      Image.getSize(item.imageUrl, (width, height) => {
        const ratio = height / width;
        setImageHeight(SCREEN_WIDTH * ratio);
      });
    }
  }, [item.imageUrl, item.isVideo]);

  return (
    <View style={[styles.igCard]}>
      <View style={styles.igHeader}>
        <Pressable style={styles.igHeaderLeft}>
          <Image source={{ uri: item.user?.avatarUrl }} style={styles.igAvatar} />
          <View>
            <Text style={[styles.igUsername, { color: textColor }]}>{item.user?.username}</Text>
            {item.location && <Text style={[styles.igLocation, { color: subColor }]}>{item.location}</Text>}
          </View>
        </Pressable>
        <Pressable hitSlop={8} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 15 }}>
          <Pressable hitSlop={10} onPress={handleSave}>
            <HugeiconsIcon
              icon={Bookmark01Icon}
              size={24}
              color={iconColor}
              fill={item.isSaved ? iconColor : "none"}
            />
          </Pressable>
          <HugeiconsIcon icon={MoreVerticalCircle01Icon} size={20} color={iconColor} />
        </Pressable>
      </View>

      <Pressable onPress={() => onFullScreen(item)}>
        {item.isVideo ? (
          <View style={[styles.videoContainer, { height: imageHeight }]}>
            <Video
              source={{ uri: item.videoUrl! }}
              style={styles.videoPlayer}
              resizeMode={ResizeMode.COVER}
              shouldPlay={isPlaying}
              isMuted
              usePoster
              posterSource={{ uri: item.imageUrl }}
              useNativeControls={false}
            />
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>▶ Video</Text>
            </View>
          </View>
        ) : (
          <Image
            source={{ uri: item.imageUrl }}
            style={[styles.igImage, { height: imageHeight }]}
            resizeMode="cover"
          />
        )}
      </Pressable>

      <View style={styles.igActions}>
        <View style={styles.igActionLeft}>
          <Pressable hitSlop={10} onPress={handleLike}>
            <HugeiconsIcon
              icon={Heart}
              size={24}
              color={item.isLiked ? "#FF3B30" : iconColor}
              fill={item.isLiked ? "#FF3B30" : "none"}
            />
          </Pressable>
          <Pressable hitSlop={10} onPress={() => onCommentPress(item)}>
            <HugeiconsIcon icon={Comment01Icon} size={24} color={iconColor} />
          </Pressable>
          <Pressable hitSlop={10} onPress={() => onSharePress(item)}>
            <HugeiconsIcon icon={Share01Icon} size={24} color={iconColor} />
          </Pressable>
        </View>
      </View>

      <View style={styles.igLikesContainer}>
        <Text style={[styles.igLikes, { color: textColor }]}>
          {item.likes.toLocaleString()} likes
        </Text>
      </View>

      <View style={styles.igCaptionContainer}>
        <Text style={[styles.igCaption, { color: textColor }]}>
          <Text style={styles.igCaptionUsername}>{item.user?.username}</Text>{" "}
          {item.caption}
        </Text>
      </View>

      {item.comments.length > 0 && (
        <Pressable style={styles.igCommentsPreview} onPress={() => onCommentPress(item)}>
          <Text style={[styles.igViewComments, { color: Colors.primaryLight }]}>
            See all {item.comments.length} {item.comments.length > 1 ? "comments" : "comment"}
          </Text>
        </Pressable>
      )}

      <Text style={[styles.igTimestamp, { color: subColor }]}>{item.timestamp}</Text>
    </View>
  );
}

// ----------------------------------------------------------------------
// Auth Prompt Overlay (unchanged)
// ----------------------------------------------------------------------
function AuthPromptOverlay({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  if (!visible) return null;
  return (
    <Pressable style={styles.authOverlay} onPress={onDismiss}>
      <View style={styles.authCard}>
        <Text style={styles.authTitle}>Join Teqil</Text>
        <Text style={styles.authSub}>Sign up to like, comment, and interact with posts.</Text>
        <Pressable
          style={styles.authBtn}
          onPress={() => {
            onDismiss();
            router.push("/(auth)/login");
          }}
        >
          <Text style={styles.authBtnText}>Sign Up / Log In</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ----------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------
export default function DiscoverTab({ onCommentPress }: { onCommentPress?: (post: FeedItem) => void }) {
  const { user } = useAuthStore();
  const { theme } = useSettingsStore();
  const isAuthenticated = !!user;

  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [lastPostId, setLastPostId] = useState("");
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPaginating, setIsPaginating] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [fullScreenPost, setFullScreenPost] = useState<FeedItem | null>(null);
  const [feedError, setFeedError] = useState(false);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : "#FAFAFA";

  const viewabilityConfig = { itemVisiblePercentThreshold: 50 };
  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    const firstVideo = viewableItems.find((vi: any) => vi.item.type === "content" && vi.item.isVideo);
    setPlayingVideoId(firstVideo ? firstVideo.item.id : null);
  }, []);

  const injectAds = useCallback((items: FeedItem[]): FeedItem[] => {
    const result: FeedItem[] = [];
    items.forEach((item, index) => {
      result.push(item);
      if ((index + 1) % 5 === 0) {
        result.push({ id: `ad-${index}-${Date.now()}`, type: "ad", likes: 0, comments: [], timestamp: "" });
      }
    });
    return result;
  }, []);

  const fetchFeed = useCallback(
    async (mode: "initial" | "refresh" | "paginate") => {
      try {
        const sub = SUBREDDITS[Math.floor(Math.random() * SUBREDDITS.length)];
        const after = mode === "paginate" && lastPostId ? `&after=${lastPostId}` : "";
        const url = `${REDDIT_BASE}/${sub}/hot?limit=10${after}&raw_json=1`;
        const response = await fetch(url, {
          headers: { "User-Agent": "TeqilApp/1.0 (by /u/teqil_user)" },
        });
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const json = await response.json();

        const posts = json.data.children
          .map((child: any) => {
            const data = child.data;
            const isVideo = data.is_video && data.media?.reddit_video;
            const mediaUrl = isVideo
              ? data.media.reddit_video.fallback_url
              : data.url_overridden_by_dest || data.url;

            if (!mediaUrl || data.is_self) return null;

            return {
              id: data.id,
              type: "content" as const,
              user: {
                id: data.author,
                username: data.author,
                avatarUrl: `https://www.redditstatic.com/avatars/defaults/v2/avatar_default_${Math.floor(Math.random() * 7)}.png`,
              },
              imageUrl: isVideo ? data.thumbnail : mediaUrl,
              videoUrl: isVideo ? mediaUrl : undefined,
              isVideo,
              caption: data.title,
              likes: data.ups,
              comments: [],
              timestamp: new Date(data.created_utc * 1000).toLocaleString(),
              isLiked: false,
              isSaved: false,
            };
          })
          .filter(Boolean) as FeedItem[];

        const items = injectAds(posts);

        if (mode === "initial" || mode === "refresh") {
          setFeedItems(items);
        } else {
          setFeedItems((prev) => [...prev, ...items]);
        }

        setLastPostId(json.data.after);
        setHasMore(!!json.data.after);
        setFeedError(false);
      } catch (error) {
        console.error("Reddit fetch error:", error);
        setFeedError(true);
      } finally {
        setIsInitialLoading(false);
        setIsRefreshing(false);
        setIsPaginating(false);
      }
    },
    [lastPostId, injectAds]
  );

  useEffect(() => {
    fetchFeed("initial");
  }, [fetchFeed]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    setLastPostId("");
    fetchFeed("refresh");
  }, [fetchFeed]);

  const onEndReached = useCallback(() => {
    if (!hasMore || isPaginating || isInitialLoading) return;
    setIsPaginating(true);
    fetchFeed("paginate");
  }, [hasMore, isPaginating, isInitialLoading, fetchFeed]);

  const handleLikeToggle = useCallback(
    (postId: string) => {
      if (!isAuthenticated) { setShowAuthPrompt(true); return; }
      setFeedItems((prev) =>
        prev.map((item) =>
          item.id === postId && item.type === "content"
            ? { ...item, isLiked: !item.isLiked, likes: item.isLiked ? item.likes - 1 : item.likes + 1 }
            : item
        )
      );
    },
    [isAuthenticated]
  );

  const handleSaveToggle = useCallback(
    (postId: string) => {
      if (!isAuthenticated) { setShowAuthPrompt(true); return; }
      setFeedItems((prev) =>
        prev.map((item) =>
          item.id === postId && item.type === "content" ? { ...item, isSaved: !item.isSaved } : item
        )
      );
    },
    [isAuthenticated]
  );

  const handleCommentPress = useCallback(
    (post: FeedItem) => {
      if (!isAuthenticated) { setShowAuthPrompt(true); return; }
      if (onCommentPress) onCommentPress(post);
    },
    [isAuthenticated, onCommentPress]
  );

  const handleSharePress = useCallback(async (post: FeedItem) => {
    try {
      await Share.share({
        message: `Check out this post from ${post.user?.username} on Teqil`,
      });
    } catch (err) {
      // ignore
    console.error('Error:', err)
    }
  }, []);

  const handleAddComment = useCallback((postId: string, text: string) => {
    const newComment: Comment = {
      id: `c-${Date.now()}`,
      user: { id: "current", username: "you", avatarUrl: "https://i.pravatar.cc/150?img=7" },
      text,
      timestamp: "Just now",
      likes: 0,
    };
    setFeedItems((prev) =>
      prev.map((item) =>
        item.id === postId && item.type === "content"
          ? { ...item, comments: [newComment, ...item.comments] }
          : item
      )
    );
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => {
      if (item.type === "ad") return <NativeAdCard isDark={isDark} />;
      return (
        <ContentCard
          item={item}
          isDark={isDark}
          onLikeToggle={handleLikeToggle}
          onSaveToggle={handleSaveToggle}
          onCommentPress={handleCommentPress}
          onSharePress={handleSharePress}
          onFullScreen={setFullScreenPost}
          isPlaying={item.id === playingVideoId}
        />
      );
    },
    [isDark, handleLikeToggle, handleSaveToggle, handleCommentPress, handleSharePress, playingVideoId]
  );

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);

  // Error state with retry button
  if (feedError && feedItems.length === 0) {
    const textColor = isDark ? Colors.textWhite : Colors.text;
    return (
      <View style={[styles.errorContainer, { backgroundColor: bg }]}>
        <Text style={{ color: textColor, marginBottom: 10 }}>{`Couldn't load posts.`}</Text>
        <Pressable
          onPress={() => { setFeedError(false); fetchFeed("initial"); }}
          style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}
        >
          <Text style={[{fontWeight: 900} ,{ color: textColor }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (isInitialLoading) {
    return (
      <ScrollView
        style={[styles.root, { backgroundColor: bg }]}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        <FeedSkeletonList isDark={isDark} count={3} />
      </ScrollView>
    );
  }

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: bg }]}>
      <FlatList
        data={feedItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={styles.igHeaderTitle}>
            <Text style={[styles.igLogo, { color: isDark ? Colors.textWhite : Colors.text }]}>
              Teqil
            </Text>
          </View>
        }
        ListFooterComponent={
          isPaginating ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : <View style={{ height: 80 }} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={Platform.OS === "android"}
        maxToRenderPerBatch={5}
        windowSize={7}
        initialNumToRender={5}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      <FullScreenPost
        item={fullScreenPost}
        visible={!!fullScreenPost}
        onClose={() => setFullScreenPost(null)}
        isDark={isDark}
      />

      <AuthPromptOverlay visible={showAuthPrompt} onDismiss={() => setShowAuthPrompt(false)} />
    </GestureHandlerRootView>
  );
}

// ----------------------------------------------------------------------
// Styles (updated)
// ----------------------------------------------------------------------
const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingBottom: 20 },
  igHeaderTitle: {
    paddingHorizontal: 19,
    paddingTop: Platform.OS === "ios" ? 8 : 4,
    paddingBottom: 4,
  },
  igLogo: { fontFamily: "Poppins_700Bold", fontSize: 28, letterSpacing: -0.5 },
  igCard: {
    paddingBottom: 8,
    marginHorizontal: 19,
    marginVertical: 10,
    borderRadius: 30,
  },
  igHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  igHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  igAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#E5E5E5" },
  igUsername: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  igLocation: { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 2 },
  igImage: { width: "100%", backgroundColor: "#F0F0F0" },
  videoContainer: { width: "100%", backgroundColor: "#000" },
  videoPlayer: { flex: 1 },
  durationBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: { color: "#FFF", fontSize: 12, fontFamily: "Poppins_500Medium" },
  igActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  igActionLeft: { flexDirection: "row", gap: 16 },
  igLikesContainer: { paddingHorizontal: 12, marginTop: 8 },
  igLikes: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  igCaptionContainer: { paddingHorizontal: 12, marginTop: 6 },
  igCaption: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 18 },
  igCaptionUsername: { fontFamily: "Poppins_600SemiBold" },
  igCommentsPreview: { paddingHorizontal: 12, marginTop: 4 },
  igViewComments: { fontFamily: "Poppins_600SemiBold", fontSize: 13, opacity: 0.7 },
  igTimestamp: { paddingHorizontal: 12, marginTop: 6, fontSize: 11, textTransform: "capitalize" },

  // Full‑screen modal
  fullScreenOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullScreenContent: { width: "100%", alignItems: "center" },
  fullScreenImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH },
  fullScreenVideoContainer: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.75 },
  fullScreenVideo: { flex: 1 },
  muteButton: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    padding: 6,
  },
  fullScreenActions: { paddingHorizontal: 20, marginTop: 10 },
  fullScreenCaption: { color: "#FFF", fontFamily: "Poppins_500Medium", fontSize: 15 },
  fullScreenUsername: { color: "#AAA", fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4 },
  closeFullScreen: { position: "absolute", top: 50, right: 20, zIndex: 10 },

  // Ad
  adImageContainer: { aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  adImageText: { fontSize: 16, marginTop: 12 },
  adCtaButton: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 30, marginTop: 20 },
  adCtaButtonText: { color: "#FFF" },

  // Auth
  authOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "flex-end", paddingBottom: 80, paddingHorizontal: 24 },
  authCard: { backgroundColor: "#fff", borderRadius: 24, padding: 28, width: "100%", alignItems: "center", gap: 12 },
  authTitle: { fontFamily: "Poppins_700Bold", fontSize: 22 },
  authSub: { fontSize: 14, textAlign: "center" },
  authBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, width: "100%", alignItems: "center" },
  authBtnText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  footerLoader: { paddingVertical: 28, alignItems: "center" },
  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
});