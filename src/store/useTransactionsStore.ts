import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { RevenueTransaction } from "../models/types";
import { supabase } from "../services/supabase";

/**
 * src/store/useTransactionsStore.ts
 *
 * Append-only audit trail of every money movement (trip payments + premium
 * subscriptions). Same offline-first ledger pattern as usePoolStore: records are
 * stored locally, then upserted to the `transactions` table with an idempotent
 * `dedupe_key` so a retry never writes a duplicate row.
 *
 * This is an AUDIT record, not the source of truth for balances — the pool
 * balance still comes from usePoolStore's ledger. Keeping it separate means the
 * full breakdown of each trip (bank paid, subsidy, bonus, company cut) is
 * queryable for reporting without bloating the pool ledger.
 */

interface TransactionsStore {
  history: RevenueTransaction[];
  record: (txn: Omit<RevenueTransaction, "synced">) => Promise<void>;
  sync: () => Promise<void>;
}

export const useTransactionsStore = create<TransactionsStore>()(
  persist(
    (set, get) => ({
      history: [],

      record: async (txn) => {
        // Idempotency: same dedupe_key = same event, never recorded twice.
        if (
          txn.dedupe_key &&
          get().history.some((h) => h.dedupe_key === txn.dedupe_key)
        ) {
          return;
        }
        set((state) => ({
          history: [{ ...txn, synced: false }, ...state.history],
        }));
        await get().sync();
      },

      sync: async () => {
        const unsynced = get().history.filter((h) => !h.synced);
        if (unsynced.length === 0) return;

        try {
          const { error } = await supabase.from("transactions").upsert(
            unsynced.map(({ synced, id, ...rest }) => rest),
            { onConflict: "dedupe_key", ignoreDuplicates: true }
          );
          if (!error) {
            set((state) => ({
              history: state.history.map((h) =>
                unsynced.find((u) => u.id === h.id) ? { ...h, synced: true } : h
              ),
            }));
          }
        } catch (err) {
          console.warn("[Transactions] sync failed, will retry later", err);
        }
      },
    }),
    {
      name: "teqil-transactions",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ history: state.history }),
    }
  )
);
