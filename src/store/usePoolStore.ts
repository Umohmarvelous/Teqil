import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { PoolEntry, PoolEntryKind, TripSplit } from "../models/types";
import { supabase } from "../services/supabase";

/**
 * src/store/usePoolStore.ts
 *
 * The passenger's **money pool** — real Naira that funds the fare discount, the
 * driver's fuel bonus and the company cut. It mirrors the proven ledger design
 * of `useCreditsStore` (append-only entries, deterministic dedupe keys, offline
 * push/pull) with one hard rule:
 *
 *   The balance is ALWAYS the sum of the ledger entries. It is never set
 *   directly. This is what makes "Emilgo can only spend money it actually has"
 *   provable — you cannot fake a balance, you can only add entries that a server
 *   can verify.
 *
 * In Step 3 the pool starts empty for everyone (no ad revenue exists yet), so no
 * discount is given and the passenger pays the full fare from their bank — the
 * safe default. Step 4 credits realised ad revenue in via `ad_revenue` entries,
 * at which point discounts switch on automatically.
 */

// ─── Tunable revenue amounts (spec §Step 3; user will re-adjust later) ───────
// Named constants, not magic numbers, so they are easy to change in one place.
// From the confirmed example (fare ₦500): pool ideally covers the other ₦250
// (half), plus a small ₦100 fuel bonus for the driver, plus ₦250 company cut.
export const DEFAULT_DRIVER_BONUS = 100; // ₦ fuel bonus paid to the driver
export const DEFAULT_COMPANY_CUT = 250;  // ₦ Emilgo's revenue per trip

/**
 * Pure, side-effect-free split calculator — the heart of the revenue system.
 *
 * The pool funds three things, in strict priority order so that when funds are
 * thin the RIGHT thing is sacrificed first:
 *   1. Fare subsidy (the passenger's discount)  ← the product's core promise
 *   2. Driver fuel bonus                         ← a perk, only if money remains
 *   3. Company cut                               ← Emilgo profits only on surplus
 *
 * The driver is ALWAYS made whole: `driverReceives = baseFare + driverBonus`,
 * because whatever the pool does not subsidise, the passenger pays from their
 * bank (`passengerBankPays = baseFare - fareSubsidy`).
 *
 * With `allowOverdraw` (the admin loss-override) the pool may go negative — this
 * is the ONLY path by which Emilgo funds rewards out of its own pocket, and it
 * is off by default.
 */
export function computeTripSplit(
  baseFare: number,
  poolBalance: number,
  opts?: {
    driverBonus?: number;
    companyCut?: number;
    allowOverdraw?: boolean;
  }
): TripSplit {
  const driverBonusTarget = opts?.driverBonus ?? DEFAULT_DRIVER_BONUS;
  const companyCutTarget = opts?.companyCut ?? DEFAULT_COMPANY_CUT;

  // The pool ideally covers "the other half" of the fare.
  const halfFare = Math.round(baseFare / 2);

  // How much the pool is allowed to spend. Normally its real balance (never
  // below 0); with the admin override, unlimited (Emilgo absorbs the shortfall).
  const available = opts?.allowOverdraw ? Infinity : Math.max(0, poolBalance);

  // Allocate in priority order.
  const fareSubsidy = Math.min(available, halfFare);
  const afterSubsidy = available - fareSubsidy;
  const driverBonus = Math.min(afterSubsidy, driverBonusTarget);
  const afterBonus = afterSubsidy - driverBonus;
  const companyCut = Math.min(afterBonus, companyCutTarget);

  const passengerBankPays = baseFare - fareSubsidy;
  const driverReceives = baseFare + driverBonus;
  const poolDraw = fareSubsidy + driverBonus + companyCut;

  return {
    baseFare,
    passengerBankPays,
    fareSubsidy,
    driverBonus,
    companyCut,
    driverReceives,
    poolDraw,
  };
}

interface PoolStore {
  balance: number;
  history: PoolEntry[];

  /** Append a raw ledger entry (positive = credit in, negative = spend). */
  addPoolEntry: (
    userId: string,
    amount: number,
    kind: PoolEntryKind,
    opts?: { tripId?: string; dedupeKey?: string }
  ) => Promise<void>;

