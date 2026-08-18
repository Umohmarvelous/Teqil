// app/(auth)/provisioning.tsx
//
// The screen between "Create account" and the app.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// Signing up does more than create an auth row. A profile row has to exist, a
// username has to be reserved, the sign-up credits have to land, the fuel pool
// has to open, ad preferences have to be defaulted and the first sync has to
// run. Some of that is a trigger, some of it is a round trip, and on a bad
// Nigerian connection the whole sequence can take fifteen seconds.
//
// Without this screen the user lands on a home screen with no name, no balance
// and no avatar, watches it populate piecemeal, and reasonably concludes the
// app is broken. Twitter, Instagram and every bank app in Nigeria show a
// setup screen for exactly this reason.
//
// ── These are REAL steps, not a fake progress bar ───────────────────────────
// Each step below actually runs and can actually fail. The bar advances when a
// step resolves, not on a timer, so a slow step visibly takes longer — which is
// the honest thing to show, and also the only version that is any use when
// something genuinely goes wrong.
//
// A failed step is not fatal. Everything here except the profile row is a
// convenience that the app re-attempts later, so a failure marks that row and
// the user still gets in. Blocking a new account at the door because a
// preference row did not default would be absurd.

import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  interpolate,
  cancelAnimation,
} from "react-native-reanimated";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  Tick02Icon,
  Alert02Icon,
  UserIcon,
  Coins01Icon,
  FuelStationIcon,
  Megaphone01Icon,
  CloudIcon,
} from "@hugeicons/core-free-icons";

import { Glass, useIOSTheme, IOSAppFont } from "@/components/ios";
import { supabase } from "@/src/services/supabase";
import { useAuthStore } from "@/src/store/useStore";
import { useCreditsStore } from "@/src/store/useCreditsStore";
import { usePoolStore } from "@/src/store/usePoolStore";
import { getAdPreferences } from "@/src/services/ads";
import { triggerSyncNow } from "@/src/services/sync";

type StepState = "waiting" | "running" | "done" | "failed";

interface Step {
  key: string;
  label: string;
  /** What the row says while it runs — present tense, specific. */
  running: string;
  icon: any;
  run: (userId: string) => Promise<void>;
}

/**
 * The sequence, in the order it must happen. Each returns normally on success
 * and throws on failure; the runner catches and marks the row.
 */
