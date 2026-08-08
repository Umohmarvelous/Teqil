// src/store/useBarterStore.ts
//
// Barter bargaining: the offer/counter-offer thread, the agreement both sides
// consent to, and violation reporting.
//
// Every write goes through a SECURITY DEFINER RPC (see
// supabase/migrations/migration_barter_bargaining.sql) — the tables grant no
// INSERT/UPDATE to clients, so turn-taking and consent can't be bypassed by a
// direct write. This store is a thin, honest wrapper: it never invents an
// outcome the server didn't return.

import { create } from "zustand";
import { supabase } from "../services/supabase";

export type BargainStatus =
  | "pending"
  | "countered"
  | "accepted"
  | "declined"
  | "withdrawn";

export type AgreementStatus =
  | "active"
  | "fulfilled"
  | "disputed"
  | "violated"
  | "cancelled";

export type ViolationReason =
  | "not_delivered"
  | "partial"
  | "no_show"
  | "unsafe"
  | "other";

export interface Bargain {
  id: string;
  offer_id: string;
  claim_id?: string | null;
  driver_id: string;
  passenger_id: string;
  proposed_by: string;
  terms: string;
  cash_amount: number;
  parent_id?: string | null;
  status: BargainStatus;
  created_at: string;
  responded_at?: string | null;
}

export interface Agreement {
  id: string;
  offer_id: string;
  claim_id?: string | null;
  bargain_id?: string | null;
  driver_id: string;
  passenger_id: string;
  agreed_terms: string;
  cash_amount: number;
  driver_accepted_at?: string | null;
  passenger_accepted_at?: string | null;
  status: AgreementStatus;
  agreed_at: string;
  closed_at?: string | null;
}

export interface BarterStanding {
  agreements: number;
  fulfilled: number;
  upheld: number;
  open_reports: number;
}

/** Result envelope shared by every barter RPC. */
export interface BarterResult {
  ok: boolean;
  reason: string;
  bargainId?: string;
  agreementId?: string;
  violationId?: string;
}

/** Plain-English rendering of an RPC reason, for alerts. */
export function describeBarterResult(r: BarterResult): string {
  switch (r.reason) {
    case "proposed":
      return "Your offer has been sent. The other side can accept or counter it.";
    case "agreed":
      return "Agreed. Both sides have now consented and the terms are recorded.";
    case "declined":
      return "Offer declined.";
    case "reported":
      return "Report submitted. The agreement is now marked disputed pending review.";
    case "fulfilled":
      return "Marked as fulfilled. Thanks for closing this out.";
    case "not_barter":
      return "This is a fixed reward offer, not a barter — it can only be accepted.";
    case "offer_closed":
      return "This offer is closed.";
    case "offer_not_found":
      return "That offer no longer exists.";
    case "driver_cannot_open":
      return "The passenger opens the bargaining on your offer — wait for a proposal.";
    case "not_your_turn":
      return "It's the other side's turn to respond.";
    case "cannot_accept_own":
      return "You can't accept your own proposal.";
    case "already_reported":
      return "You've already reported this agreement.";
    case "forbidden":
      return "Only the driver and passenger on this ride can do that.";
    case "violated":
      return "This agreement was marked violated and can't be fulfilled.";
    default:
      if (r.reason?.startsWith("already_")) {
        return `This proposal was already ${r.reason.replace("already_", "")}.`;
      }
      if (r.reason?.startsWith("parent_already_")) {
        return `That proposal was already ${r.reason.replace("parent_already_", "")}.`;
      }
      return "Couldn't complete that. Check your connection and try again.";
  }
}

interface BarterStore {
  /** Bargain thread for the offer currently open, oldest first. */
  thread: Bargain[];
  agreement: Agreement | null;
  loading: boolean;

