// src/services/coins.ts
//
// `cs` — the app's virtual coin. Earned, gifted, spent on entitlements, and
// never, under any circumstances, turned into money.
//
// ── Read COMPLIANCE.md §0 before changing this file ────────────────────────
// `cs` is safe to run without a CBN licence for exactly one reason: it is not a
// claim on EMILGO redeemable for cash. That holds only while all of these are
// true, and this file is where they are visible:
//
//   * no function here converts cs to a currency, or a currency to cs;
//   * cs buys a NAMED ENTITLEMENT at a fixed cs price — "one half-fare ride" —
//     never "n naira of value";
//   * nothing here can move cs to a bank account.
//
// If you are about to add a `csToNaira()`, stop. That one function is the
// difference between a loyalty programme and a licence.
//
// ── The two accounts ───────────────────────────────────────────────────────
// One general pool (the app's issuance budget) and one pool per user. Watching
// an ad moves cs OUT of the general pool and INTO the user's, in a single
// transaction — see `cs_grant_from_general` in migration_cs_coins.sql. When the
// ad network actually pays, that replenishes the general pool. Stage one is
// immediate; stage two is later and is not something the app can do.

import { supabase } from "@/src/services/supabase";
import { formatCs } from "@/src/services/coinFormat";

// Formatting lives in a leaf module with no imports, so `helpers.ts` can render
// coins without dragging the Supabase client in behind it. Re-exported here so
// call sites still have one obvious place to import from.
export { COIN_UNIT, formatCs, formatCsSigned } from "@/src/services/coinFormat";


export type CsKind =
  | "ad_watch"
  | "gift_received"
  | "gift_sent"
  | "referral"
  | "signup_bonus"
  | "redeem_half_fare"
  | "redeem_fuel"
  | "redeem_commission"
  | "expiry"
  | "correction";

export interface CsEntry {
  id: number;
  amount: number;
  kind: CsKind;
  counterparty_id: string | null;
  counterparty_name: string | null;
  note: string | null;
  created_at: string;
}

export interface CsEntitlement {
  code: string;
  label: string;
  description: string;
  price_cs: number;
  for_role: string | null;
}

/** Plain-language name for a ledger row. */
export function describeCsKind(kind: CsKind, counterparty?: string | null): string {
  switch (kind) {
    case "ad_watch":          return "Watched an ad";
    case "gift_received":     return counterparty ? `Gift from ${counterparty}` : "Gift received";
    case "gift_sent":         return counterparty ? `Gift to ${counterparty}` : "Gift sent";
    case "referral":          return "Referral reward";
    case "signup_bonus":      return "Welcome bonus";
    case "redeem_half_fare":  return "Redeemed a half-fare ride";
    case "redeem_fuel":       return "Redeemed a fuel voucher";
    case "redeem_commission": return "Redeemed a commission waiver";
    case "expiry":            return "Expired";
    default:                  return "Adjustment";
  }
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) {
    console.warn(`[coins] ${fn}:`, error.message);
    return null;
  }
  return data as T;
}

export async function getBalance(): Promise<number> {
  const n = await rpc<number>("cs_balance");
  return typeof n === "number" ? n : 0;
}

export async function getGeneralPool(): Promise<number> {
  const n = await rpc<number>("cs_general_balance");
  return typeof n === "number" ? n : 0;
}

export async function getHistory(limit = 100): Promise<CsEntry[]> {
  return (await rpc<CsEntry[]>("cs_history", { p_limit: limit })) ?? [];
}

export async function getEntitlements(): Promise<CsEntitlement[]> {
  const { data, error } = await supabase
    .from("cs_entitlements")
    .select("code,label,description,price_cs,for_role")
    .eq("enabled", true)
    .order("price_cs");
  if (error) {
    console.warn("[coins] entitlements:", error.message);
    return [];
  }
  return (data ?? []) as CsEntitlement[];
}

// ═════════════════════════════════════════════════════════════════════════════
// EARNING
// ═════════════════════════════════════════════════════════════════════════════

export type GrantResult =
  | { ok: true; granted: number; duplicate: boolean; balance: number; pool?: number }
  | { ok: false; reason: "general_pool_empty" | "error"; pool?: number; balance?: number };

