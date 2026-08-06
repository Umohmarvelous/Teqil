// src/utils/tiers.ts
//
// Loyalty tier derived from a user's engagement-credit balance (useCreditsStore).
// This is the Bronze / Silver / Gold status shown on the profile credit meter —
// NOT the paid free/pro/elite premium tier (that's useTierStore). Thresholds are
// defined in ONE place so the meter and any gating stay consistent.

export type CreditTierName = "Bronze" | "Silver" | "Gold";

export interface CreditTier {
  name: CreditTierName;
  color: string; // badge / meter accent
  min: number; // credits at which this tier begins
  next: number | null; // credits needed for the next tier (null at Gold)
}

// Confirmed thresholds: Bronze 0–99, Silver 100–499, Gold 500+.
const TIERS: { name: CreditTierName; min: number; color: string }[] = [
  { name: "Bronze", min: 0, color: "#CD7F32" },
  { name: "Silver", min: 100, color: "#9CA3AF" },
  { name: "Gold", min: 500, color: "#F5A623" },
];

/** The tier a credit balance currently sits in. */
export function creditTier(balance: number): CreditTier {
  const b = Math.max(0, balance || 0);
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (b >= TIERS[i].min) idx = i;
  }
  const t = TIERS[idx];
  const next = idx < TIERS.length - 1 ? TIERS[idx + 1].min : null;
  return { name: t.name, color: t.color, min: t.min, next };
}

/** Progress in [0,1] through the current tier toward the next (1 at Gold). */
export function tierProgress(balance: number): number {
  const t = creditTier(balance);
  if (t.next == null) return 1;
  const span = t.next - t.min;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, ((balance || 0) - t.min) / span));
}

/** Credits still needed to reach the next tier (0 at Gold). */
export function creditsToNextTier(balance: number): number {
  const t = creditTier(balance);
  if (t.next == null) return 0;
  return Math.max(0, t.next - (balance || 0));
}
