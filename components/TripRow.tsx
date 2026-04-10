// components/TripRow.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FB } from "@/constants/fbPalette";
import { formatDate } from "@/src/utils/helpers";
import type { Trip } from "@/src/models/types";

interface TripRowProps {
  trip: Trip;
}

export default function TripRow({ trip }: TripRowProps) {
  const status = trip.status || "active";
  const isCompleted = status === "completed";

  return (
    <View style={styles.tripRow}>
      <View style={[styles.tripIconBox, { backgroundColor: FB.green + "15" }]}>
        <Ionicons name="navigate-circle-outline" size={20} color={FB.green} />
      </View>
      <View style={styles.tripInfo}>
        <Text style={styles.tripRoute} numberOfLines={1}>
          {trip.origin} → {trip.destination}
        </Text>
        <Text style={styles.tripDate}>{formatDate(trip.created_at)}</Text>
      </View>
      <View style={[styles.tripStatusPill, isCompleted ? styles.pillDone : styles.pillActive]}>
        <Text style={[styles.pillText, isCompleted ? styles.pillTextDone : styles.pillTextActive]}>
          {isCompleted ? "Done" : "Active"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  tripIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tripInfo: { flex: 1 },
  tripRoute: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: FB.textPrimary,
  },
  tripDate: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: FB.textSec,
    marginTop: 2,
  },
  tripStatusPill: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillActive: { backgroundColor: FB.green + "15" },
  pillDone: { backgroundColor: "#F0FDF4" },
  pillText: { fontFamily: "Poppins_500Medium", fontSize: 11 },
  pillTextActive: { color: FB.green },
  pillTextDone: { color: "#16A34A" },
});