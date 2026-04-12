// app/(passenger)/index.tsx
import React, { useEffect } from "react";
import {
  View,
  StyleSheet,
} from "react-native";
import { useAuthStore } from "@/src/store/useStore";
import { PassengersStorage, TripsStorage } from "@/src/services/storage";

// Import separated components
import BalanceCard from "@/components/BalanceCard";
// const [quickTransferVisible, setQuickTransferVisible] = useState(false);



export default function PassengerDashboard() {
  const { user } = useAuthStore();
  // const { t } = useTranslation();

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



  return (
    <View style={[styles.hero, ]}>
      {/* Hero Header */}
      <BalanceCard
        coins={coins}
        // onQuickTransferPress={() => setQuickTransferVisible(true)}
        onQuickTransferPress={() => { }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
  },

})