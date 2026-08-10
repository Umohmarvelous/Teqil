// app/settings/notifications.tsx
//
// The master push switch plus per-category toggles.
//
// Each category is checked before that specific notification is presented, so
// switching one off genuinely silences that class of alert rather than just
// recording a preference. Turning the master switch off disables the whole
// group — the categories are shown dimmed rather than hidden, so it's obvious
// why they stopped arriving.

import React from "react";
import { useLocalSearchParams } from "expo-router";

import { IOSScreen, IOSListSection, IOSListRow } from "@/components/ios";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useAuthStore } from "@/src/store/useStore";
import { haptics } from "@/src/utils/haptics";
import { useHighlight } from "@/src/hooks/useHighlight";

export default function NotificationSettings() {
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const flash = useHighlight(highlight);

  const role = useAuthStore((s) => s.user?.role);

  const {
    pushNotifications,
    setPushNotifications,
    notifyDriverArrival,
    setNotifyDriverArrival,
    notifyFreeRides,
    setNotifyFreeRides,
    notifyFuelPool,
    setNotifyFuelPool,
    notifyPromotions,
    setNotifyPromotions,
  } = useSettingsStore();

  const off = !pushNotifications;

  const toggle = (fn: (v: boolean) => void) => (v: boolean) => {
    haptics.tap();
    fn(v);
  };

  return (
    <IOSScreen title="Notifications" back>
      <IOSListSection footer="Turning this off stops every Emilgo notification on this device.">
        <IOSListRow
          symbol="bell.badge.fill"
          label="Allow Notifications"
          accessory={{
            type: "switch",
            value: pushNotifications,
            onValueChange: toggle(setPushNotifications),
          }}
          {...flash("push")}
        />
      </IOSListSection>

      <IOSListSection header="Trips">
        <IOSListRow
          symbol="car.circle.fill"
          label="Driver Arrival"
          detail="When your matched driver is nearby"
          disabled={off}
          accessory={{
            type: "switch",
            value: notifyDriverArrival && !off,
            onValueChange: toggle(setNotifyDriverArrival),
          }}
          {...flash("notify-arrival")}
        />
      </IOSListSection>

      <IOSListSection header="Free rides">
        <IOSListRow
          symbol="gift.fill"
          label="Free Ride Offers"
          detail="New offers on routes you travel"
          disabled={off}
          accessory={{
            type: "switch",
            value: notifyFreeRides && !off,
            onValueChange: toggle(setNotifyFreeRides),
          }}
          {...flash("notify-free-rides")}
        />
        {role === "driver" && (
          <IOSListRow
            symbol="fuelpump.fill"
            label="Fuel Pool Warnings"
            detail="When the pool can no longer cover a reward"
            disabled={off}
            accessory={{
              type: "switch",
              value: notifyFuelPool && !off,
              onValueChange: toggle(setNotifyFuelPool),
            }}
            {...flash("notify-fuel-pool")}
          />
        )}
      </IOSListSection>

      <IOSListSection
        header="Other"
        footer="Promotions are off by default. We only send them if you ask for them."
      >
        <IOSListRow
          symbol="megaphone.fill"
          label="Promotions"
          detail="Premium offers and campaigns"
          disabled={off}
          accessory={{
            type: "switch",
            value: notifyPromotions && !off,
            onValueChange: toggle(setNotifyPromotions),
          }}
          {...flash("notify-promotions")}
        />
      </IOSListSection>
    </IOSScreen>
  );
}
