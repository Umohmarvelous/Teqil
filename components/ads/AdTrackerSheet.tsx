// components/ads/AdTrackerSheet.tsx
//
// "How many more ads, and for what" — the tracker the user opens to check
// where they stand.
//
// ── Structure, from the TeraBox reference ──────────────────────────────────
// Title, subtitle, then one ROW PER GOAL: what it takes on the left, a progress
// bar under it, and what it pays on the right. Then the primary action carrying
// its own count — "Watch ads (2/5)" — and below the fold a numbered explainer
// of the actual rules.
//
// That explainer is the part most reward screens skip and the part that matters
// most. TeraBox's version lists exactly which ad slots go away. Ours lists what
// is really being tracked: the day boundary, what forfeits a reward, the daily
// ceiling, and how the streak survives a missed day. Every number in it comes
// from the server config rather than being typed into the copy, so it cannot
// drift from what the database actually does.

import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { FuelStationIcon, Fire02Icon, Tick02Icon } from "@hugeicons/core-free-icons";

import { IOSSheet, IOSButton, useIOSTheme, IOSAppFont } from "@/components/ios";
import { formatNaira, formatClock, type AdDashboard } from "@/src/services/ads";

export interface AdTrackerSheetProps {
  visible: boolean;
  onClose: () => void;
  dashboard: AdDashboard;
  /** Seconds until another ad may start; 0 when ready. */
  cooldown: number;
  onWatch: () => void;
}

export function AdTrackerSheet({
  visible,
  onClose,
  dashboard: d,
  cooldown,
  onWatch,
}: AdTrackerSheetProps) {
  const t = useIOSTheme();

  const blocked = d.remaining_today <= 0;
  const waiting = cooldown > 0;

  const label = blocked
    ? "Daily limit reached"
    : waiting
      ? `Next ad in ${formatClock(cooldown)}`
      : `Watch ads (${d.watched_today}/${d.daily_quota})`;

  return (
    <IOSSheet
      visible={visible}
      onClose={onClose}
      detents={["medium", "large"]}
      title="Daily rewards"
    >
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={[styles.blurb, { color: t.secondaryLabel }]}>
          Watch ads to top up your fuel pool. Your pool pays half of every fare.
        </Text>

        {/* ── One row per goal ──────────────────────────────────────────── */}
        <View style={styles.goals}>
          {d.milestones.map((m) => (
            <GoalRow
              key={m.at}
              need={m.at}
              have={d.watched_today}
              naira={m.naira}
              label={m.label}
              reached={m.reached}
            />
          ))}
        </View>

        <IOSButton
          title={label}
          variant="filled"
          size="large"
          fullWidth
          disabled={blocked || waiting}
          onPress={onWatch}
          style={styles.cta}
        />

        {/* ── Streak strip ──────────────────────────────────────────────── */}
        <View style={[styles.streak, { backgroundColor: t.secondarySystemFill }]}>
          <HugeiconsIcon icon={Fire02Icon} size={18} color={t.systemOrange} strokeWidth={2} />
          <View style={styles.streakText}>
            <Text style={[styles.streakTitle, { color: t.label }]}>
              {d.current_streak} day{d.current_streak === 1 ? "" : "s"} in a row
            </Text>
            <Text style={[styles.streakSub, { color: t.tertiaryLabel }]}>
              {d.quota_met
                ? "Today is counted. Come back tomorrow to keep it."
                : `Watch ${Math.max(0, d.daily_quota - d.watched_today)} more today to keep it going.`}
            </Text>
          </View>
          {d.quota_met ? (
            <HugeiconsIcon icon={Tick02Icon} size={18} color={t.tint} strokeWidth={2.5} />
          ) : null}
        </View>

        {/* ── The rules, with the server's own numbers in them ──────────── */}
        <View style={styles.rulesHead}>
          <View style={[styles.rule, { backgroundColor: t.separator }]} />
          <Text style={[styles.rulesTitle, { color: t.secondaryLabel }]}>How this works</Text>
          <View style={[styles.rule, { backgroundColor: t.separator }]} />
        </View>

        <View style={styles.notes}>
          <Note n={1}>
            Each finished ad pays {formatNaira(d.reward_rewarded)} into your fuel pool. Hitting a
            goal above pays its amount on top.
          </Note>
          <Note n={2}>
            An ad only counts if you watch it to the end. Closing it early earns nothing — you will
            be warned before it happens.
          </Note>
          <Note n={3}>
            You can watch up to {d.max_ads_per_day} ads a day. You have {d.remaining_today} left
            today.
          </Note>
          <Note n={4}>
            There is a {d.cooldown_seconds}-second wait between ads.
          </Note>
          <Note n={5}>
            Watching {d.daily_quota} ads counts the day towards your streak. Streaks pay a bonus at{" "}
            {Object.keys(d.streak_milestones)
              .map(Number)
              .sort((a, b) => a - b)
              .join(", ")}{" "}
            days.
          </Note>
          <Note n={6}>
            Miss a day and your streak normally resets — but you have {d.freezes_left} streak
            {d.freezes_left === 1 ? " freeze" : " freezes"} left this month, which forgive one
            missed day each.
          </Note>
          <Note n={7}>
            The day resets at midnight Lagos time. Goals and the daily limit start again then.
          </Note>
          <Note n={8}>
            Rewards go to your fuel pool, not your bank. The pool covers half of each fare you pay
            with the QR code.
          </Note>
        </View>

        <View style={[styles.totals, { borderTopColor: t.separator }]}>
          <Total label="Earned today" value={formatNaira(d.earned_today)} />
          <Total label="Ads watched" value={String(d.total_watched)} />
          <Total label="Earned all time" value={formatNaira(d.total_earned)} />
        </View>
      </ScrollView>
    </IOSSheet>
  );
}

