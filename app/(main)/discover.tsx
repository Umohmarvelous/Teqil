// /**
//  * app/(main)/discover.tsx
//  *
//  * Instagram‑style feed with:
//  * - Shimmer skeleton loading
//  * - Real Reddit data from transport subreddits
//  * - Dynamic image/video sizing
//  * - Full‑screen expand on tap
//  * - Video auto‑play with mute/duration
//  * - Real comment fetching (moved to layout)
//  * - Like / Save / Share actions
//  */

// import React, { useState, useCallback, useEffect} from "react";
// import {
//   View,
//   Text,
//   StyleSheet,
//   Pressable,
//   Image,
//   ActivityIndicator,
//   RefreshControl,
//   Platform,
//   FlatList,
//   Share,
//   Dimensions,
//   Modal,
//   ScrollView,
// } from "react-native";
// import * as Haptics from "expo-haptics";
// import { Video, ResizeMode } from "expo-av";
// import { useAuthStore } from "@/src/store/useStore";
// import { useSettingsStore } from "@/src/store/useSettingsStore";
// import { Colors } from "@/constants/colors";
// import { router } from "expo-router";
// import { HugeiconsIcon } from "@hugeicons/react-native";
// import {
//   Comment01Icon,
//   Share01Icon,
//   Bookmark01Icon,
//   MoreVerticalCircle01Icon,
//   FlashIcon,
//   Heart,
//   VolumeMuteIcon,
//   VolumeHighIcon,
// } from "@hugeicons/core-free-icons";
// import { GestureHandlerRootView } from "react-native-gesture-handler";
// import { FeedSkeletonList } from "@/components/ShimmerSkeleton";
// import Animated, {
//   useSharedValue,
//   useAnimatedStyle,
//   withSpring,
//   withTiming,
// } from "react-native-reanimated";

// // ----------------------------------------------------------------------
// // Types (same as before)
// // ----------------------------------------------------------------------
// interface User {
//   id: string;
//   username: string;
//   avatarUrl: string;
// }

// export interface Comment {
//   id: string;
//   user: User;
//   text: string;
//   timestamp: string;
//   likes: number;
// }

// export interface FeedItem {
//   id: string;
//   type: "content" | "ad";
//   user?: User;
//   imageUrl?: string;
//   videoUrl?: string;
//   isVideo?: boolean;
//   caption?: string;
//   likes: number;
//   comments: Comment[];
//   timestamp: string;
//   location?: string;
//   isLiked?: boolean;
//   isSaved?: boolean;
// }

// const { width: SCREEN_WIDTH } = Dimensions.get("window");

// // ----------------------------------------------------------------------
// // TRANSPORT SUBREDDITS
// // ----------------------------------------------------------------------
// const SUBREDDITS = ["cars", "driving", "roadtrip", "motorcycles", "travel", "carcamping", "autos"];
// const REDDIT_BASE = "https://api.reddit.com/r";

// // ----------------------------------------------------------------------
// // Ad Card (unchanged)
// // ----------------------------------------------------------------------
// function NativeAdCard({ isDark }: { isDark: boolean }) {
//   const bg = isDark ? "#1A1A2E" : "#FFFFFF";
//   const textColor = isDark ? Colors.textWhite : Colors.text;
//   const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;

//   return (
//     <View style={[styles.igCard, { backgroundColor: bg }]}>
//       <View style={styles.igHeader}>
//         <View style={styles.igHeaderLeft}>
//           <View style={[styles.igAvatar, { backgroundColor: Colors.primaryLight }]}>
//             <HugeiconsIcon icon={FlashIcon} size={20} color={Colors.primary} />
//           </View>
//           <View>
//             <Text style={[styles.igUsername, { color: textColor }]}>Teqil</Text>
//             <Text style={[styles.igLocation, { color: subColor }]}>Sponsored</Text>
//           </View>
//         </View>
//         <Pressable hitSlop={8}>
//           <HugeiconsIcon icon={MoreVerticalCircle01Icon} size={20} color={subColor} />
//         </Pressable>
//       </View>
//       <View style={[styles.adImageContainer, { backgroundColor: isDark ? "#111" : "#F5F5F5", borderWidth: 2, borderColor: 'red' }]}>
//         <HugeiconsIcon icon={FlashIcon} size={48} color={Colors.primary} />
//         <Text style={[styles.adImageText, { color: subColor }]}>Grow your earnings</Text>
//         <Pressable style={styles.adCtaButton} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
//           <Text style={styles.adCtaButtonText}>Learn More</Text>
//         </Pressable>
//       </View>
//       <View style={styles.igActions}>
//         <View style={styles.igActionLeft}>
//           <Pressable hitSlop={10} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
//             <HugeiconsIcon icon={Heart} size={24} color={subColor} />
//           </Pressable>
//           <Pressable hitSlop={10}>
//             <HugeiconsIcon icon={Comment01Icon} size={24} color={subColor} />
//           </Pressable>
//           <Pressable hitSlop={10}>
//             <HugeiconsIcon icon={Share01Icon} size={24} color={subColor} />
//           </Pressable>
//         </View>
//         <Pressable hitSlop={10}>
//           <HugeiconsIcon icon={Bookmark01Icon} size={24} color={subColor} />
//         </Pressable>
//       </View>
//     </View>
//   );
// }

// // ----------------------------------------------------------------------
// // Full‑Screen Modal (unchanged)
// // ----------------------------------------------------------------------
// function FullScreenPost({ item, visible, onClose, isDark }: { item: FeedItem | null; visible: boolean; onClose: () => void; isDark: boolean }) {
//   const scale = useSharedValue(0.9);
//   const opacity = useSharedValue(0);
//   const [isMuted, setIsMuted] = useState(true);

//   const animatedStyle = useAnimatedStyle(() => ({
//     transform: [{ scale: scale.value }],
//     opacity: opacity.value,
//   }));

//   useEffect(() => {
//     if (visible) {
//       scale.value = withSpring(1);
//       opacity.value = withTiming(1);
//     } else {
//       scale.value = withSpring(0.9);
//       opacity.value = withTiming(0);
//     }
//   }, [visible, scale, opacity]);

//   if (!item) return null;

//   return (
//     <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
//       <View style={styles.fullScreenOverlay}>
//         <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
//         <Animated.View style={[styles.fullScreenContent, animatedStyle]}>
//           {item.isVideo ? (
//             <View style={styles.fullScreenVideoContainer}>
//               <Video
//                 source={{ uri: item.videoUrl! }}
//                 style={styles.fullScreenVideo}
//                 resizeMode={ResizeMode.CONTAIN}
//                 shouldPlay
//                 isMuted={isMuted}
//                 useNativeControls={false}
//               />
//               <Pressable style={styles.muteButton} onPress={() => setIsMuted(!isMuted)}>
//                 <HugeiconsIcon icon={isMuted ? VolumeMuteIcon : VolumeHighIcon} size={28} color="#FFF" />
//               </Pressable>
//             </View>
//           ) : (
//             <Image source={{ uri: item.imageUrl }} style={styles.fullScreenImage} resizeMode="contain" />
//           )}
//           <View style={styles.fullScreenActions}>
//             <Text style={styles.fullScreenCaption}>{item.caption}</Text>
//             <Text style={styles.fullScreenUsername}>@{item.user?.username}</Text>
//           </View>
//         </Animated.View>
//         <Pressable style={styles.closeFullScreen} onPress={onClose}>
//           <Text style={{ color: "#FFF", fontSize: 18 }}>✕</Text>
//         </Pressable>
//       </View>
//     </Modal>
//   );
// }

