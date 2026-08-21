// app/settings/privacy.tsx
//
// Location sharing, device locks and the emergency contact.
//
// The biometric toggles only enable if the device can actually satisfy them —
// offering a Face ID lock on hardware with nothing enrolled would leave the
// user believing they're protected when they aren't.

import React, { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";

import {
  IOSScreen,
  IOSListSection,
  IOSListRow,
  iosAlert,
} from "@/components/ios";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { haptics } from "@/src/utils/haptics";
import { useHighlight } from "@/src/hooks/useHighlight";
import * as EC from "@/src/services/emergencyContacts";
import { migrateLegacyEmergencyContact } from "@/src/services/emergencyContacts";

export default function PrivacySettings() {
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const flash = useHighlight(highlight);

  const {
    shareLocation,
    setShareLocation,
    biometricLock,
    setBiometricLock,
    biometricOnPayout,
    setBiometricOnPayout,
    emergencyContact,
    setEmergencyContact,
  } = useSettingsStore();

  // How many contacts exist, for the row's subtitle. NULL while unknown, so
  // the row does not flash "Nobody added yet" at someone who has ten.
  const [contactCount, setContactCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    // The old single contact lived in AsyncStorage on one device. Anyone who set
    // one before this screen changed would otherwise silently lose it.
    migrateLegacyEmergencyContact(emergencyContact, setEmergencyContact)
      .then(() => EC.list())
      .then((rows: EC.EmergencyContact[]) => { if (alive) setContactCount(rows.length); })
      .catch(() => { if (alive) setContactCount(0); });
    return () => { alive = false; };
  }, [emergencyContact, setEmergencyContact]);

  /** Only enable a biometric gate if the device can actually satisfy it. */
  const ensureBiometrics = useCallback(async (): Promise<boolean> => {
    try {
      const LA = await import("expo-local-authentication");
      const [hasHardware, enrolled] = await Promise.all([
        LA.hasHardwareAsync(),
        LA.isEnrolledAsync(),
      ]);
      if (!hasHardware || !enrolled) {
        iosAlert(
          "Not available",
          "Set up Face ID / Touch ID or a device passcode first, then try again.",
        );
        return false;
      }
      return true;
    } catch {
      iosAlert("Not available", "Biometric authentication isn't available on this device.");
      return false;
    }
  }, []);

  const toggleLock = useCallback(
    async (v: boolean) => {
      if (v && !(await ensureBiometrics())) return;
      haptics.tap();
      setBiometricLock(v);
    },
    [ensureBiometrics, setBiometricLock],
  );

  const togglePayoutLock = useCallback(
    async (v: boolean) => {
      if (v && !(await ensureBiometrics())) return;
      haptics.tap();
      setBiometricOnPayout(v);
    },
    [ensureBiometrics, setBiometricOnPayout],
  );

  return (
    <IOSScreen title="Privacy & Security" back>
      <IOSListSection
        header="Location"
        footer="Free rides are GPS-tracked as a condition of the ride — turning this off won't stop them."
      >
        <IOSListRow
          symbol="location.fill"
          label="Share Location During Trips"
          accessory={{
            type: "switch",
            value: shareLocation,
            onValueChange: (v) => {
              haptics.tap();
              setShareLocation(v);
            },
          }}
          {...flash("share-location")}
        />
      </IOSListSection>

      <IOSListSection header="Device security">
        <IOSListRow
          symbol="faceid"
          label="Biometric App Lock"
          detail="Face ID, Touch ID or passcode to open Emilgo"
          accessory={{ type: "switch", value: biometricLock, onValueChange: toggleLock }}
          {...flash("biometric-lock")}
        />
        <IOSListRow
          symbol="lock.shield.fill"
          label="Confirm Payout Changes"
          detail="Require Face ID before changing your payout account"
          accessory={{
            type: "switch",
            value: biometricOnPayout,
            onValueChange: togglePayoutLock,
          }}
          {...flash("biometric-payout")}
        />
      </IOSListSection>

      <IOSListSection
        header="Safety"
        footer="Up to 10 people who are told when your trips start and end, and immediately if you use SOS. They have to accept first."
      >
        <IOSListRow
          symbol="phone.arrow.up.right.fill"
          label="Emergency contacts"
          detail={
            contactCount === null
              ? undefined
              : contactCount === 0
                ? "Nobody added yet"
                : `${contactCount} contact${contactCount === 1 ? "" : "s"}`
          }
          accessory={{ type: "disclosure" }}
          onPress={() => { haptics.tap(); router.push("/emergency"); }}
          {...flash("emergency-contact")}
        />
      </IOSListSection>
    </IOSScreen>
  );
}
