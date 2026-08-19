// components/ActivityFeed.tsx
//
// Renders the unified history (src/utils/activity.ts). Each row shows an icon,
// title, subtitle and optional amount; tapping a transaction row opens its
// Receipt. Used by the dashboards ("Recent activity") and the History screens.

import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import Receipt, { type ReceiptData } from "@/components/Receipt";
import type { Activity } from "@/src/utils/activity";

const ICON: Record<Activity["icon"], any> = {
  receipt: "receipt-outline",
  crown: "diamond-outline",
  trophy: "trophy-outline",
  play: "play-circle-outline",
  car: "car-outline",
};

export default function ActivityFeed({
  activities,
  textColor,
  subColor,
  cardBg,
  borderColor,
  limit,
  emptyText,
}: {
  activities: Activity[];
  textColor: string;
  subColor: string;
  cardBg: string;
  borderColor: string;
  limit?: number;
  emptyText?: string;
}) {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const items = typeof limit === "number" ? activities.slice(0, limit) : activities;

  return (
    <View style={{ gap: 8 }}>
      {items.length === 0 ? (
        <Text style={[styles.empty, { color: subColor }]}>{emptyText ?? "No activity yet."}</Text>
      ) : (
        items.map((a) => (
          <Pressable
            key={a.id}
            disabled={!a.receipt}
            onPress={() => a.receipt && setReceipt(a.receipt)}
            style={[styles.row, {borderBottomColor: borderColor}]}
          >
            <View style={[styles.iconWrap]}>
              <Ionicons name={ICON[a.icon]} size={18} color={Colors.textWhite} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
                {a.title}
              </Text>
              <Text style={[styles.sub, { color: subColor }]} numberOfLines={1}>
                {a.subtitle}
              </Text>
            </View>
            {a.amount ? (
              <Text
                style={[
                  styles.amount,
                  {
                    color:
                      a.direction === "in"
                        ? Colors.primary
                        : a.direction === "out"
                          ? textColor
                          : subColor,
                  },
                ]}
              >
                {a.amount}
              </Text>
            ) : null}
            {a.receipt ? <Ionicons name="chevron-forward" size={16} color={subColor} /> : null}
          </Pressable>
        ))
      )}

      <Receipt visible={!!receipt} data={receipt} onClose={() => setReceipt(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'red',
    paddingHorizontal: 0,
    paddingVertical: 12,
  } as any,
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: "Poppins_600SemiBold", fontSize: 13.5 },
  sub: { fontFamily: "Poppins_400Regular", fontSize: 11.5, marginTop: 1 },
  amount: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  empty: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 24,
  },
});
