
// components/BalanceCard.tsx
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { Colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { usePoolStore } from "@/src/store/usePoolStore";

import { formatNaira } from "@/src/utils/helpers";

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

  // Real money pool (₦) — realised ad revenue that discounts the passenger's
  // fares. This is spendable money, unlike the hidden engagement "credits".
  // Driver trip earnings render elsewhere.
  const pool = usePoolStore((s) => s.balance);
  const [balanceHidden, setBalanceHidden] = useState(false);


  const isDark = theme === "dark";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";


  return (
    <>
      <View style={styles.balanceCard}>
        {/* <Text style={styles.balanceLabel}>Coin Balance</Text> */}

        {/* Balance card */}
        {/* <Pressable
                  style={[
                    styles.menuList,
                    {
                      backgroundColor: isDark
                        ? Colors.overlayLight
                        : Colors.textWhite,
                      borderColor,
                    },
                  ]}
              ></Pressable> */}
        <Pressable style={
          [styles.balanceIcon, {
            backgroundColor: isDark
              ? Colors.overlayLight
              : Colors.textWhite,
            borderWidth: 1, borderColor, 
            padding: 10, borderRadius: 50
        }]
        } onPress={() => setBalanceHidden((v) => !v)} hitSlop={8}>
          <Ionicons
            name={balanceHidden ? "eye-off" : "eye"}
            size={20} 
            color= {textColor}
          />
        </Pressable>
        <View style={styles.balanceRow}>
          <Text style={[styles.balanceValue, {color: textColor}]}>
            {balanceHidden ? "* * * * *" : formatNaira(pool)}
          </Text>
        </View>
        <Text style={styles.balanceEquiv}>Pool balance</Text>

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