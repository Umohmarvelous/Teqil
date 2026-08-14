// src/store/useFollowsStore.ts
//
// The social graph, client side. Passengers follow drivers; a driver's profile
// shows both counts and a follow toggle.
//
// ── Why this one is NOT offline-first ────────────────────────────────────────
// Everything else in Emilgo treats AsyncStorage as the truth and Supabase as the
// sync target, because a trip happens whether or not there is signal and losing
// it would lose money. A follow is different: it is a statement about another
// account, and the server owns whether it took. Queuing follows offline would
// mean showing a count that the other person's device disagrees with, and
// reconciling two devices' opinions of one boolean is more machinery than the
// feature is worth.
//
// So: the server is authoritative, the UI is optimistic, and a failed write
// rolls back and says so. Counts are cached in memory only — they are cheap to
// refetch and stale ones are worse than absent ones.
//
// Needs supabase/migrations/migration_follows.sql. Every call degrades to a
// no-op with `error` set when the migration hasn't been applied, so the app
// still runs against an older database.

import { create } from "zustand";
import { supabase } from "../services/supabase";

export interface FollowStats {
  followers: number;
  following: number;
  /** Does the signed-in user follow this profile? */
  isFollowing: boolean;
  /** Does this profile follow the signed-in user back? */
  followsMe: boolean;
}

export interface FollowPerson {
  id: string;
  full_name: string | null;
  username: string | null;
  profile_photo: string | null;
  role: string;
  driver_id: string | null;
  avg_rating: number | null;
  followed_at: string;
  /** Whether the signed-in user follows this person — drives the row's button. */
  is_following: boolean;
}

export type FollowList = "followers" | "following";

const EMPTY: FollowStats = { followers: 0, following: 0, isFollowing: false, followsMe: false };

/** How many people one page of a list holds. */
export const FOLLOW_PAGE = 30;

interface FollowsState {
  /** Cached stats per user id. */
  stats: Record<string, FollowStats>;
  /** In-flight toggle guard, per user id — stops a double tap sending two writes. */
  pending: Record<string, boolean>;
  /** Last failure, for the UI to surface. Cleared by the next successful call. */
  error: string | null;

  loadStats: (userId: string) => Promise<FollowStats>;
  /** Optimistic. Returns true if the server confirmed. */
  toggleFollow: (userId: string) => Promise<boolean>;
  listPeople: (userId: string, which: FollowList, offset?: number) => Promise<FollowPerson[]>;
  /** Drop cached stats — call on sign-out, or the next account sees the last one's. */
  reset: () => void;
}

export const useFollowsStore = create<FollowsState>()((set, get) => ({
  stats: {},
  pending: {},
  error: null,

  loadStats: async (userId) => {
    try {
      const { data, error } = await supabase.rpc("get_follow_stats", { p_user: userId });
      if (error) throw error;

      // The RPC returns a one-row table, which supabase-js surfaces as an array.
      const row = Array.isArray(data) ? data[0] : data;
      const stats: FollowStats = row
        ? {
            followers: row.followers ?? 0,
            following: row.following ?? 0,
            isFollowing: !!row.is_following,
            followsMe: !!row.follows_me,
          }
        : EMPTY;

      set((s) => ({ stats: { ...s.stats, [userId]: stats }, error: null }));
      return stats;
    } catch (e: any) {
      // An unmigrated database is the likely cause, and it must not break the
      // profile screen — the counts simply don't appear.
      set({ error: e?.message ?? "Could not load follow stats" });
      return get().stats[userId] ?? EMPTY;
    }
  },

  toggleFollow: async (userId) => {
    if (get().pending[userId]) return false;

    const before = get().stats[userId] ?? EMPTY;
    const next = !before.isFollowing;

    // Optimistic: the button must respond to the tap, not to the round trip.
    set((s) => ({
      pending: { ...s.pending, [userId]: true },
      stats: {
        ...s.stats,
        [userId]: {
          ...before,
          isFollowing: next,
          followers: Math.max(0, before.followers + (next ? 1 : -1)),
        },
      },
    }));

    try {
      const { data, error } = await supabase.rpc(next ? "follow_user" : "unfollow_user", {
        p_followee: userId,
      });
      if (error) throw error;

      // Both RPCs return the authoritative follower count, so the optimistic
      // number gets corrected in the same round trip rather than by a refetch.
      set((s) => ({
        stats: {
          ...s.stats,
          [userId]: {
            ...(s.stats[userId] ?? EMPTY),
            isFollowing: next,
            followers: typeof data === "number" ? data : s.stats[userId]?.followers ?? 0,
          },
        },
        pending: { ...s.pending, [userId]: false },
        error: null,
      }));
      return true;
    } catch (e: any) {
      // Roll back to exactly what we had; a half-applied toggle is worse than
      // no toggle, because the user can't tell which state they're in.
      set((s) => ({
        stats: { ...s.stats, [userId]: before },
        pending: { ...s.pending, [userId]: false },
        error: e?.message ?? "Could not update follow",
      }));
      return false;
    }
  },

  listPeople: async (userId, which, offset = 0) => {
    try {
      const { data, error } = await supabase.rpc(
        which === "followers" ? "list_followers" : "list_following",
        { p_user: userId, p_limit: FOLLOW_PAGE, p_offset: offset },
      );
      if (error) throw error;
      set({ error: null });
      return (data ?? []) as FollowPerson[];
    } catch (e: any) {
      set({ error: e?.message ?? "Could not load list" });
      return [];
    }
  },

  reset: () => set({ stats: {}, pending: {}, error: null }),
}));
