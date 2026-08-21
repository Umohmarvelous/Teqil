// src/services/currency.ts
//
// Real money, in the user's own currency — and the hard wall between it and
// `cs`.
//
// ── Why this replaced formatNaira() ────────────────────────────────────────
// `₦` was hard-coded in 89 places, so the app was a Nigerian app with a
// Nigerian-only price format. EMILGO has to work in any country, and a fare in
// Accra has to read "GH₵12", not "₦12".
//
// ── The rule this file enforces ────────────────────────────────────────────
// Read COMPLIANCE.md §0 before adding anything here.
//
// This module formats MONEY — amounts a bank actually moves: a fare, a
// checkout, a settlement to a driver's account, a subscription charge. Those
// screens must show the true amount in a real currency, because they have to
// reconcile against a bank statement, and because Apple and Google both require
// the price a user is about to be charged to be shown plainly.
//
// It does NOT format `cs`. That lives in `src/services/coins.ts`, and there is
// deliberately no function anywhere that converts between the two. A published
// rate from an in-app unit to a currency is the single strongest evidence that
// the unit is stored value — which is exactly the licence this app cannot
// afford. `coinsToNaira(c) = c * 0.7` used to exist. It is gone.

import { useAuthStore } from "@/src/store/useStore";

export interface CurrencyDef {
  code: string;
  symbol: string;
  /** Locale used for digit grouping — "1,000" vs "1.000" vs "1 000". */
  locale: string;
  /** Minor units. Naira is quoted whole; USD and EUR are not. */
  decimals: number;
}

/**
 * The currencies EMILGO can quote in.
 *
 * Deliberately a short list rather than every ISO 4217 code: each one here is a
 * market where the payment processor can actually settle. Adding a row without
 * a processor that supports it produces a screen that quotes a price nobody can
 * pay.
 */
export const CURRENCIES: Record<string, CurrencyDef> = {
  NGN: { code: "NGN", symbol: "₦",   locale: "en-NG", decimals: 0 },
  GHS: { code: "GHS", symbol: "GH₵", locale: "en-GH", decimals: 2 },
  KES: { code: "KES", symbol: "KSh", locale: "en-KE", decimals: 0 },
  ZAR: { code: "ZAR", symbol: "R",   locale: "en-ZA", decimals: 2 },
  XOF: { code: "XOF", symbol: "CFA", locale: "fr-SN", decimals: 0 },
  EGP: { code: "EGP", symbol: "E£",  locale: "en-EG", decimals: 2 },
  USD: { code: "USD", symbol: "$",   locale: "en-US", decimals: 2 },
  EUR: { code: "EUR", symbol: "€",   locale: "en-IE", decimals: 2 },
  GBP: { code: "GBP", symbol: "£",   locale: "en-GB", decimals: 2 },
};

export const DEFAULT_CURRENCY = "NGN";

/** ISO-3166 country → the currency EMILGO quotes there. */
export const COUNTRY_CURRENCY: Record<string, string> = {
  NG: "NGN", GH: "GHS", KE: "KES", ZA: "ZAR", EG: "EGP",
  SN: "XOF", CI: "XOF", BJ: "XOF", TG: "XOF", ML: "XOF", BF: "XOF",
  US: "USD", GB: "GBP",
  IE: "EUR", FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR", PT: "EUR", NL: "EUR",
};

export const COUNTRIES: { code: string; name: string; dial: string }[] = [
  { code: "NG", name: "Nigeria",       dial: "+234" },
  { code: "GH", name: "Ghana",         dial: "+233" },
  { code: "KE", name: "Kenya",         dial: "+254" },
  { code: "ZA", name: "South Africa",  dial: "+27"  },
  { code: "EG", name: "Egypt",         dial: "+20"  },
  { code: "SN", name: "Senegal",       dial: "+221" },
  { code: "CI", name: "Côte d'Ivoire", dial: "+225" },
  { code: "US", name: "United States", dial: "+1"   },
  { code: "GB", name: "United Kingdom",dial: "+44"  },
];

export function currencyForCountry(country?: string | null): string {
  if (!country) return DEFAULT_CURRENCY;
  return COUNTRY_CURRENCY[country.toUpperCase()] ?? DEFAULT_CURRENCY;
}

export function currencyDef(code?: string | null): CurrencyDef {
  return CURRENCIES[(code ?? "").toUpperCase()] ?? CURRENCIES[DEFAULT_CURRENCY];
}

/**
 * The signed-in user's currency.
 *
 * Read imperatively from the store so every existing `formatMoney(n)` call site
 * picks it up without threading a prop through five components — the same
 * pattern `formatDistance` already uses for the distance unit.
 */
export function activeCurrency(): CurrencyDef {
  const user = useAuthStore.getState().user as any;
  return currencyDef(user?.currency_code ?? currencyForCountry(user?.country_code));
}

/**
 * Format a REAL money amount. `₦1,200`, `GH₵12.50`, `$4.99`.
 *
 * Pass `currency` explicitly when rendering something quoted in a currency that
 * is not the viewer's — a receipt for a trip taken abroad, for instance. A
 * receipt must show what was actually charged, never a re-quote.
 */
export function formatMoney(amount: number, currency?: string): string {
  const c = currency ? currencyDef(currency) : activeCurrency();
  const n = Number.isFinite(amount) ? amount : 0;
  const body = n.toLocaleString(c.locale, {
    minimumFractionDigits: c.decimals,
    maximumFractionDigits: c.decimals,
  });
  return `${c.symbol}${body}`;
}

/** Same, but never negative-signed in front of the symbol: "-₦500" not "₦-500". */
export function formatMoneySigned(amount: number, currency?: string): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${formatMoney(Math.abs(amount), currency)}`;
}

/** Just the symbol, for an input field's prefix. */
export function currencySymbol(currency?: string): string {
  return (currency ? currencyDef(currency) : activeCurrency()).symbol;
}
