// import React, { useState, useCallback, useEffect } from "react";
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
// } from "react-native";
// import * as Haptics from "expo-haptics";
// import { useAuthStore } from "@/src/store/useStore";
// import { useSettingsStore } from "@/src/store/useSettingsStore";
// import { Colors } from "@/constants/colors";
// import { router } from "expo-router";
// import { HugeiconsIcon } from "@hugeicons/react-native";
// import {
//   BookmarkAdd01Icon,
//   Share01Icon,
//   ExternalLink,
//   FlashIcon,
// } from "@hugeicons/core-free-icons";

// // ─── Types ────────────────────────────────────────────────────────────────────

// interface FeedItem {
//   id: string;
//   type: "content" | "ad";
//   title?: string;
//   summary?: string;
//   imageUrl?: string;
//   source?: string;
//   category?: string;
//   readTime?: number;
//   publishedAt?: string;
//   url?: string;
// }

// // ─── Mock data generator (replace with real API call) ─────────────────────────

// const MOCK_CATEGORIES = ["News", "Safety", "Earnings", "Routes", "Weather"];
// const MOCK_SOURCES = ["Teqil Daily", "Road Watch NG", "Driver Hub", "Park News"];

// function generateMockItems(page: number): FeedItem[] {
//   const items: FeedItem[] = [];
//   const base = (page - 1) * 15;

//   for (let i = 0; i < 15; i++) {
//     const idx = base + i;
//     items.push({
//       id: `content-${idx}`,
//       type: "content",
//       title: [
//         "Lagos–Ibadan Expressway: New Speed Limits in Effect",
//         "How Teqil Drivers Earned ₦50k in One Weekend",
//         "Weather Alert: Heavy Rain Expected Across South-West",
//         "Park Owners: New Broadcast Feature Now Available",
//         "Top 5 Safety Tips for Night Driving in Nigeria",
//         "Fuel Price Update: Latest NNPC Station Rates",
//         "Passenger Safety: What Drivers Need to Know",
//         "Teqil Coin System Explained – Earn More Every Trip",
//       ][idx % 8],
//       summary: "Stay up to date with the latest road conditions, safety tips, and earning strategies for Nigerian commercial drivers.",
//       imageUrl: `https://picsum.photos/seed/${idx + 10}/800/450`,
//       source: MOCK_SOURCES[idx % MOCK_SOURCES.length],
//       category: MOCK_CATEGORIES[idx % MOCK_CATEGORIES.length],
//       readTime: 2 + (idx % 5),
//       publishedAt: new Date(Date.now() - idx * 3600000).toISOString(),
//       url: "#",
//     });
//   }

//   return items;
// }

// // Inject an ad placeholder every 5 content items
// function injectAds(items: FeedItem[]): FeedItem[] {
//   const result: FeedItem[] = [];
//   items.forEach((item, index) => {
//     result.push(item);
//     if ((index + 1) % 5 === 0) {
//       result.push({
//         id: `ad-${index}`,
//         type: "ad",
//       });
//     }
//   });
//   return result;
// }

// // ─── Content Card ─────────────────────────────────────────────────────────────

// function ContentCard({
//   item,
//   isDark,
//   isAuthenticated,
//   onPress,
// }: {
//   item: FeedItem;
//   isDark: boolean;
//   isAuthenticated: boolean;
//   onPress: () => void;
// }) {
//   const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
//   const textColor = isDark ? Colors.textWhite : Colors.text;
//   const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
//   const borderColor = isDark ? "rgba(255,255,255,0.06)" : "#F0F0F0";

//   const timeAgo = (iso: string) => {
//     const diff = Date.now() - new Date(iso).getTime();
//     const h = Math.floor(diff / 3600000);
//     if (h < 1) return "Just now";
//     if (h < 24) return `${h}h ago`;
//     return `${Math.floor(h / 24)}d ago`;
//   };

//   return (
//     <Pressable
//       onPress={onPress}
//       style={({ pressed }) => [
//         styles.card,
//         { backgroundColor: cardBg, borderColor, opacity: pressed ? 0.93 : 1 },
//       ]}
//     >
//       {/* Category pill */}
//       <View style={styles.cardMeta}>
//         <View style={[styles.categoryPill, { backgroundColor: Colors.primaryLight }]}>
//           <Text style={[styles.categoryText, { color: Colors.primaryDark }]}>
//             {item.category}
//           </Text>
//         </View>
//         <Text style={[styles.metaText, { color: subColor }]}>
//           {item.readTime} min read · {timeAgo(item.publishedAt!)}
//         </Text>
//       </View>

//       {/* Image */}
//       {item.imageUrl && (
//         <Image
//           source={{ uri: item.imageUrl }}
//           style={styles.cardImage}
//           resizeMode="cover"
//         />
//       )}

//       {/* Text content */}
//       <View style={styles.cardBody}>
//         <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={2}>
//           {item.title}
//         </Text>
//         <Text style={[styles.cardSummary, { color: subColor }]} numberOfLines={2}>
//           {item.summary}
//         </Text>
//       </View>

//       {/* Footer */}
//       <View style={[styles.cardFooter, { borderTopColor: borderColor }]}>
//         <View style={styles.sourceRow}>
//           <View style={[styles.sourceDot, { backgroundColor: Colors.primary }]} />
//           <Text style={[styles.sourceText, { color: subColor }]}>{item.source}</Text>
//         </View>
//         <View style={styles.cardActions}>
//           <Pressable hitSlop={8} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
//             <HugeiconsIcon icon={BookmarkAdd01Icon} size={18} color={subColor} />
//           </Pressable>
//           <Pressable hitSlop={8} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
//             <HugeiconsIcon icon={Share01Icon} size={18} color={subColor} />
//           </Pressable>
//           <Pressable hitSlop={8} onPress={onPress}>
//             <HugeiconsIcon icon={ExternalLink} size={18} color={Colors.primary} />
//           </Pressable>
//         </View>
//       </View>
//     </Pressable>
//   );
// }

// // ─── Native Ad Placeholder ────────────────────────────────────────────────────
// // Replace the inner content with a real NativeAd component from
// // react-native-google-mobile-ads when you have a valid ad unit ID.

// function NativeAdCard({ isDark }: { isDark: boolean }) {
//   const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
//   const textColor = isDark ? Colors.textWhite : Colors.text;
//   const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
//   const borderColor = isDark ? "rgba(255,255,255,0.06)" : "#F0F0F0";

//   return (
//     <View style={[styles.card, styles.adCard, { backgroundColor: cardBg, borderColor }]}>
//       <View style={styles.adBadge}>
//         <Text style={styles.adBadgeText}>Sponsored</Text>
//       </View>

//       {/* Placeholder image – real NativeAd will populate this */}
//       <View style={[styles.adImagePlaceholder, { backgroundColor: isDark ? "#1A1A1A" : "#F5F5F5" }]}>
//         <HugeiconsIcon icon={FlashIcon} size={32} color={Colors.primary} />
//         <Text style={[styles.adPlaceholderText, { color: subColor }]}>
//           Advertisement
//         </Text>
//       </View>