  /** Credit realised ad revenue into a user's pool (used from Step 4). */
  addAdRevenue: (userId: string, amount: number) => Promise<void>;

  /**
   * Spend from the pool to fund a trip. Computes the split against the CURRENT
   * balance, writes ONE negative `trip_spend` entry (idempotent by trip id) and
   * returns the split so the caller can charge the bank / record the txn.
   * Returns null if this trip was already spent (duplicate guard).
   */
  spendForTrip: (
    userId: string,
    baseFare: number,
    tripId: string,
    opts?: { driverBonus?: number; companyCut?: number; allowOverdraw?: boolean }
  ) => Promise<TripSplit | null>;

  syncPool: () => Promise<void>;
  pullPool: (userId: string) => Promise<void>;
}

export const usePoolStore = create<PoolStore>()(
  persist(
    (set, get) => ({
      balance: 0,
      history: [],

      addPoolEntry: async (userId, amount, kind, opts) => {
        const dedupeKey = opts?.dedupeKey;

        // Idempotency: if we already hold an entry with this key, do nothing.
        if (dedupeKey && get().history.some((h) => h.dedupe_key === dedupeKey)) {
          return;
        }

        const now = new Date().toISOString();
        const entry: PoolEntry = {
          id: Math.random().toString(36).substring(7), // temp local id
          user_id: userId,
          amount,
          kind,
          trip_id: opts?.tripId,
          dedupe_key: dedupeKey,
          synced: false,
          updated_at: now,
          created_at: now,
        };

        set((state) => ({
          balance: state.balance + amount,
          history: [entry, ...state.history],
        }));

        await get().syncPool();
      },

      addAdRevenue: async (userId, amount) => {
        if (amount <= 0) return;
        await get().addPoolEntry(userId, amount, "ad_revenue");
      },

      spendForTrip: async (userId, baseFare, tripId, opts) => {
        const dedupeKey = `${userId}:trip:${tripId}`;
        // Never spend the same trip twice.
        if (get().history.some((h) => h.dedupe_key === dedupeKey)) {
          return null;
        }

        const split = computeTripSplit(baseFare, get().balance, opts);

        // A zero draw (empty pool, no override) still succeeds — the passenger
        // simply pays the full fare from their bank; we skip writing an empty row.
        if (split.poolDraw > 0) {
          await get().addPoolEntry(userId, -split.poolDraw, "trip_spend", {
            tripId,
            dedupeKey,
          });
        }

        return split;
      },

      syncPool: async () => {
        const unsynced = get().history.filter((h) => !h.synced);
        if (unsynced.length === 0) return;

        try {
          // Upsert with ON CONFLICT (dedupe_key) DO NOTHING — a row the server
          // already has (retry, another device) is ignored, never double-applied.
          const { error } = await supabase.from("pool_history").upsert(
            unsynced.map((h) => ({
              user_id: h.user_id,
              amount: h.amount,
              kind: h.kind,
              trip_id: h.trip_id,
              dedupe_key: h.dedupe_key,
              updated_at: h.updated_at,
              created_at: h.created_at,
            })),
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
          console.warn("[Pool] sync failed, will retry later", err);
        }
      },

      // Pull the authoritative ledger and recompute balance. Keeps local pending
      // rows the server does not yet have so nothing spent/earned offline is lost.
      pullPool: async (userId) => {
        try {
          const { data, error } = await supabase
            .from("pool_history")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });

          if (error || !data) return;

          const remote: PoolEntry[] = data.map((r: any) => ({ ...r, synced: true }));
          const remoteKeys = new Set(
            remote.map((r) => r.dedupe_key).filter(Boolean) as string[]
          );
          set((state) => {
            const localPending = state.history.filter(
              (h) => !h.synced && !(h.dedupe_key && remoteKeys.has(h.dedupe_key))
            );
            const history = [...localPending, ...remote];
            const balance = history.reduce((sum, h) => sum + (h.amount || 0), 0);
            return { history, balance };
          });
        } catch (err) {
          console.warn("[Pool] pullPool failed", err);
        }
      },
    }),
    {
      name: "teqil-pool",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ balance: state.balance, history: state.history }),
    }
  )
);
