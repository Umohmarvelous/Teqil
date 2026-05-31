import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTripStore } from '@/src/store/useStore';
import { Colors } from '@/constants/colors';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { formatCoins } from '@/src/utils/helpers';

export default function ActiveTripBanner() {
  const { activeTrip, isTracking, fare, tripDistanceKm } = useTripStore();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (isTracking || (activeTrip && activeTrip.status === 'active')) {
      opacity.value = withRepeat(
        withSequence(withTiming(0.3, { duration: 800 }), withTiming(1, { duration: 800 })),
        -1,
        false
      );
    } else {
      opacity.value = 1;
    }
  }, [isTracking, activeTrip]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!activeTrip) return null;

  return (
    <Pressable 
      style={styles.bannerContainer} 
      onPress={() => router.push(`/(passenger)/live-trip`)}
    >
      <View style={styles.leftContent}>
        <View style={styles.liveIndicator}>
          <Animated.View style={[styles.dot, dotStyle]} />
          <Text style={styles.liveText}>LIVE TRIP</Text>
        </View>
        <Text style={styles.distanceText}>{tripDistanceKm.toFixed(2)} km</Text>
      </View>
      <View style={styles.rightContent}>
        <Text style={styles.fareLabel}>Current Fare</Text>
        <Text style={styles.fareAmount}>{formatCoins(fare)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    backgroundColor: Colors.overlayLight,
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingVertical: 25,
    marginBottom: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftContent: {
    gap: 4,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  liveText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: Colors.primary,
    letterSpacing: 1,
  },
  distanceText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
    color: Colors.textWhite,
  },
  rightContent: {
    alignItems: 'flex-end',
  },
  fareLabel: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    color: Colors.textSecondary,
  },
  fareAmount: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 18,
    color: Colors.gold,
  },
});
