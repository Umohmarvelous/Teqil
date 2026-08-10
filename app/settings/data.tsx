// app/settings/data.tsx
//
// Sync behaviour, bandwidth, how long local history is kept, and the cache.

import React, { useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams } from "expo-router";

import {
  IOSScreen,
  IOSListSection,
  IOSListRow,
  iosAlert,
  iosActionSheet,
} from "@/components/ios";
import {
  useSettingsStore,
  type RetentionDays,
} from "@/src/store/useSettingsStore";
import { queryClient } from "@/lib/query-client";
import { haptics } from "@/src/utils/haptics";
import { useHighlight } from "@/src/hooks/useHighlight";

const RETENTION_LABELS: Record<RetentionDays, string> = {
  30: "30 days",
  90: "90 days",
  365: "1 year",
  0: "Forever",
};

export default function DataSettings() {
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const flash = useHighlight(highlight);

  const {
    dataSaver,
    setDataSaver,
    syncOnWifiOnly,
    setSyncOnWifiOnly,
    historyRetentionDays,
    setHistoryRetentionDays,
  } = useSettingsStore();

  const toggle = (fn: (v: boolean) => void) => (v: boolean) => {
    haptics.tap();
    fn(v);
  };

  const pickRetention = useCallback(() => {
    haptics.tap();
    iosActionSheet(
      "Keep History For",
      "Local trip and route records older than this are pruned. Cloud records are unaffected.",
      [
        { text: "30 days", onPress: () => setHistoryRetentionDays(30) },
        { text: "90 days", onPress: () => setHistoryRetentionDays(90) },
        { text: "1 year", onPress: () => setHistoryRetentionDays(365) },
        { text: "Forever", onPress: () => setHistoryRetentionDays(0) },
        { text: "Cancel", style: "cancel" },
      ],
    );
  }, [setHistoryRetentionDays]);

  const clearCache = useCallback(() => {
    iosAlert(
      "Clear Cache",
      "Clears cached trips and feed data on this device. Your login and credits are kept and will re-sync when online.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.multiRemove([
              "teqil_trips",
              "teqil_passengers",
              "teqil_ratings",
              "teqil_broadcasts",
              "teqil_active_trip_code",
            ]);
            try {
              queryClient.clear();
            } catch {
              /* no-op */
            }
            haptics.success();
            iosAlert("Done", "Local cache cleared.");
          },
        },
      ],
    );
  }, []);

  return (
    <IOSScreen title="Data & Storage" back>
      <IOSListSection
        header="Sync"
        footer="With Wi-Fi only on, changes you make offline are queued and pushed the next time you're on Wi-Fi."
      >
        <IOSListRow
          symbol="wifi"
          label="Sync on Wi-Fi Only"
          accessory={{
            type: "switch",
            value: syncOnWifiOnly,
            onValueChange: toggle(setSyncOnWifiOnly),
          }}
          {...flash("wifi-sync")}
        />
      </IOSListSection>

      <IOSListSection
        header="Bandwidth"
        footer="Data Saver lowers GPS accuracy and slows live updates. Distances stay accurate enough to bill, but the map moves less smoothly."
      >
        <IOSListRow
          symbol="antenna.radiowaves.left.and.right"
          label="Data Saver"
          accessory={{
            type: "switch",
            value: dataSaver,
            onValueChange: toggle(setDataSaver),
          }}
          {...flash("data-saver")}
        />
      </IOSListSection>

      <IOSListSection header="Storage">
        <IOSListRow
          symbol="clock.arrow.circlepath"
          label="Keep History For"
          accessory={{ type: "detail", text: RETENTION_LABELS[historyRetentionDays] }}
          onPress={pickRetention}
          {...flash("retention")}
        />
        <IOSListRow
          symbol="trash.fill"
          label="Clear Cache"
          detail="Free space; keeps your login and credits"
          accessory={{ type: "disclosure" }}
          onPress={clearCache}
          {...flash("clear-cache")}
        />
      </IOSListSection>
    </IOSScreen>
  );
}
