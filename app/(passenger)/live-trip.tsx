// import React, { useEffect, useState, useRef } from "react";
// import { View, Text, StyleSheet, Dimensions, Pressable, Alert } from "react-native";
// import MapView, { Polyline, PROVIDER_GOOGLE, Marker } from "react-native-maps";
// import { useSafeAreaInsets } from "react-native-safe-area-context";
// import { router } from "expo-router";
// import { Ionicons } from "@expo/vector-icons";
// import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming } from "react-native-reanimated";
// import * as Haptics from "expo-haptics";
// import * as LocalAuthentication from 'expo-local-authentication';

// import { useTripStore, useAuthStore } from "@/src/store/useStore";
// import { Colors } from "@/constants/colors";
// import { startLocationTracking, stopLocationTracking } from "@/src/services/locationTracking";
// import { supabase } from "@/src/services/supabase";
// import { formatCoins } from "@/src/utils/helpers";

// const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

// const DARK_MAP_STYLE = [
//   { elementType: "geometry", stylers: [{ color: "#1a2e1f" }] },
//   { elementType: "labels.text.stroke", stylers: [{ color: "#0f1f13" }] },
//   { elementType: "labels.text.fill", stylers: [{ color: "#8aba95" }] },
//   { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c4a32" }] },
//   { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a6643" }] },
//   { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1f17" }] },
// ];

// export default function LiveTripScreen() {
//   const insets = useSafeAreaInsets();
//   const { user } = useAuthStore();
//   const { 
//     activeTrip, 
//     currentLocation, 
//     speed, 
//     fare, 
//     isTracking, 
//     routeCoordinates, 
//     tripDistanceKm,
//     resetTripState
//   } = useTripStore();

//   const [tripEnded, setTripEnded] = useState(false);
//   const [savingRoute, setSavingRoute] = useState(false);
//   const mapRef = useRef<MapView>(null);

//   const fareScale = useSharedValue(1);

//   // Authenticate before starting
//   useEffect(() => {
//     if (!isTracking && !tripEnded) {
//       const authenticateAndStart = async () => {
//         const hasHardware = await LocalAuthentication.hasHardwareAsync();
//         const isEnrolled = await LocalAuthentication.isEnrolledAsync();
//         if (hasHardware && isEnrolled) {
//           const result = await LocalAuthentication.authenticateAsync({
//             promptMessage: 'Confirm to start trip',
//           });
//           if (!result.success) {
//             Alert.alert("Authentication Failed", "You must authenticate to start the trip.");
//             router.back();
//             return;
//           }
//         }
//         startTracking();
//       };
//       authenticateAndStart();
//     }
//   }, []);

//   // Update map camera to follow user
//   useEffect(() => {
//     if (currentLocation && mapRef.current && !tripEnded) {
//       mapRef.current.animateCamera({
//         center: { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
//         zoom: 16,
//         heading: currentLocation.heading || 0,
//       });
//     }
//   }, [currentLocation, tripEnded]);

//   // Bounce fare when it increases
//   useEffect(() => {
//     if (fare > 0) {
//       fareScale.value = withSequence(
//         withTiming(1.2, { duration: 150 }),
//         withSpring(1, { damping: 10 })
//       );
//       Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
//     }
//   }, [fare]);

//   const animatedFareStyle = useAnimatedStyle(() => ({
//     transform: [{ scale: fareScale.value }],
//   }));

//   const startTracking = async () => {
//     try {
//       const tripId = activeTrip?.id || "direct_trip";
//       await startLocationTracking(tripId);
//       Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
//     } catch (e) {
//       console.warn(e);
//       Alert.alert("Tracking Error", "Could not start live tracking.");
//     }
//   };

//   const handleEndTrip = async () => {
//     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
//     await stopLocationTracking();
//     setTripEnded(true);
//   };

//   const handleSaveRoute = async () => {
//     if (!user || routeCoordinates.length < 2) return;
//     setSavingRoute(true);
//     try {
//       const origin = routeCoordinates[0];
//       const dest = routeCoordinates[routeCoordinates.length - 1];

