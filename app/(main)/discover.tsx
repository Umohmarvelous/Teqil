import React, { useState, useCallback, useEffect } from "react";
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
} from "react-native";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { Colors } from "@/constants/colors";
import { router } from "expo-router";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  BookmarkAdd01Icon,
  Share01Icon,
  ExternalLink,
  FlashIcon,
} from "@hugeicons/core-free-icons";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeedItem {
  id: string;
  type: "content" | "ad";
  title?: string;
  summary?: string;
  imageUrl?: string;
  source?: string;
  category?: string;
  readTime?: number;
  publishedAt?: string;
  url?: string;
}

// ─── Mock data generator (replace with real API call) ─────────────────────────

const MOCK_CATEGORIES = ["News", "Safety", "Earnings", "Routes", "Weather"];
const MOCK_SOURCES = ["Teqil Daily", "Road Watch NG", "Driver Hub", "Park News"];

function generateMockItems(page: number): FeedItem[] {
  const items: FeedItem[] = [];
  const base = (page - 1) * 15;

  for (let i = 0; i < 15; i++) {
    const idx = base + i;
    items.push({
      id: `content-${idx}`,
      type: "content",
      title: [
        "Lagos–Ibadan Expressway: New Speed Limits in Effect",
        "How Teqil Drivers Earned ₦50k in One Weekend",
        "Weather Alert: Heavy Rain Expected Across South-West",
        "Park Owners: New Broadcast Feature Now Available",
        "Top 5 Safety Tips for Night Driving in Nigeria",
        "Fuel Price Update: Latest NNPC Station Rates",
        "Passenger Safety: What Drivers Need to Know",
        "Teqil Coin System Explained – Earn More Every Trip",
      ][idx % 8],
      summary: "Stay up to date with the latest road conditions, safety tips, and earning strategies for Nigerian commercial drivers.",
      imageUrl: `https://picsum.photos/seed/${idx + 10}/800/450`,
      source: MOCK_SOURCES[idx % MOCK_SOURCES.length],
      category: MOCK_CATEGORIES[idx % MOCK_CATEGORIES.length],
      readTime: 2 + (idx % 5),
      publishedAt: new Date(Date.now() - idx * 3600000).toISOString(),
      url: "#",
    });
  }

  return items;
}

// Inject an ad placeholder every 5 content items
function injectAds(items: FeedItem[]): FeedItem[] {
  const result: FeedItem[] = [];
  items.forEach((item, index) => {
    result.push(item);
    if ((index + 1) % 5 === 0) {
      result.push({
        id: `ad-${index}`,
        type: "ad",
      });
    }
  });
  return result;
}

// ─── Content Card ─────────────────────────────────────────────────────────────

function ContentCard({
  item,
  isDark,
  isAuthenticated,
  onPress,
}: {
  item: FeedItem;
  isDark: boolean;
  isAuthenticated: boolean;
  onPress: () => void;
}) {
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const borderColor = isDark ? "rgba(255,255,255,0.06)" : "#F0F0F0";

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return "Just now";
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: cardBg, borderColor, opacity: pressed ? 0.93 : 1 },
      ]}
    >
      {/* Category pill */}
      <View style={styles.cardMeta}>
        <View style={[styles.categoryPill, { backgroundColor: Colors.primaryLight }]}>
          <Text style={[styles.categoryText, { color: Colors.primaryDark }]}>
            {item.category}
          </Text>
        </View>
        <Text style={[styles.metaText, { color: subColor }]}>
          {item.readTime} min read · {timeAgo(item.publishedAt!)}
        </Text>
      </View>

      {/* Image */}
      {item.imageUrl && (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.cardImage}
          resizeMode="cover"
        />
      )}

      {/* Text content */}
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[styles.cardSummary, { color: subColor }]} numberOfLines={2}>
          {item.summary}
        </Text>
      </View>

      {/* Footer */}
      <View style={[styles.cardFooter, { borderTopColor: borderColor }]}>
        <View style={styles.sourceRow}>
          <View style={[styles.sourceDot, { backgroundColor: Colors.primary }]} />
          <Text style={[styles.sourceText, { color: subColor }]}>{item.source}</Text>
        </View>
        <View style={styles.cardActions}>
          <Pressable hitSlop={8} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
            <HugeiconsIcon icon={BookmarkAdd01Icon} size={18} color={subColor} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
            <HugeiconsIcon icon={Share01Icon} size={18} color={subColor} />
          </Pressable>
          <Pressable hitSlop={8} onPress={onPress}>
            <HugeiconsIcon icon={ExternalLink} size={18} color={Colors.primary} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Native Ad Placeholder ────────────────────────────────────────────────────
// Replace the inner content with a real NativeAd component from
// react-native-google-mobile-ads when you have a valid ad unit ID.

