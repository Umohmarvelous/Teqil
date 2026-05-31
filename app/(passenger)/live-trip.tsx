import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Dimensions, Pressable, Alert } from "react-native";
import MapView, { Polyline, PROVIDER_GOOGLE, Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from 'expo-local-authentication';

import { useTripStore, useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { startLocationTracking, stopLocationTracking } from "@/src/services/locationTracking";
import { supabase } from "@/src/services/supabase";
import { formatCoins } from "@/src/utils/helpers";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1a2e1f" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f1f13" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8aba95" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c4a32" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a6643" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1f17" }] },
];

export default function LiveTripScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { 
    activeTrip, 
    currentLocation, 
    speed, 
    fare, 
    isTracking, 
    routeCoordinates, 
    tripDistanceKm,
    resetTripState
  } = useTripStore();
  
  const [tripEnded, setTripEnded] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const mapRef = useRef<MapView>(null);

  const fareScale = useSharedValue(1);

  // Authenticate before starting
  useEffect(() => {
    if (!isTracking && !tripEnded) {
      const authenticateAndStart = async () => {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (hasHardware && isEnrolled) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Confirm to start trip',
          });
          if (!result.success) {
            Alert.alert("Authentication Failed", "You must authenticate to start the trip.");
            router.back();
            return;
          }
        }
        startTracking();
      };
      authenticateAndStart();
    }
  }, []);

  // Update map camera to follow user
  useEffect(() => {
    if (currentLocation && mapRef.current && !tripEnded) {
      mapRef.current.animateCamera({
        center: { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
        zoom: 16,
        heading: currentLocation.heading || 0,
      });
    }
  }, [currentLocation, tripEnded]);

  // Bounce fare when it increases
  useEffect(() => {
    if (fare > 0) {
      fareScale.value = withSequence(
        withTiming(1.2, { duration: 150 }),
        withSpring(1, { damping: 10 })
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [fare]);

  const animatedFareStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fareScale.value }],
  }));

  const startTracking = async () => {
    try {
      const tripId = activeTrip?.id || "direct_trip";
      await startLocationTracking(tripId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.warn(e);
      Alert.alert("Tracking Error", "Could not start live tracking.");
    }
  };

  const handleEndTrip = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await stopLocationTracking();
    setTripEnded(true);
  };

  const handleSaveRoute = async () => {
    if (!user || routeCoordinates.length < 2) return;
    setSavingRoute(true);
    try {
      const origin = routeCoordinates[0];
      const dest = routeCoordinates[routeCoordinates.length - 1];
      
      await supabase.from('saved_routes').insert({
        passenger_id: user.id,
        origin_lat: origin.latitude,
        origin_lng: origin.longitude,
        dest_lat: dest.latitude,
        dest_lng: dest.longitude,
        distance_km: tripDistanceKm,
        base_fare: fare,
      });
      
      Alert.alert("Route Saved", "This route has been saved for future quick trips.", [
        { text: "OK", onPress: handleExit }
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert("Error", "Could not save the route.");
    } finally {
      setSavingRoute(false);
    }
  };

  const handleExit = () => {
    resetTripState();
    router.replace('/(main)');
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        customMapStyle={DARK_MAP_STYLE}
        showsUserLocation={false} 
        showsMyLocationButton={false}
        showsCompass={false}
      >
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={Colors.primary}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        )}
        {currentLocation && (
          <Marker
            coordinate={{ latitude: currentLocation.latitude, longitude: currentLocation.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.carMarker}>
              <Ionicons name="car" size={20} color={Colors.surface} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Top Banner: Speed and Status */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textWhite} />
        </Pressable>
        <View style={styles.speedBadge}>
          <Text style={styles.speedText}>{(speed * 3.6).toFixed(0)}</Text>
          <Text style={styles.speedLabel}>km/h</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* Bottom Panel: Fare and Controls */}
      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>DISTANCE</Text>
            <Text style={styles.statValue}>{tripDistanceKm.toFixed(2)} km</Text>
          </View>
          <Animated.View style={[styles.statBox, styles.fareBox, animatedFareStyle]}>
            <Text style={styles.fareLabel}>FARE</Text>
            <Text style={styles.fareValue}>{formatCoins(fare)}</Text>
          </Animated.View>
        </View>

        {!tripEnded ? (
          <Pressable style={styles.endButton} onPress={handleEndTrip}>
            <Text style={styles.endButtonText}>End Trip</Text>
          </Pressable>
        ) : (
          <View style={styles.postTripActions}>
            <Text style={styles.tripEndedText}>Trip Completed</Text>
            <Pressable 
              style={styles.saveRouteBtn} 
              onPress={handleSaveRoute}
              disabled={savingRoute}
            >
              <Ionicons name="bookmark" size={20} color={Colors.textWhite} />
              <Text style={styles.saveRouteText}>{savingRoute ? "Saving..." : "Save This Route"}</Text>
            </Pressable>
            <Pressable style={styles.exitBtn} onPress={handleExit}>
              <Text style={styles.exitBtnText}>Exit</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedBadge: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  speedText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 22,
    color: Colors.text,
  },
  speedLabel: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 24,
    paddingHorizontal: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  fareBox: {
    backgroundColor: 'rgba(0,166,81,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,166,81,0.3)',
  },
  statLabel: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 10,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  statValue: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 20,
    color: Colors.text,
  },
  fareLabel: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 10,
    color: Colors.primary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  fareValue: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 24,
    color: Colors.gold,
  },
  endButton: {
    backgroundColor: Colors.error,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: Colors.error,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  endButtonText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 16,
    color: Colors.textWhite,
  },
  postTripActions: {
    gap: 12,
  },
  tripEndedText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 20,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  saveRouteBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  saveRouteText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
    color: Colors.textWhite,
  },
  exitBtn: {
    backgroundColor: Colors.surfaceSecondary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  exitBtnText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
    color: Colors.text,
  },
  carMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
});