// // ----------------------------------------------------------------------
// // Content Card (updated with video auto‑play)
// // ----------------------------------------------------------------------
// function ContentCard({
//   item,
//   isDark,
//   onLikeToggle,
//   onSaveToggle,
//   onCommentPress,
//   onSharePress,
//   onFullScreen,
//   isPlaying,
// }: {
//   item: FeedItem;
//   isDark: boolean;
//   onLikeToggle: (id: string) => void;
//   onSaveToggle: (id: string) => void;
//   onCommentPress: (item: FeedItem) => void;
//   onSharePress: (item: FeedItem) => void;
//   onFullScreen: (item: FeedItem) => void;
//   isPlaying?: boolean;
// }) {
//   const textColor = isDark ? Colors.textWhite : Colors.text;
//   const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
//   const iconColor = isDark ? Colors.textWhite : Colors.text;

//   const handleLike = () => {
//     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
//     onLikeToggle(item.id);
//   };

//   const handleSave = () => {
//     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
//     onSaveToggle(item.id);
//   };

//   const [imageHeight, setImageHeight] = useState(350);
//   useEffect(() => {
//     if (item.imageUrl && !item.isVideo) {
//       Image.getSize(item.imageUrl, (width, height) => {
//         const ratio = height / width;
//         setImageHeight(SCREEN_WIDTH * ratio);
//       });
//     }
//   }, [item.imageUrl, item.isVideo]);

//   return (
//     <View style={[styles.igCard]}>
//       <View style={styles.igHeader}>
//         <Pressable style={styles.igHeaderLeft}>
//           <Image source={{ uri: item.user?.avatarUrl }} style={styles.igAvatar} />
//           <View>
//             <Text style={[styles.igUsername, { color: textColor }]}>{item.user?.username}</Text>
//             {item.location && <Text style={[styles.igLocation, { color: subColor }]}>{item.location}</Text>}
//           </View>
//         </Pressable>
//         <Pressable hitSlop={8} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 15 }}>
//           <Pressable hitSlop={10} onPress={handleSave}>
//             <HugeiconsIcon
//               icon={Bookmark01Icon}
//               size={24}
//               color={iconColor}
//               fill={item.isSaved ? iconColor : "none"}
//             />
//           </Pressable>
//           <HugeiconsIcon icon={MoreVerticalCircle01Icon} size={20} color={iconColor} />
//         </Pressable>
//       </View>

//       <Pressable onPress={() => onFullScreen(item)}>
//         {item.isVideo ? (
//           <View style={[styles.videoContainer, { height: imageHeight }]}>
//             <Video
//               source={{ uri: item.videoUrl! }}
//               style={styles.videoPlayer}
//               resizeMode={ResizeMode.COVER}
//               shouldPlay={isPlaying}
//               isMuted
//               usePoster
//               posterSource={{ uri: item.imageUrl }}
//               useNativeControls={false}
//             />
//             <View style={styles.durationBadge}>
//               <Text style={styles.durationText}>▶ Video</Text>
//             </View>
//           </View>
//         ) : (
//           <Image
//             source={{ uri: item.imageUrl }}
//             style={[styles.igImage, { height: imageHeight }]}
//             resizeMode="cover"
//           />
//         )}
//       </Pressable>

//       <View style={styles.igActions}>
//         <View style={styles.igActionLeft}>
//           <Pressable hitSlop={10} onPress={handleLike}>
//             <HugeiconsIcon
//               icon={Heart}
//               size={24}
//               color={item.isLiked ? "#FF3B30" : iconColor}
//               fill={item.isLiked ? "#FF3B30" : "none"}
//             />
//           </Pressable>
//           <Pressable hitSlop={10} onPress={() => onCommentPress(item)}>
//             <HugeiconsIcon icon={Comment01Icon} size={24} color={iconColor} />
//           </Pressable>
//           <Pressable hitSlop={10} onPress={() => onSharePress(item)}>
//             <HugeiconsIcon icon={Share01Icon} size={24} color={iconColor} />
//           </Pressable>
//         </View>
//       </View>

//       <View style={styles.igLikesContainer}>
//         <Text style={[styles.igLikes, { color: textColor }]}>
//           {item.likes.toLocaleString()} likes
//         </Text>
//       </View>

//       <View style={styles.igCaptionContainer}>
//         <Text style={[styles.igCaption, { color: textColor }]}>
//           <Text style={styles.igCaptionUsername}>{item.user?.username}</Text>{" "}
//           {item.caption}
//         </Text>
//       </View>

//       {item.comments.length > 0 && (
//         <Pressable style={styles.igCommentsPreview} onPress={() => onCommentPress(item)}>
//           <Text style={[styles.igViewComments, { color: Colors.primaryLight }]}>
//             See all {item.comments.length} {item.comments.length > 1 ? "comments" : "comment"}
//           </Text>
//         </Pressable>
//       )}

//       <Text style={[styles.igTimestamp, { color: subColor }]}>{item.timestamp}</Text>
//     </View>
//   );
// }

// // ----------------------------------------------------------------------
// // Auth Prompt Overlay (unchanged)
// // ----------------------------------------------------------------------
// function AuthPromptOverlay({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
//   if (!visible) return null;
//   return (
//     <Pressable style={styles.authOverlay} onPress={onDismiss}>
//       <View style={styles.authCard}>
//         <Text style={styles.authTitle}>Join Teqil</Text>
//         <Text style={styles.authSub}>Sign up to like, comment, and interact with posts.</Text>
//         <Pressable
//           style={styles.authBtn}
//           onPress={() => {
//             onDismiss();
//             router.push("/(auth)/login");
//           }}
//         >
//           <Text style={styles.authBtnText}>Sign Up / Log In</Text>
//         </Pressable>
//       </View>
//     </Pressable>
//   );
// }

// // ----------------------------------------------------------------------
// // Main Component
// // ----------------------------------------------------------------------
// export default function DiscoverTab({ onCommentPress }: { onCommentPress?: (post: FeedItem) => void }) {
//   const { user } = useAuthStore();
//   const { theme } = useSettingsStore();
//   const isAuthenticated = !!user;