const STEPS: Step[] = [
  {
    key: "profile",
    label: "Your profile",
    running: "Creating your profile",
    icon: UserIcon,
    // The signup trigger writes public.users. Poll for it rather than assuming:
    // the trigger is fast but it is not synchronous with the auth insert, and
    // every later step reads this row.
    run: async (userId) => {
      for (let attempt = 0; attempt < 12; attempt++) {
        const { data } = await supabase
          .from("users")
          .select("id")
          .eq("id", userId)
          .maybeSingle();
        if (data?.id) return;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error("profile row never appeared");
    },
  },
  {
    key: "credits",
    label: "Welcome bonus",
    running: "Adding your sign-up credits",
    icon: Coins01Icon,
    run: async (userId) => {
      // addCredit dedupes on its own key, so arriving here twice — a retry, a
      // reinstall — cannot pay the bonus twice.
      await useCreditsStore.getState().addCredit("signup", 10, userId);
    },
  },
  {
    key: "pool",
    label: "Fuel pool",
    running: "Opening your fuel pool",
    icon: FuelStationIcon,
    run: async (userId) => {
      await usePoolStore.getState().pullPool(userId);
    },
  },
  {
    key: "ads",
    label: "Reward settings",
    running: "Setting your reward preferences",
    icon: Megaphone01Icon,
    // Creates the ad_preferences row with its defaults, so the first visit to
    // the Rewards screen is not the thing that has to create it.
    run: async () => {
      await getAdPreferences();
    },
  },
  {
    key: "sync",
    label: "Sync",
    running: "Syncing your account",
    icon: CloudIcon,
    run: async () => {
      await triggerSyncNow();
    },
  },
];

export default function ProvisioningScreen() {
  const t = useIOSTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  const [states, setStates] = React.useState<Record<string, StepState>>(
    () => Object.fromEntries(STEPS.map((s) => [s.key, "waiting"])),
  );
  const [failed, setFailed] = React.useState<string[]>([]);
  const [finished, setFinished] = React.useState(false);

  const done = STEPS.filter((s) => states[s.key] === "done" || states[s.key] === "failed").length;
  const progress = done / STEPS.length;

  const running = STEPS.find((s) => states[s.key] === "running");

  // ── Run the sequence ──────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!user?.id) return;
    let alive = true;

    (async () => {
      const bad: string[] = [];
      for (const step of STEPS) {
        if (!alive) return;
        setStates((s) => ({ ...s, [step.key]: "running" }));
        try {
          await step.run(user.id);
          if (!alive) return;
          setStates((s) => ({ ...s, [step.key]: "done" }));
          Haptics.selectionAsync();
        } catch (e: any) {
          console.warn(`[provisioning] ${step.key}:`, e?.message ?? e);
          if (!alive) return;
          bad.push(step.key);
          setStates((s) => ({ ...s, [step.key]: "failed" }));
        }
      }
      if (!alive) return;
      setFailed(bad);
      setFinished(true);
      Haptics.notificationAsync(
        bad.length
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success,
      );
    })();

    return () => {
      alive = false;
    };
  }, [user?.id]);

  // ── Leave once everything has settled ─────────────────────────────────────
  React.useEffect(() => {
    if (!finished) return;
    // A short beat so the last tick is actually seen. Any longer and it becomes
    // a fake loading screen, which is the thing this is not.
    const h = setTimeout(() => {
      const next = user?.role === "driver" ? "/(auth)/driver-profile" : "/(main)";
      router.replace(next as never);
    }, 900);
    return () => clearTimeout(h);
  }, [finished, user?.role]);

  return (
    <View style={[styles.root, { backgroundColor: t.systemBackground }]}>
      <View style={[styles.body, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 }]}>
        <PulsingMark tint={t.tint} finished={finished} failedCount={failed.length} />

        <Text style={[styles.title, { color: t.label }]}>
          {finished ? "You're all set" : "Setting up your account"}
        </Text>
        <Text style={[styles.blurb, { color: t.secondaryLabel }]}>
          {finished
            ? failed.length
              ? "A couple of things will finish in the background. You can start using Emilgo now."
              : "Everything is ready. Taking you in…"
            : running
              ? `${running.running}…`
              : "This takes a few seconds. Please hold on."}
        </Text>

        {/* ── The metric row ────────────────────────────────────────────────
            A percentage AND a count. The percentage reads at a glance; the
            count is what tells someone on a slow connection that it is moving
            at all. */}
        <View style={styles.metrics}>
          <Text style={[styles.percent, { color: t.tint }]}>{Math.round(progress * 100)}%</Text>
          <Text style={[styles.metricSub, { color: t.tertiaryLabel }]}>
            {done} of {STEPS.length} steps
          </Text>
        </View>

        <ProgressTrack progress={progress} tint={t.tint} track={t.tertiarySystemFill} />

        <View style={styles.steps}>
          {STEPS.map((step) => (
            <StepRow key={step.key} step={step} state={states[step.key]} />
          ))}
        </View>
      </View>

      {/* An escape hatch. Nothing here is required to use the app, and a user
          stuck behind a hung step must never be trapped on a spinner. */}
      {!finished && (
        <Pressable
          style={[styles.skip, { bottom: insets.bottom + 20 }]}
          onPress={() => router.replace("/(main)" as never)}
          hitSlop={12}
        >
          <Text style={[styles.skipText, { color: t.tertiaryLabel }]}>Skip for now</Text>
        </Pressable>
      )}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════

/**
 * The mark at the top. Breathes while working, settles when done.
 *
 * Scale and rotation only — never opacity. The ring is glass, and animating
 * alpha on a GlassView or any ancestor renders the effect wrong (expo/expo
 * #41024). The colour change on completion is on the CONTENT above the glass,
 * which is fine.
 */
