// app/settings/account.tsx
//
// Profile, password, payment and payout, then the destructive account actions.
//
// Sign Out and Delete Account are deliberately in their own group at the bottom,
// separated from everything else — the iOS convention for irreversible actions.

import React, { useCallback } from "react";
import { Platform } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { IOSScreen, IOSListSection, IOSListRow, iosAlert } from "@/components/ios";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { supabase } from "@/src/services/supabase";
import { haptics } from "@/src/utils/haptics";
import { useHighlight } from "@/src/hooks/useHighlight";

export default function AccountSettings() {
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const flash = useHighlight(highlight);

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const biometricOnPayout = useSettingsStore((s) => s.biometricOnPayout);

  const isDriver = user?.role === "driver";

  const changePassword = useCallback(() => {
    if (!user?.email) {
      iosAlert("No email on file", "This account has no email to send a reset link to.");
      return;
    }
    iosAlert("Change Password", `We'll email a password-reset link to ${user.email}.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send link",
        onPress: async () => {
          const { error } = await supabase.auth.resetPasswordForEmail(user.email!, {
            redirectTo:
              Platform.OS === "web" ? window.location.origin : "teqil://reset-password",
          });
          if (error) iosAlert("Couldn't send", error.message);
          else iosAlert("Sent", "Check your email for the reset link.");
        },
      },
    ]);
  }, [user?.email]);

  /** Payout details move real money, so gate them behind Face ID when asked. */
  const openPayout = useCallback(async () => {
    haptics.tap();
    if (biometricOnPayout) {
      try {
        const LA = await import("expo-local-authentication");
        const res = await LA.authenticateAsync({
          promptMessage: "Confirm it's you to change payout details",
        });
        if (!res.success) return;
      } catch {
        // No biometric hardware available — fall through rather than lock the
        // user out of their own payout settings.
      }
    }
    router.push("/(driver)/payout-bank" as never);
  }, [biometricOnPayout]);

  const signOutFlow = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore — clear the local session regardless */
    }
    logout();
    router.replace("/(auth)/login");
  }, [logout]);

  const confirmSignOut = useCallback(() => {
    iosAlert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOutFlow },
    ]);
  }, [signOutFlow]);

  const confirmDelete = useCallback(() => {
    iosAlert(
      "Delete Account",
      "This permanently deletes your account and data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: signOutFlow },
      ],
    );
  }, [signOutFlow]);

  return (
    <IOSScreen title="Account" back>
      <IOSListSection header="Profile">
        <IOSListRow
          symbol="person.text.rectangle.fill"
          label="My Profile"
          detail={user?.full_name || user?.username || "Name, photo and contact details"}
          accessory={{ type: "disclosure" }}
          onPress={() => {
            haptics.tap();
            router.push("/(main)/profile" as never);
          }}
          {...flash("profile")}
        />




        
        <IOSListRow
          symbol="key.fill"
          label="Change Password"
          accessory={{ type: "disclosure" }}
          onPress={changePassword}
          {...flash("password")}
        />
      </IOSListSection>

      <IOSListSection
        header="Money"
        footer={
          isDriver
            ? "Payouts go to the bank account on file. Changing it may require Face ID."
            : "Cards are stored as tokens by Paystack — Emilgo never sees the number."
        }
      >
        <IOSListRow
          symbol="creditcard.fill"
          label="Payment Methods"
          detail="Saved cards for scan-and-pay"
          accessory={{ type: "disclosure" }}
          onPress={() => {
            haptics.tap();
            router.push("/checkout" as never);
          }}
          {...flash("payment-methods")}
        />
        {isDriver && (
          <IOSListRow
            symbol="banknote.fill"
            label="Payout Account"
            detail="Where your earnings are sent"
            accessory={{ type: "disclosure" }}
            onPress={openPayout}
            {...flash("payout")}
          />
        )}
      </IOSListSection>

      <IOSListSection>
        <IOSListRow
          symbol="rectangle.portrait.and.arrow.right"
          label="Sign Out"
          destructive
          onPress={confirmSignOut}
          {...flash("signout")}
        />
      </IOSListSection>

      <IOSListSection footer="Deleting your account removes your trips, credits and saved routes. It cannot be undone.">
        <IOSListRow
          symbol="trash.fill"
          label="Delete Account"
          destructive
          onPress={confirmDelete}
          {...flash("delete-account")}
        />
      </IOSListSection>
    </IOSScreen>
  );
}
