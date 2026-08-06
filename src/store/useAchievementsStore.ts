import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { supabase } from "../services/supabase";
import { ACHIEVEMENTS, type AchievementContext } from "../data/achievements";

/**
 * src/store/useAchievementsStore.ts
 *
 * Tracks which achievements the user has unlocked. Local-first (persisted +
 * instant), best-effort mirrored to the `user_achievements` table (idempotent by
 * (user_id, achievement_id)), same offline pattern as the credit/pool ledgers.
 *
 * Unlocking is deterministic: evaluate() runs every achievement's pure predicate
 * against a snapshot of app state and unlocks any newly-satisfied ones, returning
 * their ids so the UI can celebrate them.
 */
interface AchievementsStore {
  unlocked: Record<string, string>; // achievement id -> ISO unlocked_at
  earnedCount: () => number;
  unlock: (userId: string, id: string) => Promise<void>;
  evaluate: (userId: string, ctx: AchievementContext) => Promise<string[]>;
  sync: (userId: string) => Promise<void>;
  pull: (userId: string) => Promise<void>;
}

async function mirror(rows: { user_id: string; achievement_id: string; unlocked_at: string }[]) {
  if (!rows.length) return;
  try {
    await supabase
      .from("user_achievements")
      .upsert(rows, { onConflict: "user_id,achievement_id", ignoreDuplicates: true });
  } catch (e) {
    console.warn("[Achievements] sync failed, will retry later", e);
  }
}

export const useAchievementsStore = create<AchievementsStore>()(
  persist(
    (set, get) => ({
      unlocked: {},

      earnedCount: () => Object.keys(get().unlocked).length,

      unlock: async (userId, id) => {
        if (get().unlocked[id]) return;
        const at = new Date().toISOString();
        set((s) => ({ unlocked: { ...s.unlocked, [id]: at } }));
        await mirror([{ user_id: userId, achievement_id: id, unlocked_at: at }]);
      },

      evaluate: async (userId, ctx) => {
        const current = get().unlocked;
        const newly = ACHIEVEMENTS.filter((a) => !current[a.id] && a.check(ctx)).map((a) => a.id);
        if (!newly.length) return [];
        const at = new Date().toISOString();
        set((s) => {
          const next = { ...s.unlocked };
          for (const id of newly) next[id] = at;
          return { unlocked: next };
        });
        await mirror(newly.map((id) => ({ user_id: userId, achievement_id: id, unlocked_at: at })));
        return newly;
      },

      sync: async (userId) => {
        await mirror(
          Object.entries(get().unlocked).map(([id, at]) => ({
            user_id: userId,
            achievement_id: id,
            unlocked_at: at,
          }))
        );
      },

      pull: async (userId) => {
        try {
          const { data, error } = await supabase
            .from("user_achievements")
            .select("achievement_id, unlocked_at")
            .eq("user_id", userId);
          if (error || !data) return;
          set((s) => {
            const merged = { ...s.unlocked };
            for (const r of data as any[]) {
              if (!merged[r.achievement_id]) merged[r.achievement_id] = r.unlocked_at;
            }
            return { unlocked: merged };
          });
        } catch (e) {
          console.warn("[Achievements] pull failed", e);
        }
      },
    }),
    {
      name: "teqil-achievements",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ unlocked: s.unlocked }),
    }
  )
);
