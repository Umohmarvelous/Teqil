// app/achievements.tsx
//
// Full Achievements screen — a grid of every badge (Reddit-style): unlocked ones
// are colourful with their unlock date; locked ones are greyed with the
// requirement. Reached from the profile Achievements card.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Colors } from "@/constants/colors";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useAchievementsStore } from "@/src/store/useAchievementsStore";
import { ACHIEVEMENTS, TOTAL_ACHIEVEMENTS } from "@/src/data/achievements";
import { IOSScreen, useCollapsibleScroll, IOSAppFont } from "@/components/ios";

function formatDate(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function AchievementsScreen() {
  const scroll = useCollapsibleScroll();
  const isDark = useSettingsStore((s) => s.theme) === "dark";
  const unlocked = useAchievementsStore((s) => s.unlocked);
  const earned = Object.keys(unlocked).length;

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? "rgba(255,255,255,0.06)" : "#FFFFFF";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";

  return (
    <IOSScreen
      title="Achievements"
      subtitle={`${earned} of ${TOTAL_ACHIEVEMENTS} unlocked`}
      back
      scroll={scroll}
      contentContainerStyle={styles.grid}
      right={
        <Text style={[IOSAppFont.label, { color: Colors.primary }]}>
          {earned}/{TOTAL_ACHIEVEMENTS}
        </Text>
      }
    >
        {ACHIEVEMENTS.map((a) => {
          const at = unlocked[a.id];
          const on = !!at;
          return (
            <View
              key={a.id}
              style={[
                styles.cell,
                { backgroundColor: cardBg, borderColor, opacity: on ? 1 : 0.55 },
              ]}
            >
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: on ? Colors.primary + "1F" : borderColor },
                ]}
              >
                <HugeiconsIcon
                  icon={a.icon as any}
                  size={26}
                  color={on ? Colors.primary : subColor}
                />
              </View>
              <Text style={[styles.cellTitle, { color: textColor }]} numberOfLines={1}>
                {a.title}
              </Text>
              <Text style={[styles.cellDesc, { color: subColor }]} numberOfLines={2}>
                {a.description}
              </Text>
              <Text style={[styles.cellMeta, { color: on ? Colors.primary : subColor }]}>
                {on ? `Unlocked ${formatDate(at)}` : "Locked"}
              </Text>
            </View>
          );
        })}
    </IOSScreen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    padding: 16,
    gap: 12,
  },
  cell: {
    width: "48%",
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    alignItems: "flex-start",
    gap: 8,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  cellTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  cellDesc: { fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 15, minHeight: 30 },
  cellMeta: { fontFamily: "Poppins_500Medium", fontSize: 11, marginTop: 2 },
});
