// app/settings/ads.tsx
//
// Everything the user controls about ads and the rewards they pay.
//
// ── The honesty rule this screen follows ────────────────────────────────────
// Turning personalisation off does NOT reduce the number of ads, and this
// screen says so in the footer rather than letting people discover it. A
// settings screen that implies a privacy control is also a volume control is
// lying by omission, and it is the reason nobody trusts these toggles.
//
// The muted-category list is built from live inventory (`list_ad_categories`),
// so it only ever offers categories that actually exist. A muting screen listing
// categories nobody advertises in is decoration.

import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import {
  IOSScreen,
  IOSListSection,
  IOSListRow,
  useIOSTheme,
  IOSAppFont,
  iosAlert,
} from "@/components/ios";
import { haptics } from "@/src/utils/haptics";
import { useHighlight } from "@/src/hooks/useHighlight";
import { useAdsStore } from "@/src/store/useAdsStore";
import { listAdCategories, formatReward } from "@/src/services/ads";
import { amIAdmin } from "@/src/services/adAdmin";

const HOURS = [7, 9, 12, 15, 18, 19, 21];

export default function AdSettings() {
  // Cheap and cached by the server; the row simply does not render until it
  // answers, which is the right default for a privileged entry point.
  const [isAdmin, setIsAdmin] = React.useState(false);
  React.useEffect(() => {
    amIAdmin().then(setIsAdmin);
  }, []);

  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const flash = useHighlight(highlight);
  const t = useIOSTheme();

  const prefs = useAdsStore((s) => s.prefs);
  const dashboard = useAdsStore((s) => s.dashboard);
  const loadPrefs = useAdsStore((s) => s.loadPrefs);
  const refresh = useAdsStore((s) => s.refresh);
  const updatePrefs = useAdsStore((s) => s.updatePrefs);

  const [categories, setCategories] = React.useState<{ category: string; n: number }[]>([]);

  React.useEffect(() => {
    loadPrefs();
    refresh();
    listAdCategories().then(setCategories);
  }, [loadPrefs, refresh]);

  const set = (patch: Parameters<typeof updatePrefs>[0]) => {
    haptics.tap();
    updatePrefs(patch).catch((e: any) =>
      iosAlert("Could not save", e?.message ?? "Please try again."),
    );
  };

  if (!prefs) {
    return (
      <IOSScreen title="Ads & Rewards" back>
        <ActivityIndicator color={t.tint} style={{ marginTop: 40 }} />
      </IOSScreen>
    );
  }

  const muted = new Set(prefs.muted_categories);

  const toggleCategory = (c: string) => {
    haptics.tap();
    const next = muted.has(c)
      ? prefs.muted_categories.filter((x) => x !== c)
      : [...prefs.muted_categories, c];
    set({ muted_categories: next });
  };

  return (
    <IOSScreen title="Ads & Rewards" back>
      {/* ── What you're earning ───────────────────────────────────────────── */}
      <IOSListSection
        header="Your rewards"
        footer={`Each finished ad pays ${formatReward(
          dashboard.reward_rewarded,
        )} into your fuel pool. Your pool covers half of every fare you pay with the QR code.`}
      >
        <IOSListRow
          symbol="fuelpump.fill"
          label="Rewards centre"
          detail={`${dashboard.current_streak}-day streak · ${formatReward(
            dashboard.total_earned,
          )} earned`}
          accessory={{ type: "disclosure" }}
          onPress={() => router.push("/rewards" as never)}
          {...flash("ad-rewards")}
        />

        {/* Only administrators see this. The route re-checks, and every RPC
            behind it re-checks in the database, so hiding the row is a
            courtesy rather than the security boundary. */}
        {isAdmin ? (
          <IOSListRow
            symbol="megaphone.fill"
            label="Ad console"
            detail="Manage partners and creatives"
            accessory={{ type: "disclosure" }}
            onPress={() => router.push("/admin/ads" as never)}
          />
        ) : null}
      </IOSListSection>

      {/* ── Playback ──────────────────────────────────────────────────────── */}
      <IOSListSection
        header="Playback"
        footer="Video ads over mobile data use your airtime. With this on, video only plays on Wi-Fi — you can still earn from other ad formats anywhere."
      >
        <IOSListRow
          symbol="speaker.wave.2.fill"
          label="Sound on by default"
          detail="Start ads unmuted"
          accessory={{
            type: "switch",
            value: prefs.sound_on,
            onValueChange: (v) => set({ sound_on: v }),
          }}
          {...flash("ad-sound")}
        />
        <IOSListRow
          symbol="wifi"
          label="Video on Wi-Fi only"
          accessory={{
            type: "switch",
            value: prefs.wifi_only_video,
            onValueChange: (v) => set({ wifi_only_video: v }),
          }}
          {...flash("ad-wifi")}
        />
        <IOSListRow
          symbol="forward.fill"
          label="Autoplay the next ad"
          detail="Go straight into another after each reward"
          accessory={{
            type: "switch",
            value: prefs.autoplay_next,
            onValueChange: (v) => set({ autoplay_next: v }),
          }}
          {...flash("ad-autoplay")}
        />
      </IOSListSection>

      {/* ── Reminder ──────────────────────────────────────────────────────── */}
      <IOSListSection
        header="Streak reminder"
        footer="A single reminder on days you have not yet hit your goal. Nothing is sent once the day is cleared."
      >
        <IOSListRow
          symbol="bell.fill"
          label="Remind me to keep my streak"
          accessory={{
            type: "switch",
            value: prefs.reminder_enabled,
            onValueChange: (v) => set({ reminder_enabled: v }),
          }}
          {...flash("ad-reminder")}
        />
        {prefs.reminder_enabled ? (
          <View style={styles.hours}>
            {HOURS.map((h) => {
              const on = prefs.reminder_hour === h;
              return (
                <Pressable
                  key={h}
                  onPress={() => set({ reminder_hour: h })}
                  style={[
                    styles.hour,
                    on
                      ? { backgroundColor: t.tint, borderColor: t.tint }
                      : { borderColor: t.separator },
                  ]}
                >
                  <Text style={[styles.hourText, { color: on ? "#fff" : t.label }]}>
                    {h > 12 ? `${h - 12}pm` : h === 12 ? "12pm" : `${h}am`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </IOSListSection>

      {/* ── Privacy ───────────────────────────────────────────────────────── */}
      <IOSListSection
        header="Privacy"
        footer="Turning this off does NOT mean fewer ads — you will see the same number, just chosen at random rather than matched to you. Your rewards are unaffected either way."
      >
        <IOSListRow
          symbol="person.crop.circle.badge.questionmark"
          label="Personalised ads"
          detail="Use your role and routes to pick ads"
          accessory={{
            type: "switch",
            value: prefs.personalised,
            onValueChange: (v) => set({ personalised: v }),
          }}
          {...flash("ad-personalised")}
        />
      </IOSListSection>

      {/* ── Categories ────────────────────────────────────────────────────── */}
      {categories.length ? (
        <IOSListSection
          header="Hide categories"
          footer="Muted categories never appear, on the rewards screen or in your feed. You can still reach your daily goal from the categories left on."
        >
          <View style={styles.cats}>
            {categories.map((c) => {
              const off = muted.has(c.category);
              return (
                <Pressable
                  key={c.category}
                  onPress={() => toggleCategory(c.category)}
                  style={[
                    styles.cat,
                    off
                      ? { backgroundColor: t.systemRed + "1A", borderColor: t.systemRed + "55" }
                      : { borderColor: t.separator },
                  ]}
                >
                  <Text
                    style={[
                      styles.catText,
                      { color: off ? t.systemRed : t.label },
                      off && styles.catTextOff,
                    ]}
                  >
                    {c.category}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </IOSListSection>
      ) : null}

      {/* ── The rules, restated where someone looking for them would look ── */}
      <IOSListSection header="How rewards work">
        <View style={styles.rules}>
          <Rule>
            You can watch up to {dashboard.max_ads_per_day} ads a day, with a{" "}
            {dashboard.cooldown_seconds}-second gap between them.
          </Rule>
          <Rule>
            An ad must be watched to the end to pay. You are warned before closing one early.
          </Rule>
          <Rule>
            Watching {dashboard.daily_quota} ads counts the day towards your streak. The day resets
            at midnight Lagos time.
          </Rule>
          <Rule>
            You have {dashboard.freezes_left} streak freeze
            {dashboard.freezes_left === 1 ? "" : "s"} left this month. Each forgives one missed day.
          </Rule>
          <Rule>
            Rewards are paid into your fuel pool, not to a bank account, and are spent on fares.
          </Rule>
        </View>
      </IOSListSection>
    </IOSScreen>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  const t = useIOSTheme();
  return (
    <View style={styles.rule}>
      <View style={[styles.bullet, { backgroundColor: t.tertiaryLabel }]} />
      <Text style={[styles.ruleText, { color: t.secondaryLabel }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hours: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 14 },
  hour: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  hourText: { ...IOSAppFont.caption1, fontFamily: "Poppins_500Medium" },

  cats: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 14 },
  cat: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  catText: { ...IOSAppFont.caption1, fontFamily: "Poppins_500Medium", textTransform: "capitalize" },
  catTextOff: { textDecorationLine: "line-through" },

  rules: { padding: 14, gap: 10 },
  rule: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  bullet: { width: 4, height: 4, borderRadius: 2, marginTop: 7 },
  ruleText: { ...IOSAppFont.caption1, flex: 1, lineHeight: 18 },
});
