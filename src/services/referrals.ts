// src/services/referrals.ts
//
// "Watch ads from your WhatsApp Status" — the buildable half of that idea.
//
// ── The honest framing, because it changes what this file can do ────────────
// EMILGO cannot earn ad revenue from inside WhatsApp Status. Meta sells those
// ads; there is no publisher programme, no API and no revenue share, and there
// will not be one because Status inventory is Meta's own. Any plan that depends
// on it is a plan that never ships.
//
// What works — and is what every Nigerian fintech growth team actually runs —
// is the inverse: the USER's Status becomes the ad, carrying a referral link
// back here. Their contacts are the audience, WhatsApp is the transport, and
// EMILGO pays for the installs it can attribute. Same outcome the user asked
// for; achievable this week rather than never.
//
// ── What WhatsApp will and will not let an app do ───────────────────────────
// There is no URL scheme that posts to Status. None. `whatsapp://send` opens a
// CHAT, and that is the whole surface third parties get. So "share to Status"
// is necessarily two steps: put the card and the link where the user can grab
// them, then open WhatsApp so they can post it. Pretending otherwise produces a
// button that silently does the wrong thing.
//
// The share is still logged as `whatsapp_status` when the user goes down that
// path, because the alternative — refusing to distinguish it from a direct
// message — throws away the only signal that tells you which channel converts.
//
// ── Where the money rules live ──────────────────────────────────────────────
// Not here. `migration_referrals.sql` decides who gets paid, how much, and
// whether a claim is fraudulent, because this file runs on the attacker's
// phone. Everything below is a wrapper around an RPC.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { supabase } from "./supabase";

/** Where a referral link was posted. Matches the CHECK on referral_shares. */
export type ShareChannel =
  | "whatsapp_status"
  | "whatsapp_direct"
  | "copy_link"
  | "system_share"
  | "qr"
  | "other";

export interface MyReferral {
  code: string;
  /** https — the one that belongs in a Status. */
  link: string;
  /** teqil:// — only useful on a device that already has the app. */
  deep_link: string;
  enabled: boolean;
  referrer_reward: number;
  referred_reward: number;
  qualify_trips: number;
  qualify_ads: number;
  shares: number;
  signups: number;
  pending: number;
  qualified: number;
  earned: number;
  by_channel: Record<string, number>;
}

export interface ReferralRow {
  id: string;
  name: string;
  username: string | null;
  photo: string | null;
  status: "pending" | "qualified" | "rejected";
  reward: number;
  created_at: string;
  qualified_at: string | null;
}

/**
 * A code captured from a deep link before the user had an account.
 *
 * This is the entire attribution mechanism on a fresh install: the link opens
 * the app, the app has no session yet, and the code has to survive until
 * signup finishes. AsyncStorage is the right store — losing it on reinstall is
 * correct, since a reinstall is not a new referral.
 */
const PENDING_CODE_KEY = "emilgo_pending_referral_code";

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function myReferral(origin = "https://teqil.app"): Promise<MyReferral | null> {
  const { data, error } = await supabase.rpc("my_referral", { p_origin: origin });
  if (error) {
    console.warn("[referrals] my_referral:", error.message);
    return null;
  }
  return data as MyReferral;
}

export async function listMyReferrals(limit = 50): Promise<ReferralRow[]> {
  const { data, error } = await supabase.rpc("list_my_referrals", { p_limit: limit });
  if (error) {
    console.warn("[referrals] list_my_referrals:", error.message);
    return [];
  }
  return (data ?? []) as ReferralRow[];
}

// ─── Claiming ────────────────────────────────────────────────────────────────

export type ClaimReason =
  | "disabled"
  | "unknown_code"
  | "own_code"
  | "already_referred"
  | "device_already_referred"
  | "same_device_as_referrer"
  | "account_too_old";

export interface ClaimResult {
  ok: boolean;
  reason?: ClaimReason;
  referred_reward?: number;
  qualify_trips?: number;
  qualify_ads?: number;
}

/** Human wording for every refusal the database can return. */
export function claimMessage(reason?: ClaimReason): string {
  switch (reason) {
    case "unknown_code":
      return "That code doesn't match anyone. Check the spelling.";
    case "own_code":
      return "You can't invite yourself.";
    case "already_referred":
      return "You've already used an invite code.";
    case "device_already_referred":
    case "same_device_as_referrer":
      return "This phone has already been invited once.";
    case "account_too_old":
      return "Invite codes can only be used just after signing up.";
    case "disabled":
      return "Invites are paused right now.";
    default:
      return "Couldn't apply that code.";
  }
}

