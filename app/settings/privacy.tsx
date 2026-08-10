// app/settings/privacy.tsx
//
// Location sharing, device locks and the emergency contact.
//
// The biometric toggles only enable if the device can actually satisfy them —
// offering a Face ID lock on hardware with nothing enrolled would leave the
// user believing they're protected when they aren't.

import React, { useCallback, useState } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";

import {
  IOSScreen,
  IOSListSection,
  IOSListRow,
  IOSSheet,
  IOSButton,
  iosAlert,
  useIOSTheme,
  IOSFont,
  IOSMetrics,
} from "@/components/ios";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { haptics } from "@/src/utils/haptics";
import { useHighlight } from "@/src/hooks/useHighlight";

export default function PrivacySettings() {
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const flash = useHighlight(highlight);
  const ios = useIOSTheme();

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

  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState(emergencyContact?.name ?? "");
  const [phone, setPhone] = useState(emergencyContact?.phone ?? "");

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

  const saveContact = useCallback(() => {
    const n = name.trim();
    const p = phone.trim();
    if (!n || !p) {
      iosAlert("Add both details", "An emergency contact needs a name and a phone number.");
      return;
    }
    setEmergencyContact({ name: n, phone: p });
    haptics.success();
    setSheetOpen(false);
  }, [name, phone, setEmergencyContact]);

  const clearContact = useCallback(() => {
    setEmergencyContact(null);
    setName("");
    setPhone("");
    haptics.tap();
    setSheetOpen(false);
  }, [setEmergencyContact]);

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
        footer="Shown on the live-trip screen for a one-tap call. Stored on this device only — Emilgo never uploads it."
      >
        <IOSListRow
          symbol="phone.arrow.up.right.fill"
          label="Emergency Contact"
          detail={emergencyContact ? `${emergencyContact.name} · ${emergencyContact.phone}` : undefined}
          accessory={{ type: "disclosure" }}
          onPress={() => {
            haptics.tap();
            setName(emergencyContact?.name ?? "");
            setPhone(emergencyContact?.phone ?? "");
            setSheetOpen(true);
          }}
          {...flash("emergency-contact")}
        />
      </IOSListSection>

      <IOSSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        detents={[0.46, "large"]}
        title="Emergency Contact"
      >
        <View style={styles.form}>
          <Text style={[IOSFont.footnote, { color: ios.secondaryLabel }]}>
            Who should be called if something goes wrong during a trip?
          </Text>

          <View style={[styles.field, { backgroundColor: ios.tertiarySystemFill }]}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={ios.secondaryLabel}
              style={[IOSFont.body, { color: ios.label }]}
              autoCapitalize="words"
            />
          </View>

          <View style={[styles.field, { backgroundColor: ios.tertiarySystemFill }]}>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone number"
              placeholderTextColor={ios.secondaryLabel}
              style={[IOSFont.body, { color: ios.label }]}
              keyboardType="phone-pad"
            />
          </View>

          <IOSButton title="Save contact" variant="filled" size="large" fullWidth onPress={saveContact} />
          {emergencyContact && (
            <IOSButton
              title="Remove contact"
              variant="borderless"
              role="destructive"
              fullWidth
              onPress={clearContact}
            />
          )}
        </View>
      </IOSSheet>
    </IOSScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12, paddingTop: 4 },
  field: {
    height: 44,
    borderRadius: IOSMetrics.groupedRadius,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
});
