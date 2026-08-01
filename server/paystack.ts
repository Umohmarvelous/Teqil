/**
 * server/paystack.ts
 *
 * Server-side Paystack endpoints. The SECRET key lives ONLY here (never in the app).
 * The mobile app calls these routes; this module calls Paystack.
 *
 * Behaviour is mock-by-default so the app works before you have keys:
 *   - If PAYSTACK_SECRET_KEY (sk_test_… / sk_live_…) is set → real Paystack calls.
 *   - If not set → deterministic mock responses (same shape) so dev keeps flowing.
 *
 * Endpoints:
 *   POST /api/paystack/initialize      → start a charge (passenger pays). Returns
 *                                        { authorization_url, access_code, reference }.
 *   GET  /api/paystack/verify/:ref     → verify a charge by reference.
 *   POST /api/paystack/transfer        → pay out to a driver's bank (recipient + transfer).
 *   GET  /api/paystack/resolve         → resolve an account name (payout safety check).
 *   POST /api/webhooks/paystack        → signed webhook (charge.success, transfer.success).
 */

import type { Express, Request, Response } from "express";
import crypto from "node:crypto";

const PAYSTACK_BASE = "https://api.paystack.co";
const SECRET = process.env.PAYSTACK_SECRET_KEY || "";
const isLive = SECRET.startsWith("sk_");

function mockRef(prefix: string): string {
  return `${prefix}_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Thin wrapper around the Paystack REST API with the secret key attached. */
async function paystack(
  path: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; json: any }> {
  const resp = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await resp.json();
  return { ok: resp.ok, json };
}

export function registerPaystackRoutes(app: Express): void {
  if (!isLive) {
    console.log("[Paystack] No PAYSTACK_SECRET_KEY set — running in MOCK mode.");
  }

  // ── Initialize a charge (the passenger pays) ────────────────────────────────
  app.post("/api/paystack/initialize", async (req: Request, res: Response) => {
    const { email, amount, subaccount, metadata } = req.body ?? {};
    if (!email || !amount) {
      return res.status(400).json({ error: "email and amount (naira) are required" });
    }
    const kobo = Math.round(Number(amount) * 100);

    if (!isLive) {
      return res.json({
        mock: true,
        reference: mockRef("init"),
        authorization_url: null, // app falls back to its mock success in dev
        access_code: "mock_access_code",
        amount: kobo,
      });
    }
    const { ok, json } = await paystack("/transaction/initialize", "POST", {
      email,
      amount: kobo,
      subaccount,
      metadata,
    });
    if (!ok) return res.status(400).json(json);
    return res.json(json.data);
  });

  // ── Verify a charge by reference ────────────────────────────────────────────
  app.get("/api/paystack/verify/:reference", async (req: Request, res: Response) => {
    const reference = String(req.params.reference ?? "");
    if (!isLive) {
      return res.json({ mock: true, status: "success", reference, gateway_response: "Approved (mock)" });
    }
    const { ok, json } = await paystack(
      `/transaction/verify/${encodeURIComponent(reference)}`,
      "GET",
    );
    if (!ok) return res.status(400).json(json);
    return res.json(json.data);
  });

  // ── Transfer a payout to a driver's bank account ────────────────────────────
  // Creates a transfer recipient (unless recipient_code is supplied) then transfers.
  app.post("/api/paystack/transfer", async (req: Request, res: Response) => {
    const { name, account_number, bank_code, amount, reason, recipient_code } = req.body ?? {};
    if (!amount) return res.status(400).json({ error: "amount (naira) is required" });
    const kobo = Math.round(Number(amount) * 100);

    if (!isLive) {
      return res.json({ mock: true, reference: mockRef("trf"), status: "success", amount: kobo });
    }

    let recipient = recipient_code as string | undefined;
    if (!recipient) {
      if (!account_number || !bank_code) {
        return res
          .status(400)
          .json({ error: "account_number and bank_code (or recipient_code) required" });
      }
      const r = await paystack("/transferrecipient", "POST", {
        type: "nuban",
        name,
        account_number,
        bank_code,
        currency: "NGN",
      });
      if (!r.ok) return res.status(400).json(r.json);
      recipient = r.json.data.recipient_code;
    }

    const t = await paystack("/transfer", "POST", {
      source: "balance",
      amount: kobo,
      recipient,
      reason: reason || "Emilgo driver payout",
    });
    if (!t.ok) return res.status(400).json(t.json);
    return res.json({ ...t.json.data, recipient_code: recipient });
  });

  // ── Resolve an account name (used before any payout is enabled) ─────────────
  app.get("/api/paystack/resolve", async (req: Request, res: Response) => {
    const account_number = String(req.query.account_number ?? "");
    const bank_code = String(req.query.bank_code ?? "");
    if (!account_number || !bank_code) {
      return res.status(400).json({ error: "account_number and bank_code required" });
    }
    if (!isLive) {
      return res.json({ mock: true, account_name: "Mock Account Holder", account_number });
    }
    const { ok, json } = await paystack(
      `/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      "GET",
    );
    if (!ok) return res.status(400).json(json);
    return res.json(json.data);
  });

  // ── Webhook (charge.success / transfer.success), signature-verified ─────────
  app.post("/api/webhooks/paystack", (req: Request, res: Response) => {
    if (isLive) {
      const signature = req.header("x-paystack-signature");
      const raw = (req.rawBody as Buffer) ?? Buffer.from(JSON.stringify(req.body));
      const hash = crypto.createHmac("sha512", SECRET).update(raw).digest("hex");
      if (hash !== signature) {
        console.warn("[Paystack webhook] bad signature");
        return res.sendStatus(401);
      }
    }
    const event = req.body;
    console.log("[Paystack webhook]", event?.event, event?.data?.reference);
    // TODO: persist the transaction / update trip or subscription state in Supabase.
    return res.sendStatus(200);
  });
}