//   const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
//   const [lastPostId, setLastPostId] = useState("");
//   const [isInitialLoading, setIsInitialLoading] = useState(true);
//   const [isRefreshing, setIsRefreshing] = useState(false);
//   const [isPaginating, setIsPaginating] = useState(false);
//   const [hasMore, setHasMore] = useState(true);
//   const [showAuthPrompt, setShowAuthPrompt] = useState(false);
//   const [fullScreenPost, setFullScreenPost] = useState<FeedItem | null>(null);
//   const [feedError, setFeedError] = useState(false);
//   const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

//   const isDark = theme === "dark";
//   const bg = isDark ? Colors.background : Colors.border;

//   const viewabilityConfig = { itemVisiblePercentThreshold: 50 };
//   const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
//     const firstVideo = viewableItems.find((vi: any) => vi.item.type === "content" && vi.item.isVideo);
//     setPlayingVideoId(firstVideo ? firstVideo.item.id : null);
//   }, []);

//   const injectAds = useCallback((items: FeedItem[]): FeedItem[] => {
//     const result: FeedItem[] = [];
//     items.forEach((item, index) => {
//       result.push(item);
//       if ((index + 1) % 5 === 0) {
//         result.push({ id: `ad-${index}-${Date.now()}`, type: "ad", likes: 0, comments: [], timestamp: "" });
//       }
//     });
//     return result;
//   }, []);

//   const fetchFeed = useCallback(
//     async (mode: "initial" | "refresh" | "paginate") => {
//       try {
//         const sub = SUBREDDITS[Math.floor(Math.random() * SUBREDDITS.length)];
//         const after = mode === "paginate" && lastPostId ? `&after=${lastPostId}` : "";
//         const url = `${REDDIT_BASE}/${sub}/hot?limit=10${after}&raw_json=1`;
//         const response = await fetch(url, {
//           headers: { "User-Agent": "TeqilApp/1.0 (by /u/teqil_user)" },
//         });
//         if (!response.ok) throw new Error(`Status ${response.status}`);
//         const json = await response.json();

//         const posts = json.data.children
//           .map((child: any) => {
//             const data = child.data;
//             const isVideo = data.is_video && data.media?.reddit_video;
//             const mediaUrl = isVideo
//               ? data.media.reddit_video.fallback_url
//               : data.url_overridden_by_dest || data.url;

//             if (!mediaUrl || data.is_self) return null;

//             return {
//               id: data.id,
//               type: "content" as const,
//               user: {
//                 id: data.author,
//                 username: data.author,
//                 avatarUrl: `https://www.redditstatic.com/avatars/defaults/v2/avatar_default_${Math.floor(Math.random() * 7)}.png`,
//               },
//               imageUrl: isVideo ? data.thumbnail : mediaUrl,
//               videoUrl: isVideo ? mediaUrl : undefined,
//               isVideo,
//               caption: data.title,
//               likes: data.ups,
//               comments: [],
//               timestamp: new Date(data.created_utc * 1000).toLocaleString(),
//               isLiked: false,
//               isSaved: false,
//             };
//           })
//           .filter(Boolean) as FeedItem[];

//         const items = injectAds(posts);

//         if (mode === "initial" || mode === "refresh") {
//           setFeedItems(items);
//         } else {
//           setFeedItems((prev) => [...prev, ...items]);
//         }

//         setLastPostId(json.data.after);
//         setHasMore(!!json.data.after);
//         setFeedError(false);
//       } catch (error) {
//         console.error("Reddit fetch error:", error);
//         setFeedError(true);
//       } finally {
//         setIsInitialLoading(false);
//         setIsRefreshing(false);
//         setIsPaginating(false);
//       }
//     },
//     [lastPostId, injectAds]
//   );

//   useEffect(() => {
//     fetchFeed("initial");
//   }, [fetchFeed]);

//   const onRefresh = useCallback(() => {
//     setIsRefreshing(true);
//     setLastPostId("");
//     fetchFeed("refresh");
//   }, [fetchFeed]);

//   const onEndReached = useCallback(() => {
//     if (!hasMore || isPaginating || isInitialLoading) return;
//     setIsPaginating(true);
//     fetchFeed("paginate");
//   }, [hasMore, isPaginating, isInitialLoading, fetchFeed]);

//   const handleLikeToggle = useCallback(
//     (postId: string) => {
//       if (!isAuthenticated) { setShowAuthPrompt(true); return; }
//       setFeedItems((prev) =>
//         prev.map((item) =>
//           item.id === postId && item.type === "content"
//             ? { ...item, isLiked: !item.isLiked, likes: item.isLiked ? item.likes - 1 : item.likes + 1 }
//             : item
//         )
//       );
//     },
//     [isAuthenticated]
//   );

//   const handleSaveToggle = useCallback(
//     (postId: string) => {
//       if (!isAuthenticated) { setShowAuthPrompt(true); return; }
//       setFeedItems((prev) =>
//         prev.map((item) =>
//           item.id === postId && item.type === "content" ? { ...item, isSaved: !item.isSaved } : item
//         )
//       );
//     },
//     [isAuthenticated]
//   );

//   const handleCommentPress = useCallback(
//     (post: FeedItem) => {
//       if (!isAuthenticated) { setShowAuthPrompt(true); return; }
//       if (onCommentPress) onCommentPress(post);
//     },
//     [isAuthenticated, onCommentPress]
//   );

//   const handleSharePress = useCallback(async (post: FeedItem) => {
//     try {
//       await Share.share({
//         message: `Check out this post from ${post.user?.username} on Teqil`,
//       });
//     } catch (err) {
//       // ignore
//     console.error('Error:', err)
//     }
//   }, []);

//   const handleAddComment = useCallback((postId: string, text: string) => {
//     const newComment: Comment = {
//       id: `c-${Date.now()}`,
//       user: { id: "current", username: "you", avatarUrl: "https://i.pravatar.cc/150?img=7" },
//       text,
//       timestamp: "Just now",
//       likes: 0,
//     };
//     setFeedItems((prev) =>
//       prev.map((item) =>
//         item.id === postId && item.type === "content"
//           ? { ...item, comments: [newComment, ...item.comments] }
//           : item
//       )
//     );
//   }, []);

//   const renderItem = useCallback(
//     ({ item }: { item: FeedItem }) => {
//       if (item.type === "ad") return <NativeAdCard isDark={isDark} />;
//       return (
//         <ContentCard
//           item={item}
//           isDark={isDark}
//           onLikeToggle={handleLikeToggle}
//           onSaveToggle={handleSaveToggle}
//           onCommentPress={handleCommentPress}
//           onSharePress={handleSharePress}
//           onFullScreen={setFullScreenPost}
//           isPlaying={item.id === playingVideoId}
//         />
//       );
//     },
//     [isDark, handleLikeToggle, handleSaveToggle, handleCommentPress, handleSharePress, playingVideoId]
//   );

//   const keyExtractor = useCallback((item: FeedItem) => item.id, []);

