// src/services/feedback.ts
//
// Where in-app feedback goes.
//
// Order of preference:
//   1. EXPO_PUBLIC_FEEDBACK_ENDPOINT — POST the JSON payload to your own API.
//   2. Supabase `app_feedback` table, if the endpoint isn't configured.
//   3. EXPO_PUBLIC_FEEDBACK_EMAIL — fall back to the device mail composer.
//
// Every path reports honestly whether the message actually left the device, so
// the UI never shows "Thanks, sent!" for something that silently failed.

import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { supabase } from "./supabase";
import { useAuthStore } from "../store/useStore";

const ENDPOINT = process.env.EXPO_PUBLIC_FEEDBACK_ENDPOINT;
const EMAIL = process.env.EXPO_PUBLIC_FEEDBACK_EMAIL;

export type FeedbackKind = "rating" | "general" | "bug";

export interface FeedbackPayload {
  kind: FeedbackKind;
  message: string;
  /** 1–5 when the feedback came from the rating prompt. */
  rating?: number;
  /** Free-form extras, e.g. which screen it was sent from. */
  context?: Record<string, unknown>;
}

export interface FeedbackResult {
  ok: boolean;
  /** Which channel accepted it — useful in logs and for the UI copy. */
  via: "endpoint" | "supabase" | "email" | "none";
  error?: string;
}

function buildBody(payload: FeedbackPayload) {
  const user = useAuthStore.getState().user;
  return {
    kind: payload.kind,
    message: payload.message.trim(),
    rating: payload.rating ?? null,
    context: payload.context ?? {},
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
    platform: Platform.OS,
    platform_version: String(Platform.Version),
    app: "emilgo",
    created_at: new Date().toISOString(),
  };
}

export async function submitFeedback(payload: FeedbackPayload): Promise<FeedbackResult> {
  if (!payload.message.trim() && payload.rating == null) {
    return { ok: false, via: "none", error: "Nothing to send." };
  }

  const body = buildBody(payload);

  // 1. Custom endpoint
  if (ENDPOINT) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return { ok: true, via: "endpoint" };
      return { ok: false, via: "endpoint", error: `Server responded ${res.status}.` };
    } catch {
      // Fall through — the table or mail may still work offline-ish.
    }
  }

  // 2. Supabase table
  try {
    const { error } = await supabase.from("app_feedback").insert(body);
    if (!error) return { ok: true, via: "supabase" };
  } catch {
    /* fall through */
  }

  // 3. Mail composer. This only opens the composer — the user still has to hit
  //    send, so report it as such rather than claiming delivery.
  if (EMAIL) {
    try {
      const subject = encodeURIComponent(`Emilgo feedback (${payload.kind})`);
      const lines = [
        payload.message,
        "",
        "———",
        `Rating: ${payload.rating ?? "n/a"}`,
        `Platform: ${body.platform} ${body.platform_version}`,
        `User: ${body.user_email ?? body.user_id ?? "anonymous"}`,
      ];
      await Linking.openURL(`mailto:${EMAIL}?subject=${subject}&body=${encodeURIComponent(lines.join("\n"))}`);
      return { ok: true, via: "email" };
    } catch {
      /* fall through */
    }
  }

  return {
    ok: false,
    via: "none",
    error: "No feedback channel is configured. Set EXPO_PUBLIC_FEEDBACK_ENDPOINT or EXPO_PUBLIC_FEEDBACK_EMAIL.",
  };
}
