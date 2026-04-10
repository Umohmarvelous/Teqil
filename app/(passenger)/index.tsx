// app/(passenger)/index.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/src/store/useStore";
import { PassengersStorage, TripsStorage } from "@/src/services/storage";
// import type { Trip } from "@/src/models/types";
import { useTranslation } from "react-i18next";
import { FB } from "@/constants/fbPalette";

// Import separated components
import BalanceCard from "@/components/BalanceCard";
import { Colors } from "@/constants/colors";
// const [quickTransferVisible, setQuickTransferVisible] = useState(false);



export default function PassengerDashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const { t } = useTranslation();
  const [balanceHidden, setBalanceHidden] = useState(false);

  const coins = user?.points_balance || 0;
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

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
    <View >
      <View
        // contentContainerStyle={[
        //   styles.scrollContent,
        //   // { paddingBottom: Math.max(insets.bottom, 24) + 100 },
        // ]}
      >
        {/* Hero Header */}
        <View style={[styles.hero, { paddingTop: topPadding + 14 }, {backgroundColor: Colors.primary}]}>
          <BalanceCard
            coins={coins}
            balanceHidden={balanceHidden}

            onToggleHide={() => setBalanceHidden(v => !v)}
            // onQuickTransferPress={() => setQuickTransferVisible(true)}
          />
        </View>
      </View>

    </View>
  );
}

// Main dashboard styles (only what remains)
const styles = StyleSheet.create({
  // root: { flex: 1,  },
  scrollContent: { gap: 0 },

  hero: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderRadius: 24,
  },
  heroTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  heroGreet: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
  },
  heroName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: "#fff",
    lineHeight: 30,
  },
  heroTopRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  notifBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBtn: {},
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: FB.green,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#fff" },

  sectionCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionHeading: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: FB.textPrimary,
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  seeAll: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: FB.green,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  divider: { height: 1, backgroundColor: FB.border },

  
})