//   // Error state with retry button
//   if (feedError && feedItems.length === 0) {
//     const textColor = isDark ? Colors.textWhite : Colors.text;
//     return (
//       <View style={[styles.errorContainer, { backgroundColor: bg }]}>
//         <Text style={{ color: textColor, marginBottom: 10 }}>{`Couldn't load posts.`}</Text>
//         <Pressable
//           onPress={() => { setFeedError(false); fetchFeed("initial"); }}
//           style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}
//         >
//           <Text style={[{fontWeight: 900} ,{ color: textColor }]}>Retry</Text>
//         </Pressable>
//       </View>
//     );
//   }

//   if (isInitialLoading) {
//     return (
//       <ScrollView
//         style={[styles.root, { backgroundColor: bg }]}
//         showsVerticalScrollIndicator={false}
//         showsHorizontalScrollIndicator={false}
//       >
//         <FeedSkeletonList isDark={isDark} count={3} />
//       </ScrollView>
//     );
//   }

//   return (
//     <GestureHandlerRootView style={[styles.root, { backgroundColor: bg }]}>
//       <FlatList
//         data={feedItems}
//         keyExtractor={keyExtractor}
//         renderItem={renderItem}

//         ListFooterComponent={
//           isPaginating ? (
//             <View style={styles.footerLoader}>
//               <ActivityIndicator size="small" color={Colors.primary} />
//             </View>
//           ) : <View style={{ height: 80 }} />
//         }
//         onEndReached={onEndReached}
//         onEndReachedThreshold={0.5}
//         refreshControl={
//           <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
//         }
//         contentContainerStyle={styles.listContent}
//         showsVerticalScrollIndicator={false}
//         removeClippedSubviews={Platform.OS === "android"}
//         maxToRenderPerBatch={5}
//         windowSize={7}
//         initialNumToRender={5}
//         onViewableItemsChanged={onViewableItemsChanged}
//         viewabilityConfig={viewabilityConfig}
//       />

//       <FullScreenPost
//         item={fullScreenPost}
//         visible={!!fullScreenPost}
//         onClose={() => setFullScreenPost(null)}
//         isDark={isDark}
//       />

//       <AuthPromptOverlay visible={showAuthPrompt} onDismiss={() => setShowAuthPrompt(false)} />
//     </GestureHandlerRootView>
//   );
// }


// const styles = StyleSheet.create({
//   root: { flex: 1 },
//   listContent: { paddingBottom: 20 },
//   igHeaderTitle: {
//     paddingHorizontal: 19,
//     paddingTop: Platform.OS === "ios" ? 8 : 4,
//     paddingBottom: 4,
//   },
//   igLogo: { fontFamily: "Poppins_700Bold", fontSize: 28, letterSpacing: -0.5 },
//   igCard: {
//     paddingBottom: 8,
//     marginHorizontal: 19,
//     marginVertical: 10,
//     borderRadius: 30,
//   },
//   igHeader: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     paddingHorizontal: 10,
//     paddingVertical: 12,
//   },
//   igHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
//   igAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#E5E5E5" },
//   igUsername: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
//   igLocation: { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 2 },
//   igImage: { width: "100%", backgroundColor: "#F0F0F0" },
//   videoContainer: { width: "100%", backgroundColor: "#000" },
//   videoPlayer: { flex: 1 },
//   durationBadge: {
//     position: "absolute",
//     bottom: 8,
//     right: 8,
//     backgroundColor: "rgba(0,0,0,0.6)",
//     borderRadius: 6,
//     paddingHorizontal: 6,
//     paddingVertical: 2,
//   },
//   durationText: { color: "#FFF", fontSize: 12, fontFamily: "Poppins_500Medium" },
//   igActions: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     paddingHorizontal: 12,
//     paddingTop: 10,
//   },
//   igActionLeft: { flexDirection: "row", gap: 16 },
//   igLikesContainer: { paddingHorizontal: 12, marginTop: 8 },
//   igLikes: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
//   igCaptionContainer: { paddingHorizontal: 12, marginTop: 6 },
//   igCaption: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 18 },
//   igCaptionUsername: { fontFamily: "Poppins_600SemiBold" },
//   igCommentsPreview: { paddingHorizontal: 12, marginTop: 4 },
//   igViewComments: { fontFamily: "Poppins_600SemiBold", fontSize: 13, opacity: 0.7 },
//   igTimestamp: { paddingHorizontal: 12, marginTop: 6, fontSize: 11, textTransform: "capitalize" },

//   // Full‑screen modal
//   fullScreenOverlay: {
//     flex: 1,
//     backgroundColor: "rgba(0,0,0,0.95)",
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   fullScreenContent: { width: "100%", alignItems: "center" },
//   fullScreenImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH },
//   fullScreenVideoContainer: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.75 },
//   fullScreenVideo: { flex: 1 },
//   muteButton: {
//     position: "absolute",
//     bottom: 12,
//     right: 12,
//     backgroundColor: "rgba(0,0,0,0.5)",
//     borderRadius: 20,
//     padding: 6,
//   },
//   fullScreenActions: { paddingHorizontal: 20, marginTop: 10 },
//   fullScreenCaption: { color: "#FFF", fontFamily: "Poppins_500Medium", fontSize: 15 },
//   fullScreenUsername: { color: "#AAA", fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4 },
//   closeFullScreen: { position: "absolute", top: 50, right: 20, zIndex: 10 },

//   // Ad
//   adImageContainer: { aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 20 },
//   adImageText: { fontSize: 16, marginTop: 12 },
//   adCtaButton: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 30, marginTop: 20 },
//   adCtaButtonText: { color: "#FFF" },

//   // Auth
//   authOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "flex-end", paddingBottom: 80, paddingHorizontal: 24 },
//   authCard: { backgroundColor: "#fff", borderRadius: 24, padding: 28, width: "100%", alignItems: "center", gap: 12 },
//   authTitle: { fontFamily: "Poppins_700Bold", fontSize: 22 },
//   authSub: { fontSize: 14, textAlign: "center" },
//   authBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, width: "100%", alignItems: "center" },
//   authBtnText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
//   footerLoader: { paddingVertical: 28, alignItems: "center" },
//   errorContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
// });


















