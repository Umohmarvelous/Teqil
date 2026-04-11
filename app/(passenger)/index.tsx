// app/(passenger)/index.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/src/store/useStore";
import { PassengersStorage, TripsStorage } from "@/src/services/storage";
// import type { Trip } from "@/src/models/types";
// import { useTranslation } from "react-i18next";

// Import separated components
import BalanceCard from "@/components/BalanceCard";
// const [quickTransferVisible, setQuickTransferVisible] = useState(false);



export default function PassengerDashboard() {
  const { user, logout } = useAuthStore();
  // const { t } = useTranslation();
  const [balanceHidden, setBalanceHidden] = useState(false);

  const coins = user?.points_balance || 0;

  useEffect(() => {
    // quickTransferVisible(true)
    if (!user?.id) return;
    const loadTrips = async () => {
      try {
        const passengers = await PassengersStorage.getByUserId(user.id);
        if (!passengers) return;
        const trips = await Promise.all(
          passengers.slice(-5).map(async (p) => {
            const all = await TripsStorage.getAll();
            return all.find((t) => t.id === p.trip_id);
          })
        );
      } catch (error) {
        console.warn("Failed to load recent trips:", error);
      }
    };
    loadTrips();
  }, [user?.id]);

  

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you really sure about this ?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          const { signOut } = await import("@/src/services/supabase");
          await signOut();
          logout();
          router.replace("/(auth)/welcome");
        },
      },
    ]);
  };

  return (
    <View style={[styles.hero, ]}>
      {/* Hero Header */}
      <BalanceCard
        coins={coins}
        balanceHidden={balanceHidden}

        onToggleHide={() => setBalanceHidden(v => !v)}
        // onQuickTransferPress={() => setQuickTransferVisible(true)}
        onQuickTransferPress={() => { }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    // paddingBottom: 14,
  },

})