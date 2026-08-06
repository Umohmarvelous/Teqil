// src/utils/activity.ts
//
// Unifies everything that should appear in a user's history — trip/premium
// transactions, unlocked achievements, watched ads, and trips — into a single,
// time-sorted Activity[] that the dashboards and History screens render. Also
// maps a transaction to a ReceiptData for the Receipt modal.

import type { RevenueTransaction, Trip, CreditHistory } from "@/src/models/types";
import { achievementById } from "@/src/data/achievements";
import { formatNaira } from "@/src/utils/helpers";
import type { ReceiptData } from "@/components/Receipt";

export type ActivityKind = "transaction" | "achievement" | "ad" | "trip";

export interface Activity {
  id: string;
  kind: ActivityKind;
  title: string;
  subtitle: string;
  amount?: string;
  direction?: "in" | "out" | "neutral";
  timestamp: string; // ISO
  icon: "receipt" | "crown" | "trophy" | "play" | "car";
  receipt?: ReceiptData; // present for transactions → tap opens the receipt
}

function shortRef(s?: string): string {
  if (!s) return "—";
  return s.replace(/[^A-Za-z0-9]/g, "").slice(-12).toUpperCase();
}

function fmtTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-NG", {
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** Map a recorded transaction to a printable receipt. */
export function transactionToReceipt(t: RevenueTransaction): ReceiptData {
  const ok = t.status !== "failed";
  const statusLabel = t.status === "failed" ? "Failed" : "Successful";
  const isPremium = t.kind === "premium_subscription";

  const amount = isPremium ? t.premium_amount ?? 0 : t.passenger_bank_paid ?? 0;

  const payment = {
    title: "Payment Details",
    rows: [
      { label: "Invoice Number", value: shortRef(t.dedupe_key || t.id) },
      { label: "Order Time", value: fmtTime(t.created_at) },
      { label: "Payment Method", value: "Paystack" },
      {
        label: "Payment Status",
        value: statusLabel,
        status: (t.status === "failed" ? "failed" : "success") as "failed" | "success",
      },
      { label: "Amount", value: formatNaira(amount), strong: true },
    ],
  };

  const details = isPremium
    ? {
        title: "Plan Details",
        rows: [
          { label: "Emilgo Premium", value: formatNaira(t.premium_amount ?? 0) },
          { label: "Station share (60%)", value: formatNaira(t.station_share ?? 0) },
          { label: "Company share (40%)", value: formatNaira(t.company_share ?? 0) },
          { label: "Total Paid", value: formatNaira(t.premium_amount ?? 0), strong: true },
        ],
      }
    : {
        title: "Trip Details",
        rows: [
          { label: "Base fare", value: formatNaira(t.base_fare ?? 0) },
          { label: "You paid (half)", value: formatNaira(t.passenger_bank_paid ?? 0) },
          { label: "Fuel bonus", value: `+ ${formatNaira(t.driver_bonus ?? 0)}` },
          { label: "Driver received", value: formatNaira(t.driver_total ?? 0), strong: true },
        ],
      };

  const shareText = [
    `EMILGO — ${statusLabel} Payment`,
    ...payment.rows.map((r) => `${r.label}: ${r.value}`),
    "",
    details.title,
    ...details.rows.map((r) => `${r.label}: ${r.value}`),
  ].join("\n");

  return { title: ok ? "Payment Successful" : "Payment Failed", ok, sections: [payment, details], shareText };
}

/** Build the unified, newest-first activity feed from all the user's sources. */
export function buildActivity(input: {
  transactions?: RevenueTransaction[];
  achievements?: Record<string, string>; // id -> unlocked_at
  credits?: CreditHistory[];
  trips?: Trip[];
}): Activity[] {
  const out: Activity[] = [];

  for (const t of input.transactions ?? []) {
    const isPremium = t.kind === "premium_subscription";
    const amt = isPremium ? t.premium_amount ?? 0 : t.passenger_bank_paid ?? 0;
    out.push({
      id: `txn_${t.id}`,
      kind: "transaction",
      title: isPremium ? "Premium subscription" : "Trip payment",
      subtitle: fmtTime(t.created_at),
      amount: `- ${formatNaira(amt)}`,
      direction: "out",
      timestamp: t.created_at,
      icon: isPremium ? "crown" : "receipt",
      receipt: transactionToReceipt(t),
    });
  }

  for (const [id, at] of Object.entries(input.achievements ?? {})) {
    const def = achievementById(id);
    out.push({
      id: `ach_${id}`,
      kind: "achievement",
      title: "Achievement unlocked",
      subtitle: def?.title ?? id,
      direction: "neutral",
      timestamp: at,
      icon: "trophy",
    });
  }

  for (const c of input.credits ?? []) {
    if (c.type !== "ad_watch") continue;
    out.push({
      id: `ad_${c.id}`,
      kind: "ad",
      title: "Watched an ad",
      subtitle: fmtTime(c.created_at),
      amount: `+ ${c.amount} credits`,
      direction: "in",
      timestamp: c.created_at,
      icon: "play",
    });
  }

  for (const trip of input.trips ?? []) {
    out.push({
      id: `trip_${trip.id}`,
      kind: "trip",
      title: `Trip ${trip.trip_code ?? ""}`.trim(),
      subtitle: `${trip.origin ?? "—"} → ${trip.destination ?? "—"}`,
      direction: "neutral",
      timestamp: trip.created_at ?? trip.start_time ?? new Date(0).toISOString(),
      icon: "car",
    });
  }

  return out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}
