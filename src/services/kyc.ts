/**
 * src/services/kyc.ts
 *
 * Identity verification (KYC) shaped around Smile Identity, MOCK-backed for now.
 * Same approach as the Paystack mock: the interfaces match what the live provider
 * needs, so going live later means replacing the function bodies with real Smile
 * Identity API calls (using keys the user obtains) — no UI changes.
 *
 * PRIVACY: the raw NIN/BVN never leaves this module except to the (mock) provider,
 * and it is NEVER stored. We persist only `hashIdentity(...)` — a salted hash used
 * to enforce "one identity per account". See the production note on hashIdentity.
 */

const DEV_OTP_CODE = "123456"; // mock: the only code that "works" until real OTP is wired

// A fixed app-side salt for the identity hash. In production this should come from
// a secret (env), not be committed.
const IDENTITY_SALT = "emilgo:v1:kyc";

/**
 * Deterministic, non-reversible-ish hash of a government ID + salt.
 *
 * NOTE: this is an FNV-1a hash — good enough to enforce uniqueness for the mock
 * without storing the raw number. In PRODUCTION replace this with a real
 * cryptographic hash, e.g. expo-crypto:
 *   await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, IDENTITY_SALT + id)
 */
export function hashIdentity(idNumber: string): string {
  const input = `${IDENTITY_SALT}:${idNumber.trim()}`;
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  // Unsigned, base36 for a compact stable string.
  return (h >>> 0).toString(36);
}

export interface VerifyIdentityParams {
  idType: "nin" | "bvn";
  idNumber: string;
  selfie?: string; // base64 / uri — used by real liveness check later
}

export interface VerifyIdentityResult {
  verified: boolean;
  id_name: string;   // the legal name on record for that ID
  reference: string; // provider reference for the check
}

export interface OtpResult {
  ok: boolean;
  reference: string;
}

function makeRef(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Mock: derive a plausible "legal name" from the ID so the flow is testable. */
function mockNameForId(idNumber: string): string {
  const names = ["Chidi Okonkwo", "Amina Bello", "Emeka Obi", "Ngozi Eze", "Tunde Alabi"];
  let sum = 0;
  for (let i = 0; i < idNumber.length; i++) sum += idNumber.charCodeAt(i);
  return names[sum % names.length];
}

export const KycService = {
  /**
   * Verify a NIN/BVN. Live version calls Smile Identity's ID verification.
   * Mock: accepts any non-empty numeric-ish id and returns a deterministic name.
   */
  verifyIdentity: async (params: VerifyIdentityParams): Promise<VerifyIdentityResult> => {
    return new Promise((resolve) => {
      console.log("[KYC Mock] verifyIdentity", { idType: params.idType });
      setTimeout(() => {
        const clean = params.idNumber.replace(/\D/g, "");
        const verified = clean.length >= 8; // mock rule
        resolve({
          verified,
          id_name: verified ? mockNameForId(clean) : "",
          reference: makeRef("kyc"),
        });
      }, 1200);
    });
  },

  /** Send an OTP to the phone. Mock: always "sends"; the code is DEV_OTP_CODE. */
  sendOtp: async (phone: string): Promise<OtpResult> => {
    console.log("[KYC Mock] sendOtp to", phone, "→ use code", DEV_OTP_CODE);
    return { ok: true, reference: makeRef("otp") };
  },

  /** Verify the OTP. Mock: only DEV_OTP_CODE succeeds. */
  verifyOtp: async (phone: string, code: string): Promise<boolean> => {
    return code.trim() === DEV_OTP_CODE;
  },
};

export { DEV_OTP_CODE };
