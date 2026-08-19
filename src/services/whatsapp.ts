// src/services/whatsapp.ts
//
// Opening a WhatsApp conversation with someone from inside EMILGO.
//
// ── What this is, and what it is not ────────────────────────────────────────
// This is a DEEP LINK. It hands the conversation over to WhatsApp and stops
// there. It does not read WhatsApp messages, does not sync them back, and does
// not tell you whether the message was ever sent — none of which is possible
// from a client.
//
// Two-way sync needs the WhatsApp Business Platform: a Meta Business account, a
// verified business, a dedicated number that can no longer be used in the normal
// WhatsApp app, a hosted HTTPS webhook, and per-conversation billing. See
// SETUP-KEYS.md §4.2. The deep link is the free 80% and it is what ships today.
//
// ── Why the number handling is so fussy ────────────────────────────────────
// `wa.me` accepts only digits in full international form. A Nigerian number
// written the way people actually write it — 0803…, +234 803…, 234-803-… — all
// have to collapse to `234803…`, and a leading `+` or a space silently produces
// a "phone number shared via url is invalid" page rather than an error we can
// catch.

import { Linking, Platform } from "react-native";

/** Nigeria. The app is Nigerian; a bare 0-prefixed number is a Nigerian one. */
const DEFAULT_COUNTRY_CODE = "234";

/**
 * Collapse any way a Nigerian number is commonly written into the digits-only
 * international form wa.me needs. Returns null when the input cannot be one.
 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // 0803… → 234803…
  if (digits.startsWith("0")) {
    const rest = digits.slice(1);
    return rest.length >= 9 ? DEFAULT_COUNTRY_CODE + rest : null;
  }
  // Already 234…
  if (digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    return digits.length >= 12 ? digits : null;
  }
  // A bare 10-digit local number, or an already-international number for some
  // other country. Both are usable as-is.
  if (digits.length === 10) return DEFAULT_COUNTRY_CODE + digits;
  return digits.length >= 11 ? digits : null;
}

export interface OpenWhatsAppResult {
  ok: boolean;
  /** Why it did not open, when it did not. */
  reason?: "no_number" | "not_installed" | "failed";
}

/**
 * Open a WhatsApp chat, optionally with a message pre-filled.
 *
 * Tries the `whatsapp://` scheme first because it goes straight to the app; the
 * `wa.me` HTTPS link is the fallback, which works through the browser and
 * offers to install WhatsApp when it is missing. Doing it the other way round
 * bounces the user through Safari even when the app is right there.
 */
export async function openWhatsApp(
  phone: string | null | undefined,
  message?: string,
): Promise<OpenWhatsAppResult> {
  const number = toWhatsAppNumber(phone);
  if (!number) return { ok: false, reason: "no_number" };

  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  const appUrl = `whatsapp://send?phone=${number}${message ? `&text=${encodeURIComponent(message)}` : ""}`;
  const webUrl = `https://wa.me/${number}${text}`;

  try {
    // canOpenURL needs the scheme declared in LSApplicationQueriesSchemes on
    // iOS; without that it returns false even when WhatsApp is installed, which
    // is why a false answer falls through to the web link rather than failing.
    const canOpenApp = Platform.OS === "ios" ? await Linking.canOpenURL(appUrl) : true;
    if (canOpenApp) {
      await Linking.openURL(appUrl);
      return { ok: true };
    }
  } catch {
    // Fall through to the web link.
  }

  try {
    await Linking.openURL(webUrl);
    return { ok: true };
  } catch {
    return { ok: false, reason: "not_installed" };
  }
}

/** Whether WhatsApp appears to be installed, for showing or hiding the action. */
export async function hasWhatsApp(): Promise<boolean> {
  try {
    return await Linking.canOpenURL("whatsapp://send?phone=2348000000000");
  } catch {
    return false;
  }
}
