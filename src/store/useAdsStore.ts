// src/store/useAdsStore.ts
//
// Rewarded-ads state: the dashboard, the preferences, and the one place where a
// completed watch turns into money in the fuel pool.
//
// ── Why the pool credit lives here and not in the player screen ─────────────
// `usePoolStore.addAdRevenue` was written months ago with the comment "used
// from Step 4". This is Step 4. Routing every completion through one function
// means the player, an autoplay chain and any future entry point all credit
// identically, and the dedupe key is derived from the session id so a retried
// call cannot pay twice.
//
// ── Why the dashboard is not persisted ─────────────────────────────────────
// A streak is a claim about what happened today, and today changes while the
// app is closed. Restoring a cached "5 of 5 watched" from yesterday would show
// a user a cleared goal they have not cleared. It is one cheap round trip; take
// the round trip.

import { create } from "zustand";
import * as ads from "../services/ads";
import type { AdDashboard, AdPreferences, AdCompletion, AdFormat } from "../services/ads";
import { usePoolStore } from "./usePoolStore";
import { useAuthStore } from "./useStore";

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
        const uid = useAuthStore.getState().user?.id;
        if (uid) {
          // The session id is the dedupe key: `addPoolEntry` drops a second
          // entry with the same key, so a retry after a dropped response
          // cannot credit the same watch twice.
          await usePoolStore
            .getState()
            .addPoolEntry(uid, result.total_credited, "ad_revenue", {
              dedupeKey: `ad_session_${sessionId}`,
            })
            .catch((e: any) => console.warn("[ads] pool credit:", e?.message));
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
