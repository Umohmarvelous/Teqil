// components/BalanceCard.tsx
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FB } from "@/constants/fbPalette";
import { formatCoins, formatNaira } from "@/src/utils/helpers";

interface BalanceCardProps {
  coins: number;
  balanceHidden: boolean;
  onToggleHide: () => void;
  onQuickTransferPress: () => void;
}

export default function BalanceCard({
  coins,
  balanceHidden,
  onToggleHide,
  onQuickTransferPress,
}: BalanceCardProps) {
  return (
    <View style={styles.balanceCard}>
      <View style={styles.balanceCardInner}>
        <View style={styles.balanceLeft}>
          <Text style={styles.balanceLabel}>Coin Balance</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceValue}>
              {balanceHidden ? "• • • • •" : formatCoins(coins)}
            </Text>
            <Pressable onPress={onToggleHide} hitSlop={8}>
              <Ionicons
                name={balanceHidden ? "eye-off-outline" : "eye-outline"}
                size={18}
                color="rgba(255,255,255,0.6)"
              />
            </Pressable>
          </View>
          <Text style={styles.balanceEquiv}>
            ≈ {formatNaira(coins * 0.7)} value
          </Text>
        </View>
        <View style={styles.balanceCoinIcon}>
          <Ionicons name="star" size={34} color={FB.gold} />
        </View>
      </View>

      <Pressable style={styles.quickSendRow} onPress={onQuickTransferPress}>
        <Ionicons name="send-outline" size={14} color={FB.greenLight} />
        <Text style={styles.quickSendText}>Quick Transfer</Text>
        <Ionicons name="chevron-forward" size={14} color={FB.greenLight} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  balanceCard: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  balanceCardInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  balanceLeft: { gap: 4 },
  balanceLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  balanceValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 26,
    color: "#fff",
    letterSpacing: -0.5,
  },
  balanceEquiv: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: FB.gold,
    marginTop: 2,
  },
  balanceCoinIcon: { alignItems: "center", justifyContent: "center" },
  quickSendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  quickSendText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: FB.greenLight,
    flex: 1,
  },
});