//       <View style={styles.cardBody}>
//         <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={1}>
//           Grow your earnings with Teqil Premium
//         </Text>
//         <Text style={[styles.cardSummary, { color: subColor }]} numberOfLines={2}>
//           Unlock exclusive routes and priority passenger matching.
//         </Text>
//       </View>

//       <Pressable
//         style={styles.adCta}
//         onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
//       >
//         <Text style={styles.adCtaText}>Learn More</Text>
//       </Pressable>
//     </View>
//   );
// }

// // ─── Auth Prompt Overlay ──────────────────────────────────────────────────────

// function AuthPromptOverlay({ visible }: { visible: boolean }) {
//   if (!visible) return null;
//   return (
//     <View style={styles.authPromptOverlay}>
//       <View style={styles.authPromptCard}>
//         <Text style={styles.authPromptTitle}>Join Teqil</Text>
//         <Text style={styles.authPromptSub}>
//           Sign up to read articles, earn points, and track your trips.
//         </Text>
//         <Pressable
//           style={styles.authPromptBtn}
//           onPress={() => router.push("/(auth)/login")}
//         >
//           <Text style={styles.authPromptBtnText}>Sign Up / Log In</Text>
//         </Pressable>
//       </View>
//     </View>
//   );
// }

// // ─── Main Discover Tab ────────────────────────────────────────────────────────

// export default function DiscoverTab() {
//   const { user } = useAuthStore();
//   const { theme } = useSettingsStore();
//   const isAuthenticated = !!user;

//   const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
//   const [page, setPage] = useState(1);
//   const [isLoading, setIsLoading] = useState(false);
//   const [isRefreshing, setIsRefreshing] = useState(false);
//   const [hasMore, setHasMore] = useState(true);
//   const [showAuthPrompt, setShowAuthPrompt] = useState(false);

//   const isDark = theme === "dark";
//   const bg = isDark ? Colors.background : "#F4F6FA";

//   const loadFeed = useCallback(async (pageNum: number, refresh = false) => {
//     if (isLoading && !refresh) return;
//     setIsLoading(true);

//     try {
//       // TODO: Replace with real API call:
//       // const res = await fetch(`/api/feed?page=${pageNum}&limit=15`);
//       // const data = await res.json();
//       // const items = data.items;
//       // setHasMore(data.hasMore);

//       // Mock: simulate network delay
//       await new Promise((r) => setTimeout(r, 600));
//       const items = generateMockItems(pageNum);
//       const withAds = injectAds(items);

//       if (refresh) {
//         setFeedItems(withAds);
//       } else {
//         setFeedItems((prev) => [...prev, ...withAds]);
//       }

//       // Mock: stop after page 5
//       if (pageNum >= 5) setHasMore(false);
//     } catch (err) {
//       console.warn("[Discover] feed load error", err);
//     } finally {
//       setIsLoading(false);
//       setIsRefreshing(false);
//     }
//   }, [isLoading]);

//   useEffect(() => {
//     loadFeed(1, true);
//   }, [loadFeed]);

//   const onRefresh = useCallback(() => {
//     setIsRefreshing(true);
//     setPage(1);
//     setHasMore(true);
//     loadFeed(1, true);
//   }, [loadFeed]);

//   const onEndReached = useCallback(() => {
//     if (!hasMore || isLoading) return;
//     const nextPage = page + 1;
//     setPage(nextPage);
//     loadFeed(nextPage);
//   }, [hasMore, isLoading, page, loadFeed]);

//   const handleContentPress = useCallback(() => {
//     if (!isAuthenticated) {
//       setShowAuthPrompt(true);
//       return;
//     }
//     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
//     // TODO: router.push(`/(main)/article/${item.id}`);
//   }, [isAuthenticated]);

//   const renderItem = useCallback(
//     ({ item }: { item: FeedItem }) => {
//       if (item.type === "ad") {
//         return <NativeAdCard isDark={isDark} />;
//       }
//       return (
//         <ContentCard
//           item={item}
//           isDark={isDark}
//           isAuthenticated={isAuthenticated}
//           onPress={handleContentPress}
//         />
//       );
//     },
//     [isDark, isAuthenticated, handleContentPress]
//   );

//   const keyExtractor = useCallback((item: FeedItem) => item.id, []);

//   const ListFooter = () => {
//     if (!isLoading || feedItems.length === 0) return <View style={{ height: 80 }} />;
//     return (
//       <View style={styles.footerLoader}>
//         <ActivityIndicator size="small" color={Colors.primary} />
//       </View>
//     );
//   };

//   const ListHeader = () => (
//     <View style={[styles.feedHeader]}>
//       <Text style={[styles.feedTitle, { color: isDark ? Colors.textWhite : Colors.text }]}>
//         Discover
//       </Text>
//       <Text style={[styles.feedSub, { color: isDark ? Colors.textSecondary : Colors.textTertiary }]}>
//         News, tips, and stories for Nigerian drivers
//       </Text>
//     </View>
//   );

//   return (
//     <View style={[styles.root, { backgroundColor: bg }]}>
//       <FlatList
//         data={feedItems}
//         keyExtractor={keyExtractor}
//         renderItem={renderItem}
//         ListHeaderComponent={ListHeader}
//         ListFooterComponent={ListFooter}
//         onEndReached={onEndReached}
//         onEndReachedThreshold={0.5}
//         refreshControl={

//           <RefreshControl
//             refreshing={isRefreshing}
//             onRefresh={onRefresh}
//             tintColor={Colors.primary}
//             colors={[Colors.primary]}
//           />
//         }
//         contentContainerStyle={styles.listContent}
//         showsVerticalScrollIndicator={false}
//         removeClippedSubviews={Platform.OS === "android"}
//         maxToRenderPerBatch={8}
//         windowSize={10}
//         initialNumToRender={5}
//       />

//       <AuthPromptOverlay visible={showAuthPrompt} />
//     </View>
//   );
// }

// // ─── Styles ───────────────────────────────────────────────────────────────────

// const styles = StyleSheet.create({
//   root: { flex: 1 },
//   listContent: {
//     paddingHorizontal: 16,
//     paddingBottom: 16,
//     gap: 12,
//   },
//   feedHeader: {
//     paddingTop: 20,
//     paddingBottom: 8,
//   },
//   feedTitle: {
//     fontFamily: "Poppins_700Bold",
//     fontSize: 26,
//   },
//   feedSub: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 13,
//     marginTop: 2,
//     lineHeight: 20,
//   },