function NativeAdCard({ isDark }: { isDark: boolean }) {
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const borderColor = isDark ? "rgba(255,255,255,0.06)" : "#F0F0F0";

  return (
    <View style={[styles.card, styles.adCard, { backgroundColor: cardBg, borderColor }]}>
      <View style={styles.adBadge}>
        <Text style={styles.adBadgeText}>Sponsored</Text>
      </View>

      {/* Placeholder image – real NativeAd will populate this */}
      <View style={[styles.adImagePlaceholder, { backgroundColor: isDark ? "#1A1A1A" : "#F5F5F5" }]}>
        <HugeiconsIcon icon={FlashIcon} size={32} color={Colors.primary} />
        <Text style={[styles.adPlaceholderText, { color: subColor }]}>
          Advertisement
        </Text>
      </View>

      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={1}>
          Grow your earnings with Teqil Premium
        </Text>
        <Text style={[styles.cardSummary, { color: subColor }]} numberOfLines={2}>
          Unlock exclusive routes and priority passenger matching.
        </Text>
      </View>

      <Pressable
        style={styles.adCta}
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      >
        <Text style={styles.adCtaText}>Learn More</Text>
      </Pressable>
    </View>
  );
}

// ─── Auth Prompt Overlay ──────────────────────────────────────────────────────

function AuthPromptOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={styles.authPromptOverlay}>
      <View style={styles.authPromptCard}>
        <Text style={styles.authPromptTitle}>Join Teqil</Text>
        <Text style={styles.authPromptSub}>
          Sign up to read articles, earn points, and track your trips.
        </Text>
        <Pressable
          style={styles.authPromptBtn}
          onPress={() => router.push("/(auth)/login")}
        >
          <Text style={styles.authPromptBtnText}>Sign Up / Log In</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Main Discover Tab ────────────────────────────────────────────────────────

export default function DiscoverTab() {
  const { user } = useAuthStore();
  const { theme } = useSettingsStore();
  const isAuthenticated = !!user;

  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : "#F4F6FA";

  const loadFeed = useCallback(async (pageNum: number, refresh = false) => {
    if (isLoading && !refresh) return;
    setIsLoading(true);

    try {
      // TODO: Replace with real API call:
      // const res = await fetch(`/api/feed?page=${pageNum}&limit=15`);
      // const data = await res.json();
      // const items = data.items;
      // setHasMore(data.hasMore);

      // Mock: simulate network delay
      await new Promise((r) => setTimeout(r, 600));
      const items = generateMockItems(pageNum);
      const withAds = injectAds(items);

      if (refresh) {
        setFeedItems(withAds);
      } else {
        setFeedItems((prev) => [...prev, ...withAds]);
      }

      // Mock: stop after page 5
      if (pageNum >= 5) setHasMore(false);
    } catch (err) {
      console.warn("[Discover] feed load error", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isLoading]);

  useEffect(() => {
    loadFeed(1, true);
  }, [loadFeed]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    setPage(1);
    setHasMore(true);
    loadFeed(1, true);
  }, [loadFeed]);

  const onEndReached = useCallback(() => {
    if (!hasMore || isLoading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadFeed(nextPage);
  }, [hasMore, isLoading, page, loadFeed]);

  const handleContentPress = useCallback(() => {
    if (!isAuthenticated) {
      setShowAuthPrompt(true);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // TODO: router.push(`/(main)/article/${item.id}`);
  }, [isAuthenticated]);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => {
      if (item.type === "ad") {
        return <NativeAdCard isDark={isDark} />;
      }
      return (
        <ContentCard
          item={item}
          isDark={isDark}
          isAuthenticated={isAuthenticated}
          onPress={handleContentPress}
        />
      );
    },
    [isDark, isAuthenticated, handleContentPress]
  );

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);

  const ListFooter = () => {
    if (!isLoading || feedItems.length === 0) return <View style={{ height: 80 }} />;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  };

  const ListHeader = () => (
    <View style={[styles.feedHeader]}>
      <Text style={[styles.feedTitle, { color: isDark ? Colors.textWhite : Colors.text }]}>
        Discover
      </Text>
      <Text style={[styles.feedSub, { color: isDark ? Colors.textSecondary : Colors.textTertiary }]}>
        News, tips, and stories for Nigerian drivers
      </Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <FlatList
        data={feedItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
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
        maxToRenderPerBatch={8}
        windowSize={10}
        initialNumToRender={5}
      />

      <AuthPromptOverlay visible={showAuthPrompt} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  feedHeader: {
    paddingTop: 20,
    paddingBottom: 8,
  },
  feedTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 26,
  },
  feedSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    marginTop: 2,
    lineHeight: 20,
  },

  // Content card
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  categoryPill: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  metaText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
  },
  cardImage: {
    width: "100%",
    height: 180,
    backgroundColor: "#E5E5E5",
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 6,
  },
  cardTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    lineHeight: 22,
  },
  cardSummary: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sourceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sourceText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  cardActions: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },

  // Ad card
  adCard: {
    borderStyle: "dashed",
    borderWidth: 1.2,
  },
  adBadge: {
    alignSelf: "flex-start",
    backgroundColor: Colors.goldLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    margin: 12,
    marginBottom: 0,
  },
  adBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 9,
    color: Colors.gold,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  adImagePlaceholder: {
    height: 130,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    margin: 12,
    borderRadius: 12,
  },
  adPlaceholderText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  adCta: {
    backgroundColor: Colors.primary,
    margin: 12,
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  adCtaText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },

  // Footer loader
  footerLoader: {
    paddingVertical: 24,
    alignItems: "center",
  },

  // Auth prompt
  authPromptOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 80,
    paddingHorizontal: 24,
  },
  authPromptCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 28,
    width: "100%",
    alignItems: "center",
    gap: 12,
  },
  authPromptTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  authPromptSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  authPromptBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 8,
    width: "100%",
    alignItems: "center",
  },
  authPromptBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});






















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