//       await supabase.from('saved_routes').insert({
//         passenger_id: user.id,
//         origin_lat: origin.latitude,
//         origin_lng: origin.longitude,
//         dest_lat: dest.latitude,
//         dest_lng: dest.longitude,
//         distance_km: tripDistanceKm,
//         base_fare: fare,
//       });

//       Alert.alert("Route Saved", "This route has been saved for future quick trips.", [
//         { text: "OK", onPress: handleExit }
//       ]);
//       Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
//     } catch (err) {
//       Alert.alert("Error", "Could not save the route.");
//     } finally {
//       setSavingRoute(false);
//     }
//   };

//   const handleExit = () => {
//     resetTripState();
//     router.replace('/(main)');
//   };

//   return (
//     <View style={styles.container}>
//       <MapView
//         ref={mapRef}
//         style={StyleSheet.absoluteFillObject}
//         provider={PROVIDER_GOOGLE}
//         customMapStyle={DARK_MAP_STYLE}
//         showsUserLocation={false} 
//         showsMyLocationButton={false}
//         showsCompass={false}
//       >
//         {routeCoordinates.length > 0 && (
//           <Polyline
//             coordinates={routeCoordinates}
//             strokeColor={Colors.primary}
//             strokeWidth={5}
//             lineCap="round"
//             lineJoin="round"
//           />
//         )}
//         {currentLocation && (
//           <Marker
//             coordinate={{ latitude: currentLocation.latitude, longitude: currentLocation.longitude }}
//             anchor={{ x: 0.5, y: 0.5 }}
//           >
//             <View style={styles.carMarker}>
//               <Ionicons name="car" size={20} color={Colors.surface} />
//             </View>
//           </Marker>
//         )}
//       </MapView>

//       {/* Top Banner: Speed and Status */}
//       <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
//         <Pressable onPress={() => router.back()} style={styles.backBtn}>
//           <Ionicons name="chevron-back" size={24} color={Colors.textWhite} />
//         </Pressable>
//         <View style={styles.speedBadge}>
//           <Text style={styles.speedText}>{(speed * 3.6).toFixed(0)}</Text>
//           <Text style={styles.speedLabel}>km/h</Text>
//         </View>
//         <View style={styles.backBtn} />
//       </View>

//       {/* Bottom Panel: Fare and Controls */}
//       <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 20 }]}>
//         <View style={styles.statsRow}>
//           <View style={styles.statBox}>
//             <Text style={styles.statLabel}>DISTANCE</Text>
//             <Text style={styles.statValue}>{tripDistanceKm.toFixed(2)} km</Text>
//           </View>
//           <Animated.View style={[styles.statBox, styles.fareBox, animatedFareStyle]}>
//             <Text style={styles.fareLabel}>FARE</Text>
//             <Text style={styles.fareValue}>{formatCoins(fare)}</Text>
//           </Animated.View>
//         </View>