//   // Content card
//   card: {
//     borderRadius: 20,
//     borderWidth: 1,
//     overflow: "hidden",
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.05,
//     shadowRadius: 8,
//     elevation: 2,
//   },
//   cardMeta: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     paddingHorizontal: 16,
//     paddingTop: 14,
//     paddingBottom: 10,
//   },
//   categoryPill: {
//     borderRadius: 8,
//     paddingHorizontal: 10,
//     paddingVertical: 4,
//   },
//   categoryText: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 10,
//     letterSpacing: 0.5,
//   },
//   metaText: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 11,
//   },
//   cardImage: {
//     width: "100%",
//     height: 180,
//     backgroundColor: "#E5E5E5",
//   },
//   cardBody: {
//     paddingHorizontal: 16,
//     paddingTop: 12,
//     paddingBottom: 10,
//     gap: 6,
//   },
//   cardTitle: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 15,
//     lineHeight: 22,
//   },
//   cardSummary: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 13,
//     lineHeight: 20,
//   },
//   cardFooter: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     paddingHorizontal: 16,
//     paddingVertical: 10,
//     borderTopWidth: 1,
//   },
//   sourceRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 6,
//   },
//   sourceDot: {
//     width: 6,
//     height: 6,
//     borderRadius: 3,
//   },
//   sourceText: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 12,
//   },
//   cardActions: {
//     flexDirection: "row",
//     gap: 14,
//     alignItems: "center",
//   },

//   // Ad card
//   adCard: {
//     borderStyle: "dashed",
//     borderWidth: 1.2,
//   },
//   adBadge: {
//     alignSelf: "flex-start",
//     backgroundColor: Colors.goldLight,
//     borderRadius: 6,
//     paddingHorizontal: 8,
//     paddingVertical: 3,
//     margin: 12,
//     marginBottom: 0,
//   },
//   adBadgeText: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 9,
//     color: Colors.gold,
//     letterSpacing: 1,
//     textTransform: "uppercase",
//   },
//   adImagePlaceholder: {
//     height: 130,
//     alignItems: "center",
//     justifyContent: "center",
//     gap: 8,
//     margin: 12,
//     borderRadius: 12,
//   },
//   adPlaceholderText: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 12,
//   },
//   adCta: {
//     backgroundColor: Colors.primary,
//     margin: 12,
//     marginTop: 4,
//     borderRadius: 12,
//     paddingVertical: 10,
//     alignItems: "center",
//   },
//   adCtaText: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 14,
//     color: "#fff",
//   },

//   // Footer loader
//   footerLoader: {
//     paddingVertical: 24,
//     alignItems: "center",
//   },

//   // Auth prompt
//   authPromptOverlay: {
//     ...StyleSheet.absoluteFillObject,
//     backgroundColor: "rgba(0,0,0,0.7)",
//     alignItems: "center",
//     justifyContent: "flex-end",
//     paddingBottom: 80,
//     paddingHorizontal: 24,
//   },
//   authPromptCard: {
//     backgroundColor: "#fff",
//     borderRadius: 24,
//     padding: 28,
//     width: "100%",
//     alignItems: "center",
//     gap: 12,
//   },
//   authPromptTitle: {
//     fontFamily: "Poppins_700Bold",
//     fontSize: 22,
//     color: Colors.text,
//   },
//   authPromptSub: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 14,
//     color: Colors.textSecondary,
//     textAlign: "center",
//     lineHeight: 22,
//   },
//   authPromptBtn: {
//     backgroundColor: Colors.primary,
//     borderRadius: 14,
//     paddingHorizontal: 32,
//     paddingVertical: 14,
//     marginTop: 8,
//     width: "100%",
//     alignItems: "center",
//   },
//   authPromptBtnText: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 15,
//     color: "#fff",
//   },
// });






















// // app/(main)/discover.tsx
// import React, { useState, useCallback, useEffect } from "react";
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
// } from "react-native";
// import * as Haptics from "expo-haptics";
// import { useAuthStore } from "@/src/store/useStore";
// import { useSettingsStore } from "@/src/store/useSettingsStore";
// import { Colors } from "@/constants/colors";
// import { router } from "expo-router";
// import { HugeiconsIcon } from "@hugeicons/react-native";
// import {
//   BookmarkAdd01Icon,
//   Share01Icon,
//   ExternalLink,
//   FlashIcon,
//   Search02Icon,
// } from "@hugeicons/core-free-icons";
// import SkeletonPlaceholder from "react-native-skeleton-placeholder";
// import SearchOverlay from "@/components/SearchOverlay";

// // ─── Types ────────────────────────────────────────────────────────────────────

// interface FeedItem {
//   id: string;
//   type: "content" | "ad";
//   title?: string;
//   summary?: string;
//   imageUrl?: string;
//   source?: string;
//   category?: string;
//   readTime?: number;
//   publishedAt?: string;
//   url?: string;
// }

// // ─── Mock data generator ──────────────────────────────────────────────────────

// const MOCK_CATEGORIES = ["News", "Safety", "Earnings", "Routes", "Weather"];
// const MOCK_SOURCES = ["Teqil Daily", "Road Watch NG", "Driver Hub", "Park News"];

// function generateMockItems(page: number): FeedItem[] {
//   const items: FeedItem[] = [];
//   const base = (page - 1) * 15;

//   for (let i = 0; i < 15; i++) {
//     const idx = base + i;
//     items.push({
//       id: `content-${idx}`,
//       type: "content",
//       title: [
//         "Lagos–Ibadan Expressway: New Speed Limits in Effect",
//         "How Teqil Drivers Earned ₦50k in One Weekend",
//         "Weather Alert: Heavy Rain Expected Across South-West",
//         "Park Owners: New Broadcast Feature Now Available",
//         "Top 5 Safety Tips for Night Driving in Nigeria",
//         "Fuel Price Update: Latest NNPC Station Rates",
//         "Passenger Safety: What Drivers Need to Know",
//         "Teqil Coin System Explained – Earn More Every Trip",
//       ][idx % 8],
//       summary: "Stay up to date with the latest road conditions, safety tips, and earning strategies for Nigerian commercial drivers.",
//       imageUrl: `https://picsum.photos/seed/${idx + 10}/800/450`,
//       source: MOCK_SOURCES[idx % MOCK_SOURCES.length],
//       category: MOCK_CATEGORIES[idx % MOCK_CATEGORIES.length],
//       readTime: 2 + (idx % 5),
//       publishedAt: new Date(Date.now() - idx * 3600000).toISOString(),
//       url: "#",
//     });
//   }

//   return items;
// }

// function injectAds(items: FeedItem[]): FeedItem[] {
//   const result: FeedItem[] = [];
//   items.forEach((item, index) => {
//     result.push(item);
//     if ((index + 1) % 5 === 0) {
//       result.push({
//         id: `ad-${index}`,
//         type: "ad",
//       });
//     }
//   });
//   return result;
// }

// // ─── Skeleton Card Component ──────────────────────────────────────────────────

// function SkeletonFeedCard({ isDark }: { isDark: boolean }) {
//   const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
//   const baseColor = isDark ? "#2A2A2A" : "#E1E9EE";
//   const highlightColor = isDark ? "#3A3A3A" : "#F0F0F0";

