import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { supabase } from "../services/supabase";
import { STATION_SHARE_PERCENT } from "../services/paystack";

/**
 * src/store/useFuelPoolStore.ts
 *
 * The GLOBAL fuel reward pool (Phase A of the fuel-partnership / free-ride system).
 * Unlike usePoolStore (a per-passenger, offline-first pool), this is a SHARED pool
 * whose authoritative balance lives on the server (fuel_pool_history). It is:
 *   • credited by the 60% station share of every premium payment (creditPremiumShare),
 *   • drawn down when a driver redeems free fuel for a qualifying free ride
 *     (redeemFuel → the redeem_fuel RPC, which caps at the realized balance under an
 *     advisory lock so it can never overdraw — that's what makes "nobody loses money"
 *     provable).
 *
 * We cache the last-known balance locally for instant display; call refresh() to
 * re-sync the true global balance. See supabase/migrations/migration_fuel_pool.sql.
 */

/** The share of a premium payment that funds free fuel (60%). */
export const FUEL_STATION_SHARE = STATION_SHARE_PERCENT;

interface FuelPoolStore {
  balance: number; // last-known GLOBAL pool balance (server is authoritative)

  /** Re-read the true global pool balance from the server. */
  refresh: () => Promise<number>;

  /** Credit the 60% station share of a premium payment into the pool (idempotent by ref). */
  creditPremiumShare: (userId: string, premiumAmount: number, ref: string) => Promise<number>;

  /**
   * Redeem free fuel for a driver's qualifying free ride. Returns the ₦ actually
   * redeemed (0 if the pool can't cover it — the trip then just isn't fuel-funded).
   */
  redeemFuel: (driverId: string, amount: number, tripId: string) => Promise<number>;
}

export const useFuelPoolStore = create<FuelPoolStore>()(
  persist(
    (set, get) => ({
      balance: 0,

      refresh: async () => {
        try {
          const { data, error } = await supabase.rpc("fuel_pool_balance");
          if (!error && typeof data === "number") {
            set({ balance: data });
            return data;
          }
        } catch (e) {
          console.warn("[FuelPool] refresh failed", e);
        }
        return get().balance;
      },

      creditPremiumShare: async (userId, premiumAmount, ref) => {
        const share = Math.round((premiumAmount || 0) * FUEL_STATION_SHARE);
        if (share <= 0 || !userId) return 0;
        try {
          const { error } = await supabase.from("fuel_pool_history").upsert(
            [{ user_id: userId, amount: share, kind: "premium_share", dedupe_key: `premshare:${ref}` }],
            { onConflict: "dedupe_key", ignoreDuplicates: true }
          );
          if (!error) set((s) => ({ balance: s.balance + share }));
        } catch (e) {
          console.warn("[FuelPool] creditPremiumShare failed", e);
        }
        return share;
      },

      redeemFuel: async (driverId, amount, tripId) => {
        if (!driverId || amount <= 0) return 0;
        try {
          const { data, error } = await supabase.rpc("redeem_fuel", {
            p_driver_id: driverId,
            p_amount: amount,
            p_trip_id: tripId,
          });
          const redeemed = !error && typeof data === "number" ? data : 0;
          if (redeemed > 0) set((s) => ({ balance: Math.max(0, s.balance - redeemed) }));
          return redeemed;
        } catch (e) {
          console.warn("[FuelPool] redeemFuel failed", e);
          return 0;
        }
      },
    }),
    {
      name: "teqil-fuel-pool",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ balance: s.balance }),
    }
  )
);
