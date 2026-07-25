import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CreditHistory, CreditType } from "../models/types";
import { supabase } from "../services/supabase";

export interface FloatingAnimation {
  id: string;
  amount: number;
  x: number;
  y: number;
  timestamp: number;
}

/**
 * Builds the deterministic "earn once" key for an event.
 * Same inputs → same key, so the same action can never be rewarded twice,
 * whether the duplicate is caught locally (below) or server-side (the
 * credits_history.dedupe_key UNIQUE index). Returns undefined for events that
 * are allowed to repeat (e.g. ad_watch), which map to a NULL key = no dedup.
 */
function buildDedupeKey(
  type: CreditType,
  userId: string,
  postId?: string,
  commentId?: string
): string | undefined {
  if (type === "signup") return `${userId}:signup`;
  if (type === "reply" && commentId) return `${userId}:reply:${commentId}`;
  if ((type === "like" || type === "comment" || type === "share") && postId) {
    return `${userId}:${type}:${postId}`;
  }
  return undefined; // ad_watch and anything unkeyed: never deduped
}

interface CreditsStore {
  balance: number;
  history: CreditHistory[];
  floatingAnimations: FloatingAnimation[];
  
  setBalance: (balance: number) => void;
  addCredit: (type: CreditType, amount: number, userId: string, postId?: string, commentId?: string) => Promise<void>;
  syncCredits: () => Promise<void>;
  pullCredits: (userId: string) => Promise<void>;
  addFloatingAnimation: (amount: number, x: number, y: number) => void;
  removeFloatingAnimation: (id: string) => void;
}

export const useCreditsStore = create<CreditsStore>()(
  persist(
    (set, get) => ({
      balance: 0,
      history: [],
      floatingAnimations: [],

      setBalance: (balance) => set({ balance }),

      addFloatingAnimation: (amount, x, y) => set((state) => ({
        floatingAnimations: [
          ...state.floatingAnimations,
          { id: Math.random().toString(36).substring(7), amount, x, y, timestamp: Date.now() }
        ]
      })),

      removeFloatingAnimation: (id) => set((state) => ({
        floatingAnimations: state.floatingAnimations.filter(a => a.id !== id)
      })),

      addCredit: async (type, amount, userId, postId, commentId) => {
        const state = get();
        const dedupeKey = buildDedupeKey(type, userId, postId, commentId);

        // Enforce "earn once" locally by the deterministic key. Keying on the
        // dedupe_key (rather than type + ids) is what keeps a top-level comment
        // and a reply on the same post from colliding — they live in different
        // key namespaces ("<uid>:comment:<post>" vs "<uid>:reply:<comment>").
        if (dedupeKey && state.history.some(h => h.dedupe_key === dedupeKey)) {
          return; // Already earned this exact reward
        }

        const newEntry: CreditHistory = {
          id: Math.random().toString(36).substring(7), // Temporary ID for offline
          user_id: userId,
          type,
          amount,
          post_id: postId,
          comment_id: commentId,
          dedupe_key: dedupeKey,
          synced: false,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        };

        set((state) => ({
          balance: state.balance + amount,
          history: [newEntry, ...state.history]
        }));

        // Try to sync immediately
        await get().syncCredits();
      },

      syncCredits: async () => {
        const state = get();
        const unsynced = state.history.filter(h => !h.synced);
        if (unsynced.length === 0) return;

        try {
          // Upsert (not insert) so a row the server already has — e.g. earned
          // on another device, or a retried sync — is silently ignored instead
          // of erroring. `ignoreDuplicates` emits ON CONFLICT DO NOTHING against
          // the credits_history.dedupe_key UNIQUE index. Rows with a NULL
          // dedupe_key (ad_watch) never conflict, so they always insert.
          const { error } = await supabase.from('credits_history').upsert(
            unsynced.map(h => ({
              // Omit 'id' so Supabase generates the UUID, and omit 'synced'
              // (that flag is local-only bookkeeping).
              user_id: h.user_id,
              type: h.type,
              amount: h.amount,
              post_id: h.post_id,
              comment_id: h.comment_id,
              dedupe_key: h.dedupe_key,
              updated_at: h.updated_at,
              created_at: h.created_at
            })),
            { onConflict: 'dedupe_key', ignoreDuplicates: true }
          );

          if (!error) {
            // Update local state to mark as synced
            set((state) => ({
              history: state.history.map(h => 
                unsynced.find(u => u.id === h.id) ? { ...h, synced: true } : h
              )
            }));
            
            // Optionally, we could fetch the latest balance from the backend here
            // to ensure it matches if there were server-side changes.
          }
        } catch (err) {
          console.warn('Sync failed, will retry later', err);
        }
      },

      // Pull the authoritative ledger from Supabase and recompute the balance.
      // Keeps still-pending local entries so nothing earned offline is lost.
      pullCredits: async (userId) => {
        try {
          const { data, error } = await supabase
            .from('credits_history')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

          if (error || !data) return;

          const remote: CreditHistory[] = data.map((r: any) => ({ ...r, synced: true }));
          const remoteKeys = new Set(
            remote.map((r) => r.dedupe_key).filter(Boolean) as string[]
          );
          set((state) => {
            // Keep only local pending rows the server does NOT already have.
            // Without this, a row that synced but whose 'synced' flag never
            // flipped (e.g. app killed mid-sync) would be double-counted here.
            const localPending = state.history.filter(
              (h) => !h.synced && !(h.dedupe_key && remoteKeys.has(h.dedupe_key))
            );
            const history = [...localPending, ...remote];
            const balance = history.reduce((sum, h) => sum + (h.amount || 0), 0);
            return { history, balance };
          });
        } catch (err) {
          console.warn('[Credits] pullCredits failed', err);
        }
      },
    }),
    {
      name: "teqil-credits",
      storage: createJSONStorage(() => AsyncStorage),
      // Persist only the ledger; floatingAnimations are transient UI state.
      partialize: (state) => ({ balance: state.balance, history: state.history }),
    }
  )
);