//         {!tripEnded ? (
//           <Pressable style={styles.endButton} onPress={handleEndTrip}>
//             <Text style={styles.endButtonText}>End Trip</Text>
//           </Pressable>
//         ) : (
//           <View style={styles.postTripActions}>
//             <Text style={styles.tripEndedText}>Trip Completed</Text>
//             <Pressable 
//               style={styles.saveRouteBtn} 
//               onPress={handleSaveRoute}
//               disabled={savingRoute}
//             >
//               <Ionicons name="bookmark" size={20} color={Colors.textWhite} />
//               <Text style={styles.saveRouteText}>{savingRoute ? "Saving..." : "Save This Route"}</Text>
//             </Pressable>
//             <Pressable style={styles.exitBtn} onPress={handleExit}>
//               <Text style={styles.exitBtnText}>Exit</Text>
//             </Pressable>
//           </View>
//         )}
//       </View>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: Colors.background,
//   },
//   topBar: {
//     position: 'absolute',
//     top: 0,
//     width: '100%',
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     paddingHorizontal: 20,
//     zIndex: 10,
//   },
//   backBtn: {
//     width: 44,
//     height: 44,
//     backgroundColor: 'rgba(0,0,0,0.5)',
//     borderRadius: 22,
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   speedBadge: {
//     backgroundColor: Colors.surface,
//     paddingHorizontal: 20,
//     paddingVertical: 10,
//     borderRadius: 24,
//     flexDirection: 'row',
//     alignItems: 'baseline',
//     gap: 4,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 4 },
//     shadowOpacity: 0.3,
//     shadowRadius: 10,
//   },
//   speedText: {
//     fontFamily: 'Poppins_700Bold',
//     fontSize: 22,
//     color: Colors.text,
//   },
//   speedLabel: {
//     fontFamily: 'Poppins_500Medium',
//     fontSize: 12,
//     color: Colors.textSecondary,
//   },
//   bottomPanel: {
//     position: 'absolute',
//     bottom: 0,
//     width: '100%',
//     backgroundColor: Colors.surface,
//     borderTopLeftRadius: 30,
//     borderTopRightRadius: 30,
//     paddingTop: 24,
//     paddingHorizontal: 24,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: -10 },
//     shadowOpacity: 0.1,
//     shadowRadius: 20,
//   },
//   statsRow: {
//     flexDirection: 'row',
//     gap: 16,
//     marginBottom: 24,
//   },
//   statBox: {
//     flex: 1,
//     backgroundColor: Colors.surfaceSecondary,
//     borderRadius: 16,
//     padding: 16,
//     alignItems: 'center',
//   },
//   fareBox: {
//     backgroundColor: 'rgba(0,166,81,0.1)',
//     borderWidth: 1,
//     borderColor: 'rgba(0,166,81,0.3)',
//   },
//   statLabel: {
//     fontFamily: 'Poppins_600SemiBold',
//     fontSize: 10,
//     color: Colors.textSecondary,
//     letterSpacing: 1,
//     marginBottom: 4,
//   },
//   statValue: {
//     fontFamily: 'Poppins_700Bold',
//     fontSize: 20,
//     color: Colors.text,
//   },
//   fareLabel: {
//     fontFamily: 'Poppins_600SemiBold',
//     fontSize: 10,
//     color: Colors.primary,
//     letterSpacing: 1,
//     marginBottom: 4,
//   },
//   fareValue: {
//     fontFamily: 'Poppins_700Bold',
//     fontSize: 24,
//     color: Colors.gold,
//   },
//   endButton: {
//     backgroundColor: Colors.error,
//     paddingVertical: 18,
//     borderRadius: 16,
//     alignItems: 'center',
//     shadowColor: Colors.error,
//     shadowOffset: { width: 0, height: 4 },
//     shadowOpacity: 0.4,
//     shadowRadius: 8,
//   },
//   endButtonText: {
//     fontFamily: 'Poppins_700Bold',
//     fontSize: 16,
//     color: Colors.textWhite,
//   },
//   postTripActions: {
//     gap: 12,
//   },
//   tripEndedText: {
//     fontFamily: 'Poppins_700Bold',
//     fontSize: 20,
//     color: Colors.text,
//     textAlign: 'center',
//     marginBottom: 8,
//   },
//   saveRouteBtn: {
//     backgroundColor: Colors.primary,
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'center',
//     gap: 8,
//     paddingVertical: 16,
//     borderRadius: 16,
//   },
//   saveRouteText: {
//     fontFamily: 'Poppins_600SemiBold',
//     fontSize: 16,
//     color: Colors.textWhite,
//   },
//   exitBtn: {
//     backgroundColor: Colors.surfaceSecondary,
//     paddingVertical: 16,
//     borderRadius: 16,
//     alignItems: 'center',
//   },
//   exitBtnText: {
//     fontFamily: 'Poppins_600SemiBold',
//     fontSize: 16,
//     color: Colors.text,
//   },
//   carMarker: {
//     width: 32,
//     height: 32,
//     borderRadius: 16,
//     backgroundColor: Colors.primary,
//     alignItems: 'center',
//     justifyContent: 'center',
//     borderWidth: 3,
//     borderColor: 'rgba(255,255,255,0.8)',
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 4 },
//     shadowOpacity: 0.3,
//     shadowRadius: 5,
//   },
// });



























