// src/services/ads.ts
//
// The rewarded-ads system's server surface.
//
// Every payout decision lives in supabase/migrations/migration_ad_rewards.sql,
// not here. This file cannot decide that an ad was watched, how long it ran or
// what it is worth — it reports what happened and renders what comes back. That
// separation is the whole anti-fraud story: `start_ad_session` stamps the start
// time from the database's own clock, and `complete_ad_session` compares it to
// the database's own `now()`. A patched client gets the same answer as an
// honest one.

import { supabase } from "./supabase";
import { formatCs } from "./coins";

// ═════════════════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════════════════

export type AdFormat = "banner" | "interstitial" | "rewarded";

export interface AdCreative {
  id: string;
  advertiser_name: string;
  advertiser_logo: string | null;
  headline: string;
  body: string;
  media_url: string | null;
  media_type: "image" | "video" | null;
  cta_label: string;
  cta_url: string;
  format: AdFormat;
  category: string;
  duration_seconds: number;
  /** Null means the ad cannot be skipped at all. */
  skip_after_seconds: number | null;

  // Present only when the ad promotes an app — drives the post-roll install card.
  app_name: string | null;
  app_icon: string | null;
  app_rating: number | null;
  app_installs: string | null;
  app_store_url: string | null;
  play_store_url: string | null;
  app_screenshots: string[];
}

/** Why there is nothing to show. Each needs its own screen, not one error. */
export type NoAdReason = "daily_limit" | "cooldown" | "no_inventory" | "offline";

export type NextAdResult =
  | { ok: true; ad: AdCreative; reward: number }
  | { ok: false; reason: NoAdReason; readyAt?: string };

export interface AdMilestone {
  at: number;
  naira: number;
  label: string;
  reached: boolean;
}

export interface AdDayStat {
  day: string;
  watched: number;
  earned: number;
  quota_met: boolean;
}

export interface AdDashboard {
  today: string;
  watched_today: number;
  earned_today: number;
  daily_quota: number;
  quota_met: boolean;
  bonus_claimed: boolean;
  milestones: AdMilestone[];
  next_milestone: Omit<AdMilestone, "reached"> | null;
  max_ads_per_day: number;
  remaining_today: number;
  current_streak: number;
  longest_streak: number;
  total_watched: number;
  total_earned: number;
  freezes_left: number;
  streak_milestones: Record<string, number>;
  cooldown_seconds: number;
  next_ad_at: string | null;
  reward_rewarded: number;
  reward_interstitial: number;
  reward_banner: number;
  week: AdDayStat[];
}

export interface AdCompletion {
  ok: boolean;
  rewarded: boolean;
  reason?: string;
  /** Per-ad reward. */
  reward: number;
  /** Ladder rung crossed by this ad, if any. */
  milestone_bonus: number;
  milestone_label: string | null;
  /** Streak-length payout, if this ad started a new milestone streak. */
  streak_bonus: number;
  total_credited: number;
  quota_met_now: boolean;
  watched_today: number;
  daily_quota: number;
  streak: number;
  /** Only set when the server refused: how long was actually watched. */
  watched_seconds?: number;
  required_seconds?: number;
}

export interface AdPreferences {
  personalised: boolean;
  sound_on: boolean;
  wifi_only_video: boolean;
  autoplay_next: boolean;
  reminder_enabled: boolean;
  reminder_hour: number;
  muted_categories: string[];
}

export interface AdHistoryRow {
  id: string;
  created_at: string;
  advertiser_name: string;
  advertiser_logo: string | null;
  headline: string;
  format: AdFormat;
  category: string;
  watched_ms: number;
  duration_seconds: number;
  status: "open" | "completed" | "abandoned" | "expired";
  rewarded: boolean;
  reward_amount: number;
  no_reward_reason: string | null;
}

export const EMPTY_DASHBOARD: AdDashboard = {
  today: "",
  watched_today: 0,
  earned_today: 0,
  daily_quota: 5,
  quota_met: false,
  bonus_claimed: false,
  milestones: [],
  next_milestone: null,
  max_ads_per_day: 20,
  remaining_today: 0,
  current_streak: 0,
  longest_streak: 0,
  total_watched: 0,
  total_earned: 0,
  freezes_left: 0,
  streak_milestones: {},
  cooldown_seconds: 20,
  next_ad_at: null,
  reward_rewarded: 0,
  reward_interstitial: 0,
  reward_banner: 0,
  week: [],
};

