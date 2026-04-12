
// components/BalanceCard.tsx
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { Colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/src/store/useStore";

import {
  formatCoins,
  formatNaira,
  coinsToNaira,
} from "@/src/utils/helpers";

interface BalanceCardProps {
  coins: number;
  // balanceHidden: boolean;
  // onToggleHide: () => void;
  onQuickTransferPress: () => void;
}

export default function BalanceCard({
  // coins,
  // balanceHidden,
  // onToggleHide,
  onQuickTransferPress,
}: BalanceCardProps) {
  
  const { theme } = useSettingsStore();
  const { user } = useAuthStore();
  
  const coins = user?.points_balance || 0;
  const [balanceHidden, setBalanceHidden] = useState(false);


  const isDark = theme === "dark";
  const textColor = isDark ? Colors.textWhite : Colors.text;


  return (
    <>
      <View style={styles.balanceCard}>
        {/* <Text style={styles.balanceLabel}>Coin Balance</Text> */}

        {/* Balance card */}
        <Pressable style={styles.balanceIcon} onPress={() => setBalanceHidden((v) => !v)} hitSlop={8}>
          <Ionicons
            name={balanceHidden ? "eye-off" : "eye"}
            size={22} 
            color= {textColor}
          />
        </Pressable>
        <View style={styles.balanceRow}>
          <Text style={[styles.balanceValue, {color: textColor}]}>
            {balanceHidden ? "* * * * *" : formatCoins(coins)}
          </Text>
        </View>
        <Text style={styles.balanceEquiv}>
          ≈ {formatNaira(coinsToNaira(coins))}
        </Text>

      </View>
    </>
  );
}


// ─── Main Styles ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  balanceCard: {
    flexDirection: "column",
    gap: 22,
    alignItems: "center",
    flex: 1,   

  },
  balanceLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.background,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  balanceRow: { 
  },
  balanceValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 26,
    color: Colors.background,
    letterSpacing: -0.5, 
  },
  balanceIcon: {
    alignSelf: 'flex-end',
  },
  balanceEquiv: {
    // alignSelf: 'flex-start',
    fontFamily: "Poppins_700Bold",
    fontSize: 12,    
    color: Colors.gold,
  },
});