/**
 * app/(main)/discover.tsx
 *
 * Social Feed ("For You" tab) with:
 * - Shimmer skeleton loading
 * - Real Reddit data from transport subreddits
 * - Dynamic image/video sizing
 * - Full‑screen video player with swipe-to-dismiss
 * - Twitter/Threads–style comment thread modal with reply support
 * - Interstitial ads every 4 comments
 * - Post creation UI
 * - Credit indicators on action buttons (🪙10 Like, 🪙30 Comment, 🪙50 Share)
 * - Once-per-action credit earning
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Share,
  Dimensions,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  FlatList,
  Animated as RNAnimated,
  PanResponder,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Video, ResizeMode } from "expo-av";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useCreditsStore } from "@/src/store/useCreditsStore";
import { Colors } from "@/constants/colors";
import { router } from "expo-router";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Comment01Icon,
  Share01Icon,
  Bookmark01Icon,
  MoreVerticalCircle01Icon,
  FlashIcon,
  Heart,
  VolumeMuteIcon,
  VolumeHighIcon,
  AdvertisimentFreeIcons,
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
// Credit Constants
// ----------------------------------------------------------------------
const CREDIT_LIKE = 10;
const CREDIT_COMMENT = 30;
const CREDIT_SHARE = 50;
const CREDIT_REPLY = 5;

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------
interface FeedUser {
  id: string;
  username: string;
  avatarUrl: string;
}

export interface Reply {
  id: string;
  user: FeedUser;
  text: string;
  timestamp: string;
  likes: number;
}

export interface Comment {
  id: string;
  user: FeedUser;
  text: string;
  timestamp: string;
  likes: number;
  replies: Reply[];
}

export interface FeedItem {
  id: string;
  type: "content" | "ad";
  user?: FeedUser;
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// ----------------------------------------------------------------------
// TRANSPORT SUBREDDITS
// ----------------------------------------------------------------------
const SUBREDDITS = ["cars", "driving", "roadtrip", "motorcycles", "travel", "carcamping", "autos"];
const REDDIT_BASE = "https://api.reddit.com/r";

// ----------------------------------------------------------------------
// Compact Ad Card (for comment thread interstitials)
// ----------------------------------------------------------------------
function CompactAdCard({ isDark }: { isDark: boolean }) {
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "#E5E8EC";
  return (
    <View style={[compactAdStyles.container, { backgroundColor: borderColor }]}>
      <View style={compactAdStyles.row}>
        <View style={[compactAdStyles.iconCircle, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F0F0" }]}>
          <HugeiconsIcon icon={FlashIcon} size={16} color={Colors.primary} />
        </View>
        <View style={compactAdStyles.textCol}>
          <Text style={[compactAdStyles.label, { color: subColor }]}>Sponsored</Text>
          <Text style={[compactAdStyles.cta, { color: Colors.primary }]}>Earn more with Teqil →</Text>
        </View>
      </View>
    </View>
  );
}

const compactAdStyles = StyleSheet.create({
  container: { marginVertical: 8, marginHorizontal: 4, borderRadius: 14, padding: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  textCol: { flex: 1 },
  label: { fontFamily: "Poppins_400Regular", fontSize: 10 },
  cta: { fontFamily: "Poppins_600SemiBold", fontSize: 12, marginTop: 1 },
});

// ----------------------------------------------------------------------
// Feed Ad Card (every 5th post)
// ----------------------------------------------------------------------
function NativeAdCard({ isDark }: { isDark: boolean }) {
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "#E5E8EC";

  return (
    <View style={[styles.igCard, { backgroundColor: borderColor }, { paddingHorizontal: 0 }]}>
      <View style={styles.igHeader}>
        <View style={styles.igHeaderLeft}>
          <View style={[styles.igAvatar, { padding: 20, borderRadius: 50, alignItems: "center", justifyContent: "center" }, { backgroundColor: textColor }]}>
            <HugeiconsIcon icon={AdvertisimentFreeIcons} size={23} color={subColor} />
          </View>
          <View>
            <Text style={[styles.igUsername, { fontSize: 15 }, { color: textColor }]}>Ads</Text>
            <Text style={[styles.igLocation, { color: subColor }]}>Sponsored</Text>
          </View>
        </View>
        <Pressable hitSlop={8}>
          <HugeiconsIcon icon={MoreVerticalCircle01Icon} fill={textColor} size={20} color={textColor} />
        </Pressable>
      </View>
      <View style={[styles.adImageContainer, { marginHorizontal: 10 }]}>
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
// Full‑Screen Video Player (swipe-down to dismiss)
// ----------------------------------------------------------------------
function FullScreenVideoPlayer({
  item,
  visible,
  onClose,
}: {
  item: FeedItem | null;
  visible: boolean;
  onClose: () => void;
}) {
  const [isMuted, setIsMuted] = useState(false);
  const translateY = useRef(new RNAnimated.Value(0)).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 10,
        onPanResponderMove: (_, gs) => {
          if (gs.dy > 0) translateY.setValue(gs.dy);
        },
        onPanResponderRelease: (_, gs) => {
          if (gs.dy > 120) {
            RNAnimated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }).start(onClose);
          } else {
            RNAnimated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
          }
        },
      }),
    [onClose, translateY]
  );

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <RNAnimated.View
        style={[fullVidStyles.overlay, { transform: [{ translateY }] }]}
        {...panResponder.panHandlers}
      >
        {/* Swipe indicator */}
        <View style={fullVidStyles.swipeBar} />
        <Video
          source={{ uri: item.videoUrl! }}
          style={fullVidStyles.video}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
          isLooping
          isMuted={isMuted}
          useNativeControls={false}
        />
        {/* Controls overlay */}
        <View style={fullVidStyles.controls}>
          <View style={fullVidStyles.captionArea}>
            <Text style={fullVidStyles.username}>@{item.user?.username}</Text>
            <Text style={fullVidStyles.caption} numberOfLines={3}>{item.caption}</Text>
          </View>
          <View style={fullVidStyles.sideActions}>
            <Pressable style={fullVidStyles.actionBtn} onPress={() => setIsMuted(!isMuted)}>
              <HugeiconsIcon icon={isMuted ? VolumeMuteIcon : VolumeHighIcon} size={26} color="#FFF" />
            </Pressable>
          </View>
        </View>
        <Pressable style={fullVidStyles.closeBtn} onPress={onClose} hitSlop={12}>
          <Text style={{ color: "#FFF", fontSize: 20, fontFamily: "Poppins_600SemiBold" }}>✕</Text>
        </Pressable>
      </RNAnimated.View>
    </Modal>
  );
}

const fullVidStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#000" },
  swipeBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.4)", alignSelf: "center", marginTop: 12 },
  video: { flex: 1 },
  controls: { position: "absolute", bottom: 80, left: 0, right: 0, flexDirection: "row", paddingHorizontal: 16, alignItems: "flex-end" },
  captionArea: { flex: 1, marginRight: 16 },
  username: { color: "#FFF", fontFamily: "Poppins_700Bold", fontSize: 15, marginBottom: 4 },
  caption: { color: "rgba(255,255,255,0.85)", fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 18 },
  sideActions: { alignItems: "center", gap: 20 },
  actionBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  closeBtn: { position: "absolute", top: 50, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
});