// app/(passenger)/live-trip.tsx  (FULL REPLACEMENT)
//
// Premium live trip screen with:
//  - Immersive dark map with smooth camera follow + heading rotation
//  - Animated fare counter (slot-machine digit roll on each increment)
//  - Speed badge with colour ramp (green → amber → red)
//  - Save-route sheet with spring dismiss animation
//  - Biometric confirm before tracking starts

import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Animated,
  Easing,
  Platform,
  StatusBar,
} from "react-native";
import MapView, {
  Polyline,
  PROVIDER_GOOGLE,
  Marker,
} from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";

import { useTripStore, useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useSavedRoutes } from "@/src/hooks/useSavedRoutes";
import {
  startLocationTracking,
  stopLocationTracking,
} from "@/src/services/locationTracking";
import { Colors } from "@/constants/colors";
import { formatCoins } from "@/src/utils/helpers";

// ─── Map style ────────────────────────────────────────────────────────────────

const MAP_STYLE = [
  { elementType: "geometry",            stylers: [{ color: "#0f1b14" }] },
  { elementType: "labels.text.stroke",  stylers: [{ color: "#0a1210" }] },
  { elementType: "labels.text.fill",    stylers: [{ color: "#6aad7a" }] },
  { featureType: "road",
    elementType: "geometry",            stylers: [{ color: "#1d3827" }] },
  { featureType: "road.highway",
    elementType: "geometry",            stylers: [{ color: "#274d36" }] },
  { featureType: "road.highway",
    elementType: "geometry.stroke",     stylers: [{ color: "#1a3328" }] },
  { featureType: "water",
    elementType: "geometry",            stylers: [{ color: "#0a1610" }] },
  { featureType: "poi",
    elementType: "geometry",            stylers: [{ color: "#152219" }] },
  { featureType: "poi.park",
    elementType: "geometry.fill",       stylers: [{ color: "#152b1e" }] },
  { featureType: "transit",
    elementType: "geometry",            stylers: [{ color: "#12201a" }] },
  { featureType: "administrative",
    elementType: "geometry.stroke",     stylers: [{ color: "#1f3d2c" }] },
];

// ─── Animated coin counter ────────────────────────────────────────────────────
// Each digit slot rolls up independently when the value increases.

function AnimatedCoinCounter({ coins }: { coins: number }) {
  const displayedRef = useRef(coins);
  const bounceAnim   = useRef(new Animated.Value(1)).current;
  const glowAnim     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (coins === displayedRef.current) return;
    displayedRef.current = coins;

    // Scale bounce
    Animated.sequence([
      Animated.spring(bounceAnim, {
        toValue:    1.18,
        damping:    8,
        stiffness:  300,
        useNativeDriver: true,
      }),
      Animated.spring(bounceAnim, {
        toValue:    1,
        damping:    12,
        stiffness:  200,
        useNativeDriver: true,
      }),
    ]).start();

    // Glow flash
    Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 120, useNativeDriver: false }),
      Animated.timing(glowAnim, { toValue: 0, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]).start();
  }, [coins]);

  const glowColor = glowAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ["rgba(0,166,81,0)", "rgba(0,220,110,0.35)"],
  });

  return (
    <View style={counterStyles.wrap}>
      <Text style={counterStyles.label}>FARE</Text>
      <Animated.View style={[
        counterStyles.glow,
        { backgroundColor: glowColor },
      ]} />
      <Animated.Text style={[
        counterStyles.value,
        { transform: [{ scale: bounceAnim }] },
      ]}>
        {formatCoins(Math.round(coins))}
      </Animated.Text>
      <Text style={counterStyles.unit}>coins</Text>
    </View>
  );
}

const counterStyles = StyleSheet.create({
  wrap:  { alignItems: "center", position: "relative" },
  label: {
    fontFamily:    "Poppins_600SemiBold",
    fontSize:      10,
    color:         Colors.primary,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    marginBottom:  4,
  },
  glow:  {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
  },
  value: {
    fontFamily:    "Poppins_700Bold",
    fontSize:      38,
    color:         Colors.gold,
    letterSpacing: -1,
    lineHeight:    42,
  },
  unit:  {
    fontFamily: "Poppins_500Medium",
    fontSize:   11,
    color:      Colors.gold,
    opacity:    0.7,
    marginTop:  2,
  },
});

