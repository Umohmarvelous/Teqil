// src/utils/fuel.ts
//
// How much free fuel (₦) a driver earns for one qualifying free ride. Fixed per
// ride for now; it can scale with the GPS-measured distance later. The actual
// payout is ALWAYS capped by the realized fuel pool at redemption time (the
// redeem_fuel RPC), so this is only the *target* reward.

export const FUEL_REWARD_PER_RIDE = 500; // ₦ per completed free ride (tunable)

/** Target free-fuel reward for a qualifying free ride. */
export function computeFuelReward(opts?: { perRide?: number; distanceKm?: number }): number {
  const base = opts?.perRide ?? FUEL_REWARD_PER_RIDE;
  // Distance scaling stays conservative until GPS trip data is wired (Phase D).
  return Math.max(0, Math.round(base));
}