//   return (
//     <View style={[styles.card, { backgroundColor: cardBg }]}>
//       <SkeletonPlaceholder
//         borderRadius={4}
//         backgroundColor={baseColor}
//         highlightColor={highlightColor}     
//       >
//         <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
//           <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
//             <View style={{ width: 80, height: 20, borderRadius: 8 }} />
//             <View style={{ width: 60, height: 14, borderRadius: 4 }} />
//           </View>
//         </View>
//         <View style={{ width: "100%", height: 180 }} />
//         <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
//           <View style={{ width: "90%", height: 18, borderRadius: 4, marginBottom: 8 }} />
//           <View style={{ width: "100%", height: 14, borderRadius: 4, marginBottom: 4 }} />
//           <View style={{ width: "80%", height: 14, borderRadius: 4 }} />
//         </View>
//         <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: isDark ? "rgba(255,255,255,0.06)" : "#F0F0F0" }}>
//           <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
//             <View style={{ width: 100, height: 14, borderRadius: 4 }} />
//             <View style={{ flexDirection: "row", gap: 14 }}>
//               <View style={{ width: 18, height: 18, borderRadius: 9 }} />
//               <View style={{ width: 18, height: 18, borderRadius: 9 }} />
//               <View style={{ width: 18, height: 18, borderRadius: 9 }} />
//             </View>
//           </View>
//         </View>
//       </SkeletonPlaceholder>
//     </View>
//   );
// }

// // ─── Content Card ─────────────────────────────────────────────────────────────

// function ContentCard({
//   item,
//   isDark,
//   isAuthenticated,
//   onPress,
// }: {
//   item: FeedItem;
//   isDark: boolean;
//   isAuthenticated: boolean;
//   onPress: () => void;
// }) {
//   const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
//   const textColor = isDark ? Colors.textWhite : Colors.text;
//   const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
//   const borderColor = isDark ? "rgba(255,255,255,0.06)" : "#F0F0F0";

//   const timeAgo = (iso: string) => {
//     const diff = Date.now() - new Date(iso).getTime();
//     const h = Math.floor(diff / 3600000);
//     if (h < 1) return "Just now";
//     if (h < 24) return `${h}h ago`;
//     return `${Math.floor(h / 24)}d ago`;
//   };

//   return (
//     <Pressable
//       onPress={onPress}
//       style={({ pressed }) => [
//         styles.card,
//         { backgroundColor: cardBg, borderColor, opacity: pressed ? 0.93 : 1 },
//       ]}
//     >
//       <View style={styles.cardMeta}>
//         <View style={[styles.categoryPill, { backgroundColor: Colors.primaryLight }]}>
//           <Text style={[styles.categoryText, { color: Colors.primaryDark }]}>
//             {item.category}
//           </Text>
//         </View>
//         <Text style={[styles.metaText, { color: subColor }]}>
//           {item.readTime} min read · {timeAgo(item.publishedAt!)}
//         </Text>
//       </View>

//       {item.imageUrl && (
//         <Image
//           source={{ uri: item.imageUrl }}
//           style={styles.cardImage}
//           resizeMode="cover"
//         />
//       )}

//       <View style={styles.cardBody}>
//         <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={2}>
//           {item.title}
//         </Text>
//         <Text style={[styles.cardSummary, { color: subColor }]} numberOfLines={2}>
//           {item.summary}
//         </Text>
//       </View>

//       <View style={[styles.cardFooter, { borderTopColor: borderColor }]}>
//         <View style={styles.sourceRow}>
//           <View style={[styles.sourceDot, { backgroundColor: Colors.primary }]} />
//           <Text style={[styles.sourceText, { color: subColor }]}>{item.source}</Text>
//         </View>
//         <View style={styles.cardActions}>
//           <Pressable hitSlop={8} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
//             <HugeiconsIcon icon={BookmarkAdd01Icon} size={18} color={subColor} />
//           </Pressable>
//           <Pressable hitSlop={8} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
//             <HugeiconsIcon icon={Share01Icon} size={18} color={subColor} />
//           </Pressable>
//           <Pressable hitSlop={8} onPress={onPress}>
//             <HugeiconsIcon icon={ExternalLink} size={18} color={Colors.primary} />
//           </Pressable>
//         </View>
//       </View>
//     </Pressable>
//   );
// }

// // ─── Native Ad Placeholder ────────────────────────────────────────────────────

// function NativeAdCard({ isDark }: { isDark: boolean }) {
//   const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
//   const textColor = isDark ? Colors.textWhite : Colors.text;
//   const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
//   const borderColor = isDark ? "rgba(255,255,255,0.06)" : "#F0F0F0";

//   return (
//     <View style={[styles.card, styles.adCard, { backgroundColor: cardBg, borderColor }]}>
//       <View style={styles.adBadge}>
//         <Text style={styles.adBadgeText}>Sponsored</Text>
//       </View>

//       <View style={[styles.adImagePlaceholder, { backgroundColor: isDark ? "#1A1A1A" : "#F5F5F5" }]}>
//         <HugeiconsIcon icon={FlashIcon} size={32} color={Colors.primary} />
//         <Text style={[styles.adPlaceholderText, { color: subColor }]}>
//           Advertisement
//         </Text>
//       </View>

//       <View style={styles.cardBody}>
//         <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={1}>
//           Grow your earnings with Teqil Premium
//         </Text>
//         <Text style={[styles.cardSummary, { color: subColor }]} numberOfLines={2}>
//           Unlock exclusive routes and priority passenger matching.
//         </Text>
//       </View>

//       <Pressable
//         style={styles.adCta}
//         onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
//       >
//         <Text style={styles.adCtaText}>Learn More</Text>
//       </Pressable>
//     </View>
//   );
// }

// // ─── Auth Prompt Overlay ──────────────────────────────────────────────────────

// function AuthPromptOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
//   if (!visible) return null;
//   return (
//     <Pressable style={styles.authPromptOverlay} onPress={onClose}>
//       <View style={styles.authPromptCard}>
//         <Text style={styles.authPromptTitle}>Join Teqil</Text>
//         <Text style={styles.authPromptSub}>
//           Sign up to read articles, earn points, and track your trips.
//         </Text>
//         <Pressable
//           style={styles.authPromptBtn}
//           onPress={() => {
//             onClose();
//             router.push("/(auth)/login");
//           }}
//         >
//           <Text style={styles.authPromptBtnText}>Sign Up / Log In</Text>
//         </Pressable>
//       </View>
//     </Pressable>
//   );
// }

// // ─── Main Discover Tab ────────────────────────────────────────────────────────

// export default function DiscoverTab() {
//   const { user } = useAuthStore();
//   const { theme } = useSettingsStore();
//   const isAuthenticated = !!user;

//   const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
//   const [page, setPage] = useState(1);
//   const [isLoading, setIsLoading] = useState(false);
//   const [isRefreshing, setIsRefreshing] = useState(false);
//   const [hasMore, setHasMore] = useState(true);
//   const [showAuthPrompt, setShowAuthPrompt] = useState(false);
//   const [searchVisible, setSearchVisible] = useState(false);

//   const isDark = theme === "dark";
//   const bg = isDark ? Colors.background : "#F4F6FA";
//   const textColor = isDark ? Colors.textWhite : Colors.text;
//   const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;

//   const loadFeed = useCallback(async (pageNum: number, refresh = false) => {
//     if (isLoading && !refresh) return;
//     setIsLoading(true);

//     try {
//       await new Promise((r) => setTimeout(r, 600));
//       const items = generateMockItems(pageNum);
//       const withAds = injectAds(items);

