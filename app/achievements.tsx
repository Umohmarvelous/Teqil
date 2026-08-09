// app/achievements.tsx
//
// Full Achievements screen — a grid of every badge: unlocked ones are tinted and
// dated, locked ones are dimmed with their requirement. Reached from the profile
// Achievements card.
//
// iOS kit: large-title header, semantic palette, iOS text ramp. Badge glyphs stay
// on Hugeicons because each achievement ships its own icon in the data file —
// SF Symbols has no equivalent per-badge set.

import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { SymbolView } from "expo-symbols";

import { useIOSTheme, IOSFont, IOSMetrics } from "@/components/ios";
import { useAchievementsStore } from "@/src/store/useAchievementsStore";
import { ACHIEVEMENTS, TOTAL_ACHIEVEMENTS } from "@/src/data/achievements";

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
  const insets = useSafeAreaInsets();
  const ios = useIOSTheme();
  const unlocked = useAchievementsStore((s) => s.unlocked);
  const earned = Object.keys(unlocked).length;

  const topPadding = Platform.OS === "web" ? 20 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: ios.systemGroupedBackground }]}>
      <StatusBar style={ios.scheme === "dark" ? "light" : "dark"} />

      <View style={{ paddingTop: topPadding + 6, paddingHorizontal: IOSMetrics.groupedInset }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.backRow}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <SymbolView name="chevron.left" size={17} tintColor={ios.tint} fallback={null} />
          <Text style={[IOSFont.body, { color: ios.tint }]}>Back</Text>
        </Pressable>

        <View style={styles.titleRow}>
          <Text style={[IOSFont.largeTitle, { color: ios.label, flex: 1 }]}>Achievements</Text>
          <Text style={[IOSFont.title3, { color: ios.tint }]}>
            {earned}/{TOTAL_ACHIEVEMENTS}
          </Text>
        </View>
        <Text style={[IOSFont.footnote, { color: ios.secondaryLabel, marginBottom: 8 }]}>
          {earned === TOTAL_ACHIEVEMENTS
            ? "Every badge unlocked."
            : `${TOTAL_ACHIEVEMENTS - earned} still to unlock`}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {ACHIEVEMENTS.map((a) => {
          const at = unlocked[a.id];
          const on = !!at;
          return (
            <View
              key={a.id}
              style={[
                styles.cell,
                {
                  backgroundColor: ios.secondarySystemGroupedBackground,
                  opacity: on ? 1 : 0.5,
                },
              ]}
              accessibilityLabel={`${a.title}. ${on ? `Unlocked ${formatDate(at)}` : "Locked"}`}
            >
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: on ? ios.tint : ios.tertiarySystemFill },
                ]}
              >
                <HugeiconsIcon
                  icon={a.icon as any}
                  size={24}
                  color={on ? "#FFFFFF" : ios.secondaryLabel}
                />
              </View>

              <Text numberOfLines={1} style={[IOSFont.headline, { color: ios.label }]}>
                {a.title}
              </Text>
              <Text numberOfLines={2} style={[IOSFont.caption1, { color: ios.secondaryLabel, minHeight: 32 }]}>
                {a.description}
              </Text>
              <Text style={[IOSFont.caption2, { color: on ? ios.tint : ios.tertiaryLabel }]}>
                {on ? `Unlocked ${formatDate(at)}` : "Locked"}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1 },
  backRow:  { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: -4 },
  titleRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 4 },

  grid: {
    flexDirection:  "row",
    flexWrap:       "wrap",
    justifyContent: "space-between",
    paddingHorizontal: IOSMetrics.groupedInset,
    paddingTop:     6,
  },
  cell: {
    width:        "48%",
    borderRadius: IOSMetrics.groupedRadius,
    padding:      14,
    marginBottom: 12,
    alignItems:   "flex-start",
    gap:          5,
  },
  iconWrap: {
    width:          46,
    height:         46,
    borderRadius:   12,
    alignItems:     "center",
    justifyContent: "center",
    marginBottom:   4,
  },
});
