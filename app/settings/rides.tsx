// app/settings/rides.tsx
//
// How tracking behaves during a ride, and what the ride screens show you.

import React from "react";
import { router, useLocalSearchParams } from "expo-router";

import { IOSScreen, IOSListSection, IOSListRow } from "@/components/ios";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { haptics } from "@/src/utils/haptics";
import { useHighlight } from "@/src/hooks/useHighlight";

export default function RideSettings() {
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const flash = useHighlight(highlight);

  const {
    autoStartTracking,
    setAutoStartTracking,
    confirmEndTrip,
    setConfirmEndTrip,
    voiceGuidance,
    setVoiceGuidance,
    fareBreakdown,
    setFareBreakdown,
    distanceUnit,
    setDistanceUnit,
  } = useSettingsStore();

  const toggle = (fn: (v: boolean) => void) => (v: boolean) => {
    haptics.tap();
    fn(v);
  };

  return (
    <IOSScreen title="Rides & Tracking" back>
      <IOSListSection
        header="Tracking"
        footer="Free rides always track from pickup to drop-off — that GPS record is what earns the driver their fuel reward."
      >
        <IOSListRow
          symbol="location.fill.viewfinder"
          label="Start Tracking Automatically"
          detail="Begin GPS as soon as a ride screen opens"
          accessory={{
            type: "switch",
            value: autoStartTracking,
            onValueChange: toggle(setAutoStartTracking),
          }}
          {...flash("auto-tracking")}
        />
        <IOSListRow
          symbol="checkmark.shield.fill"
          label="Confirm Before Ending"
          detail="Ask before stopping a tracked ride"
          accessory={{
            type: "switch",
            value: confirmEndTrip,
            onValueChange: toggle(setConfirmEndTrip),
          }}
          {...flash("confirm-end")}
        />
      </IOSListSection>

      <IOSListSection header="During a ride">
        <IOSListRow
          symbol="speaker.wave.2.fill"
          label="Voice Guidance"
          detail="Speak pickup, progress and arrival cues aloud"
          accessory={{
            type: "switch",
            value: voiceGuidance,
            onValueChange: toggle(setVoiceGuidance),
          }}
          {...flash("voice-guidance")}
        />
        <IOSListRow
          symbol="list.bullet.rectangle.fill"
          label="Show Fare Breakdown"
          detail="See the split before confirming a payment"
          accessory={{
            type: "switch",
            value: fareBreakdown,
            onValueChange: toggle(setFareBreakdown),
          }}
          {...flash("fare-breakdown")}
        />
      </IOSListSection>

      <IOSListSection header="Units">
        <IOSListRow
          symbol="ruler.fill"
          label="Distance Units"
          accessory={{ type: "detail", text: distanceUnit === "km" ? "Kilometres" : "Miles" }}
          onPress={() => {
            haptics.tap();
            setDistanceUnit(distanceUnit === "km" ? "mi" : "km");
          }}
          {...flash("distance-unit")}
        />
      </IOSListSection>

      <IOSListSection>
        <IOSListRow
          symbol="map.fill"
          label="Route History"
          detail="GPS routes of trips and free rides you've taken"
          accessory={{ type: "disclosure" }}
          onPress={() => {
            haptics.tap();
            router.push("/route-history" as never);
          }}
          {...flash("route-history")}
        />
      </IOSListSection>
    </IOSScreen>
  );
}