//       if (refresh) {
//         setFeedItems(withAds);
//       } else {
//         setFeedItems((prev) => [...prev, ...withAds]);
//       }

//       if (pageNum >= 5) setHasMore(false);
//     } catch (err) {
//       console.warn("[Discover] feed load error", err);
//     } finally {
//       setIsLoading(false);
//       setIsRefreshing(false);
//     }
//   }, [isLoading]);

//   useEffect(() => {
//     loadFeed(1, true);
//   }, []);

//   const onRefresh = useCallback(() => {
//     setIsRefreshing(true);
//     setPage(1);
//     setHasMore(true);
//     loadFeed(1, true);
//   }, [loadFeed]);

//   const onEndReached = useCallback(() => {
//     if (!hasMore || isLoading) return;
//     const nextPage = page + 1;
//     setPage(nextPage);
//     loadFeed(nextPage);
//   }, [hasMore, isLoading, page, loadFeed]);

//   const handleContentPress = useCallback(() => {
//     if (!isAuthenticated) {
//       setShowAuthPrompt(true);
//       return;
//     }
//     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
//     // TODO: router.push(`/(main)/article/${item.id}`);
//   }, [isAuthenticated]);

//   const renderItem = useCallback(
//     ({ item }: { item: FeedItem }) => {
//       if (item.type === "ad") {
//         return <NativeAdCard isDark={isDark} />;
//       }
//       return (
//         <ContentCard
//           item={item}
//           isDark={isDark}
//           isAuthenticated={isAuthenticated}
//           onPress={handleContentPress}
//         />
//       );
//     },
//     [isDark, isAuthenticated, handleContentPress]
//   );

//   const keyExtractor = useCallback((item: FeedItem) => item.id, []);

//   const ListHeader = () => (
//     <View style={[styles.feedHeader, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
//       <View>
//         <Text style={[styles.feedTitle, { color: textColor }]}>
//           Discover
//         </Text>
//         <Text style={[styles.feedSub, { color: subColor }]}>
//           News, tips, and stories for Nigerian drivers
//         </Text>
//       </View>
//       <Pressable onPress={() => setSearchVisible(true)} style={styles.searchIcon}>
//         <HugeiconsIcon icon={Search02Icon} size={24} color={textColor} />
//       </Pressable>
//     </View>
//   );

//   // Show skeleton while loading initial data
//   if (isLoading && feedItems.length === 0) {
//     return (
//       <View style={[styles.root, { backgroundColor: bg }]}>
//         <FlatList
//           data={[1, 2, 3, 4, 5]}
//           keyExtractor={(item) => item.toString()}
//           renderItem={() => <SkeletonFeedCard isDark={isDark} />}
//           ListHeaderComponent={ListHeader}
//           contentContainerStyle={styles.listContent}
//           showsVerticalScrollIndicator={false}
//         />

//         <SearchOverlay visible={searchVisible} onClose={() => setSearchVisible(false)} isDark={isDark} />
//         <AuthPromptOverlay visible={showAuthPrompt} onClose={() => setShowAuthPrompt(false)} />
//       </View>
//     );
//   }

//   return (
//     <View style={[styles.root, { backgroundColor: bg }]}>
//       <FlatList
//         data={feedItems}
//         keyExtractor={keyExtractor}
//         renderItem={renderItem}
//         ListHeaderComponent={ListHeader}
//         ListFooterComponent={
//           isLoading && feedItems.length > 0 ? (
//             <View style={styles.footerLoader}>
//               <ActivityIndicator size="small" color={Colors.primary} />
//             </View>
//           ) : <View style={{ height: 80 }} />
//         }
//         onEndReached={onEndReached}
//         onEndReachedThreshold={0.5}
//         refreshControl={
//           <RefreshControl
//             refreshing={isRefreshing}
//             onRefresh={onRefresh}
//             tintColor={Colors.primary}
//             colors={[Colors.primary]}
//           />
//         }
//         contentContainerStyle={styles.listContent}
//         showsVerticalScrollIndicator={false}
//         removeClippedSubviews={Platform.OS === "android"}
//         maxToRenderPerBatch={8}
//         windowSize={10}
//         initialNumToRender={5}
//       />

//       <SearchOverlay visible={searchVisible} onClose={() => setSearchVisible(false)} isDark={isDark} />
//       <AuthPromptOverlay visible={showAuthPrompt} onClose={() => setShowAuthPrompt(false)} />
//     </View>
//   );
// }

// // ─── Styles ───────────────────────────────────────────────────────────────────

// const styles = StyleSheet.create({
//   root: { flex: 1 },
//   listContent: {
//     paddingHorizontal: 16,
//     paddingBottom: 16,
//     gap: 12,
//   },
//   feedHeader: {
//     paddingTop: 20,
//     paddingBottom: 8,
//   },
//   feedTitle: {
//     fontFamily: "Poppins_700Bold",
//     fontSize: 26,
//   },
//   feedSub: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 13,
//     marginTop: 2,
//     lineHeight: 20,
//   },
//   searchIcon: {
//     padding: 8,
//   },

//   card: {
//     borderRadius: 20,
//     borderWidth: 1,
//     overflow: "hidden",
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.05,
//     shadowRadius: 8,
//     elevation: 2,
//   },
//   cardMeta: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     paddingHorizontal: 16,
//     paddingTop: 14,
//     paddingBottom: 10,
//   },
//   categoryPill: {
//     borderRadius: 8,
//     paddingHorizontal: 10,
//     paddingVertical: 4,
//   },
//   categoryText: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 10,
//     letterSpacing: 0.5,
//   },
//   metaText: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 11,
//   },
//   cardImage: {
//     width: "100%",
//     height: 180,
//     backgroundColor: "#E5E5E5",
//   },
//   cardBody: {
//     paddingHorizontal: 16,
//     paddingTop: 12,
//     paddingBottom: 10,
//     gap: 6,
//   },
//   cardTitle: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 15,
//     lineHeight: 22,
//   },
//   cardSummary: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 13,
//     lineHeight: 20,
//   },
//   cardFooter: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     paddingHorizontal: 16,
//     paddingVertical: 10,
//     borderTopWidth: 1,
//   },
//   sourceRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 6,
//   },
//   sourceDot: {
//     width: 6,
//     height: 6,
//     borderRadius: 3,
//   },
//   sourceText: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 12,
//   },
//   cardActions: {
//     flexDirection: "row",
//     gap: 14,
//     alignItems: "center",
//   },

//   adCard: {
//     borderStyle: "dashed",
//     borderWidth: 1.2,
//   },
//   adBadge: {
//     alignSelf: "flex-start",
//     backgroundColor: Colors.goldLight,
//     borderRadius: 6,
//     paddingHorizontal: 8,
//     paddingVertical: 3,
//     margin: 12,
//     marginBottom: 0,
//   },
//   adBadgeText: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 9,
//     color: Colors.gold,
//     letterSpacing: 1,
//     textTransform: "uppercase",
//   },
//   adImagePlaceholder: {
//     height: 130,
//     alignItems: "center",
//     justifyContent: "center",
//     gap: 8,
//     margin: 12,
//     borderRadius: 12,
//   },
//   adPlaceholderText: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 12,
//   },
//   adCta: {
//     backgroundColor: Colors.primary,
//     margin: 12,
//     marginTop: 4,
//     borderRadius: 12,
//     paddingVertical: 10,
//     alignItems: "center",
//   },
//   adCtaText: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 14,
//     color: "#fff",
//   },

