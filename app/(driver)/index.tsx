import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { useSettingsStore } from "@/src/store/useSettingsStore";

import {
  formatCoins,
  formatNaira,
} from "@/src/utils/helpers";
// import { useTranslation } from "react-i18next";

export default function DriverDashboard() {
  const { theme } = useSettingsStore();
  const { user } = useAuthStore();
  
  // const insets = useSafeAreaInsets();
  // const { t } = useTranslation();
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
        {/* This used to read "≈ ₦n", derived from a fixed 0.7 rate. A published
            conversion rate from an in-app unit to a real currency is what makes
            that unit stored value, and stored value needs a CBN licence — see
            COMPLIANCE.md §2.1. Coins are compared to nothing now; what they are
            WORTH is stated as what they buy. */}
        <Text style={styles.balanceEquiv}>
          Spend on fuel vouchers and commission waivers
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