function GoalRow({
  need,
  have,
  naira,
  label,
  reached,
}: {
  need: number;
  have: number;
  naira: number;
  label: string;
  reached: boolean;
}) {
  const t = useIOSTheme();
  const fraction = Math.min(1, have / need);

  const w = useSharedValue(0);
  React.useEffect(() => {
    w.value = withTiming(fraction, { duration: 480, easing: Easing.out(Easing.cubic) });
  }, [fraction, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));

  return (
    <View style={styles.goal}>
      <View style={styles.goalMain}>
        <Text style={[styles.goalTitle, { color: t.label }]}>
          Watch {need} {need === 1 ? "ad" : "ads"}
          <Text style={[styles.goalLabel, { color: t.tertiaryLabel }]}>  ·  {label}</Text>
        </Text>
        <View style={[styles.bar, { backgroundColor: t.tertiarySystemFill }]}>
          <Animated.View
            style={[styles.barFill, { backgroundColor: reached ? t.tint : t.tint + "CC" }, fill]}
          />
        </View>
      </View>

      <View style={styles.goalReward}>
        <HugeiconsIcon
          icon={reached ? Tick02Icon : FuelStationIcon}
          size={17}
          color={reached ? t.tint : t.secondaryLabel}
          strokeWidth={2}
        />
        <Text style={[styles.goalNaira, { color: reached ? t.tint : t.label }]}>
          {formatNaira(naira)}
        </Text>
      </View>
    </View>
  );
}

function Note({ n, children }: { n: number; children: React.ReactNode }) {
  const t = useIOSTheme();
  return (
    <View style={styles.note}>
      <Text style={[styles.noteN, { color: t.tertiaryLabel }]}>{n}.</Text>
      <Text style={[styles.noteText, { color: t.secondaryLabel }]}>{children}</Text>
    </View>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  const t = useIOSTheme();
  return (
    <View style={styles.total}>
      <Text style={[styles.totalValue, { color: t.label }]}>{value}</Text>
      <Text style={[styles.totalLabel, { color: t.tertiaryLabel }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 40, gap: 18 },
  blurb: { ...IOSAppFont.footnote, lineHeight: 19 },

  goals: { gap: 18 },
  goal: { flexDirection: "row", alignItems: "center", gap: 14 },
  goalMain: { flex: 1, gap: 8 },
  goalTitle: { ...IOSAppFont.subheadline, fontFamily: "Poppins_600SemiBold" },
  goalLabel: { ...IOSAppFont.caption1 },
  bar: { height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  goalReward: { alignItems: "center", width: 62, gap: 2 },
  goalNaira: { ...IOSAppFont.caption1, fontFamily: "Poppins_600SemiBold" },

  cta: { marginTop: 4 },

  streak: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14 },
  streakText: { flex: 1, gap: 2 },
  streakTitle: { ...IOSAppFont.subheadline, fontFamily: "Poppins_600SemiBold" },
  streakSub: { ...IOSAppFont.caption1, lineHeight: 16 },

  rulesHead: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  rulesTitle: { ...IOSAppFont.footnote, fontFamily: "Poppins_600SemiBold" },

  notes: { gap: 10 },
  note: { flexDirection: "row", gap: 8 },
  noteN: { ...IOSAppFont.caption1, width: 16 },
  noteText: { ...IOSAppFont.caption1, flex: 1, lineHeight: 18 },

  totals: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    marginTop: 4,
  },
  total: { alignItems: "center", flex: 1, gap: 2 },
  totalValue: { ...IOSAppFont.headline },
  totalLabel: { ...IOSAppFont.caption2, textAlign: "center" },
});
