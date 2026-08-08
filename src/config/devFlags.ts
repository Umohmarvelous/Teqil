// src/config/devFlags.ts
//
// Development-only escape hatches. Code-level only — there is deliberately NO UI
// for any of this, so it can't be toggled by anyone holding the app.
//
// ── Why it's safe ────────────────────────────────────────────────────────────
// Every flag is ANDed with `__DEV__`, which the React Native / Metro production
// bundler replaces with the literal `false` and then dead-code-eliminates. So in
// any release build (`eas build --profile production`, a store binary, or
// `expo start --no-dev --minify`) these constants are hard `null`/`false` — even
// if someone leaves EXPO_PUBLIC_DEV_PREMIUM_TIER set in the build environment.
//
// That belt-and-braces matters because EXPO_PUBLIC_* variables are inlined into
// the JS bundle at build time, so an env var alone would NOT be a safe gate.
//
// ── Turning the premium bypass on ────────────────────────────────────────────
//   1. Put this in `.env`:               EXPO_PUBLIC_DEV_PREMIUM_TIER=elite
//   2. Restart Metro with a clear cache: npx expo start -c
//      (EXPO_PUBLIC_* values are baked into the bundle — a hot reload won't pick
//       up a change.)
//
// ── Turning it off ───────────────────────────────────────────────────────────
// Delete or comment out that line and restart with `-c`. Shipping to production
// requires no action at all — `__DEV__` already disables it.
//
// ── Removing it permanently ──────────────────────────────────────────────────
// Delete this file, then drop the `resolveEffectiveTier` call in
// src/store/useTierStore.ts so `useEffectiveTier()` returns `s.tier` directly.
// Nothing else in the app reads these flags.

import type { PremiumTier } from "@/src/models/types";

/** True only in a development bundle. The single kill-switch for everything here. */
export const DEV_OVERRIDES_ENABLED: boolean = __DEV__;

function parseTier(value?: string | null): PremiumTier | null {
  const v = (value ?? "").trim().toLowerCase();
  return v === "pro" || v === "elite" || v === "free" ? (v as PremiumTier) : null;
}

/**
 * Premium tier forced by `.env`, or null. Always null outside development.
 * Accepts "free" too, so you can pin the *unsubscribed* state while a real
 * subscription is active on the account.
 */
export const ENV_PREMIUM_OVERRIDE: PremiumTier | null = DEV_OVERRIDES_ENABLED
  ? parseTier(process.env.EXPO_PUBLIC_DEV_PREMIUM_TIER)
  : null;

// One line in the Metro logs at startup, so "is the bypass on?" is answerable
// without guessing. EXPO_PUBLIC_* values are inlined at bundle time, so if this
// prints `raw=undefined` the variable isn't in `.env` (note: `.env.example` is
// NOT loaded) or Metro was started without `-c` after the change.
if (DEV_OVERRIDES_ENABLED) {
  console.log(
    `[devFlags] premium bypass: ${ENV_PREMIUM_OVERRIDE ?? "OFF"}` +
      ` (raw=${String(process.env.EXPO_PUBLIC_DEV_PREMIUM_TIER)})`,
  );
}

/**
 * Resolve the tier the app should actually behave as: the `.env` override in
 * development, the account's real tier everywhere else.
 */
export function resolveEffectiveTier(realTier: PremiumTier): PremiumTier {
  if (!DEV_OVERRIDES_ENABLED) return realTier;
  return ENV_PREMIUM_OVERRIDE ?? realTier;
}