function PulsingMark({
  tint,
  finished,
  failedCount,
}: {
  tint: string;
  finished: boolean;
  failedCount: number;
}) {
  const t = useIOSTheme();
  const pulse = useSharedValue(0);

  React.useEffect(() => {
    if (finished) {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 220 });
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [finished, pulse]);

  const inner = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.08]) }],
  }));
  const halo = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.35]) }],
  }));

  const ok = finished && failedCount === 0;

  return (
    <View style={styles.markWrap}>
      <Animated.View style={[styles.halo, { backgroundColor: tint + "1A" }, halo]} />
      <Animated.View style={inner}>
        <Glass
          variant="regular"
          radius={44}
          style={styles.mark}
          fallbackIntensity={50}
          fallbackTint={t.secondarySystemBackground}
        >
          <HugeiconsIcon
            icon={ok ? Tick02Icon : finished ? Alert02Icon : UserIcon}
            size={34}
            color={finished && failedCount ? t.systemOrange : tint}
            strokeWidth={2}
          />
        </Glass>
      </Animated.View>
    </View>
  );
}

/** The bar. Width is animated; a shimmer rides it so it never looks frozen. */
function ProgressTrack({
  progress,
  tint,
  track,
}: {
  progress: number;
  tint: string;
  track: string;
}) {
  const w = useSharedValue(0);
  const shimmer = useSharedValue(0);

  React.useEffect(() => {
    w.value = withTiming(progress, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [progress, w]);

  React.useEffect(() => {
    shimmer.value = withRepeat(
      withDelay(300, withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) })),
      -1,
      false,
    );
    return () => cancelAnimation(shimmer);
  }, [shimmer]);

  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  const gleam = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-60, 260]) }],
  }));

  return (
    <View style={[styles.track, { backgroundColor: track }]}>
      <Animated.View style={[styles.fill, { backgroundColor: tint }, fill]}>
        <Animated.View style={[styles.gleam, gleam]} />
      </Animated.View>
    </View>
  );
}

function StepRow({ step, state }: { step: Step; state: StepState }) {
  const t = useIOSTheme();

  const colour =
    state === "done"
      ? t.tint
      : state === "failed"
        ? t.systemOrange
        : state === "running"
          ? t.label
          : t.quaternaryLabel;

  const spin = useSharedValue(0);
  React.useEffect(() => {
    if (state !== "running") {
      cancelAnimation(spin);
      spin.value = 0;
      return;
    }
    spin.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [state, spin]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  return (
    <View style={styles.step}>
      <View style={[styles.stepIcon, { borderColor: colour + "44" }]}>
        {state === "running" ? (
          <Animated.View style={spinStyle}>
            <View style={[styles.spinner, { borderColor: colour + "33", borderTopColor: colour }]} />
          </Animated.View>
        ) : (
          <HugeiconsIcon
            icon={state === "done" ? Tick02Icon : state === "failed" ? Alert02Icon : step.icon}
            size={15}
            color={colour}
            strokeWidth={2.2}
          />
        )}
      </View>
      <Text style={[styles.stepLabel, { color: colour }]} numberOfLines={1}>
        {state === "running" ? step.running : step.label}
      </Text>
      {state === "failed" ? (
        <Text style={[styles.stepNote, { color: t.tertiaryLabel }]}>will retry</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 32, alignItems: "center" },

  markWrap: { width: 88, height: 88, alignItems: "center", justifyContent: "center" },
  halo: { ...StyleSheet.absoluteFillObject, borderRadius: 44 },
  mark: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  title: { ...IOSAppFont.title2, marginTop: 26, textAlign: "center" },
  blurb: {
    ...IOSAppFont.subheadline,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 21,
    minHeight: 42,
  },

  metrics: { alignItems: "center", marginTop: 26 },
  percent: { fontFamily: "Poppins_700Bold", fontSize: 44, lineHeight: 50 },
  metricSub: { ...IOSAppFont.caption1, marginTop: -2 },

  track: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    marginTop: 16,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 4, overflow: "hidden" },
  gleam: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 60,
    backgroundColor: "rgba(255,255,255,0.35)",
  },

  steps: { width: "100%", marginTop: 30, gap: 14 },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  stepLabel: { ...IOSAppFont.subheadline, flex: 1 },
  stepNote: { ...IOSAppFont.caption2 },

  skip: { position: "absolute", alignSelf: "center", padding: 12 },
  skipText: { ...IOSAppFont.footnote },
});