//   footerLoader: {
//     paddingVertical: 24,
//     alignItems: "center",
//   },

//   authPromptOverlay: {
//     ...StyleSheet.absoluteFillObject,
//     backgroundColor: "rgba(0,0,0,0.7)",
//     alignItems: "center",
//     justifyContent: "flex-end",
//     paddingBottom: 80,
//     paddingHorizontal: 24,
//   },
//   authPromptCard: {
//     backgroundColor: "#fff",
//     borderRadius: 24,
//     padding: 28,
//     width: "100%",
//     alignItems: "center",
//     gap: 12,
//   },
//   authPromptTitle: {
//     fontFamily: "Poppins_700Bold",
//     fontSize: 22,
//     color: Colors.text,
//   },
//   authPromptSub: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 14,
//     color: Colors.textSecondary,
//     textAlign: "center",
//     lineHeight: 22,
//   },
//   authPromptBtn: {
//     backgroundColor: Colors.primary,
//     borderRadius: 14,
//     paddingHorizontal: 32,
//     paddingVertical: 14,
//     marginTop: 8,
//     width: "100%",
//     alignItems: "center",
//   },
//   authPromptBtnText: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 15,
//     color: "#fff",
//   },
// });






/**
 * app/(main)/discover.tsx
 *
 * Instagram‑style feed with:
 * - Skeleton loading on initial load
 * - Native ad injection every 5 items
 * - Bottom sheet for comments (expandable/collapsible)
 * - Working Like, Comment, Share, Save buttons
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
  FlatList,
  KeyboardAvoidingView,
  Share,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
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
  Send,
} from "@hugeicons/core-free-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetFlatList,
} from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// ----------------------------------------------------------------------
// Types & Mock Data
// ----------------------------------------------------------------------
interface User {
  id: string;
  username: string;
  avatarUrl: string;
}

interface Comment {
  id: string;
  user: User;
  text: string;
  timestamp: string;
  likes: number;
}

interface FeedItem {
  id: string;
  type: "content" | "ad";
  user?: User;
  imageUrl?: string;
  caption?: string;
  likes: number;
  comments: Comment[];
  timestamp: string;
  location?: string;
  isLiked?: boolean;
  isSaved?: boolean;
}

const MOCK_USERS: User[] = [
  { id: "1", username: "lagos_driver", avatarUrl: "https://i.pravatar.cc/150?img=1" },
  { id: "2", username: "teqil_ng", avatarUrl: "https://i.pravatar.cc/150?img=2" },
  { id: "3", username: "road_safety", avatarUrl: "https://i.pravatar.cc/150?img=3" },
];

const MOCK_COMMENTS: Comment[] = [
  {
    id: "c1",
    user: MOCK_USERS[1],
    text: "This is so helpful! Thanks for sharing 🙌",
    timestamp: "2h ago",
    likes: 12,
  },
  {
    id: "c2",
    user: MOCK_USERS[2],
    text: "I experienced this yesterday on the expressway.",
    timestamp: "1h ago",
    likes: 5,
  },
];

function generateMockItems(page: number, limit = 10): FeedItem[] {
  const base = (page - 1) * limit;
  return Array.from({ length: limit }, (_, i) => {
    const idx = base + i;
    const user = MOCK_USERS[idx % MOCK_USERS.length];
    return {
      id: `post-${idx}`,
      type: "content",
      user,
      imageUrl: `https://picsum.photos/seed/${idx + 50}/800/800`,
      caption:
        "Stay safe on Lagos roads. Always check your mirrors and keep a safe distance. #DriveSafe #LagosTraffic",
      likes: 120 + idx * 7,
      comments: [...MOCK_COMMENTS],
      timestamp: `${idx + 2}h ago`,
      location: idx % 2 === 0 ? "Lagos–Ibadan Expressway" : "Lekki Phase 1",
      isLiked: false,
      isSaved: false,
    };
  });
}

function injectAds(items: FeedItem[]): FeedItem[] {
  const result: FeedItem[] = [];
  items.forEach((item, index) => {
    result.push(item);
    if ((index + 1) % 5 === 0) {
      result.push({ id: `ad-${index}-${Date.now()}`, type: "ad", likes: 0, comments: [], timestamp: "" });
    }
  });
  return result;
}

// ----------------------------------------------------------------------
// Skeleton Components (Instagram style)
// ----------------------------------------------------------------------
function SkeletonCard({ isDark }: { isDark: boolean }) {
  const bg = isDark ? "#1A1A2E" : "#FFFFFF";
  const shimmerColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";

  return (
    <View style={[styles.igCard, { backgroundColor: bg }]}>
      {/* Header skeleton */}
      <View style={styles.igHeader}>
        <View style={styles.igHeaderLeft}>
          <View style={[styles.skeletonAvatar, { backgroundColor: shimmerColor }]} />
          <View>
            <View style={[styles.skeletonLine, { width: 100, backgroundColor: shimmerColor }]} />
            <View style={[styles.skeletonLine, { width: 60, marginTop: 4, backgroundColor: shimmerColor }]} />
          </View>
        </View>
        <View style={[styles.skeletonIcon, { backgroundColor: shimmerColor }]} />
      </View>

      {/* Image skeleton */}
      <View style={[styles.igImage, { backgroundColor: shimmerColor }]} />

      {/* Actions skeleton */}
      <View style={styles.igActions}>
        <View style={styles.igActionLeft}>
          <View style={[styles.skeletonIcon, { backgroundColor: shimmerColor }]} />
          <View style={[styles.skeletonIcon, { backgroundColor: shimmerColor }]} />
          <View style={[styles.skeletonIcon, { backgroundColor: shimmerColor }]} />
        </View>
        <View style={[styles.skeletonIcon, { backgroundColor: shimmerColor }]} />
      </View>

      {/* Likes & caption skeleton */}
      <View style={styles.igLikesContainer}>
        <View style={[styles.skeletonLine, { width: 80, backgroundColor: shimmerColor }]} />
      </View>
      <View style={styles.igCaptionContainer}>
        <View style={[styles.skeletonLine, { width: "90%", backgroundColor: shimmerColor }]} />
        <View style={[styles.skeletonLine, { width: "70%", marginTop: 4, backgroundColor: shimmerColor }]} />
      </View>
    </View>
  );
}

function FeedSkeletonList({ isDark, count = 3 }: { isDark: boolean; count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={`skeleton-${i}`} isDark={isDark} />
      ))}
    </>
  );
}

