// app/settings/appearance.tsx
//
// Theme, language and what your profile shows publicly.

import React from "react";
import { useLocalSearchParams } from "expo-router";

import { IOSScreen, IOSListSection, IOSListRow } from "@/components/ios";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useAuthStore } from "@/src/store/useStore";
import { haptics } from "@/src/utils/haptics";
import { useHighlight } from "@/src/hooks/useHighlight";

export default function AppearanceSettings() {
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const flash = useHighlight(highlight);

  // `theme` is the scheme in force, `themePreference` is what was chosen. The
  // Dark Mode switch shows the former (so it's right under "Use System
  // Setting"), and writes the latter.
  const theme = useSettingsStore((s) => s.theme);
  const themePreference = useSettingsStore((s) => s.themePreference);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const showTierBadge = useSettingsStore((s) => s.showTierBadge);
  const setShowTierBadge = useSettingsStore((s) => s.setShowTierBadge);

  const language = useAuthStore((s) => s.language);
  const setLanguage = useAuthStore((s) => s.setLanguage);

  const isDark = theme === "dark";
  const followingSystem = themePreference === "system";

  return (
    <IOSScreen title="Appearance" back>
      <IOSListSection
        header="Theme"
        footer="Emilgo follows your system appearance until you set this."
      >
        <IOSListRow
          symbol="moon.fill"
          label="Dark Mode"
          // Setting it explicitly is a decision, so it takes the app off
          // "follow the system" — the same thing iOS does in Display settings.
          detail={followingSystem ? "Following your system appearance" : undefined}
          accessory={{
            type: "switch",
            value: isDark,
            onValueChange: (v) => {
              haptics.tap();
              setTheme(v ? "dark" : "light");
            },
          }}
          {...flash("theme")}
        />
        <IOSListRow
          symbol="circle.lefthalf.filled"
          label="Use System Setting"
          accessory={{
            type: "switch",
            value: followingSystem,
            // Turning it off pins whatever is on screen right now, so the
            // appearance never jumps as a side effect of this switch.
            onValueChange: (v) => {
              haptics.tap();
              setTheme(v ? "system" : isDark ? "dark" : "light");
            },
          }}
        />
      </IOSListSection>

      <IOSListSection header="Language">
        <IOSListRow
          symbol="globe"
          label="Language"
          accessory={{ type: "detail", text: language === "pid" ? "Nigerian Pidgin" : "English" }}
          onPress={() => {
            haptics.tap();
            setLanguage(language === "en" ? "pid" : "en");
          }}
          {...flash("language")}
        />
      </IOSListSection>

      <IOSListSection
        header="Profile"
        footer="Your credit tier is Bronze, Silver or Gold based on completed trips. Turning this off hides it from other users; it doesn't change the tier itself."
      >
        <IOSListRow
          symbol="rosette"
          label="Show Credit Tier Badge"
          accessory={{
            type: "switch",
            value: showTierBadge,
            onValueChange: (v) => {
              haptics.tap();
              setShowTierBadge(v);
            },
          }}
          {...flash("tier-badge")}
        />
      </IOSListSection>
    </IOSScreen>
  );
}
