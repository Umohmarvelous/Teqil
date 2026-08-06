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
 * The pool starts empty for everyone (ad revenue lands in Step 4), so until a
 * pool is funded every trip is BLOCKED — the passenger is never charged and the
 * driver is never shorted. Funding a pool (`ad_revenue`, or the admin override)
 * switches the discounted split on automatically.
 */

// ─── Fixed revenue amounts (per spec) ────────────────────────────────────────
// Named constants, not magic numbers, so they are easy to change in one place.
// Confirmed example (fare ₦1000): passenger pays ₦500, the pool matches ₦500 +
// ₦100 driver bonus (driver nets ₦1100), and a ₦100 company cut is taken from
// the pool only when it can still afford it.
export const DEFAULT_DRIVER_BONUS = 100;      // ₦ fixed fuel bonus paid to the driver
export const DEFAULT_COMPANY_CUT = 100;       // ₦ fixed, optional Emilgo revenue per trip (passenger pool)
export const DEFAULT_DRIVER_COMMISSION = 100; // ₦ fixed, optional Emilgo cut from the DRIVER's own pool

/**
 * Pure, side-effect-free split calculator — the heart of the revenue system.
 *
 * Strict rule (confirmed): the passenger ALWAYS pays exactly HALF the fare, and
 * the pool MATCHES that half + pays a fixed ₦100 driver bonus, so the driver is
 * always made whole at `baseFare + ₦100`. Both are mandatory:
 *
 *   • If the pool cannot cover `half + bonus`, the trip is BLOCKED (the caller
 *     must refuse the payment) — we never short the driver, never make the
 *     passenger pay more than half.
 *   • The ₦100 company cut is OPTIONAL — taken from the pool only if it still
 *     has it after the mandatory part.
 *
 * `allowOverdraw` (the admin loss-override) treats the pool as unlimited — the
 * ONLY path by which Emilgo deliberately funds a trip out of its own pocket, and
 * the way to demo/test the funded flow while pools are ₦0. Off by default.
 *
 * NOTE: the separate ₦100 driver commission is drawn from the DRIVER's OWN pool
 * via charge_driver_commission() at payment time — not part of this split.
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

  // The passenger always pays exactly half; the pool must match that half.
  const half = Math.round(baseFare / 2);

  // Spendable pool: its real balance (never below 0), or unlimited under the
  // admin override (Emilgo deliberately funds the shortfall).
  const available = opts?.allowOverdraw ? Infinity : Math.max(0, poolBalance);

  // Mandatory: matching half + fixed driver bonus. Can't cover it → BLOCK.
  const required = half + driverBonusTarget;
  if (available < required) {
    return {
      baseFare,
      passengerBankPays: half, // what they *would* pay once the pool is funded
      fareSubsidy: 0,
      driverBonus: 0,
      companyCut: 0,
      driverReceives: 0,
      poolDraw: 0,
      blocked: true,
      shortfall: required - available,
    };
  }

  // Funded: pool matches the half + pays the bonus; company cut only if the pool
  // still affords it after the mandatory part.
  const fareSubsidy = half;
  const driverBonus = driverBonusTarget;
  const companyCut = available - required >= companyCutTarget ? companyCutTarget : 0;

  return {
    baseFare,
    passengerBankPays: half,
    fareSubsidy,
    driverBonus,
    companyCut,
    driverReceives: baseFare + driverBonus,
    poolDraw: fareSubsidy + driverBonus + companyCut,
    blocked: false,
    shortfall: 0,
  };
}

/**
 * Charge the fixed ₦100 driver commission from the DRIVER's OWN pool — optional,
 * best-effort, never blocks a trip.
 *
 * A passenger can't write another user's pool_history (RLS = own row), so this
 * runs through the `charge_driver_commission` SECURITY DEFINER RPC, which debits
 * the driver's pool ONLY if it can afford it and is idempotent per trip. Returns
 * the amount actually charged (0 if skipped — e.g. driver pool empty, or the RPC
 * isn't deployed yet). See supabase/migrations/migration_driver_commission.sql.
 */
export async function chargeDriverCommission(
  driverId: string | undefined | null,
  tripId: string,
  amount: number = DEFAULT_DRIVER_COMMISSION
): Promise<number> {
  if (!driverId) return 0;
  try {
    const { data, error } = await supabase.rpc("charge_driver_commission", {
      p_driver_id: driverId,
      p_trip_id: tripId,
      p_amount: amount,
    });
    if (error) return 0;
    return typeof data === "number" ? data : 0;
  } catch (e) {
    console.warn("[Pool] driver commission skipped", e);
    return 0;
  }
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
   * balance; if funded, writes ONE negative `trip_spend` entry (idempotent by
   * trip id) and returns the split. If the pool can't cover half + bonus the
   * returned split has `blocked: true` and NO entry is written. Returns null if
   * this trip was already spent (duplicate guard).
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

        // Blocked: the pool can't fund the matching half + bonus. Write NOTHING
        // and hand the blocked split back so the caller refuses the payment.
        if (split.blocked) {
          return split;
        }

        // Funded: draw the pool once (idempotent by trip id).
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