// ----------------------------------------------------------------------
// Native Ad Card (Instagram style sponsored)
// ----------------------------------------------------------------------
function NativeAdCard({ isDark }: { isDark: boolean }) {
  const bg = isDark ? "#1A1A2E" : "#FFFFFF";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const borderColor = isDark ? "rgba(255,255,255,0.06)" : "#F0F0F0";

  return (
    <View style={[styles.igCard, { backgroundColor: bg, borderColor }]}>
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
// Instagram Content Card
// ----------------------------------------------------------------------
function ContentCard({
  item,
  isDark,
  onLikeToggle,
  onSaveToggle,
  onCommentPress,
  onSharePress,
}: {
  item: FeedItem;
  isDark: boolean;
  onLikeToggle: (id: string) => void;
  onSaveToggle: (id: string) => void;
  onCommentPress: (item: FeedItem) => void;
  onSharePress: (item: FeedItem) => void;
}) {
  const cardBg = isDark ? "#1A1A2E" : "#FFFFFF";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const iconColor = isDark ? Colors.textWhite : Colors.text;

  const handleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onLikeToggle(item.id);
  };

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSaveToggle(item.id);
  };

  return (
    <View style={[styles.igCard, { backgroundColor: cardBg }]}>
      {/* Header */}
      <View style={styles.igHeader}>
        <Pressable style={styles.igHeaderLeft}>
          <Image source={{ uri: item.user?.avatarUrl }} style={styles.igAvatar} />
          <View>
            <Text style={[styles.igUsername, { color: textColor }]}>{item.user?.username}</Text>
            {item.location && <Text style={[styles.igLocation, { color: subColor }]}>{item.location}</Text>}
          </View>
        </Pressable>
        <Pressable hitSlop={8}>
          <HugeiconsIcon icon={MoreVerticalCircle01Icon} size={20} color={iconColor} />
        </Pressable>
      </View>

      {/* Image */}
      <Image source={{ uri: item.imageUrl }} style={styles.igImage} resizeMode="cover" />

      {/* Action Buttons */}
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
        <Pressable hitSlop={10} onPress={handleSave}>
          <HugeiconsIcon
            icon={Bookmark01Icon}
            size={24}
            color={iconColor}
            fill={item.isSaved ? iconColor : "none"}
          />
        </Pressable>
      </View>

      {/* Likes */}
      <View style={styles.igLikesContainer}>
        <Text style={[styles.igLikes, { color: textColor }]}>
          {item.likes.toLocaleString()} likes
        </Text>
      </View>

      {/* Caption */}
      <View style={styles.igCaptionContainer}>
        <Text style={[styles.igCaption, { color: textColor }]}>
          <Text style={styles.igCaptionUsername}>{item.user?.username}</Text>{" "}
          {item.caption}
        </Text>
      </View>

      {/* Comments preview */}
      {item.comments.length > 0 && (
        <Pressable style={styles.igCommentsPreview} onPress={() => onCommentPress(item)}>
          <Text style={[styles.igViewComments, { color: subColor }]}>
            View all {item.comments.length} comments
          </Text>
          <Text style={[styles.igCommentPreview, { color: subColor }]} numberOfLines={1}>
            <Text style={styles.igCommentUsername}>{item.comments[0].user.username}</Text>{" "}
            {item.comments[0].text}
          </Text>
        </Pressable>
      )}

      {/* Timestamp */}
      <Text style={[styles.igTimestamp, { color: subColor }]}>{item.timestamp}</Text>
    </View>
  );
}

