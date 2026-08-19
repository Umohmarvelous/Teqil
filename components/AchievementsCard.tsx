// components/AchievementsCard.tsx
//
// Compact profile card: "X/12 Achievements" + a preview strip of badges. Tapping
// opens the full Achievements screen.

import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Trophy, ChevronRight } from "@hugeicons/core-free-icons";
import { Colors } from "@/constants/colors";
import { useAchievementsStore } from "@/src/store/useAchievementsStore";
import { ACHIEVEMENTS, TOTAL_ACHIEVEMENTS } from "@/src/data/achievements";

export default function AchievementsCard({
  textColor,
  subColor,
  cardBg,
  borderColor,
}: {
  textColor: string;
  subColor: string;
  cardBg: string;
  borderColor: string;
}) {
  const unlocked = useAchievementsStore((s) => s.unlocked);
  const earned = Object.keys(unlocked).length;
  const preview = ACHIEVEMENTS.slice(0, 5);

  return (
    <Pressable
      // "/achievements" is a real route (app/achievements.tsx); the `as any`
      // silences expo-router typed-routes until it regenerates on next start/build.
      onPress={() => router.push("/achievements" as any)}
      style={[styles.card, { backgroundColor: 'transparent' }]}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <HugeiconsIcon icon={Trophy as any} size={20} color={textColor} />
          <Text style={[styles.title, { color: textColor }]}>Achievements</Text>
        </View>
        <View style={styles.countRow}>
          <Text style={[styles.count, { color: subColor }]}>
            {earned}/{TOTAL_ACHIEVEMENTS}
          </Text>
          <HugeiconsIcon icon={ChevronRight as any} size={18} color={subColor} />
        </View>
      </View>

      <View style={styles.badgeRow}>
        {preview.map((a) => {
          const on = !!unlocked[a.id];
          return (
            <View
              key={a.id}
              style={[
                styles.badge,
                {
                  borderColor,
                  backgroundColor: on ? Colors.primary + "18" : "transparent",
                  opacity: on ? 1 : 0.4,
                },
              ]}
            >
              <HugeiconsIcon icon={a.icon} size={20} color={on ? Colors.primary : subColor} />
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 30,
    marginTop: 35,
    padding: 10,
    marginBottom: 10,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 0,
    elevation: 2,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  countRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  count: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  badgeRow: { flexDirection: "row", gap: 10 },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
