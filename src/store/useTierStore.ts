import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { PremiumTier } from "../models/types";
import { resolveEffectiveTier } from "../config/devFlags";

/**
 * src/store/useTierStore.ts
 *
 * Premium tier + revenue policy state.
 *
 * Tiers: free / pro / elite. There is NO purchase flow yet (that lands with the
 * premium + fuel work later) — this store just holds the current tier plus the
 * pricing rule, so other screens can gate features and show prices consistently.
 *
 * Pricing rule (confirmed): premium price tracks the fuel price so it stays fair
 * as fuel rises. Pro = 4× one litre, Elite = 8× one litre. Prices are DERIVED
 * from `fuelPricePerLitre`, never stored separately, so changing the fuel price
 * updates both plans at once.
 *
 * `adminLossOverride` is the single hidden switch (off by default) that lets
 * Emilgo deliberately fund rewards beyond the realised pool — read by
 * computeTripSplit via its `allowOverdraw` option. Off = Emilgo can never lose money.
 */

// Multipliers on the current litre price. Easy to re-adjust in one place.
export const PRO_FUEL_MULTIPLIER = 4;
export const ELITE_FUEL_MULTIPLIER = 8;

// Fallback litre price (₦) until a live fuel price is wired in. Used only if
// `fuelPricePerLitre` has never been set.
const DEFAULT_FUEL_PRICE = 1200;

interface TierStore {
  /**
   * The tier the account has actually paid for. Feature gates should NOT read
   * this directly — use `useEffectiveTier()` so the dev override is honoured.
   */
  tier: PremiumTier;
  fuelPricePerLitre: number;


  /**
   * Admin-only loss override. When true, computeTripSplit is allowed to overdraw
   * a passenger's pool (Emilgo absorbs the shortfall) — a deliberate, controlled
   * subsidy. OFF by default; there is no user-facing toggle for it.
   */
  adminLossOverride: boolean;

  setTier: (tier: PremiumTier) => void;
  setFuelPrice: (pricePerLitre: number) => void;
  setAdminLossOverride: (on: boolean) => void;

  /** Derived plan prices from the current fuel price. */
  proPrice: () => number;
  elitePrice: () => number;
  /** Price for a given tier (free = 0). */
  priceForTier: (tier: PremiumTier) => number;
}

export const useTierStore = create<TierStore>()(
  persist(
    (set, get) => ({
      tier: "free",
      fuelPricePerLitre: DEFAULT_FUEL_PRICE,
      adminLossOverride: false,

      setTier: (tier) => set({ tier }),
      setFuelPrice: (pricePerLitre) =>
        set({ fuelPricePerLitre: Math.max(0, pricePerLitre) }),
      setAdminLossOverride: (on) => set({ adminLossOverride: on }),

      proPrice: () => get().fuelPricePerLitre * PRO_FUEL_MULTIPLIER,
      elitePrice: () => get().fuelPricePerLitre * ELITE_FUEL_MULTIPLIER,
      priceForTier: (tier) => {
        if (tier === "pro") return get().proPrice();
        if (tier === "elite") return get().elitePrice();
        return 0;
      },
    }),
    {
      name: "teqil-tier",
      storage: createJSONStorage(() => AsyncStorage),
      // Persist policy state; the derived price functions are recreated on load.
      partialize: (state) => ({
        tier: state.tier,
        fuelPricePerLitre: state.fuelPricePerLitre,
        adminLossOverride: state.adminLossOverride,
      }),
    }
  )
);

// ─── Entitlements ────────────────────────────────────────────────────────────
//
// Every premium gate in the app goes through these. They're the ONLY place the
// dev override is applied, so there's exactly one thing to audit — and removing
// the bypass later means changing one file, not hunting `tier !== "free"` checks
// across screens.

/**
 * The tier the app should behave as: the real one in production, or the
 * simulated one in development. Reactive — re-renders when either changes.
 */
export function useEffectiveTier(): PremiumTier {
  return useTierStore((s) => resolveEffectiveTier(s.tier));
}

/** Pro or Elite. */
export function useIsPremium(): boolean {
  return useEffectiveTier() !== "free";
}

/** Elite only. */
export function useIsElite(): boolean {
  return useEffectiveTier() === "elite";
}

/** Non-hook read, for use outside React (services, store actions). */
export function getEffectiveTier(): PremiumTier {
  return resolveEffectiveTier(useTierStore.getState().tier);
}