// ═════════════════════════════════════════════════════════════════════════════
// READS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Everything the Rewards screen and the tracker modal need, in one round trip.
 *
 * Returns the empty dashboard rather than throwing when the migration is not
 * applied or the network is down — the screen then shows zeroes and its own
 * offline notice, which is better than a red box over a rewards page.
 */
export async function getAdDashboard(): Promise<AdDashboard> {
  const { data, error } = await supabase.rpc("get_ad_dashboard");
  if (error) {
    console.warn("[ads] get_ad_dashboard:", error.message);
    return EMPTY_DASHBOARD;
  }
  const d = data as any;
  return {
    ...EMPTY_DASHBOARD,
    ...d,
    milestones: Array.isArray(d?.milestones) ? d.milestones : [],
    week: Array.isArray(d?.week) ? d.week : [],
    streak_milestones: d?.streak_milestones ?? {},
    earned_today: Number(d?.earned_today ?? 0),
    total_earned: Number(d?.total_earned ?? 0),
    reward_rewarded: Number(d?.reward_rewarded ?? 0),
    reward_interstitial: Number(d?.reward_interstitial ?? 0),
    reward_banner: Number(d?.reward_banner ?? 0),
  };
}

export async function nextAd(format: AdFormat = "rewarded"): Promise<NextAdResult> {
  const { data, error } = await supabase.rpc("next_ad", { p_format: format });
  if (error) {
    console.warn("[ads] next_ad:", error.message);
    return { ok: false, reason: "offline" };
  }
  const d = data as any;
  if (!d?.ok) {
    return { ok: false, reason: (d?.reason ?? "no_inventory") as NoAdReason, readyAt: d?.ready_at };
  }
  return {
    ok: true,
    reward: Number(d.reward ?? 0),
    ad: {
      ...d.ad,
      app_screenshots: Array.isArray(d.ad?.app_screenshots) ? d.ad.app_screenshots : [],
      app_rating: d.ad?.app_rating == null ? null : Number(d.ad.app_rating),
    },
  };
}