// ─── Speed badge ──────────────────────────────────────────────────────────────

function SpeedBadge({ speedMs }: { speedMs: number }) {
  const kmh = Math.round(speedMs * 3.6);

  // Colour ramp: ≤40 → green, 41–70 → amber, >70 → red
  const colour =
    kmh <= 40  ? "#00D46A" :
    kmh <= 70  ? "#F59E0B" :
    "#EF4444";

  return (
    <View style={speedStyles.badge}>
      <Text style={[speedStyles.value, { color: colour }]}>{kmh}</Text>
      <Text style={speedStyles.unit}>km/h</Text>
    </View>
  );
}

const speedStyles = StyleSheet.create({
  badge: {
    alignItems:      "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius:    18,
    paddingHorizontal:16,
    paddingVertical:  8,
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.12)",
  },
  value: { fontFamily: "Poppins_700Bold", fontSize: 22, lineHeight: 26 },
  unit:  { fontFamily: "Poppins_500Medium", fontSize: 10, color: "rgba(255,255,255,0.55)" },
});

// ─── Save route bottom sheet ──────────────────────────────────────────────────

function SaveRouteSheet({
  visible,
  onSave,
  onDismiss,
  saving,
  originLabel,
  destLabel,
  distanceKm,
  fare,
}: {
  visible:     boolean;
  onSave:      () => void;
  onDismiss:   () => void;
  saving:      boolean;
  originLabel?: string;
  destLabel?:   string;
  distanceKm:   number;
  fare:         number;
}) {
  const slideY  = useRef(new Animated.Value(300)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, damping: 22, stiffness: 160, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY,  { toValue: 300, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,   duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[sheetStyles.backdrop, { opacity }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      <Animated.View style={[sheetStyles.sheet, { transform: [{ translateY: slideY }] }]}>
        <View style={sheetStyles.handle} />
        <View style={sheetStyles.iconRow}>
          <View style={sheetStyles.iconCircle}>
            <Ionicons name="bookmark" size={24} color={Colors.primary} />
          </View>
        </View>
        <Text style={sheetStyles.title}>Save this route?</Text>
        <Text style={sheetStyles.sub}>
          You can repeat it quickly next time without re-entering the details.
        </Text>

        <View style={sheetStyles.routePreview}>
          <View style={sheetStyles.routeRow}>
            <View style={sheetStyles.dotGreen} />
            <Text style={sheetStyles.routeLabel} numberOfLines={1}>
              {originLabel || "Current location"}
            </Text>
          </View>
          <View style={sheetStyles.routeConnector} />
          <View style={sheetStyles.routeRow}>
            <View style={sheetStyles.dotRed} />
            <Text style={sheetStyles.routeLabel} numberOfLines={1}>
              {destLabel || "Destination"}
            </Text>
          </View>

          <View style={sheetStyles.stats}>
            <Text style={sheetStyles.stat}>📏 {distanceKm.toFixed(2)} km</Text>
            <Text style={sheetStyles.stat}>🪙 {Math.round(fare)} coins</Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            sheetStyles.saveBtn,
            pressed && { opacity: 0.85 },
            saving && { opacity: 0.65 },
          ]}
          onPress={onSave}
          disabled={saving}
        >
          <Ionicons name="bookmark" size={18} color="#fff" />
          <Text style={sheetStyles.saveBtnText}>
            {saving ? "Saving…" : "Save Route"}
          </Text>
        </Pressable>

        <Pressable style={sheetStyles.skipBtn} onPress={onDismiss}>
          <Text style={sheetStyles.skipBtnText}>Skip</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent:  "flex-end",
    zIndex:          20,
  },
  sheet: {
    backgroundColor:    Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius:28,
    padding:            28,
    paddingBottom:      44,
    alignItems:         "center",
    gap:                12,
  },
  handle: {
    width:           36,
    height:          4,
    borderRadius:    2,
    backgroundColor: Colors.border,
    marginBottom:    4,
  },
  iconRow:    { alignItems: "center" },
  iconCircle: {
    width:           56,
    height:          56,
    borderRadius:    16,
    backgroundColor: Colors.primaryLight,
    alignItems:      "center",
    justifyContent:  "center",
  },
  title: { fontFamily: "Poppins_700Bold",    fontSize: 20, color: Colors.text, textAlign: "center" },
  sub:   { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },

  routePreview: {
    width:           "100%",
    backgroundColor: Colors.border,
    borderRadius:    16,
    padding:         16,
    gap:             6,
    marginVertical:  4,
  },
  routeRow:      { flexDirection: "row", alignItems: "center", gap: 10 },
  dotGreen:      { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary, flexShrink: 0 },
  dotRed:        { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.error,   flexShrink: 0 },
  routeConnector:{ width: 2, height: 14, backgroundColor: Colors.borderLight, marginLeft: 4 },
  routeLabel:    { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text, flex: 1 },
  stats:         { flexDirection: "row", gap: 20, marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  stat:          { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },

  saveBtn: {
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "center",
    gap:             8,
    backgroundColor: Colors.primary,
    borderRadius:    16,
    height:          54,
    width:           "100%",
    shadowColor:     Colors.primary,
    shadowOffset:    { width: 0, height: 6 },
    shadowOpacity:   0.35,
    shadowRadius:    12,
    elevation:       8,
  },
  saveBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: "#fff" },
  skipBtn:     { paddingVertical: 8 },
  skipBtnText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, textDecorationLine: "underline" },
});

