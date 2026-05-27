import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '@/src/store/useSettingsStore';
import { Colors } from '@/constants/colors';

interface Article {
  id: string;
  title: string;
  summary: string;
  imageUrl: string;
  source: string;
  category: string;
  readTime: number;
  publishedAt: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  News: '#3B82F6',
  Safety: '#EF4444',
  Earnings: '#F5A623',
  Routes: Colors.primary,
  Weather: '#8B5CF6',
};

function formatTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useSettingsStore();
  const isDark = theme === 'dark';
  const bg = isDark ? Colors.background : '#F2F4F7';
  const cardBg = isDark ? Colors.primaryDarker : '#fff';
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;

  const [articles, setArticles] = useState<Article[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchArticles = useCallback(async (pageNum: number, replace = false) => {
    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN || 'localhost:5000';
      const url = `https://${domain}/api/feed?page=${pageNum}&limit=10`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setArticles(prev => replace ? data.items : [...prev, ...data.items]);
      setHasMore(data.hasMore);
      setPage(pageNum);
    } catch (e) {
      console.warn('[Feed] fetch error:', e);
    }
  }, []);

  useEffect(() => {
    fetchArticles(1, true).finally(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchArticles(1, true);
    setRefreshing(false);
  }, [fetchArticles]);

  const onLoadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    await fetchArticles(page + 1, false);
    setLoadingMore(false);
  }, [hasMore, loadingMore, page, fetchArticles]);

  const renderItem = ({ item }: { item: Article }) => (
    <Pressable
      style={[styles.card, { backgroundColor: cardBg }]}
      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
    >
      <Image
        source={{ uri: item.imageUrl }}
        style={styles.image}
        resizeMode="cover"
      />
      <View style={styles.cardBody}>
        <View style={styles.meta}>
          <View style={[styles.tag, { backgroundColor: (CATEGORY_COLORS[item.category] || Colors.primary) + '18' }]}>
            <Text style={[styles.tagText, { color: CATEGORY_COLORS[item.category] || Colors.primary }]}>
              {item.category}
            </Text>
          </View>
          <Text style={[styles.time, { color: subColor }]}>{formatTime(item.publishedAt)}</Text>
        </View>
        <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[styles.summary, { color: subColor }]} numberOfLines={2}>{item.summary}</Text>
        <View style={styles.footer}>
          <Text style={[styles.source, { color: Colors.primary }]}>{item.source}</Text>
          <Text style={[styles.readTime, { color: subColor }]}>{item.readTime} min read</Text>
        </View>
      </View>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={articles}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      style={{ backgroundColor: bg }}
      contentContainerStyle={{ paddingVertical: 12, paddingBottom: insets.bottom + 16 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.primary}
          colors={[Colors.primary]}
        />
      }
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.4}
      ListFooterComponent={
        loadingMore ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: subColor }]}>No articles yet</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 15,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  image: {
    width: '100%',
    height: 190,
    backgroundColor: '#E5E7EB',
  },
  cardBody: {
    padding: 16,
    gap: 6,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  tagText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 11,
  },
  time: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
  },
  title: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 15,
    lineHeight: 21,
  },
  summary: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  source: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
  },
  readTime: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
  },
});
