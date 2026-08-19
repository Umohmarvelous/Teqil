// src/services/admob.ts
//
// Google AdMob — the network that actually fills the ad slots.
//
// ── Why AdMob and not Meta ─────────────────────────────────────────────────
// Meta Audience Network requires an approved Business account, a reviewed app,
// and — since 2022 — it no longer accepts new publishers in many markets
// without an existing Meta ads relationship. AdMob accepts a new publisher with
// a Google account and an AdSense-style review, fills reliably in Nigeria, and
// pays out to a Nigerian bank. It is the only one of the big networks you can
// realistically go live with unaided.
//
// Nothing here forecloses adding Meta later: AdMob **Mediation** can call Meta,
// AppLovin, Unity and others as bidders inside the same waterfall, which is
// configured in the AdMob dashboard rather than in this file. That is the right
// way to add a second network — not a second SDK.
//
// ── The two-layer design, and why it matters ───────────────────────────────
// AdMob decides WHICH ad plays and tells us it was watched. It does NOT decide
// what the user earns — `complete_ad_session` in Postgres does, by comparing its
// own clock against its own `started_at`. So a compromised or spoofed SDK can at
// most cause an ad to be marked watched; it cannot mint a payout, because the
// server still requires the wall-clock time to have passed.
//
// House ads (rows in `ad_creatives`) and network ads coexist. The player asks
// the database first: a direct partner has already paid, so their inventory
// should burn before we hand the slot to a network that takes a cut.
//
// ── Expo Go ────────────────────────────────────────────────────────────────
// This is a native module. It does not exist in Expo Go, and `require` of it
// throws there. Every entry point below is guarded and reports `unavailable`
// rather than crashing, so the `sdk-54-temp` branch keeps running on a phone
// without a dev build. `isAdMobAvailable()` is what the UI should branch on.

import { Platform } from "react-native";

export type AdMobFormat = "rewarded" | "interstitial";

export interface AdMobLoadResult {
  ok: boolean;
  reason?: "unavailable" | "no_fill" | "error";
  message?: string;
}

export interface AdMobShowResult {
  ok: boolean;
  /** True only when the SDK confirmed the reward threshold was reached. */
  earned: boolean;
  reason?: "unavailable" | "not_loaded" | "dismissed_early" | "error";
  message?: string;
}

// ── Module loading ───────────────────────────────────────────────────────────
// Loaded once, lazily, and never re-thrown. `requireNativeModule` style imports
// throw at import time when the binary lacks the module, which would take the
// whole app down on launch in Expo Go rather than degrading.

let mod: any | undefined;
let loadAttempted = false;

function sdk(): any | null {
  if (loadAttempted) return mod ?? null;
  loadAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("react-native-google-mobile-ads");
  } catch {
    mod = undefined;
  }
  return mod ?? null;
}

/** Whether real network ads can be served on this build. */
export function isAdMobAvailable(): boolean {
  return !!sdk()?.default;
}

/**
 * Ad unit IDs.
 *
 * Google's TEST units are used unless a real one is configured, and that is the
 * correct default rather than a placeholder to be embarrassed about: serving
 * live ads to yourself during development is a policy violation that gets an
 * AdMob account banned, and Google publishes these units precisely so nobody
 * has to. `TestIds` resolves per-platform.
 *
 * Set the real ones in `.env`; they are public identifiers, so `EXPO_PUBLIC_` is
 * correct here in a way it is not for a secret key.
 */
function unitId(format: AdMobFormat): string {
  const s = sdk();
  const env =
    format === "rewarded"
      ? Platform.select({
          ios: process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED,
          android: process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED,
        })
      : Platform.select({
          ios: process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL,
          android: process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL,
        });

  if (env) return env;
  return format === "rewarded" ? s?.TestIds?.REWARDED : s?.TestIds?.INTERSTITIAL;
}

export function bannerUnitId(): string | null {
  const s = sdk();
  if (!s) return null;
  return (
    Platform.select({
      ios: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER,
      android: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER,
    }) ?? s.TestIds?.BANNER
  );
}

/** True when the app is still pointed at Google's test units. */
export function isUsingTestUnits(): boolean {
  return !(
    process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED ||
    process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED
  );
}

// ── Initialisation ───────────────────────────────────────────────────────────

let initialised = false;

/**
 * Call once, early. Safe to call repeatedly.
 *
 * The ATT prompt must come BEFORE `initialize()` on iOS. Asking afterwards
 * means the first session's requests go out non-personalised, which on iOS is
 * roughly a 3–5× difference in eCPM — the single most expensive ordering
 * mistake in mobile advertising.
 */
export async function initAdMob(): Promise<boolean> {
  const s = sdk();
  if (!s?.default) return false;
  if (initialised) return true;

  try {
    if (Platform.OS === "ios") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const att = require("expo-tracking-transparency");
        const { status } = await att.getTrackingPermissionsAsync();
        if (status === "undetermined") {
          await att.requestTrackingPermissionsAsync();
        }
      } catch {
        // No ATT module in this build; the SDK will serve non-personalised.
      }
    }

    await s.default().initialize();
    initialised = true;
    return true;
  } catch (e: any) {
    console.warn("[admob] initialize:", e?.message ?? e);
    return false;
  }
}

// ── Rewarded ─────────────────────────────────────────────────────────────────

let rewarded: any | null = null;
let rewardedReady = false;

/**
 * Preload a rewarded ad.
 *
 * Rewarded video is loaded ahead of time on purpose. Loading on tap means a
 * spinner of one to several seconds between "Watch & earn" and anything
 * happening, which is where users leave.
 */