// ─── Car marker ───────────────────────────────────────────────────────────────

function CarMarker({ heading }: { heading: number }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 800, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={markerStyles.wrap}>
      {/* Pulse ring */}
      <Animated.View style={[
        markerStyles.pulse,
        { transform: [{ scale: pulseAnim }] },
      ]} />
      {/* Car icon */}
      <View style={[markerStyles.dot, { transform: [{ rotate: `${heading}deg` }] }]}>
        <Ionicons name="navigate" size={18} color="#fff" />
      </View>
    </View>
  );
}

const markerStyles = StyleSheet.create({
  wrap:  { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  pulse: {
    position:        "absolute",
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: "rgba(0,166,81,0.25)",
  },
  dot: {
    width:           34,
    height:          34,
    borderRadius:    17,
    backgroundColor: Colors.primary,
    alignItems:      "center",
    justifyContent:  "center",
    borderWidth:     3,
    borderColor:     "rgba(255,255,255,0.9)",
    shadowColor:     Colors.primary,
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.5,
    shadowRadius:    8,
    elevation:       8,
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LiveTripScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { theme } = useSettingsStore();

  const {
    activeTrip,
    currentLocation,
    speed,
    fare,
    isTracking,
    routeCoordinates,
    tripDistanceKm,
    resetTripState,
  } = useTripStore();

  const { saveRoute, saving } = useSavedRoutes();

  const [tripEnded,        setTripEnded]        = useState(false);
  const [saveSheetVisible, setSaveSheetVisible] = useState(false);
  const [routeSaved,       setRouteSaved]       = useState(false);

  const mapRef      = useRef<MapView>(null);
  const panelSlideY = useRef(new Animated.Value(200)).current;

  // Slide bottom panel up on mount
  useEffect(() => {
    Animated.spring(panelSlideY, {
      toValue:  0,
      damping:  22,
      stiffness:160,
      useNativeDriver: true,
    }).start();
  }, []);

  // Auth + start tracking
  useEffect(() => {
    if (isTracking || tripEnded) return;

    const boot = async () => {
      const hasHW = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (hasHW && isEnrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage:        "Confirm to start trip tracking",
          fallbackLabel:        "Use passcode",
          disableDeviceFallback: false,
        });
        if (!result.success) {
          Alert.alert("Authentication required", "Biometric confirm is needed to start tracking.");
          router.back();
          return;
        }
      }

      try {
        await startLocationTracking(activeTrip?.id || "live_trip");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {
        Alert.alert("Tracking Error", "Could not start location tracking.");
      }
    };

    boot();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow camera
  useEffect(() => {
    if (!currentLocation || tripEnded) return;
    mapRef.current?.animateCamera({
      center:  { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
      zoom:    17,
      heading: currentLocation.heading || 0,
      pitch:   45,
    }, { duration: 800 });
  }, [currentLocation, tripEnded]);

  const handleEndTrip = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await stopLocationTracking();
    setTripEnded(true);
    // Only offer save if there's a real route
    if (routeCoordinates.length >= 2) {
      setTimeout(() => setSaveSheetVisible(true), 600);
    }
  }, [routeCoordinates.length]);

  const handleSaveRoute = useCallback(async () => {
    if (!currentLocation || routeCoordinates.length < 2) return;

    const origin = routeCoordinates[0];
    const dest   = routeCoordinates[routeCoordinates.length - 1];

    const saved = await saveRoute({
      origin_lat:   origin.latitude,
      origin_lng:   origin.longitude,
      origin_label: activeTrip?.origin,
      dest_lat:     dest.latitude,
      dest_lng:     dest.longitude,
      dest_label:   activeTrip?.destination,
      distance_km:  tripDistanceKm,
      base_fare:    fare,
    });

    if (saved) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRouteSaved(true);
      setSaveSheetVisible(false);
    } else {
      Alert.alert("Couldn't save", "Please try again.");
    }
  }, [currentLocation, routeCoordinates, activeTrip, tripDistanceKm, fare, saveRoute]);

  const handleExit = useCallback(() => {
    resetTripState();
    router.replace("/(main)");
  }, [resetTripState]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Map ── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        customMapStyle={MAP_STYLE}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsTraffic={false}
        rotateEnabled={false}
        zoomControlEnabled={false}
      >
        {routeCoordinates.length > 1 && (
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
            coordinate={{
              latitude:  currentLocation.latitude,
              longitude: currentLocation.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
          >
            <CarMarker heading={currentLocation.heading || 0} />
          </Marker>
        )}
      </MapView>

      {/* ── Top bar: back + speed ── */}
      <View style={[styles.topBar, { paddingTop: (Platform.OS === "web" ? 20 : insets.top) + 10 }]}>
        <Pressable style={styles.topBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>

        <SpeedBadge speedMs={speed} />

        <View style={[styles.topBtn, { backgroundColor: "transparent" }]} />
      </View>

      {/* ── Distance pill (top-right) ── */}
      {tripDistanceKm > 0 && (
        <View style={[styles.distancePill, { top: (Platform.OS === "web" ? 20 : insets.top) + 68 }]}>
          <Ionicons name="navigate-circle" size={13} color={Colors.primary} />
          <Text style={styles.distancePillText}>{tripDistanceKm.toFixed(2)} km</Text>
        </View>
      )}

      {/* ── Bottom panel ── */}
      <Animated.View
        style={[
          styles.panel,
          { paddingBottom: Math.max(insets.bottom, 20) + 16 },
          { transform: [{ translateY: panelSlideY }] },
        ]}
      >
        {Platform.OS === "ios" && (
          <BlurView
            intensity={80}
            tint={theme === "dark" ? "dark" : "light"}
            style={StyleSheet.absoluteFillObject}
          />
        )}

        {/* Fare counter — centrepiece */}
        <AnimatedCoinCounter coins={fare} />

        {/* Separator */}
        <View style={styles.panelDivider} />

        {/* Action button */}
        {!tripEnded ? (
          <Pressable
            style={({ pressed }) => [styles.endBtn, pressed && { opacity: 0.85 }]}
            onPress={handleEndTrip}
          >
            <Ionicons name="stop-circle" size={20} color="#fff" />
            <Text style={styles.endBtnText}>End Trip</Text>
          </Pressable>
        ) : (
          <View style={styles.postTrip}>
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
              <Text style={styles.completedText}>Trip completed</Text>
            </View>

            {!routeSaved ? (
              <Pressable
                style={({ pressed }) => [styles.saveRouteBtn, pressed && { opacity: 0.8 }]}
                onPress={() => setSaveSheetVisible(true)}
              >
                <Ionicons name="bookmark-outline" size={16} color={Colors.primary} />
                <Text style={styles.saveRouteBtnText}>Save this route</Text>
              </Pressable>
            ) : (
              <View style={styles.savedIndicator}>
                <Ionicons name="bookmark" size={15} color={Colors.primary} />
                <Text style={styles.savedIndicatorText}>Route saved</Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [styles.exitBtn, pressed && { opacity: 0.8 }]}
              onPress={handleExit}
            >
              <Text style={styles.exitBtnText}>Back to Home</Text>
            </Pressable>
          </View>
        )}
      </Animated.View>

      {/* ── Save-route sheet ── */}
      <SaveRouteSheet
        visible={saveSheetVisible}
        onSave={handleSaveRoute}
        onDismiss={() => setSaveSheetVisible(false)}
        saving={saving}
        originLabel={activeTrip?.origin}
        destLabel={activeTrip?.destination}
        distanceKm={tripDistanceKm}
        fare={fare}
      />
    </View>
  );
}

const PANEL_RADIUS = 30;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a1210" },

  topBar: {
    position:        "absolute",
    top:             0,
    left:            0,
    right:           0,
    flexDirection:   "row",
    justifyContent:  "space-between",
    alignItems:      "center",
    paddingHorizontal:16,
    zIndex:          10,
  },
  topBtn: {
    width:           40,
    height:          40,
    borderRadius:    12,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems:      "center",
    justifyContent:  "center",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.1)",
  },

  distancePill: {
    position:        "absolute",
    right:           16,
    flexDirection:   "row",
    alignItems:      "center",
    gap:             5,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal:12,
    paddingVertical:   6,
    borderRadius:    20,
    borderWidth:     1,
    borderColor:     "rgba(0,166,81,0.3)",
    zIndex:          10,
  },
  distancePillText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize:   12,
    color:      Colors.primary,
  },

  panel: {
    position:            "absolute",
    bottom:              0,
    left:                0,
    right:               0,
    borderTopLeftRadius:  PANEL_RADIUS,
    borderTopRightRadius: PANEL_RADIUS,
    backgroundColor:     Platform.OS === "ios" ? "rgba(15,27,20,0.82)" : "rgba(15,27,20,0.96)",
    paddingTop:          28,
    paddingHorizontal:   28,
    gap:                 20,
    overflow:            "hidden",
    borderTopWidth:      1,
    borderTopColor:      "rgba(0,166,81,0.25)",
    shadowColor:         "#000",
    shadowOffset:        { width: 0, height: -12 },
    shadowOpacity:       0.4,
    shadowRadius:        20,
    elevation:           20,
  },

  panelDivider: {
    height:          1,
    backgroundColor: "rgba(255,255,255,0.07)",
  },

  endBtn: {
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "center",
    gap:             8,
    backgroundColor: Colors.error,
    borderRadius:    16,
    height:          56,
    shadowColor:     Colors.error,
    shadowOffset:    { width: 0, height: 6 },
    shadowOpacity:   0.45,
    shadowRadius:    12,
    elevation:       8,
  },
  endBtnText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#fff" },

  postTrip: { gap: 12 },

  completedBadge: {
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "center",
    gap:             7,
    backgroundColor: "rgba(0,166,81,0.12)",
    borderRadius:    12,
    paddingVertical:  10,
    borderWidth:     1,
    borderColor:     "rgba(0,166,81,0.3)",
  },
  completedText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.primary },

  saveRouteBtn: {
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "center",
    gap:             7,
    backgroundColor: "transparent",
    borderRadius:    14,
    paddingVertical:  12,
    borderWidth:     1.5,
    borderColor:     Colors.primary,
  },
  saveRouteBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.primary },

  savedIndicator: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            6,
    paddingVertical:10,
  },
  savedIndicatorText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.primary },

  exitBtn: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius:    14,
    height:          50,
    alignItems:      "center",
    justifyContent:  "center",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.1)",
  },
  exitBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "rgba(255,255,255,0.8)" },
});