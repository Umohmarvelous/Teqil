/**
 * server/kyc.ts
 *
 * Server-side KYC proxy (Smile Identity). The Partner ID + API key live ONLY here.
 * The app posts the NIN/BVN (+ optional selfie) to this route; this module calls
 * Smile Identity and returns just a verdict + legal name — the app never holds the
 * provider secret, and the raw ID is not persisted server-side.
 *
 * Mock-by-default (same shape as src/services/kyc.ts VerifyIdentityResult):
 *   - If SMILE_PARTNER_ID + SMILE_API_KEY are set → real Smile Identity (see TODO).
 *   - If not set → deterministic mock so the wizard is testable now.
 *
 * Endpoint:
 *   POST /api/kyc/verify  { idType, idNumber, selfie? }
 *                         → { verified, id_name, reference }
 */

import type { Express, Request, Response } from "express";

const PARTNER_ID = process.env.SMILE_PARTNER_ID || "";
const API_KEY = process.env.SMILE_API_KEY || "";
const isLive = !!(PARTNER_ID && API_KEY);

const MOCK_NAMES = ["Chidi Okonkwo", "Amina Bello", "Emeka Obi", "Ngozi Eze", "Tunde Alabi"];

function mockNameForId(idNumber: string): string {
  let sum = 0;
  for (let i = 0; i < idNumber.length; i++) sum += idNumber.charCodeAt(i);
  return MOCK_NAMES[sum % MOCK_NAMES.length];
}

export function registerKycRoutes(app: Express): void {
  if (!isLive) {
    console.log("[KYC] No SMILE_PARTNER_ID/SMILE_API_KEY set — running in MOCK mode.");
  }

  app.post("/api/kyc/verify", async (req: Request, res: Response) => {
    const { idType, idNumber, selfie } = req.body ?? {};
    if (!idType || !idNumber) {
      return res.status(400).json({ error: "idType and idNumber are required" });
    }

    if (!isLive) {
      const clean = String(idNumber).replace(/\D/g, "");
      const verified = clean.length >= 8;
      return res.json({
        verified,
        id_name: verified ? mockNameForId(clean) : "",
        reference: `kyc_mock_${Date.now()}`,
      });
    }

    // ── TODO: real Smile Identity ─────────────────────────────────────────────
    // 1. `npm i smile-identity-core`
    // 2. const { WebApi } = require("smile-identity-core");
    //    const connection = new WebApi(PARTNER_ID, callbackUrl, API_KEY, sidServer);
    // 3. Submit an Enhanced KYC job (job_type 5) with { country: "NG", id_type:
    //    idType.toUpperCase(), id_number: idNumber }. For the face match add the
    //    selfie image as a Biometric KYC job (job_type 1).
    // 4. Map Smile's ResultCode / Actions to { verified, id_name, reference }.
    const _ = selfie; // will feed the liveness/face-match job
    return res.status(501).json({
      error: "Smile Identity live mode not implemented yet — install smile-identity-core and wire it here.",
    });
  });
}
