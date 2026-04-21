import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import SkeletonPlaceholder from 'react-native-skeleton-placeholder';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 16;
const CARD_INNER = SCREEN_WIDTH - CARD_PADDING * 2;

const SkeletonCard = () => (
  <SkeletonPlaceholder borderRadius={4} backgroundColor="#E8E8E8" highlightColor="#F5F5F5">
    <SkeletonPlaceholder.Item
      width={SCREEN_WIDTH - CARD_PADDING * 2}
      marginHorizontal={CARD_PADDING}
      marginBottom={20}
      padding={14}
      borderRadius={16}
    >
      {/* Header row: avatar + name/date */}
      <SkeletonPlaceholder.Item flexDirection="row" alignItems="center">
        <SkeletonPlaceholder.Item width={44} height={44} borderRadius={22} />
        <SkeletonPlaceholder.Item marginLeft={12}>
          <SkeletonPlaceholder.Item width={130} height={13} borderRadius={4} />
          <SkeletonPlaceholder.Item marginTop={7} width={90} height={11} borderRadius={4} />
        </SkeletonPlaceholder.Item>
      </SkeletonPlaceholder.Item>

      {/* Cover image */}
      <SkeletonPlaceholder.Item
        marginTop={14}
        width={CARD_INNER - 28}
        height={190}
        borderRadius={12}
      />

      {/* Title line */}
      <SkeletonPlaceholder.Item marginTop={14} width={CARD_INNER * 0.85} height={14} borderRadius={4} />

      {/* Body lines */}
      <SkeletonPlaceholder.Item marginTop={8} width={CARD_INNER * 0.95} height={12} borderRadius={4} />
      <SkeletonPlaceholder.Item marginTop={6} width={CARD_INNER * 0.7} height={12} borderRadius={4} />

      {/* Action row */}
      <SkeletonPlaceholder.Item flexDirection="row" marginTop={16}>
        <SkeletonPlaceholder.Item width={60} height={28} borderRadius={20} />
        <SkeletonPlaceholder.Item marginLeft={10} width={60} height={28} borderRadius={20} />
        <SkeletonPlaceholder.Item marginLeft={10} width={60} height={28} borderRadius={20} />
      </SkeletonPlaceholder.Item>
    </SkeletonPlaceholder.Item>
  </SkeletonPlaceholder>
);

// Renders N skeleton cards — default 3 covers typical viewport
export const DiscoverSkeleton = ({ count = 3 }: { count?: number }) => (
  <View style={styles.container}>
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: {
    paddingTop: 12,
  },
});