// ----------------------------------------------------------------------
// Full‑Screen Image Modal (unchanged)
// ----------------------------------------------------------------------
function FullScreenPost({
  item,
  visible,
  onClose,
  isDark,
}: {
  item: FeedItem | null;
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
}) {
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);

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
          <Image source={{ uri: item.imageUrl }} style={styles.fullScreenImage} resizeMode="contain" />
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
// Comment Thread Modal (Twitter/Threads style)
// ----------------------------------------------------------------------
function CommentThreadModal({
  post,
  visible,
  onClose,
  isDark,
  onAddComment,
  onAddReply,
}: {
  post: FeedItem | null;
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  onAddComment: (postId: string, text: string) => void;
  onAddReply: (postId: string, commentId: string, text: string) => void;
}) {
  const [newComment, setNewComment] = useState("");
  const [replyTarget, setReplyTarget] = useState<{ commentId: string; username: string } | null>(null);
  const inputRef = useRef<TextInput>(null);

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const bg = isDark ? Colors.background : "#FFF";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  const inputBg = isDark ? "rgba(255,255,255,0.06)" : "#F5F6F8";

  const handleSubmit = () => {
    const text = newComment.trim();
    if (!text || !post) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (replyTarget) {
      onAddReply(post.id, replyTarget.commentId, text);
      setReplyTarget(null);
    } else {
      onAddComment(post.id, text);
    }
    setNewComment("");
  };

  const handleReplyPress = (commentId: string, username: string) => {
    setReplyTarget({ commentId, username });
    setNewComment(`@${username} `);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Build flat list: comments + replies with interstitial ads every 4 items
  const threadItems = useMemo(() => {
    if (!post) return [];
    const items: Array<{ type: "comment" | "reply" | "ad"; data?: Comment | Reply; parentId?: string; parentUser?: string }> = [];
    let counter = 0;

    // Always show at least one ad even if no comments
    if (post.comments.length === 0) {
      items.push({ type: "ad" });
      return items;
    }

    for (const comment of post.comments) {
      items.push({ type: "comment", data: comment });
      counter++;
      if (counter % 4 === 0) items.push({ type: "ad" });

      for (const reply of (comment.replies || [])) {
        items.push({ type: "reply", data: reply, parentId: comment.id, parentUser: comment.user.username });
        counter++;
        if (counter % 4 === 0) items.push({ type: "ad" });
      }
    }
    return items;
  }, [post]);

  if (!post) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={threadStyles.dimOverlay} onPress={onClose} />
        <View style={[threadStyles.sheet, { backgroundColor: bg }]}>
          {/* Header */}
          <View style={[threadStyles.header, { borderBottomColor: borderColor }]}>
            <View style={threadStyles.handleBar} />
            <Text style={[threadStyles.headerTitle, { color: textColor }]}>
              {post.comments.length} {post.comments.length === 1 ? "Comment" : "Comments"}
            </Text>
          </View>

          {/* Thread List */}
          <FlatList
            data={threadItems}
            keyExtractor={(item, index) => {
              if (item.type === "ad") return `thread-ad-${index}`;
              return (item.data as any)?.id || `item-${index}`;
            }}
            renderItem={({ item }) => {
              if (item.type === "ad") return <CompactAdCard isDark={isDark} />;

              const isReply = item.type === "reply";
              const c = item.data as (Comment | Reply);

              return (
                <View style={[threadStyles.commentRow, isReply && threadStyles.replyIndent]}>
                  {isReply && <View style={[threadStyles.threadLine, { backgroundColor: borderColor }]} />}
                  <Image source={{ uri: c.user.avatarUrl }} style={threadStyles.avatar} />
                  <View style={threadStyles.commentBody}>
                    <View style={threadStyles.commentMeta}>
                      <Text style={[threadStyles.commentUser, { color: textColor }]}>{c.user.username}</Text>
                      <Text style={[threadStyles.commentTime, { color: subColor }]}>{c.timestamp}</Text>
                    </View>
                    <Text style={[threadStyles.commentText, { color: textColor }]}>{c.text}</Text>
                    <View style={threadStyles.commentActions}>
                      <Pressable hitSlop={8}>
                        <Text style={[threadStyles.actionText, { color: subColor }]}>{c.likes} ♥</Text>
                      </Pressable>
                      {!isReply && (
                        <Pressable
                          hitSlop={8}
                          onPress={() => handleReplyPress((c as Comment).id, c.user.username)}
                        >
                          <Text style={[threadStyles.actionText, { color: subColor }]}>Reply 🪙{CREDIT_REPLY}</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          />

          {/* Input Bar */}
          <View style={[threadStyles.inputBar, { borderTopColor: borderColor, backgroundColor: bg }]}>
            {replyTarget && (
              <View style={threadStyles.replyIndicator}>
                <Text style={[threadStyles.replyIndicatorText, { color: subColor }]}>
                  Replying to @{replyTarget.username}
                </Text>
                <Pressable onPress={() => { setReplyTarget(null); setNewComment(""); }} hitSlop={8}>
                  <Text style={{ color: subColor, fontSize: 14 }}>✕</Text>
                </Pressable>
              </View>
            )}
            <View style={[threadStyles.inputRow, { backgroundColor: inputBg }]}>
              <TextInput
                ref={inputRef}
                style={[threadStyles.input, { color: textColor }]}
                placeholder={replyTarget ? `Reply to @${replyTarget.username}...` : "Add a comment..."}
                placeholderTextColor={subColor}
                value={newComment}
                onChangeText={setNewComment}
                multiline
                maxLength={500}
              />
              <Pressable
                onPress={handleSubmit}
                disabled={!newComment.trim()}
                style={[threadStyles.sendBtn, !newComment.trim() && { opacity: 0.4 }]}
              >
                <Text style={threadStyles.sendBtnText}>
                  {replyTarget ? `🪙${CREDIT_REPLY}` : `🪙${CREDIT_COMMENT}`} Post
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const threadStyles = StyleSheet.create({
  dimOverlay: { flex: 0.2, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { flex: 0.8, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  header: { alignItems: "center", paddingVertical: 12, borderBottomWidth: 1 },
  handleBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(128,128,128,0.3)", marginBottom: 10 },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  commentRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  replyIndent: { paddingLeft: 56 },
  threadLine: { position: "absolute", left: 42, top: -10, bottom: 10, width: 2, borderRadius: 1 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#E5E5E5" },
  commentBody: { flex: 1 },
  commentMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  commentUser: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  commentTime: { fontFamily: "Poppins_400Regular", fontSize: 11 },
  commentText: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 19, marginTop: 3 },
  commentActions: { flexDirection: "row", gap: 16, marginTop: 6 },
  actionText: { fontFamily: "Poppins_500Medium", fontSize: 12 },
  inputBar: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
  replyIndicator: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  replyIndicatorText: { fontFamily: "Poppins_400Regular", fontSize: 12 },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8, gap: 8 },
  input: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 14, maxHeight: 80 },
  sendBtn: { backgroundColor: Colors.primary, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  sendBtnText: { color: "#FFF", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
});

// ----------------------------------------------------------------------
// Post Creation Modal
// ----------------------------------------------------------------------
function CreatePostModal({
  visible,
  onClose,
  onPost,
  isDark,
  userAvatar,
}: {
  visible: boolean;
  onClose: () => void;
  onPost: (text: string) => void;
  isDark: boolean;
  userAvatar: string;
}) {
  const [text, setText] = useState("");
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const bg = isDark ? Colors.background : "#FFF";
  const inputBg = isDark ? "rgba(255,255,255,0.06)" : "#F5F6F8";

  const handlePost = () => {
    if (!text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPost(text.trim());
    setText("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 0.3, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={onClose} />
        <View style={[createStyles.sheet, { backgroundColor: bg }]}>
          <View style={createStyles.header}>
            <Pressable onPress={onClose}>
              <Text style={[createStyles.cancelText, { color: subColor }]}>Cancel</Text>
            </Pressable>
            <Text style={[createStyles.title, { color: textColor }]}>New Post</Text>
            <Pressable
              onPress={handlePost}
              disabled={!text.trim()}
              style={[createStyles.postBtn, !text.trim() && { opacity: 0.4 }]}
            >
              <Text style={createStyles.postBtnText}>Post</Text>
            </Pressable>
          </View>
          <View style={createStyles.body}>
            <Image source={{ uri: userAvatar }} style={createStyles.avatar} />
            <TextInput
              style={[createStyles.input, { color: textColor }]}
              placeholder="What's on your mind?"
              placeholderTextColor={subColor}
              value={text}
              onChangeText={setText}
              multiline
              autoFocus
              maxLength={1000}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = StyleSheet.create({
  sheet: { flex: 0.7, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(128,128,128,0.15)" },
  cancelText: { fontFamily: "Poppins_500Medium", fontSize: 14 },
  title: { fontFamily: "Poppins_600SemiBold", fontSize: 16 },
  postBtn: { backgroundColor: Colors.primary, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 8 },
  postBtnText: { color: "#FFF", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  body: { flexDirection: "row", padding: 18, gap: 12, flex: 1 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#E5E5E5" },
  input: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 15, lineHeight: 22, textAlignVertical: "top" },
});

// ----------------------------------------------------------------------
// Content Card
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
  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "#E5E8EC";

  const handleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLikeToggle(item.id);
  };

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSaveToggle(item.id);
  };

  const [imageHeight, setImageHeight] = useState(150);
  useEffect(() => {
    if (item.imageUrl && !item.isVideo) {
      Image.getSize(item.imageUrl, (width, height) => {
        const ratio = height / width;
        setImageHeight(SCREEN_WIDTH * ratio);
      });
    }
  }, [item.imageUrl, item.isVideo]);

  return (
    <>
      <View style={styles.igCard}>
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
              style={[styles.igImage, { height: imageHeight }, { backgroundColor: borderColor }]}
              resizeMode="cover"
            />
          )}
        </Pressable>

        {/* Action buttons with credit indicators */}
        <View style={styles.igActions}>
          <View style={styles.igActionLeft}>
            <Pressable hitSlop={10} onPress={handleLike} style={styles.actionWithBadge}>
              <HugeiconsIcon
                icon={Heart}
                size={24}
                color={item.isLiked ? "#FF3B30" : iconColor}
                fill={item.isLiked ? "#FF3B30" : "none"}
              />
              <Text style={[styles.creditBadge, { color: Colors.primary }]}>🪙{CREDIT_LIKE}</Text>
            </Pressable>
            <Pressable hitSlop={10} onPress={() => onCommentPress(item)} style={styles.actionWithBadge}>
              <HugeiconsIcon icon={Comment01Icon} size={24} color={iconColor} />
              <Text style={[styles.creditBadge, { color: Colors.primary }]}>🪙{CREDIT_COMMENT}</Text>
            </Pressable>
            <Pressable hitSlop={10} onPress={() => onSharePress(item)} style={styles.actionWithBadge}>
              <HugeiconsIcon icon={Share01Icon} size={24} color={iconColor} />
              <Text style={[styles.creditBadge, { color: Colors.primary }]}>🪙{CREDIT_SHARE}</Text>
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
      <View style={{ borderWidth: 0.5, borderColor, height: 1, width: "100%" }} />
    </>
  );
}

// ----------------------------------------------------------------------
// Auth Prompt Overlay
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
export default function DiscoverTab({
  onCommentPress,
  setCommentHandler,
  scrollY,
}: {
  onCommentPress?: (post: FeedItem) => void;
  setCommentHandler?: (handler: any) => void;
  scrollY?: RNAnimated.Value;
}) {
  const { user } = useAuthStore();
  const { addCredit, addFloatingAnimation } = useCreditsStore();
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
  const [fullScreenVideoPost, setFullScreenVideoPost] = useState<FeedItem | null>(null);
  const [feedError, setFeedError] = useState(false);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [threadPost, setThreadPost] = useState<FeedItem | null>(null);

  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : Colors.border;

  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const HEADER_HEIGHT = topPadding + 110;
  const BOTTOM_HEIGHT = 60 + Math.max(insets.bottom, 16) + 20;

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

  // ─── Credit‑earning handlers ────────────────────────────────────────
  const handleLikeToggle = useCallback(
    (postId: string) => {
      if (!isAuthenticated) { setShowAuthPrompt(true); return; }
      setFeedItems((prev) =>
        prev.map((item) => {
          if (item.id === postId && item.type === "content") {
            const isNowLiked = !item.isLiked;
            if (isNowLiked && user) {
              addCredit("like", CREDIT_LIKE, user.id, postId);
              addFloatingAnimation(CREDIT_LIKE, SCREEN_WIDTH / 2 - 20, SCREEN_HEIGHT / 2);
            }
            return { ...item, isLiked: isNowLiked, likes: isNowLiked ? item.likes + 1 : item.likes - 1 };
          }
          return item;
        })
      );
    },
    [isAuthenticated, user, addCredit, addFloatingAnimation]
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
      setThreadPost(post);
    },
    [isAuthenticated]
  );

  const handleSharePress = useCallback(
    async (post: FeedItem) => {
      try {
        const result = await Share.share({
          message: `Check out this post from ${post.user?.username} on Teqil`,
        });
        if (result.action === Share.sharedAction && user) {
          addCredit("share", CREDIT_SHARE, user.id, post.id);
          addFloatingAnimation(CREDIT_SHARE, SCREEN_WIDTH / 2 - 20, SCREEN_HEIGHT / 2);
        }
      } catch (err) {
        console.error("Share error:", err);
      }
    },
    [user, addCredit, addFloatingAnimation]
  );

  const handleAddComment = useCallback(
    (postId: string, text: string) => {
      const newComment: Comment = {
        id: `c-${Date.now()}`,
        user: {
          id: user?.id || "current",
          username: user?.username || "you",
          avatarUrl: "https://i.pravatar.cc/150?img=7",
        },
        text,
        timestamp: "Just now",
        likes: 0,
        replies: [],
      };

      if (user) {
        addCredit("comment", CREDIT_COMMENT, user.id, postId);
        addFloatingAnimation(CREDIT_COMMENT, SCREEN_WIDTH / 2 - 20, SCREEN_HEIGHT / 2);
      }

      setFeedItems((prev) =>
        prev.map((item) =>
          item.id === postId && item.type === "content"
            ? { ...item, comments: [newComment, ...item.comments] }
            : item
        )
      );

      // Also update the thread post if it's currently open
      setThreadPost((prev) => {
        if (prev && prev.id === postId) {
          return { ...prev, comments: [newComment, ...prev.comments] };
        }
        return prev;
      });
    },
    [user, addCredit, addFloatingAnimation]
  );

  const handleAddReply = useCallback(
    (postId: string, commentId: string, text: string) => {
      const newReply: Reply = {
        id: `r-${Date.now()}`,
        user: {
          id: user?.id || "current",
          username: user?.username || "you",
          avatarUrl: "https://i.pravatar.cc/150?img=7",
        },
        text,
        timestamp: "Just now",
        likes: 0,
      };

      if (user) {
        addCredit("comment", CREDIT_REPLY, user.id, postId, commentId);
        addFloatingAnimation(CREDIT_REPLY, SCREEN_WIDTH / 2 - 20, SCREEN_HEIGHT / 2);
      }

      const updateComments = (comments: Comment[]) =>
        comments.map((c) =>
          c.id === commentId ? { ...c, replies: [...(c.replies || []), newReply] } : c
        );

      setFeedItems((prev) =>
        prev.map((item) =>
          item.id === postId && item.type === "content"
            ? { ...item, comments: updateComments(item.comments) }
            : item
        )
      );

      setThreadPost((prev) => {
        if (prev && prev.id === postId) {
          return { ...prev, comments: updateComments(prev.comments) };
        }
        return prev;
      });
    },
    [user, addCredit, addFloatingAnimation]
  );

  // ─── Post creation ───────────────────────────────────────────────────
  const handleCreatePost = useCallback(
    (text: string) => {
      if (!user) return;
      const newPost: FeedItem = {
        id: `local-${Date.now()}`,
        type: "content",
        user: {
          id: user.id,
          username: user.username || "you",
          avatarUrl: "https://i.pravatar.cc/150?img=7",
        },
        caption: text,
        likes: 0,
        comments: [],
        timestamp: "Just now",
        isLiked: false,
        isSaved: false,
      };
      setFeedItems((prev) => [newPost, ...prev]);
    },
    [user]
  );

  // ─── Full screen handler: video vs image ──────────────────────────────
  const handleFullScreen = useCallback((item: FeedItem) => {
    if (item.isVideo) {
      setFullScreenVideoPost(item);
    } else {
      setFullScreenPost(item);
    }
  }, []);

  useEffect(() => {
    if (setCommentHandler) {
      setCommentHandler(handleAddComment);
    }
  }, [setCommentHandler, handleAddComment]);

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
          onFullScreen={handleFullScreen}
          isPlaying={item.id === playingVideoId}
        />
      );
    },
    [isDark, handleLikeToggle, handleSaveToggle, handleCommentPress, handleSharePress, handleFullScreen, playingVideoId]
  );

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "#E5E8EC";

  // ─── Post creation header (shown at top of feed for signed-in users) ─
  const ListHeaderComponent = useMemo(() => {
    if (!isAuthenticated) return null;
    return (
      <Pressable
        style={[styles.createPostBar, { borderBottomColor: borderColor }]}
        onPress={() => setShowCreatePost(true)}
      >
        <Image
          source={{ uri: "https://i.pravatar.cc/150?img=7" }}
          style={styles.createPostAvatar}
        />
        <View style={[styles.createPostInput, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#F5F6F8" }]}>
          <Text style={[styles.createPostPlaceholder, { color: subColor }]}>
            What's on your mind?
          </Text>
        </View>
      </Pressable>
    );
  }, [isAuthenticated, isDark, borderColor, subColor]);

  // Error state with retry button
  if (feedError && feedItems.length === 0) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: bg }]}>
        <Text style={{ color: textColor, marginBottom: 10 }}>{`Couldn't load posts.`}</Text>
        <Pressable
          onPress={() => { setFeedError(false); fetchFeed("initial"); }}
          style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}
        >
          <Text style={[{ fontWeight: "900" }, { color: textColor }]}>Retry</Text>
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
        contentContainerStyle={{ paddingTop: HEADER_HEIGHT, paddingBottom: BOTTOM_HEIGHT }}
      >
        <FeedSkeletonList isDark={isDark} count={3} />
      </ScrollView>
    );
  }

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: bg }]}>
      <RNAnimated.FlatList
        data={feedItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={ListHeaderComponent}
        onScroll={
          scrollY
            ? RNAnimated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true }
              )
            : undefined
        }
        scrollEventThrottle={16}
        ListFooterComponent={
          isPaginating ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : (
            <View style={{ height: 40 }} />
          )
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: HEADER_HEIGHT, paddingBottom: BOTTOM_HEIGHT },
        ]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={Platform.OS === "android"}
        maxToRenderPerBatch={5}
        windowSize={7}
        initialNumToRender={5}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      {/* Full-screen image modal */}
      <FullScreenPost
        item={fullScreenPost}
        visible={!!fullScreenPost}
        onClose={() => setFullScreenPost(null)}
        isDark={isDark}
      />

      {/* Full-screen video player */}
      <FullScreenVideoPlayer
        item={fullScreenVideoPost}
        visible={!!fullScreenVideoPost}
        onClose={() => setFullScreenVideoPost(null)}
      />

      {/* Comment thread modal */}
      <CommentThreadModal
        post={threadPost}
        visible={!!threadPost}
        onClose={() => setThreadPost(null)}
        isDark={isDark}
        onAddComment={handleAddComment}
        onAddReply={handleAddReply}
      />

      {/* Post creation modal */}
      <CreatePostModal
        visible={showCreatePost}
        onClose={() => setShowCreatePost(false)}
        onPost={handleCreatePost}
        isDark={isDark}
        userAvatar="https://i.pravatar.cc/150?img=7"
      />

      <AuthPromptOverlay visible={showAuthPrompt} onDismiss={() => setShowAuthPrompt(false)} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: {
    paddingBottom: 20,
  },
  // Post creation bar
  createPostBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 19,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  createPostAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#E5E5E5" },
  createPostInput: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
  createPostPlaceholder: { fontFamily: "Poppins_400Regular", fontSize: 14 },
  // Card
  igCard: {
    paddingBottom: 8,
    marginHorizontal: 19,
    marginVertical: 10,
    borderRadius: 30,
    minHeight: 150,
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
  igImage: {
    width: "auto",
    borderRadius: 20,
    marginHorizontal: 10,
  },
  videoContainer: {
    width: "100%",
    backgroundColor: "#000",
    borderRadius: 20,
  },
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
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingVertical: 10,
  },
  igActionLeft: { flexDirection: "row", gap: 20 },
  actionWithBadge: { alignItems: "center", gap: 2 },
  creditBadge: { fontFamily: "Poppins_600SemiBold", fontSize: 10 },
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
  fullScreenActions: { paddingHorizontal: 20, marginTop: 10 },
  fullScreenCaption: { color: "#FFF", fontFamily: "Poppins_500Medium", fontSize: 15 },
  fullScreenUsername: { color: "#AAA", fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4 },
  closeFullScreen: { position: "absolute", top: 50, right: 20, zIndex: 10 },

  // Ad
  adImageContainer: { aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 20, borderRadius: 20 },
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