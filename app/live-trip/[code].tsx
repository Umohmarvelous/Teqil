import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  Dimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useAuthStore } from "@/src/store/useStore";
import { useTripStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { TripsStorage, PassengersStorage } from "@/src/services/storage";
import { formatCoins, formatDuration, generateId } from "@/src/utils/helpers";
import type { Trip, Passenger } from "@/src/models/types";
import { useTranslation } from "react-i18next";

const { width } = Dimensions.get("window");

function EarningsCounter({ coins }: { coins: number }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.15, { duration: 150 }),
      withTiming(1, { duration: 150 })
    );
  }, [coins]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[styles.earningsCounter, style]}>
      <Ionicons name="star" size={18} color={Colors.gold} />
      <Text style={styles.earningsText}>{formatCoins(coins)}</Text>
    </Animated.View>
  );
}

export default function LiveTripScreen() {
  const insets = useSafeAreaInsets();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user } = useAuthStore();
  const { activeTrip, setActiveTrip, earningsCoins, incrementEarnings, elapsedSeconds, setElapsedSeconds, resetTripState } = useTripStore();
  const { t } = useTranslation();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [isEnding, setIsEnding] = useState(false);
  const [sosVisible, setSosVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pulseSos = useSharedValue(1);
  const tickerOpacity = useSharedValue(1);

  useEffect(() => {
    pulseSos.value = withRepeat(
      withSequence(withTiming(1.08, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1,
      false
    );
    tickerOpacity.value = withRepeat(
      withSequence(withTiming(0.5, { duration: 1000 }), withTiming(1, { duration: 1000 })),
      -1,
      false
    );
  }, []);

  const sosStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseSos.value }] }));
  const tickerStyle = useAnimatedStyle(() => ({ opacity: tickerOpacity.value }));

  useEffect(() => {
    const init = async () => {
      const found = await TripsStorage.getByCode(code || "");
      if (found) {
        setTrip(found);
        const psgrs = await PassengersStorage.getByTripId(found.id);
        setPassengers(psgrs);
      }
    };
    init();
  }, [code]);

  useEffect(() => {
    if (user?.role === "driver") {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(elapsedSeconds + 1);
        if (elapsedSeconds % 30 === 0 && elapsedSeconds > 0) {
          incrementEarnings(1);
        }
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [elapsedSeconds, user?.role]);

  const handleEndTrip = () => {
    Alert.alert(
      "End Trip?",
      "This will complete the trip for all passengers.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Trip",
          style: "destructive",
          onPress: async () => {
            setIsEnding(true);
            if (trip) {
              await TripsStorage.update(trip.id, { status: "completed", end_time: new Date().toISOString() });
            }
            if (timerRef.current) clearInterval(timerRef.current);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            resetTripState();
            router.replace(user?.role === "driver" ? "/(driver)" : "/(passenger)");
          },
        },
      ]
    );
  };

  const handleSOS = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Alert.alert(
      "SOS Alert",
      "Emergency alert will be sent to all emergency contacts and your park owner.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send SOS",
          style: "destructive",
          onPress: () => {
            console.log("SOS triggered for trip:", code);
            Alert.alert("SOS Sent", "Emergency contacts and park owner have been notified.");
          },
        },
      ]
    );
  };

  const displayTrip = trip || activeTrip;
  const isDriver = user?.role === "driver";
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.mapPlaceholder]}>
        <LinearGradient
          colors={["#1a472a", "#2d6a4f", "#40916c"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.mapTopBar, { paddingTop: topPadding + 8 }]}>
          <Pressable style={styles.backBtnMap} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={Colors.surface} />
          </Pressable>
          <Animated.View style={tickerStyle}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </Animated.View>
          {isDriver && <EarningsCounter coins={earningsCoins} />}
          {!isDriver && <View style={{ width: 80 }} />}
        </View>

        <View style={styles.mapContent}>
          <View style={styles.routeVisualization}>
            <View style={styles.routeNode}>
              <View style={styles.routeNodeDotGreen} />
              <Text style={styles.routeNodeLabel} numberOfLines={1}>
                {displayTrip?.origin || "Origin"}
              </Text>
            </View>
            <View style={styles.routeDotted}>
              {[...Array(8)].map((_, i) => (
                <View key={i} style={styles.routeDotSegment} />
              ))}
            </View>
            <View style={styles.carMarker}>
              <Ionicons name="car-sport" size={28} color={Colors.surface} />
            </View>
            <View style={styles.routeDotted}>
              {[...Array(8)].map((_, i) => (
                <View key={i} style={styles.routeDotSegment} />
              ))}
            </View>
            <View style={styles.routeNode}>
              <View style={styles.routeNodeDotRed} />
              <Text style={styles.routeNodeLabel} numberOfLines={1}>
                {displayTrip?.destination || "Destination"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.bottomPanel}>
        <View style={styles.panelHandle} />

        <View style={styles.tripInfoRow}>
          <View style={styles.tripCodePill}>
            <Text style={styles.tripCodeText}>{code}</Text>
          </View>
          <Text style={styles.tripDuration}>{formatDuration(elapsedSeconds)}</Text>
          <View style={styles.passengerCount}>
            <Ionicons name="people" size={16} color={Colors.primary} />
            <Text style={styles.passengerCountText}>
              {passengers.length} {t("trip.passengersOnboard")}
            </Text>
          </View>
        </View>

        {isDriver && passengers.length > 0 && (
          <View style={styles.passengerList}>
            <Text style={styles.passengerListTitle}>{t("trip.passengers")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {passengers.map((p, idx) => (
                <View key={p.id} style={styles.passengerChip}>
                  <View style={styles.passengerAvatar}>
                    <Text style={styles.passengerAvatarText}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.passengerDest} numberOfLines={1}>
                    {p.destination || "End"}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {isDriver && passengers.length === 0 && (
          <View style={styles.noPassengers}>
            <Ionicons name="person-add-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.noPassengersText}>{t("trip.noPassengers")}</Text>
          </View>
        )}

        <View style={styles.actionRow}>
          <Animated.View style={sosStyle}>
            <Pressable style={styles.sosBtn} onPress={handleSOS}>
              <Text style={styles.sosBtnText}>{t("trip.sos")}</Text>
            </Pressable>
          </Animated.View>

          {isDriver && (
            <Pressable
              style={[styles.endTripBtn, isEnding && styles.endTripBtnLoading]}
              onPress={handleEndTrip}
              disabled={isEnding}
            >
              <Ionicons name="flag" size={20} color={Colors.surface} />
              <Text style={styles.endTripBtnText}>
                {isEnding ? "Ending..." : t("trip.endTrip")}
              </Text>
            </Pressable>
          )}
        </View>

        <View style={{ height: Math.max(insets.bottom, 16) + (Platform.OS === "web" ? 34 : 0) }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a472a" },
  mapPlaceholder: {
    flex: 1,
    position: "relative",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  mapTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    zIndex: 10,
  },
  backBtnMap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error,
  },
  liveText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: Colors.surface,
    letterSpacing: 2,
  },
  earningsCounter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  earningsText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: Colors.gold,
  },
  mapContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  routeVisualization: {
    alignItems: "center",
    gap: 8,
  },
  routeNode: {
    alignItems: "center",
    gap: 6,
  },
  routeNodeDotGreen: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#4ADE80",
    borderWidth: 3,
    borderColor: Colors.surface,
  },
  routeNodeDotRed: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.error,
    borderWidth: 3,
    borderColor: Colors.surface,
  },
  routeNodeLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.surface,
    maxWidth: 140,
    textAlign: "center",
  },
  routeDotted: {
    gap: 4,
    alignItems: "center",
  },
  routeDotSegment: {
    width: 2,
    height: 6,
    backgroundColor: "rgba(255,255,255,0.5)",
    borderRadius: 1,
  },
  carMarker: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  bottomPanel: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  panelHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 18,
  },
  tripInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  tripCodePill: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tripCodeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: Colors.text,
    letterSpacing: 2,
  },
  tripDuration: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.primary,
  },
  passengerCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  passengerCountText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  passengerList: { marginBottom: 16 },
  passengerListTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 10,
  },
  passengerChip: {
    alignItems: "center",
    marginRight: 12,
    gap: 6,
    width: 70,
  },
  passengerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  passengerAvatarText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.primary,
  },
  passengerDest: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  noPassengers: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  noPassengersText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  sosBtn: {
    width: 72,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.error,
  },
  sosBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: Colors.error,
    letterSpacing: 1,
  },
  endTripBtn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.error,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: Colors.error,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  endTripBtnLoading: { opacity: 0.7 },
  endTripBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.surface,
  },
});
