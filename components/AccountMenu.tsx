// components/AccountMenu.tsx
//
// The avatar menu: who you are, who else you're signed in as, and the account
// actions — the control every app puts behind the profile picture.
//
// It exists once and is used from the home header, the messages header and the
// profile header, because three copies of "sign out" is three chances for one
// of them to forget to clear something.
//
// ── Switching accounts ───────────────────────────────────────────────────────
// Backed by `src/services/accounts.ts`, which keeps a refresh token per account
// in the Keychain. Switching replaces the Supabase session, which fires
// `onAuthStateChange` in the root layout and re-drives the auth store — so this
// component doesn't have to reach into state itself.
//
// A stored session can be revoked server-side at any time. That path is handled
// explicitly: the entry is dropped and the user is sent to a normal sign-in with
// an explanation, rather than the menu appearing to do nothing.

import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { router } from "expo-router";

import { IOSMenu, iosAlert, type IOSMenuItem } from "@/components/ios";
import Avatar from "@/components/Avatar";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import {
  listAccounts,
  switchAccount,
  type AccountSummary,
} from "@/src/services/accounts";
import { haptics } from "@/src/utils/haptics";

export interface AccountMenuProps {
  /** The control the menu hangs off — usually an avatar or a person glyph. */
  anchor: React.ReactElement;
}

export function AccountMenu({ anchor }: AccountMenuProps) {
  const user = useAuthStore((s) => s.user);
  const themePreference = useSettingsStore((s) => s.themePreference);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const [others, setOthers] = useState<AccountSummary[]>([]);

  // Re-read on every mount: an account may have been added or invalidated since
  // this header last rendered.
  useEffect(() => {
    let cancelled = false;
    listAccounts()
      .then((all) => {
        if (!cancelled) setOthers(all.filter((a) => a.id !== user?.id));
      })
      .catch(() => {
        if (!cancelled) setOthers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const doSwitch = useCallback(async (account: AccountSummary) => {
    haptics.tap();
    const result = await switchAccount(account.id);

    if (result.ok) {
      haptics.success();
      router.replace("/(main)" as never);
      return;
    }

    iosAlert("Can't switch account", result.message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign in",
        onPress: () => router.push("/(auth)/login" as never),
      },
    ]);
  }, []);

  const addAccount = useCallback(() => {
    haptics.tap();
    // The current session stays live until the new sign-in completes, so
    // abandoning this flow leaves the user exactly where they were.
    router.push("/(auth)/login?add=1" as never);
  }, []);

  const signOut = useCallback(() => {
    iosAlert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          const { signOut: supabaseSignOut } = await import("@/src/services/supabase");
          const { logout } = useAuthStore.getState();
          await supabaseSignOut();
          logout();
          router.replace("/(auth)/login" as never);
        },
      },
    ]);
  }, []);

  const items: IOSMenuItem[] = [
    ...others.map<IOSMenuItem>((account) => ({
      label: account.full_name || account.email,
      symbol: "person.crop.circle",
      onPress: () => doSwitch(account),
    })),
    {
      label: "Add an account",
      symbol: "person.badge.plus",
      onPress: addAccount,
      startsNewSection: others.length > 0,
    },
    {
      label: "My Profile",
      symbol: "person.text.rectangle",
      onPress: () => router.push("/(main)" as never),
      startsNewSection: true,
    },
    {
      label: "Account Settings",
      symbol: "gearshape",
      onPress: () => router.push("/settings/account" as never),
    },
    {
      label: "Dark Mode",
      symbol: "moon",
      // Toggling here is an explicit choice, so it takes the app off "follow
      // the system" — the same rule the Appearance screen uses.
      toggle: {
        value: theme === "dark",
        onValueChange: (v) => setTheme(v ? "dark" : "light"),
      },
    },
    ...(themePreference !== "system"
      ? [
          {
            label: "Use System Appearance",
            symbol: "circle.lefthalf.filled" as const,
            onPress: () => setTheme("system"),
          },
        ]
      : []),
    {
      label: "Help & Support",
      symbol: "questionmark.circle",
      onPress: () => router.push("/settings/about" as never),
      startsNewSection: true,
    },
    {
      label: "Sign Out",
      symbol: "rectangle.portrait.and.arrow.right",
      destructive: true,
      onPress: signOut,
      startsNewSection: true,
    },
  ];

  return <IOSMenu anchor={anchor} items={items} />;
}

/**
 * The avatar as it appears in a header, ready to be passed as the menu anchor.
 *
 * Kept here so all three headers show the same thing — a header that rendered
 * its own would drift the moment one of them changed size.
 */
export function AccountMenuAvatar({ size = 26 }: { size?: number }) {
  const user = useAuthStore((s) => s.user);
  return (
    <View style={styles.avatarWrap}>
      <Avatar name={user?.full_name || "U"} photoUri={user?.profile_photo} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  avatarWrap: { alignItems: "center", justifyContent: "center" },
});

export default AccountMenu;
