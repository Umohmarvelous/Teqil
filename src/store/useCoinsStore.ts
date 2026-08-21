// src/store/useCoinsStore.ts
//
// The user's `cs` balance and statement, cached for instant paint and
// reconciled against the server, which is the only thing that can mint.
//
// ── Why the balance is never written locally ───────────────────────────────
// `useCreditsStore` computes its balance by summing a locally-appendable
// ledger, which is fine for a score. It is not fine for something a user can
// GIFT: a client that can add a positive entry can gift coins it never earned.
//
// So this store holds a CACHE, not a ledger. Every mutation goes to an RPC that
// checks a balance the client cannot see or edit, and the number that comes back
// replaces the cached one. Optimism here is limited to showing the server's
// answer immediately after it arrives.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

import * as coins from "@/src/services/coins";

interface CoinsState {
  balance: number;
  history: coins.CsEntry[];
  entitlements: coins.CsEntitlement[];
  redemptions: coins.CsRedemption[];
  giftConfig: coins.GiftConfig | null;
  loading: boolean;
  /** Last successful refresh, so a screen can show staleness honestly. */
  syncedAt: string | null;

  refresh: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  gift: (toUserId: string, amount: number, note?: string) => Promise<coins.GiftResult>;
  redeem: (code: string) => Promise<coins.RedeemResult>;
  creditForAd: (amount: number, dedupeKey: string, note?: string) => Promise<coins.GrantResult>;
  clear: () => void;
}

export const useCoinsStore = create<CoinsState>()(
  persist(
    (set, get) => ({
      balance: 0,
      history: [],
      entitlements: [],
      redemptions: [],
      giftConfig: null,
      loading: false,
      syncedAt: null,

      refresh: async () => {
        set({ loading: true });
        try {
          // One round of parallel reads rather than four awaited in sequence:
          // this runs on a screen open, and four serial round trips on a slow
          // connection is the difference between instant and visibly loading.
          const [balance, history, entitlements, redemptions, giftConfig] =
            await Promise.all([
              coins.getBalance(),
              coins.getHistory(),
              coins.getEntitlements(),
              coins.getRedemptions(),
              coins.getGiftConfig(),
            ]);
          set({
            balance, history, entitlements, redemptions, giftConfig,
            syncedAt: new Date().toISOString(),
          });
        } finally {
          set({ loading: false });
        }
      },

      refreshBalance: async () => {
        const balance = await coins.getBalance();
        set({ balance, syncedAt: new Date().toISOString() });
      },

      gift: async (toUserId, amount, note) => {
        const res = await coins.giftCoins(toUserId, amount, note);
        if (res.ok) {
          // The server returned the authoritative balance; take it rather than
          // subtracting locally, so a concurrent gift from another device can
          // never leave the two disagreeing.
          set({ balance: res.balance });
          await get().refresh();
        }
        return res;
      },

      redeem: async (code) => {
        const res = await coins.redeem(code);
        if (res.ok) {
          set({ balance: res.balance });
          await get().refresh();
        }
        return res;
      },

      creditForAd: async (amount, dedupeKey, note) => {
        const res = await coins.grantForAd(amount, dedupeKey, note);
        if (res.ok) set({ balance: res.balance });
        return res;
      },

      clear: () => set({
        balance: 0, history: [], redemptions: [], syncedAt: null,
      }),
    }),
    {
      name: "emilgo-coins",
      storage: createJSONStorage(() => AsyncStorage),
      // The balance is cached for paint only; `refresh()` replaces it on open.
      // Entitlement prices and the gift config are server config and are not
      // worth persisting — a stale price would be shown as if it were current.
      partialize: (s) => ({ balance: s.balance, history: s.history, syncedAt: s.syncedAt }),
    },
  ),
);
