import React, { useEffect } from 'react';
import { View, StyleSheet, DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';

interface ShimmerProps {
  width: DimensionValue;
  height: number | string;
  borderRadius?: number;
  style?: any;
  isDark?: boolean;
}

export const Shimmer = ({ width, height, borderRadius = 8, style, isDark = false }: ShimmerProps) => {
  const translateX = useSharedValue(-300);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(300, { duration: 1200, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const baseColor = isDark ? Colors.primaryDarker : '#ffffff';
  const shimmerColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)';

  return (
    <View style={[{ width, height, borderRadius, overflow: 'hidden', backgroundColor: baseColor }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle]}>
        <LinearGradient
          colors={['transparent', shimmerColor, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: 200, height: '100%' }}
        />
      </Animated.View>
    </View>
  );
};

export const FeedCardSkeleton = ({ isDark }: { isDark: boolean }) => {
  return (
    <View style={[styles.card]}>
      <View style={styles.header}>
        <Shimmer width={46} height={46} borderRadius={58} isDark={isDark} />
        <View style={styles.headerText}>
          <Shimmer width={60} height={10} borderRadius={5}  isDark={isDark} />
          <Shimmer width={100} height={12} borderRadius={6} style={{ marginTop: 6 }} isDark={isDark} />
        </View>
      </View>
      <Shimmer width="100%" height={300} borderRadius={22} isDark={isDark} />
      <View style={styles.actions}>
        <View style={styles.actionLeft}>
          <Shimmer width={24} height={24} borderRadius={6} isDark={isDark} />
          <Shimmer width={24} height={24} borderRadius={6} isDark={isDark} />
          <Shimmer width={24} height={24} borderRadius={6} isDark={isDark} />
        </View>
        <Shimmer width={24} height={24} borderRadius={6} isDark={isDark} />
      </View>
      <View style={{ paddingHorizontal: 5, marginTop: 8 }}>
        <Shimmer width={80} height={12} borderRadius={6} isDark={isDark} />
      </View>
      <View style={{ paddingHorizontal: 5, marginTop: 6 }}>
        <Shimmer width="90%" height={12} borderRadius={6} isDark={isDark} />
        <Shimmer width="70%" height={12} borderRadius={6} style={{ marginTop: 6 }} isDark={isDark} />
      </View>
    </View>
  );
};

export const FeedSkeletonList = ({ count = 3, isDark }: { count?: number; isDark: boolean }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <FeedCardSkeleton key={`skeleton-${i}`} isDark={isDark} />
    ))}
  </>
);

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    paddingBottom: 8,
    borderRadius: 20,
    marginHorizontal: 30
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  headerText: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    paddingTop: 10,
  },
  actionLeft: {
    flexDirection: 'row',
    gap: 16,
  },
});