/**
 * Stage one: an ad finished, so the general pool pays this user.
 *
 * `dedupeKey` must identify the AD SESSION, not the moment of calling — a
 * client that retries after a dropped response has to be paid once, and a
 * timestamp-based key would pay twice.
 *
 * An empty general pool is a real answer, not a failure: it means the ad network
 * has not settled yet. Telling the user that is better than crediting cs the
 * company has not earned.
 */
export async function grantForAd(
  amount: number,
  dedupeKey: string,
  note?: string,
): Promise<GrantResult> {
  const res = await rpc<any>("cs_grant_from_general", {
    p_amount: Math.round(amount),
    p_dedupe_key: dedupeKey,
    p_note: note ?? null,
  });
  if (!res) return { ok: false, reason: "error" };
  return res as GrantResult;
}

// ═════════════════════════════════════════════════════════════════════════════
// GIFTING
// ═════════════════════════════════════════════════════════════════════════════

export interface GiftConfig {
  min_gift: number;
  max_gift: number;
  daily_sent_cap: number;
  daily_gift_count: number;
  enabled: boolean;
}

export async function getGiftConfig(): Promise<GiftConfig> {
  const { data } = await supabase
    .from("cs_gift_config")
    .select("min_gift,max_gift,daily_sent_cap,daily_gift_count,enabled")
    .maybeSingle();
  return (
    (data as GiftConfig) ?? {
      min_gift: 5, max_gift: 500, daily_sent_cap: 2000,
      daily_gift_count: 20, enabled: true,
    }
  );
}

export type GiftFailure =
  | "disabled" | "invalid_recipient" | "unknown_recipient" | "out_of_range"
  | "insufficient" | "daily_cap" | "daily_count" | "error";

export type GiftResult =
  | { ok: true; amount: number; to_name: string; to_role: string; balance: number; reference: string }
  | { ok: false; reason: GiftFailure; min?: number; max?: number; balance?: number; cap?: number; sent_today?: number };

/** Send cs to another user. Points move; nothing else does. */
export async function giftCoins(
  toUserId: string,
  amount: number,
  note?: string,
): Promise<GiftResult> {
  const res = await rpc<any>("cs_gift", {
    p_to_user: toUserId,
    p_amount: Math.round(amount),
    p_note: note?.trim() || null,
  });
  if (!res) return { ok: false, reason: "error" };
  return res as GiftResult;
}

/** A sentence a user can act on, for each way a gift can be refused. */
export function explainGiftFailure(r: Extract<GiftResult, { ok: false }>): string {
  switch (r.reason) {
    case "disabled":
      return "Gifting is switched off at the moment.";
    case "invalid_recipient":
      return "You can't gift coins to yourself.";
    case "unknown_recipient":
      return "That account no longer exists.";
    case "out_of_range":
      return `A gift has to be between ${formatCs(r.min ?? 5)} and ${formatCs(r.max ?? 500)}.`;
    case "insufficient":
      return `You only have ${formatCs(r.balance ?? 0)}. Watch an ad to earn more.`;
    case "daily_cap":
      return `You've gifted ${formatCs(r.sent_today ?? 0)} today, and the daily limit is ${formatCs(r.cap ?? 0)}. Try again tomorrow.`;
    case "daily_count":
      return `You've sent the maximum number of gifts today (${r.cap}). Try again tomorrow.`;
    default:
      return "That didn't go through. Check your connection and try again.";
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SPENDING
// ═════════════════════════════════════════════════════════════════════════════

export type RedeemResult =
  | { ok: true; voucher: string; label: string; price: number; balance: number }
  | { ok: false; reason: "unknown_entitlement" | "wrong_role" | "insufficient" | "error"; balance?: number; price?: number };

/**
 * Spend cs on a named entitlement and get a voucher code back.
 *
 * The voucher is the whole design: cs buys a THING with a code you show at the
 * pump or at the gate. It never buys "an amount", because an amount is what a
 * balance of money is.
 */
export async function redeem(code: string): Promise<RedeemResult> {
  const res = await rpc<any>("cs_redeem", { p_code: code });
  if (!res) return { ok: false, reason: "error" };
  return res as RedeemResult;
}

export interface CsRedemption {
  id: string;
  code: string;
  price_cs: number;
  voucher_code: string;
  used_at: string | null;
  expires_at: string;
  created_at: string;
}

export async function getRedemptions(): Promise<CsRedemption[]> {
  const { data, error } = await supabase
    .from("cs_redemptions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.warn("[coins] redemptions:", error.message);
    return [];
  }
  return (data ?? []) as CsRedemption[];
}
