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
        // Enforce once per post/comment locally
        const state = get();
        if (postId || commentId) {
          const exists = state.history.find(h => 
            h.type === type && 
            (postId ? h.post_id === postId : true) && 
            (commentId ? h.comment_id === commentId : true)
          );
          if (exists) return; // Already earned
        }

        const newEntry: CreditHistory = {
          id: Math.random().toString(36).substring(7), // Temporary ID for offline
          user_id: userId,
          type,
          amount,
          post_id: postId,
          comment_id: commentId,
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
          const { error } = await supabase.from('credits_history').insert(
            unsynced.map(h => ({
              // Omit 'id' so Supabase generates UUID, or we could generate a UUID locally.
              // We'll omit 'id' and 'synced' fields for insertion
              user_id: h.user_id,
              type: h.type,
              amount: h.amount,
              post_id: h.post_id,
              comment_id: h.comment_id,
              updated_at: h.updated_at,
              created_at: h.created_at
            }))
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
          set((state) => {
            const localPending = state.history.filter((h) => !h.synced);
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