// ----------------------------------------------------------------------
// Comment Bottom Sheet (Instagram style)
// ----------------------------------------------------------------------
function CommentSheet({
  bottomSheetRef,
  post,
  isDark,
  onClose,
  onAddComment,
}: {
  bottomSheetRef: React.RefObject<BottomSheet>;
  post: FeedItem | null;
  isDark: boolean;
  onClose: () => void;
  onAddComment: (postId: string, text: string) => void;
}) {
  const [commentText, setCommentText] = useState("");
  const snapPoints = useMemo(() => ["70%", "95%"], []);

  const handleSend = () => {
    if (!commentText.trim() || !post) return;
    onAddComment(post.id, commentText.trim());
    setCommentText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    []
  );

  if (!post) return null;

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const bgColor = isDark ? "#1A1A2E" : "#FFFFFF";
  const inputBg = isDark ? "#2A2A40" : "#F2F2F2";

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onClose={onClose}
      backgroundStyle={{ backgroundColor: bgColor }}
      handleIndicatorStyle={{ backgroundColor: subColor }}
    >
      <View style={styles.sheetContainer}>
        {/* Header */}
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: textColor }]}>Comments</Text>
          <Pressable onPress={onClose}>
            <Text style={[styles.sheetClose, { color: Colors.primary }]}>Close</Text>
          </Pressable>
        </View>

        {/* Comments list */}
        <BottomSheetFlatList
          data={post.comments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.commentsList}
          renderItem={({ item }) => (
            <View style={styles.commentItem}>
              <Image source={{ uri: item.user.avatarUrl }} style={styles.commentAvatar} />
              <View style={styles.commentContent}>
                <Text style={[styles.commentText, { color: textColor }]}>
                  <Text style={styles.commentUsername}>{item.user.username}</Text> {item.text}
                </Text>
                <View style={styles.commentMeta}>
                  <Text style={[styles.commentTime, { color: subColor }]}>{item.timestamp}</Text>
                  <Text style={[styles.commentLikes, { color: subColor }]}>{item.likes} likes</Text>
                  <Pressable>
                    <Text style={[styles.commentReply, { color: subColor }]}>Reply</Text>
                  </Pressable>
                </View>
              </View>
              <Pressable hitSlop={8}>
                <HugeiconsIcon icon={Heart} size={14} color={subColor} />
              </Pressable>
            </View>
          )}
          ListEmptyComponent={
            <Text style={[styles.noComments, { color: subColor }]}>No comments yet.</Text>
          }
        />

        {/* Input bar */}
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[styles.commentInputContainer, { borderTopColor: isDark ? "#333" : "#E5E5E5" }]}>
            <Image source={{ uri: "https://i.pravatar.cc/150?img=7" }} style={styles.commentAvatarSmall} />
            <BottomSheetTextInput
              style={[styles.commentInput, { backgroundColor: inputBg, color: textColor }]}
              placeholder="Add a comment..."
              placeholderTextColor={subColor}
              value={commentText}
              onChangeText={setCommentText}
              multiline
            />
            <Pressable
              onPress={handleSend}
              disabled={!commentText.trim()}
              style={[styles.sendButton, { opacity: commentText.trim() ? 1 : 0.4 }]}
            >
              <HugeiconsIcon icon={Send} size={22} color={Colors.primary} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </BottomSheet>
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
// Main Discover Tab
// ----------------------------------------------------------------------
export default function DiscoverTab() {
  const { user } = useAuthStore();
  const { theme } = useSettingsStore();
  const isAuthenticated = !!user;

  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [page, setPage] = useState(1);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPaginating, setIsPaginating] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedItem | null>(null);

  const bottomSheetRef = useRef<BottomSheet>(null);
  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : "#FAFAFA";

  const fetchFeed = useCallback(
    async (pageNum: number, mode: "initial" | "refresh" | "paginate") => {
      try {
        await new Promise((r) => setTimeout(r, mode === "paginate" ? 800 : 1400));
        const items = injectAds(generateMockItems(pageNum));

        if (mode === "initial" || mode === "refresh") {
          setFeedItems(items);
        } else {
          setFeedItems((prev) => [...prev, ...items]);
        }

        if (pageNum >= 5) setHasMore(false);
      } catch (err) {
        console.warn("[Discover] fetch error", err);
      } finally {
        setIsInitialLoading(false);
        setIsRefreshing(false);
        setIsPaginating(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchFeed(1, "initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    setPage(1);
    setHasMore(true);
    fetchFeed(1, "refresh");
  }, [fetchFeed]);

  const onEndReached = useCallback(() => {
    if (!hasMore || isPaginating || isInitialLoading) return;
    const next = page + 1;
    setPage(next);
    setIsPaginating(true);
    fetchFeed(next, "paginate");
  }, [hasMore, isPaginating, isInitialLoading, page, fetchFeed]);

  const handleLikeToggle = useCallback(
    (postId: string) => {
      if (!isAuthenticated) {
        setShowAuthPrompt(true);
        return;
      }
      setFeedItems((prev) =>
        prev.map((item) =>
          item.id === postId && item.type === "content"
            ? { ...item, isLiked: !item.isLiked, likes: item.likes + (item.isLiked ? -1 : 1) }
            : item
        )
      );
    },
    [isAuthenticated]
  );

  const handleSaveToggle = useCallback(
    (postId: string) => {
      if (!isAuthenticated) {
        setShowAuthPrompt(true);
        return;
      }
      setFeedItems((prev) =>
        prev.map((item) =>
          item.id === postId && item.type === "content"
            ? { ...item, isSaved: !item.isSaved }
            : item
        )
      );
    },
    [isAuthenticated]
  );

  const handleCommentPress = useCallback(
    (post: FeedItem) => {
      if (!isAuthenticated) {
        setShowAuthPrompt(true);
        return;
      }
      setSelectedPost(post);
      bottomSheetRef.current?.snapToIndex(0);
    },
    [isAuthenticated]
  );

  const handleSharePress = useCallback(async (post: FeedItem) => {
    try {
      await Share.share({
        message: `Check out this post from ${post.user?.username} on Teqil`,
      });
    } catch (error) {
      Alert.alert("Error", "Could not share post");
    }
  }, []);

  const handleAddComment = useCallback((postId: string, text: string) => {
    setFeedItems((prev) =>
      prev.map((item) => {
        if (item.id === postId && item.type === "content") {
          const newComment: Comment = {
            id: `c-${Date.now()}`,
            user: {
              id: "current",
              username: "you",
              avatarUrl: "https://i.pravatar.cc/150?img=7",
            },
            text,
            timestamp: "Just now",
            likes: 0,
          };
          return { ...item, comments: [newComment, ...item.comments] };
        }
        return item;
      })
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
        />
      );
    },
    [isDark, handleLikeToggle, handleSaveToggle, handleCommentPress, handleSharePress]
  );

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);

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
        ListEmptyComponent={
          isInitialLoading ? <FeedSkeletonList isDark={isDark} count={3} /> : null
        }
        ListFooterComponent={
          isPaginating ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : (
            <View style={{ height: 80 }} />
          )
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={Platform.OS === "android"}
        maxToRenderPerBatch={5}
        windowSize={7}
        initialNumToRender={3}
      />

      <CommentSheet
        bottomSheetRef={bottomSheetRef}
        post={selectedPost}
        isDark={isDark}
        onClose={() => setSelectedPost(null)}
        onAddComment={handleAddComment}
      />

      <AuthPromptOverlay visible={showAuthPrompt} onDismiss={() => setShowAuthPrompt(false)} />
    </GestureHandlerRootView>
  );
}

// ----------------------------------------------------------------------
// Styles (Instagram replica)
// ----------------------------------------------------------------------
const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingBottom: 20 },
  igHeaderTitle: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 50 : 30,
    paddingBottom: 8,
  },
  igLogo: { fontFamily: "Poppins_700Bold", fontSize: 28, letterSpacing: -0.5 },
  igCard: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#DBDBDB",
  },
  igHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  igHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  igAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#E5E5E5" },
  igUsername: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  igLocation: { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 2 },
  igImage: { width: "100%", aspectRatio: 1, backgroundColor: "#F0F0F0" },
  igActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  igActionLeft: { flexDirection: "row", alignItems: "center", gap: 16 },
  igLikesContainer: { paddingHorizontal: 12, marginTop: 8 },
  igLikes: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  igCaptionContainer: { paddingHorizontal: 12, marginTop: 4 },
  igCaption: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 18 },
  igCaptionUsername: { fontFamily: "Poppins_600SemiBold" },
  igCommentsPreview: { paddingHorizontal: 12, marginTop: 4 },
  igViewComments: { fontFamily: "Poppins_400Regular", fontSize: 13, opacity: 0.7 },
  igCommentPreview: { fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 2 },
  igCommentUsername: { fontFamily: "Poppins_600SemiBold" },
  igTimestamp: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    paddingHorizontal: 12,
    marginTop: 6,
    textTransform: "uppercase",
  },

  // Ad styles
  adImageContainer: {
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  adImageText: { fontFamily: "Poppins_500Medium", fontSize: 16, marginTop: 12 },
  adCtaButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 30,
    marginTop: 20,
  },
  adCtaButtonText: { fontFamily: "Poppins_600SemiBold", color: "#FFF" },

  // Bottom sheet
  sheetContainer: { flex: 1 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#DBDBDB",
  },
  sheetTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16 },
  sheetClose: { fontFamily: "Poppins_500Medium", fontSize: 15 },
  commentsList: { paddingHorizontal: 12, paddingTop: 8 },
  commentItem: {
    flexDirection: "row",
    marginBottom: 16,
  },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  commentContent: { flex: 1 },
  commentText: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 18 },
  commentUsername: { fontFamily: "Poppins_600SemiBold" },
  commentMeta: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 12 },
  commentTime: { fontFamily: "Poppins_400Regular", fontSize: 12 },
  commentLikes: { fontFamily: "Poppins_500Medium", fontSize: 12 },
  commentReply: { fontFamily: "Poppins_500Medium", fontSize: 12 },
  noComments: { fontFamily: "Poppins_400Regular", textAlign: "center", marginTop: 30 },
  commentInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentAvatarSmall: { width: 32, height: 32, borderRadius: 16, marginRight: 10 },
  commentInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: { marginLeft: 10 },

  // Skeleton
  skeletonAvatar: { width: 36, height: 36, borderRadius: 18 },
  skeletonLine: { height: 12, borderRadius: 6 },
  skeletonIcon: { width: 24, height: 24, borderRadius: 6 },

  // Auth overlay
  authOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 80,
    paddingHorizontal: 24,
  },
  authCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 28,
    width: "100%",
    alignItems: "center",
    gap: 12,
  },
  authTitle: { fontFamily: "Poppins_700Bold", fontSize: 22, color: Colors.text },
  authSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  authBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 8,
    width: "100%",
    alignItems: "center",
  },
  authBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#fff" },
  footerLoader: { paddingVertical: 28, alignItems: "center" },
});