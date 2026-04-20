import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '@/src/store/useSettingsStore';
import { Colors } from '@/constants/colors';
import SkeletonPlaceholder from 'react-native-skeleton-placeholder';

// const { width } = Dimensions.get('window');

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useSettingsStore();
  const isDark = theme === 'dark';
  const bg = isDark ? Colors.background : '#F5F5F5';
  const cardBg = isDark ? Colors.primaryDarker : '#fff';
  // const highlightColor = isDark ? '#2A2A2A' : '#E1E9EE';

  // Skeleton items for feed
  const renderSkeletonItem = (key: number):any => (
    <View key={key} style={[styles.card, { backgroundColor: cardBg }]}>
      <SkeletonPlaceholder
        borderRadius={4}
        backgroundColor={isDark ? '#3A3A3A' : '#E1E9EE'}
        // highlightColor={highlightColor}
      >
        <View style={styles.skeletonHeader}>
          <View style={styles.avatar} />
          <View style={styles.headerText}>
            <View style={styles.title} />
            <View style={styles.subtitle} />
          </View>
        </View>
        <View style={styles.imagePlaceholder} />
        <View style={styles.contentLines}>
          <View style={styles.line} />
          <View style={[styles.line, { width: '80%' }]} />
        </View>
      </SkeletonPlaceholder>
    </View>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: bg }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: 12 }}>
        {[1, 2, 3, 4].map((i) => renderSkeletonItem(i))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    padding: 16,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    width: 120,
    height: 14,
    borderRadius: 7,
    marginBottom: 6,
  },
  subtitle: {
    width: 80,
    height: 12,
    borderRadius: 6,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
  },
  contentLines: {
    marginTop: 8,
  },
  line: {
    width: '100%',
    height: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
});