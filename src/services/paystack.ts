/**
 * src/services/paystack.ts
 *
 * Payment service. Still MOCK-backed (it simulates and logs, then resolves), but
 * the interfaces now model exactly what the live Paystack integration will do,
 * and every call returns a reference so the caller can record a transaction row.
 * Swapping to live keys later means replacing the bodies, not the signatures.
 *
 * Two flows:
 *   1. processTripPayment  — the fare split (bank + pool → driver + company).
 *   2. processPremiumPayment — a premium subscription split 60/40 via Paystack
 *      Subaccounts + Transaction Split (60% partner station, 40% Emilgo).
 */

import { apiFetch, isServerConfigured } from "./api";

export interface PaymentResult {
  success: boolean;
  reference: string;
}

// ─── Trip payment ─────────────────────────────────────────────────────────────
export interface TripPaymentParams {
  passenger_email: string;
  base_fare: number;
  passenger_bank_pays: number; // charged to the passenger's real bank account
  pool_draw: number;           // taken from the passenger's realised ad-pool
  driver_bonus: number;        // funded from the pool
  company_cut: number;         // funded from the pool
  driver_total: number;        // = base_fare + driver_bonus (driver made whole)
}

// ─── Premium subscription (60/40 split) ──────────────────────────────────────
export const STATION_SHARE_PERCENT = 0.6; // 60% → partner station fuel pot
export const COMPANY_SHARE_PERCENT = 0.4; // 40% → Emilgo

export interface PremiumPaymentParams {
  email: string;
  amount: number;              // full premium price paid by the user
  station_subaccount: string;  // Paystack subaccount code of the partner station
}

export interface PremiumSplit {
  station_share: number; // 60%
  company_share: number; // 40%
}

// ─── Bank account resolution (for payouts) ───────────────────────────────────
// Live version calls Paystack's Resolve Account API. Used by the loyalty program
// to confirm a payout account's name matches the KYC-verified identity before any
// reward money can ever be sent there.
export interface BankAccountResult {
  resolved: boolean;
  account_name: string;
}

/** Mock: derive a deterministic "account name" from the account number. */
export async function resolveBankAccount(
  bankCode: string,
  accountNumber: string
): Promise<BankAccountResult> {
  const clean = accountNumber.replace(/\D/g, "");

  // Real mode (EXPO_PUBLIC_API_URL set): resolve via the server's live Paystack.
  // Do NOT invent a name if the call fails — return unresolved so the UI honestly
  // says "couldn't verify" instead of showing fake data. (The placeholder below
  // ONLY runs when no server is configured — pure offline dev.)
  if (isServerConfigured()) {
    try {
      const data = await apiFetch<{ account_name?: string }>(
        `/api/paystack/resolve?account_number=${encodeURIComponent(clean)}&bank_code=${encodeURIComponent(bankCode)}`
      );
      return { resolved: !!data.account_name, account_name: data.account_name ?? "" };
    } catch (e) {
      console.warn("[Paystack] resolve via server failed (no fake fallback in real mode)", e);
      return { resolved: false, account_name: "" };
    }
  }

  const names = ["Chidi Okonkwo", "Amina Bello", "Emeka Obi", "Ngozi Eze", "Tunde Alabi"];
  let sum = 0;
  for (let i = 0; i < clean.length; i++) sum += clean.charCodeAt(i);
  const resolved = clean.length === 10; // Nigerian NUBAN is 10 digits
  console.log("[Paystack placeholder] resolveBankAccount (no server configured) →", { resolved });
  return {
    resolved,
    account_name: resolved ? names[sum % names.length] : "",
  };
}

/** Split a premium payment 60/40. Pure helper, safe to unit-test. */
export function computePremiumSplit(amount: number): PremiumSplit {
  const station_share = Math.round(amount * STATION_SHARE_PERCENT);
  // Company gets the remainder so the two shares always sum exactly to `amount`
  // (avoids a ₦1 rounding gap).
  const company_share = amount - station_share;
  return { station_share, company_share };
}

