// components/BalanceCard.tsx
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { formatCoins, formatNaira } from "@/src/utils/helpers";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { Colors } from "@/constants/colors";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { EyeIcon, EyeOff } from "@hugeicons/core-free-icons";

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
  
  const { theme } = useSettingsStore();

  const isDark = theme === "dark";
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const textColor = isDark ? Colors.textWhite : Colors.text;

  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";

  return (
    <>
      <View style={ styles.balanceLabelContainer}>
        <Text style={[styles.balanceLabel, {color: textColor}]}>Coin Balance</Text>
        <Pressable onPress={onToggleHide} hitSlop={8}>
          <HugeiconsIcon
            icon={balanceHidden ? EyeOff : EyeIcon}
            size={18}
            color={textColor}
          />
        </Pressable>
      </View>
      <View style={[styles.balanceCard, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.balanceCardInner}>
          <View style={styles.balanceLeft}>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceValue}>
                {balanceHidden ? "****" : formatCoins(coins)}
                {/* <Text style={{fontFamily: "Helvetica", fontSize: 18, color: '#AFAFAF', fontWeight: '700'}}>{ formatCoins < 1 ? " Coins" : " Coin" }</Text> */}
              </Text>
              <Text style={styles.balanceEquiv}>
                 ≈ {` `} {formatNaira(coins * 0.7)}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  balanceCard: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: 'flex-start',
  },
  balanceCardInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginVertical: 10,
  },
  balanceLeft: {
    flex: 1,
  },
  balanceLabelContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 15,
    textAlign: 'center',
  },
  balanceLabel: {
  fontFamily: "Poppins_600SemiBold",
  fontSize: 14,
  marginBottom: 12,
  },
  balanceRow: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: 'center', 
    // gap: 37, 
    flex:1
  },
  balanceValue: {
    fontFamily: "mono",
    fontSize: 30,
    color: Colors.warning,
    letterSpacing: -0.5,
  },
  balanceEquiv: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textTertiary,
    marginTop: 2,
  },

});