export function loadRewarded(): Promise<AdMobLoadResult> {
  const s = sdk();
  if (!s?.RewardedAd) return Promise.resolve({ ok: false, reason: "unavailable" });

  return new Promise((resolve) => {
    try {
      const ad = s.RewardedAd.createForAdRequest(unitId("rewarded"), {
        // Nothing sensitive is attached to an ad request. Keywords could raise
        // eCPM, but they would leak what the user is doing to a third party.
        requestNonPersonalizedAdsOnly: false,
      });

      let settled = false;
      const done = (r: AdMobLoadResult) => {
        if (settled) return;
        settled = true;
        resolve(r);
      };

      const offLoaded = ad.addAdEventListener(s.RewardedAdEventType.LOADED, () => {
        rewarded = ad;
        rewardedReady = true;
        offLoaded?.();
        done({ ok: true });
      });

      const offError = ad.addAdEventListener(s.AdEventType.ERROR, (err: any) => {
        rewardedReady = false;
        offError?.();
        // "no-fill" is normal and not an error worth surfacing: it means the
        // auction found nothing worth showing this user right now.
        const noFill = String(err?.code ?? "").includes("no-fill");
        done({
          ok: false,
          reason: noFill ? "no_fill" : "error",
          message: err?.message,
        });
      });

      ad.load();

      // A load that never resolves would hang the player forever.
      setTimeout(() => done({ ok: false, reason: "no_fill", message: "timed out" }), 12_000);
    } catch (e: any) {
      resolve({ ok: false, reason: "error", message: e?.message });
    }
  });
}

export function isRewardedReady(): boolean {
  return rewardedReady && !!rewarded;
}

/**
 * Show the preloaded rewarded ad and resolve once it closes.
 *
 * `earned` is true only if AdMob fired EARNED_REWARD, which it does when the
 * user watched far enough to qualify. The caller must still settle the session
 * server-side — this flag is a claim by the client, and the database is what
 * decides whether it is paid.
 */
export function showRewarded(): Promise<AdMobShowResult> {
  const s = sdk();
  if (!s?.RewardedAdEventType) return Promise.resolve({ ok: false, earned: false, reason: "unavailable" });
  if (!rewarded || !rewardedReady) {
    return Promise.resolve({ ok: false, earned: false, reason: "not_loaded" });
  }

  const ad = rewarded;
  rewardedReady = false;
  rewarded = null;

  return new Promise((resolve) => {
    let earned = false;
    let settled = false;
    const done = (r: AdMobShowResult) => {
      if (settled) return;
      settled = true;
      // Fetch the next one immediately so the following tap is instant.
      loadRewarded().catch(() => {});
      resolve(r);
    };

    try {
      ad.addAdEventListener(s.RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      });
      ad.addAdEventListener(s.AdEventType.CLOSED, () => {
        done({ ok: true, earned, reason: earned ? undefined : "dismissed_early" });
      });
      ad.addAdEventListener(s.AdEventType.ERROR, (err: any) => {
        done({ ok: false, earned, reason: "error", message: err?.message });
      });
      ad.show();
    } catch (e: any) {
      done({ ok: false, earned: false, reason: "error", message: e?.message });
    }
  });
}

// ── Interstitial ─────────────────────────────────────────────────────────────

let interstitial: any | null = null;
let interstitialReady = false;

export function loadInterstitial(): Promise<AdMobLoadResult> {
  const s = sdk();
  if (!s?.InterstitialAd) return Promise.resolve({ ok: false, reason: "unavailable" });

  return new Promise((resolve) => {
    try {
      const ad = s.InterstitialAd.createForAdRequest(unitId("interstitial"), {
        requestNonPersonalizedAdsOnly: false,
      });
      let settled = false;
      const done = (r: AdMobLoadResult) => {
        if (settled) return;
        settled = true;
        resolve(r);
      };

      ad.addAdEventListener(s.AdEventType.LOADED, () => {
        interstitial = ad;
        interstitialReady = true;
        done({ ok: true });
      });
      ad.addAdEventListener(s.AdEventType.ERROR, (err: any) => {
        interstitialReady = false;
        done({ ok: false, reason: "error", message: err?.message });
      });
      ad.load();
      setTimeout(() => done({ ok: false, reason: "no_fill", message: "timed out" }), 12_000);
    } catch (e: any) {
      resolve({ ok: false, reason: "error", message: e?.message });
    }
  });
}

export function isInterstitialReady(): boolean {
  return interstitialReady && !!interstitial;
}

export function showInterstitial(): Promise<AdMobShowResult> {
  const s = sdk();
  if (!s || !interstitial || !interstitialReady) {
    return Promise.resolve({ ok: false, earned: false, reason: "not_loaded" });
  }
  const ad = interstitial;
  interstitialReady = false;
  interstitial = null;

  return new Promise((resolve) => {
    let settled = false;
    const done = (r: AdMobShowResult) => {
      if (settled) return;
      settled = true;
      loadInterstitial().catch(() => {});
      resolve(r);
    };
    try {
      ad.addAdEventListener(s.AdEventType.CLOSED, () => done({ ok: true, earned: true }));
      ad.addAdEventListener(s.AdEventType.ERROR, (err: any) =>
        done({ ok: false, earned: false, reason: "error", message: err?.message }),
      );
      ad.show();
    } catch (e: any) {
      done({ ok: false, earned: false, reason: "error", message: e?.message });
    }
  });
}

/**
 * The banner component, or null when the SDK is absent.
 *
 * Returned rather than re-exported so a screen can render its own placeholder
 * in Expo Go instead of importing a module that is not there.
 */
export function getBannerComponent(): { Banner: any; sizes: any } | null {
  const s = sdk();
  if (!s?.BannerAd) return null;
  return { Banner: s.BannerAd, sizes: s.BannerAdSize };
}