export async function listAdHistory(limit = 30, offset = 0): Promise<AdHistoryRow[]> {
  const { data, error } = await supabase.rpc("list_ad_history", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    console.warn("[ads] list_ad_history:", error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({ ...r, reward_amount: Number(r.reward_amount ?? 0) }));
}

export async function listAdCategories(): Promise<{ category: string; n: number }[]> {
  const { data, error } = await supabase.rpc("list_ad_categories");
  if (error) {
    console.warn("[ads] list_ad_categories:", error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({ category: r.category, n: Number(r.n) }));
}

// ═════════════════════════════════════════════════════════════════════════════
// SESSION LIFECYCLE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Opens a session and returns its id. Throws — unlike the reads — because the
 * player must not start counting down against a session the server never
 * created; the user would watch the whole ad and be told it did not count.
 */
export async function startAdSession(adId: string): Promise<string> {
  const { data, error } = await supabase.rpc("start_ad_session", { p_ad: adId });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function completeAdSession(sessionId: string): Promise<AdCompletion> {
  const { data, error } = await supabase.rpc("complete_ad_session", { p_session: sessionId });
  if (error) throw new Error(error.message);
  const d = data as any;
  return {
    ok: !!d?.ok,
    rewarded: !!d?.rewarded,
    reason: d?.reason,
    reward: Number(d?.reward ?? 0),
    milestone_bonus: Number(d?.milestone_bonus ?? 0),
    milestone_label: d?.milestone_label ?? null,
    streak_bonus: Number(d?.streak_bonus ?? 0),
    total_credited: Number(d?.total_credited ?? 0),
    quota_met_now: !!d?.quota_met_now,
    watched_today: Number(d?.watched_today ?? 0),
    daily_quota: Number(d?.daily_quota ?? 0),
    streak: Number(d?.streak ?? 0),
    watched_seconds: d?.watched_seconds == null ? undefined : Number(d.watched_seconds),
    required_seconds: d?.required_seconds == null ? undefined : Number(d.required_seconds),
  };
}

/**
 * Closing the player early. Fire-and-forget: the user has already left, and a
 * failed abandon just leaves a session that `start_ad_session` will expire on
 * the next open.
 */
export function abandonAdSession(sessionId: string) {
  supabase
    .rpc("abandon_ad_session", { p_session: sessionId })
    .then(({ error }) => error && console.warn("[ads] abandon:", error.message));
}

/**
 * Open a session for a network-filled slot (AdMob).
 *
 * Separate from `startAdSession` because there is no creative to point at — see
 * migration_ad_network.sql. Everything downstream is identical: the same
 * `complete_ad_session` settles it, against the same server clock.
 */
export async function startNetworkAdSession(
  format: "rewarded" | "interstitial" = "rewarded",
  durationSeconds = 30,
): Promise<string> {
  const { data, error } = await supabase.rpc("start_network_ad_session", {
    p_format: format,
    p_network: "admob",
    p_duration: durationSeconds,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export function recordAdClick(adId: string, sessionId?: string) {
  supabase
    .rpc("record_ad_click", { p_ad: adId, p_session: sessionId ?? null })
    .then(({ error }) => error && console.warn("[ads] click:", error.message));
}

// ═════════════════════════════════════════════════════════════════════════════
// PREFERENCES AND FEEDBACK
// ═════════════════════════════════════════════════════════════════════════════

const DEFAULT_PREFS: AdPreferences = {
  personalised: true,
  sound_on: false,
  wifi_only_video: true,
  autoplay_next: false,
  reminder_enabled: true,
  reminder_hour: 19,
  muted_categories: [],
};

export async function getAdPreferences(): Promise<AdPreferences> {
  const { data, error } = await supabase.rpc("get_ad_preferences");
  if (error) {
    console.warn("[ads] get_ad_preferences:", error.message);
    return DEFAULT_PREFS;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    ...DEFAULT_PREFS,
    ...row,
    muted_categories: Array.isArray(row?.muted_categories) ? row.muted_categories : [],
  };
}

/** Only the keys you pass are changed; everything else is left alone. */
export async function setAdPreferences(patch: Partial<AdPreferences>): Promise<AdPreferences> {
  const { data, error } = await supabase.rpc("set_ad_preferences", {
    p_personalised: patch.personalised ?? null,
    p_sound_on: patch.sound_on ?? null,
    p_wifi_only_video: patch.wifi_only_video ?? null,
    p_autoplay_next: patch.autoplay_next ?? null,
    p_reminder_enabled: patch.reminder_enabled ?? null,
    p_reminder_hour: patch.reminder_hour ?? null,
    p_muted_categories: patch.muted_categories ?? null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    ...DEFAULT_PREFS,
    ...row,
    muted_categories: Array.isArray(row?.muted_categories) ? row.muted_categories : [],
  };
}

/**
 * The reaction button on the player.
 *
 * `scope: "category"` mutes everything like it, not just this creative. That
 * distinction is the difference between "I have seen this enough" and "stop
 * showing me betting adverts", and collapsing the two is why most hide buttons
 * feel like they do nothing.
 */
export async function suppressAd(
  adId: string,
  scope: "creative" | "category" = "creative",
  reason?: string,
) {
  const { error } = await supabase.rpc("suppress_ad", {
    p_ad: adId,
    p_scope: scope,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function reportAd(adId: string, reason: string, note?: string) {
  const { error } = await supabase.rpc("report_ad", {
    p_ad: adId,
    p_reason: reason,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
}

// ═════════════════════════════════════════════════════════════════════════════
// FORMATTING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * An ad reward, as `40 cs`.
 *
 * This was `formatNaira` and rendered "₦40". Ad rewards were never naira — they
 * were a number the app promised to convert at a fixed rate — and quoting them
 * in a real currency is what turned a loyalty balance into something that looks
 * like money you are owed. See COMPLIANCE.md §2.1 and §2.9.
 */
export function formatReward(n: number): string {
  return formatCs(Math.round(n));
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** The human reason a watch earned nothing, for the history list. */
export function noRewardLabel(reason: string | null): string {
  switch (reason) {
    case "closed_early":
      return "Closed early — no reward";
    case "too_short":
      return "Not watched long enough";
    case "daily_limit":
      return "Daily limit reached";
    default:
      return "No reward";
  }
}
