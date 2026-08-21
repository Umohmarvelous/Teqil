// src/store/useAdsStore.ts
//
// Rewarded-ads state: the dashboard, the preferences, and the one place where a
// completed watch turns into `cs` in the user's pool.
//
// ── The two-stage flow, as specified ───────────────────────────────────────
// Stage 1, immediately: a watch moves cs OUT of the ONE general pool and INTO
// this user's pool, in a single database transaction. The user is paid before
// the ad network has paid anybody, which is the point — the wait is EMILGO's,
// not the user's.
//
// Stage 2, later: the ad network settles into EMILGO's own corporate account and
// an operator replenishes the general pool (`cs_replenish_general`, admin-only).
// The app cannot do stage 2 and should not be able to.
//
// If the general pool is empty, stage 1 REFUSES rather than crediting cs that
// was never funded. The user is told. A pool that can go negative is a promise
// the company has not financed.
//
// ── Why the credit lives here and not in the player screen ─────────────────
// Routing every completion through one function means the player, an autoplay
// chain and any future entry point credit identically, and the dedupe key is
// derived from the session id so a retried call cannot pay twice.
//
// ── Why the dashboard is not persisted ─────────────────────────────────────
// A streak is a claim about what happened today, and today changes while the
// app is closed. Restoring a cached "5 of 5 watched" from yesterday would show
// a user a cleared goal they have not cleared. It is one cheap round trip; take
// the round trip.

import { create } from "zustand";
import * as ads from "../services/ads";
import type { AdDashboard, AdPreferences, AdCompletion, AdFormat } from "../services/ads";
import { useCoinsStore } from "./useCoinsStore";

interface AdsState {
  dashboard: AdDashboard;
  prefs: AdPreferences | null;
  loading: boolean;
  /** Set while a watch is in flight, so two taps cannot open two players. */
  busy: boolean;
  error: string | null;

  refresh: () => Promise<void>;
  loadPrefs: () => Promise<void>;
  updatePrefs: (patch: Partial<AdPreferences>) => Promise<void>;

  /**
   * Settle a finished watch: ask the server what it is worth, credit the pool,
   * refresh the dashboard. Returns the server's verdict so the player can show
   * the right celebration — or the right refusal.
   */
  settle: (sessionId: string) => Promise<AdCompletion>;

  /** Seconds until the next ad may start, from the cached dashboard. */
  cooldownRemaining: () => number;
  /** Can a watch start at all right now, and if not, why. */
  gate: () => { allowed: boolean; reason?: ads.NoAdReason; seconds?: number };

  reset: () => void;
}

export const useAdsStore = create<AdsState>()((set, get) => ({
  dashboard: ads.EMPTY_DASHBOARD,
  prefs: null,
  loading: false,
  busy: false,
  error: null,

  refresh: async () => {
    set({ loading: true });
    const dashboard = await ads.getAdDashboard();
    set({ dashboard, loading: false });
  },

  loadPrefs: async () => {
    const prefs = await ads.getAdPreferences();
    set({ prefs });
  },

  updatePrefs: async (patch) => {
    // Optimistic: a settings toggle that waits on a round trip feels broken.
    const before = get().prefs;
    if (before) set({ prefs: { ...before, ...patch } });
    try {
      const prefs = await ads.setAdPreferences(patch);
      set({ prefs, error: null });
    } catch (e: any) {
      if (before) set({ prefs: before });
      set({ error: e?.message ?? "Could not save that setting" });
      throw e;
    }
  },

  settle: async (sessionId) => {
    set({ busy: true });
    try {
      const result = await ads.completeAdSession(sessionId);

      if (result.rewarded && result.total_credited > 0) {
        // The session id is the dedupe key, so a retry after a dropped response
        // is paid once. This used to append to a client-writable ledger; it now
        // goes through an RPC that debits the general pool in the same
        // transaction, because a client that can add a positive entry to its own
        // balance can mint the currency it is about to gift away.
        const grant = await useCoinsStore
          .getState()
          .creditForAd(
            Math.round(result.total_credited),
            `ad_session_${sessionId}`,
            "Rewarded ad",
          );

        if (!grant.ok) {
          // Not an error the user caused. Surfaced so the player can say
          // "rewards are paused" instead of silently showing +0.
          set({ error: grant.reason === "general_pool_empty"
            ? "Rewards are paused while the pool is topped up. Your watch still counted."
            : "Could not credit that watch. It will not be lost — try again shortly." });
        }
      }

      // The dashboard has moved — watched count, ladder, streak, cooldown.
      await get().refresh();
      return result;
    } finally {
      set({ busy: false });
    }
  },

  cooldownRemaining: () => {
    const at = get().dashboard.next_ad_at;
    if (!at) return 0;
    return Math.max(0, Math.ceil((new Date(at).getTime() - Date.now()) / 1000));
  },

  gate: () => {
    const d = get().dashboard;
    if (d.remaining_today <= 0) return { allowed: false, reason: "daily_limit" as const };
    const wait = get().cooldownRemaining();
    if (wait > 0) return { allowed: false, reason: "cooldown" as const, seconds: wait };
    return { allowed: true };
  },

  reset: () =>
    set({ dashboard: ads.EMPTY_DASHBOARD, prefs: null, loading: false, busy: false, error: null }),
}));

/** Re-exported so screens import one module rather than two. */
export type { AdDashboard, AdPreferences, AdCompletion, AdFormat };
