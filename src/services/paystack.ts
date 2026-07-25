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
  const names = ["Chidi Okonkwo", "Amina Bello", "Emeka Obi", "Ngozi Eze", "Tunde Alabi"];
  let sum = 0;
  for (let i = 0; i < clean.length; i++) sum += clean.charCodeAt(i);
  const resolved = clean.length === 10; // Nigerian NUBAN is 10 digits
  console.log("[Paystack Mock] resolveBankAccount", { bankCode, resolved });
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