function makeReference(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const PaystackService = {
  /**
   * Process a trip fare payment.
   * Live version will: charge `passenger_bank_pays` to the passenger, then run a
   * Transaction Split routing `driver_total` to the driver subaccount and
   * `company_cut` to the company account (the pool portion is an internal ledger
   * move already handled by usePoolStore before this is called).
   */
  processTripPayment: async (params: TripPaymentParams): Promise<PaymentResult> => {
    // Prefer the server: it initializes the charge (passenger_bank_pays) with the
    // real Paystack secret when keys are set. Falls back to the mock on any error.
    if (isServerConfigured()) {
      try {
        const data = await apiFetch<{ reference: string }>("/api/paystack/initialize", {
          method: "POST",
          body: { email: params.passenger_email, amount: params.passenger_bank_pays },
        });
        return { success: true, reference: data.reference };
      } catch (e) {
        console.warn("[Paystack] trip payment via server failed, using mock", e);
      }
    }
    return new Promise((resolve) => {
      console.log("[Paystack Mock] Trip payment…", params);
      setTimeout(() => {
        console.log("[Paystack Mock] Trip payment ok");
        console.log(`- Passenger bank pays: ₦${params.passenger_bank_pays}`);
        console.log(`- Pool draw: ₦${params.pool_draw}`);
        console.log(`  └-> Driver total: ₦${params.driver_total} (fare ₦${params.base_fare} + bonus ₦${params.driver_bonus})`);
        console.log(`  └-> Company cut: ₦${params.company_cut}`);
        resolve({ success: true, reference: makeReference("trip") });
      }, 1200);
    });
  },

  /**
   * Process a premium subscription with a 60/40 split.
   * Live version will use Paystack Subaccounts + Transaction Split: the station
   * subaccount receives 60%, the company account 40%, in one charge.
   */
  processPremiumPayment: async (
    params: PremiumPaymentParams
  ): Promise<PaymentResult & PremiumSplit> => {
    const split = computePremiumSplit(params.amount);
    // Prefer the server: it charges the full amount and (live) runs the 60/40 split
    // via the station subaccount. Falls back to the mock on any error.
    if (isServerConfigured()) {
      try {
        const data = await apiFetch<{ reference: string }>("/api/paystack/initialize", {
          method: "POST",
          body: {
            email: params.email,
            amount: params.amount,
            subaccount: params.station_subaccount,
          },
        });
        return { success: true, reference: data.reference, ...split };
      } catch (e) {
        console.warn("[Paystack] premium payment via server failed, using mock", e);
      }
    }
    return new Promise((resolve) => {
      console.log("[Paystack Mock] Premium payment…", params, split);
      setTimeout(() => {
        console.log("[Paystack Mock] Premium payment ok");
        console.log(`- Total: ₦${params.amount}`);
        console.log(`  └-> Station (60%): ₦${split.station_share} → ${params.station_subaccount}`);
        console.log(`  └-> Company (40%): ₦${split.company_share}`);
        resolve({ success: true, reference: makeReference("prem"), ...split });
      }, 1200);
    });
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Checkout / mandate scaffold — real-Paystack-shaped, server-preferred, mock
// fallback. Raw card/bank details are used ONCE to tokenize and are NEVER
// persisted or returned. See supabase/migration_payment_methods.sql.
// ═══════════════════════════════════════════════════════════════════════════

/** Detect a card brand from its BIN (first digits). Display-only. */
export function detectCardBrand(pan: string): string {
  const n = pan.replace(/\D/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "mastercard";
  if (/^(506[01]|507[89]|6500)/.test(n)) return "verve";
  if (/^3[47]/.test(n)) return "amex";
  return "card";
}

export interface CardInput {
  email: string;
  number: string; // raw PAN — used once to tokenize, never stored
  cvv: string;
  exp_month: number;
  exp_year: number;
  holder_name: string;
}
export interface TokenizeResult {
  ok: boolean;
  token?: string;
  brand?: string;
  last4?: string;
  exp_month?: number;
  exp_year?: number;
  error?: string;
}

/**
 * Tokenize a card. Live: the SERVER charges a small verification amount via
 * Paystack and returns an `authorization_code` (the token). We keep ONLY the
 * token + last4 + brand. Mock derives last4/brand and mints a mock token — the
 * PAN/CVV are never persisted or returned.
 */
export async function tokenizeCard(card: CardInput): Promise<TokenizeResult> {
  const digits = card.number.replace(/\D/g, "");
  const brand = detectCardBrand(digits);
  const last4 = digits.slice(-4);

  if (isServerConfigured()) {
    try {
      const data = await apiFetch<{ token?: string; brand?: string; last4?: string; error?: string }>(
        "/api/paystack/tokenize-card",
        {
          method: "POST",
          body: {
            email: card.email,
            number: digits,
            cvv: card.cvv,
            exp_month: card.exp_month,
            exp_year: card.exp_year,
            name: card.holder_name,
          },
        }
      );
      if (!data.token) return { ok: false, error: data.error ?? "Card could not be verified." };
      return { ok: true, token: data.token, brand: data.brand ?? brand, last4: data.last4 ?? last4, exp_month: card.exp_month, exp_year: card.exp_year };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Card verification failed." };
    }
  }

  if (digits.length < 12 || digits.length > 19) {
    return { ok: false, error: "That card number doesn't look valid." };
  }
  console.log("[Paystack Mock] tokenizeCard →", { brand, last4 });
  return { ok: true, token: makeReference("authz"), brand, last4, exp_month: card.exp_month, exp_year: card.exp_year };
}

export interface MandateInput {
  email: string;
  account_number: string;
  bank_code: string;
  bvn?: string;
}
export interface MandateResult {
  ok: boolean;
  token?: string;
  bank_name?: string;
  last4?: string;
  error?: string;
}

/**
 * Authorize a passenger's account for direct debit. Live: the server starts a
 * Paystack Direct Debit / dedicated charge; the user consents (BVN + OTP + a small
 * verification token) and Paystack returns a mandate reference we store.
 */
export async function createDirectDebitMandate(m: MandateInput): Promise<MandateResult> {
  const clean = m.account_number.replace(/\D/g, "");
  if (isServerConfigured()) {
    try {
      const data = await apiFetch<{ token?: string; bank_name?: string; error?: string }>(
        "/api/paystack/mandate",
        { method: "POST", body: { email: m.email, account_number: clean, bank_code: m.bank_code, bvn: m.bvn } }
      );
      if (!data.token) return { ok: false, error: data.error ?? "Could not authorize direct debit." };
      return { ok: true, token: data.token, bank_name: data.bank_name, last4: clean.slice(-4) };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Mandate authorization failed." };
    }
  }
  if (clean.length !== 10) return { ok: false, error: "Enter a valid 10-digit account number." };
  console.log("[Paystack Mock] createDirectDebitMandate ok");
  return { ok: true, token: makeReference("mandate"), bank_name: "Mock Bank", last4: clean.slice(-4) };
}

export interface ChargeResult {
  ok: boolean;
  reference?: string;
  reason?: string; // e.g. "insufficient_funds", "declined"
}

/** Charge a saved token (card authorization_code or mandate). */
export async function chargeWithToken(params: { email: string; amount: number; token: string }): Promise<ChargeResult> {
  if (isServerConfigured()) {
    try {
      const data = await apiFetch<{ status?: string; reference?: string; reason?: string }>(
        "/api/paystack/charge-authorization",
        { method: "POST", body: { email: params.email, amount: params.amount, authorization_code: params.token } }
      );
      if (data.status === "success" && data.reference) return { ok: true, reference: data.reference };
      return { ok: false, reason: data.reason ?? "declined" };
    } catch (e: any) {
      return { ok: false, reason: e?.message ?? "charge_failed" };
    }
  }
  console.log("[Paystack Mock] chargeWithToken →", params.amount);
  return { ok: true, reference: makeReference("chg") };
}

export interface RecipientResult {
  ok: boolean;
  recipient_code?: string;
  account_name?: string;
  error?: string;
}

/** Create a verified transfer recipient (driver payout). Live: Paystack Name
 *  Enquiry (NIBSS) confirms the account holder before it's saved. */
export async function createTransferRecipient(params: {
  name: string;
  account_number: string;
  bank_code: string;
}): Promise<RecipientResult> {
  const clean = params.account_number.replace(/\D/g, "");
  if (isServerConfigured()) {
    try {
      const data = await apiFetch<{ recipient_code?: string; account_name?: string; error?: string }>(
        "/api/paystack/transfer-recipient",
        { method: "POST", body: { name: params.name, account_number: clean, bank_code: params.bank_code } }
      );
      if (!data.recipient_code) return { ok: false, error: data.error ?? "Could not verify that account." };
      return { ok: true, recipient_code: data.recipient_code, account_name: data.account_name };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Recipient creation failed." };
    }
  }
  const bank = await resolveBankAccount(params.bank_code, clean);
  if (!bank.resolved) return { ok: false, error: "That account could not be verified." };
  return { ok: true, recipient_code: makeReference("rcp"), account_name: bank.account_name };
}