export async function claimReferral(code: string): Promise<ClaimResult> {
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!clean) return { ok: false, reason: "unknown_code" };

  const { data, error } = await supabase.rpc("claim_referral", { p_code: clean });
  if (error) {
    console.warn("[referrals] claim_referral:", error.message);
    return { ok: false };
  }
  return data as ClaimResult;
}

/**
 * Ask the server whether this account has now earned its referral reward.
 *
 * Safe to call whenever — after a trip, after an ad, on app open. The function
 * recomputes the qualifying condition from trips and ad sessions it already
 * holds and pays at most once, so calling it too often costs a round trip and
 * nothing else. That is why the client is allowed to trigger it at all.
 */
export async function tryQualify(): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase.rpc("try_qualify_referral");
  if (error) return { ok: false, reason: error.message };
  return data as { ok: boolean; reason?: string };
}

// ─── Deep links ──────────────────────────────────────────────────────────────

/**
 * Pull a referral code out of any link shape we hand out.
 *
 *   teqil://r/AB3D9K
 *   https://teqil.app/r/AB3D9K
 *   https://teqil.app/r/AB3D9K?utm_source=status
 *
 * Deliberately strict about the alphabet: `gen_referral_code` never emits O, 0,
 * I, 1 or L, so anything containing them is a misread rather than a code.
 */
export function codeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/r\/([A-HJ-NP-Za-hj-np-z2-9]{4,12})/);
  return m ? m[1].toUpperCase() : null;
}

export async function rememberPendingCode(code: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_CODE_KEY, code.toUpperCase());
}

export async function takePendingCode(): Promise<string | null> {
  const code = await AsyncStorage.getItem(PENDING_CODE_KEY);
  if (code) await AsyncStorage.removeItem(PENDING_CODE_KEY);
  return code;
}

/**
 * Call once after a successful signup.
 *
 * Consumes the stored code and applies it. Returns null when there was none,
 * which is the common case and not a failure.
 */
export async function applyPendingReferral(): Promise<ClaimResult | null> {
  const code = await takePendingCode();
  if (!code) return null;
  return claimReferral(code);
}

// ─── Sharing ─────────────────────────────────────────────────────────────────

/** The message that goes out. Short, because Status text is read in two seconds. */
export function shareText(r: MyReferral): string {
  return (
    `I use EMILGO to move around and earn while I do it. ` +
    `Join with my code ${r.code} and we both get credited.\n\n${r.link}`
  );
}

/**
 * Post to WhatsApp Status.
 *
 * Two steps by necessity, not by choice: no URL scheme posts to Status, so the
 * text is copied to the clipboard and WhatsApp is opened. The caller is
 * expected to tell the user to paste — a button that opens WhatsApp with no
 * explanation reads as a bug.
 *
 * Returns what actually happened so the UI can say the right thing rather than
 * claiming success unconditionally.
 */
export async function shareToWhatsAppStatus(
  r: MyReferral,
): Promise<{ ok: boolean; copied: boolean; opened: boolean }> {
  const text = shareText(r);
  let copied = false;
  try {
    await Clipboard.setStringAsync(text);
    copied = true;
  } catch {
    /* clipboard is a convenience; the share can still proceed */
  }

  let opened = false;
  try {
    if (await Linking.canOpenURL("whatsapp://app")) {
      await Linking.openURL("whatsapp://app");
      opened = true;
    }
  } catch {
    /* not installed */
  }

  await recordShare("whatsapp_status");
  return { ok: copied || opened, copied, opened };
}

/** Send the link straight into a WhatsApp chat, which IS a supported scheme. */
export async function shareToWhatsAppChat(r: MyReferral): Promise<boolean> {
  const url = `whatsapp://send?text=${encodeURIComponent(shareText(r))}`;
  try {
    await Linking.openURL(url);
    await recordShare("whatsapp_direct");
    return true;
  } catch {
    return false;
  }
}

/** The OS share sheet — every other app, in one button. */
export async function shareAnywhere(r: MyReferral): Promise<boolean> {
  try {
    const res = await Share.share({ message: shareText(r) });
    if (res.action === Share.dismissedAction) return false;
    await recordShare("system_share");
    return true;
  } catch {
    return false;
  }
}

export async function copyLink(r: MyReferral): Promise<void> {
  await Clipboard.setStringAsync(r.link);
  await recordShare("copy_link");
}

/**
 * Log where a link went.
 *
 * Fire-and-forget on purpose: a failed analytics write must never stop a share
 * the user has already performed.
 */
export async function recordShare(channel: ShareChannel): Promise<void> {
  const { error } = await supabase.rpc("record_referral_share", { p_channel: channel });
  if (error) console.warn("[referrals] record_referral_share:", error.message);
}
