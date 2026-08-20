// components/feed/PostPoll.tsx
//
// A poll attached to a post.
//
// Before voting: tappable options, no percentages — showing the running result
// first biases the vote, which is why every platform hides it.
// After voting, or once closed: bars with percentages and the viewer's pick
// marked.
//
// The bar is a plain width transition rather than a Reanimated layout animation:
// a poll can appear four times on one screen and each extra animated node costs
// a shared value plus a UI-thread subscription for a 300ms effect nobody asked
// for.

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useIOSTheme, IOSAppFont } from "@/components/ios/theme";
import type { PostPoll as Poll } from "@/src/services/feed";

function remaining(endsAt?: string | null) {
  const ms = endsAt ? new Date(endsAt).getTime() - Date.now() : 0;
  if (!endsAt || Number.isNaN(ms) || ms <= 0) return "Final results";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)}d left`;
  if (h >= 1) return `${h}h left`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m left`;
}

export interface PostPollProps {
  poll: Poll;
  onVote: (choice: number) => void;
}

function PostPollInner({ poll, onVote }: PostPollProps) {
  const t = useIOSTheme();
  const [busy, setBusy] = React.useState(false);

  // Defensive, and deliberately so. `src/services/feed.ts` normalises polls, but
  // a poll arrives inside a list of dozens of posts and one malformed row must
  // not be able to unmount the feed. This component previously trusted
  // `poll.votes` to exist, and `Math.max(...undefined)` threw "Cannot convert
  // undefined value to object" — a whole-screen crash caused by one bad row.
  const options = Array.isArray(poll?.options) ? poll.options : [];
  const votes = React.useMemo(
    () => options.map((_, i) => Number(poll?.votes?.[i] ?? 0)),
    [options, poll?.votes],
  );
  const max = votes.length ? Math.max(...votes) : 0;

  const voted = poll?.my_choice != null;
  const revealed = voted || !!poll?.closed;
  const total = poll?.total ?? votes.reduce((a, b) => a + b, 0);

  const vote = async (i: number) => {
    if (revealed || busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await onVote(i);
    } finally {
      setBusy(false);
    }
  };

  if (options.length < 2) return null;

  return (
    <View style={styles.wrap}>
      {options.map((label, i) => {
        const n = votes[i] ?? 0;
        const pct = total > 0 ? Math.round((n / total) * 100) : 0;
        const mine = poll?.my_choice === i;
        // The winning option only reads as the winner once results are shown.
        const leading = revealed && n > 0 && n === max;

        if (!revealed) {
          return (
            <Pressable
              key={i}
              onPress={() => vote(i)}
              disabled={busy}
              style={[styles.choice, { borderColor: t.tint }]}
            >
              <Text style={[styles.choiceText, { color: t.tint }]} numberOfLines={2}>
                {label}
              </Text>
            </Pressable>
          );
        }

        return (
          <View key={i} style={[styles.result, { backgroundColor: t.tertiarySystemFill }]}>
            <View
              style={[
                styles.resultFill,
                {
                  width: `${pct}%`,
                  backgroundColor: leading ? t.tint + "38" : t.systemFill,
                },
              ]}
            />
            <View style={styles.resultRow}>
              <Text
                style={[
                  styles.resultLabel,
                  { color: t.label, fontFamily: leading ? "Poppins_600SemiBold" : "Poppins_400Regular" },
                ]}
                numberOfLines={2}
              >
                {label}
              </Text>
              {mine ? (
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  size={15}
                  color={t.tint}
                  strokeWidth={2}
                />
              ) : null}
              <Text style={[styles.resultPct, { color: t.secondaryLabel }]}>{pct}%</Text>
            </View>
          </View>
        );
      })}

      <Text style={[styles.meta, { color: t.tertiaryLabel }]}>
        {total.toLocaleString()} {total === 1 ? "vote" : "votes"} · {remaining(poll?.ends_at)}
      </Text>
    </View>
  );
}

export const PostPoll = React.memo(PostPollInner);

const styles = StyleSheet.create({
  wrap: { marginTop: 10, gap: 7 },
  choice: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  choiceText: { ...IOSAppFont.subheadline, fontFamily: "Poppins_500Medium" },
  result: { borderRadius: 8, overflow: "hidden", justifyContent: "center" },
  resultFill: { position: "absolute", left: 0, top: 0, bottom: 0 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  resultLabel: { ...IOSAppFont.subheadline, flex: 1 },
  resultPct: { ...IOSAppFont.footnote, fontVariant: ["tabular-nums"] },
  meta: { ...IOSAppFont.caption1, marginTop: 2 },
});