  loadThread: (offerId: string, userId: string) => Promise<void>;
  propose: (params: {
    offerId: string;
    terms: string;
    cashAmount?: number;
    parentId?: string | null;
  }) => Promise<BarterResult>;
  respond: (bargainId: string, accept: boolean) => Promise<BarterResult>;
  reportViolation: (
    agreementId: string,
    reason: ViolationReason,
    details?: string
  ) => Promise<BarterResult>;
  markFulfilled: (agreementId: string) => Promise<BarterResult>;
  fetchStanding: (userId: string) => Promise<BarterStanding | null>;
  reset: () => void;
}

/** Normalise the JSONB envelope every barter RPC returns. */
function toResult(data: unknown, error: unknown): BarterResult {
  if (error || !data) return { ok: false, reason: "error" };
  const row = data as Record<string, unknown>;
  return {
    ok: !!row.ok,
    reason: String(row.reason ?? "error"),
    bargainId: row.bargain_id as string | undefined,
    agreementId: row.agreement_id as string | undefined,
    violationId: row.violation_id as string | undefined,
  };
}

export const useBarterStore = create<BarterStore>()((set, get) => ({
  thread: [],
  agreement: null,
  loading: false,

  loadThread: async (offerId, userId) => {
    set({ loading: true });
    try {
      // RLS already limits these to rides the caller is party to; the userId
      // filter just narrows a driver's view to the one passenger's thread.
      const [{ data: bargains }, { data: agreements }] = await Promise.all([
        supabase
          .from("free_ride_bargains")
          .select("*")
          .eq("offer_id", offerId)
          .order("created_at", { ascending: true }),
        supabase
          .from("free_ride_agreements")
          .select("*")
          .eq("offer_id", offerId)
          .limit(1),
      ]);

      const thread = ((bargains ?? []) as Bargain[]).filter(
        (b) => b.driver_id === userId || b.passenger_id === userId
      );

      set({
        thread,
        agreement: ((agreements ?? []) as Agreement[])[0] ?? null,
      });
    } catch (e) {
      console.warn("[Barter] loadThread failed", e);
    } finally {
      set({ loading: false });
    }
  },

  propose: async ({ offerId, terms, cashAmount = 0, parentId = null }) => {
    try {
      const { data, error } = await supabase.rpc("propose_barter", {
        p_offer_id: offerId,
        p_terms: terms,
        p_cash_amount: cashAmount,
        p_parent_id: parentId,
      });
      return toResult(data, error);
    } catch (e) {
      console.warn("[Barter] propose failed", e);
      return { ok: false, reason: "error" };
    }
  },

  respond: async (bargainId, accept) => {
    try {
      const { data, error } = await supabase.rpc("respond_barter", {
        p_bargain_id: bargainId,
        p_accept: accept,
      });
      return toResult(data, error);
    } catch (e) {
      console.warn("[Barter] respond failed", e);
      return { ok: false, reason: "error" };
    }
  },

  reportViolation: async (agreementId, reason, details) => {
    try {
      const { data, error } = await supabase.rpc("report_barter_violation", {
        p_agreement_id: agreementId,
        p_reason: reason,
        p_details: details ?? null,
      });
      return toResult(data, error);
    } catch (e) {
      console.warn("[Barter] reportViolation failed", e);
      return { ok: false, reason: "error" };
    }
  },

  markFulfilled: async (agreementId) => {
    const result = await (async () => {
      try {
        const { data, error } = await supabase.rpc("fulfil_barter_agreement", {
          p_agreement_id: agreementId,
        });
        return toResult(data, error);
      } catch (e) {
        console.warn("[Barter] markFulfilled failed", e);
        return { ok: false, reason: "error" } as BarterResult;
      }
    })();

    if (result.ok) {
      const current = get().agreement;
      if (current?.id === agreementId) {
        set({ agreement: { ...current, status: "fulfilled" } });
      }
    }
    return result;
  },

  fetchStanding: async (userId) => {
    try {
      const { data, error } = await supabase.rpc("user_barter_standing", {
        p_user_id: userId,
      });
      if (error || !data) return null;
      return data as BarterStanding;
    } catch {
      return null;
    }
  },

  reset: () => set({ thread: [], agreement: null, loading: false }),
}));
