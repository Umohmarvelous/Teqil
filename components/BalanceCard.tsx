// components/BalanceCard.tsx
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { formatCoins, formatNaira } from "@/src/utils/helpers";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { Colors } from "@/constants/colors";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { EyeIcon, EyeOff, Hidden } from "@hugeicons/core-free-icons";

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
  const textColor = isDark ? Colors.textWhite : Colors.text;


  return (
    <>
      <View style={styles.balanceLabelContainer}>
        <View style={{flexDirection: 'row', gap: 10}}>
          <Text style={[styles.balanceLabel, {color: textColor}]}>Coin Balance</Text>
          <Pressable onPress={onToggleHide} hitSlop={8}>
            <HugeiconsIcon
              icon={balanceHidden ? EyeOff : EyeIcon}
              size={18}
              color={textColor}
            />
          </Pressable>
        </View>
        <View style={styles.balanceRow}>
          <Text style={styles.balanceValue}>
            {balanceHidden ? "****" : formatCoins(coins)}
          </Text>
          <Text style={styles.balanceEquiv}>
              ≈ {` `} {formatNaira(coins * 0.7)}
          </Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({

  balanceLabelContainer: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    gap: 25, 
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