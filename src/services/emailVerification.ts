// src/services/emailVerification.ts
//
// Email verification, BEFORE the account exists in any usable form.
//
// ── Why the order is inverted from the old flow ────────────────────────────
// Registration used to call `signUp(email, password, metadata)` and then send a
// confirmation email. That creates a working account whose email may never be
// confirmed — and because this app carries chat, trip history and coins, an
// unverified address is a permanent password-reset hole: whoever really owns
// that mailbox can take the account whenever they like.
//
// So verification comes first:
//
//   1. `sendCode(email)`     — Supabase mails a 6-digit code.
//   2. `verifyCode(email,c)` — the code is exchanged for a real session. At this
//                              point the address is proven.
//   3. `finishSignUp(...)`   — the password and the profile are set ON that
//                              session, with `updateUser`.
//
// The account is unusable between 1 and 3 (no password, `profile_complete`
// false), and an abandoned attempt is simply resumed by asking for a new code.
//
// ── What this needs from the Supabase dashboard ────────────────────────────
// The default "Magic Link" email template contains `{{ .ConfirmationURL }}` and
// no code. For a 6-digit code to arrive, the template must include
// `{{ .Token }}`. See SETUP-KEYS §1.4 — without it the mail still sends, and the
// user is looking for a number that is not in it.

import { supabase } from "@/src/services/supabase";

export const CODE_LENGTH = 6;
/** How long the user has before the code is refused. Supabase's default. */
export const CODE_TTL_SECONDS = 3600;
/** Gap enforced client-side between resends, so the button cannot be hammered. */
export const RESEND_COOLDOWN_SECONDS = 45;

export type SendResult =
  | { ok: true }
  | { ok: false; reason: "rate_limited" | "invalid_email" | "already_registered" | "network" | "unknown"; message: string };

/**
 * Mail a fresh code.
 *
 * `shouldCreateUser: true` is what lets this be a REGISTRATION step rather than
 * only a login one — the auth row is created here, passwordless, and gains its
 * password in `finishSignUp`.
 */
export async function sendCode(email: string): Promise<SendResult> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
    return { ok: false, reason: "invalid_email", message: "That email address doesn't look right." };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: clean,
    options: { shouldCreateUser: true },
  });

  if (!error) return { ok: true };

  const m = error.message.toLowerCase();
  if (m.includes("rate") || m.includes("too many") || error.status === 429) {
    return {
      ok: false,
      reason: "rate_limited",
      message: "Too many codes requested. Wait a minute and try again.",
    };
  }
  if (m.includes("network") || m.includes("fetch") || m.includes("timeout")) {
    return {
      ok: false,
      reason: "network",
      message: "No connection. Check your internet and try again.",
    };
  }
  return { ok: false, reason: "unknown", message: error.message };
}

export type VerifyResult =
  | { ok: true; userId: string; isNew: boolean }
  | { ok: false; reason: "wrong_code" | "expired" | "network" | "unknown"; message: string };

/**
 * Exchange the code for a session.
 *
 * `isNew` distinguishes "this address had never been used" from "this address
 * already has a full account". The second means the person is trying to
 * register an email they already registered, and the honest answer is to send
 * them to sign-in rather than to quietly overwrite their password.
 */
export async function verifyCode(email: string, code: string): Promise<VerifyResult> {
  const clean = email.trim().toLowerCase();
  const token = code.replace(/\D/g, "");

  if (token.length !== CODE_LENGTH) {
    return { ok: false, reason: "wrong_code", message: `Enter the ${CODE_LENGTH}-digit code from your email.` };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: clean,
    token,
    type: "email",
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("expired")) {
      return { ok: false, reason: "expired", message: "That code has expired. Send a new one." };
    }
    if (m.includes("network") || m.includes("fetch")) {
      return { ok: false, reason: "network", message: "No connection. Try again." };
    }
    return {
      ok: false,
      reason: "wrong_code",
      message: "That code isn't right. Check the email and try again.",
    };
  }

  const user = data.user;
  if (!user) {
    return { ok: false, reason: "unknown", message: "Verification failed. Try again." };
  }

  // A row in `public.users` is what makes an account real in this app; an
  // auth row with no profile is a half-finished registration, not an account.
  const { data: profile } = await supabase
    .from("users")
    .select("id, profile_complete")
    .eq("id", user.id)
    .maybeSingle();

  return { ok: true, userId: user.id, isNew: !profile };
}

export type FinishResult =
  | { ok: true; userId: string }
  | { ok: false; message: string };

/**
 * Set the password and the profile on the already-verified session.
 *
 * This is a single `updateUser` on purpose. Setting the password and then the
 * metadata in two calls leaves a window where the account has a password and no
 * role — and the role is what every screen in the app routes on.
 */
export async function finishSignUp(
  password: string,
  metadata: Record<string, unknown>,
): Promise<FinishResult> {
  const { data, error } = await supabase.auth.updateUser({
    password,
    data: metadata,
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("same as the old") || m.includes("different from the old")) {
      return { ok: false, message: "Choose a password you have not used on this account before." };
    }
    return { ok: false, message: error.message };
  }
  if (!data.user) return { ok: false, message: "Could not finish signing up. Try again." };
  return { ok: true, userId: data.user.id };
}

/**
 * Abandon a half-finished registration.
 *
 * Signs out so the passwordless session does not linger. The auth row stays —
 * the client has no right to delete it — and is picked up by a fresh code next
 * time, which is why an abandoned attempt is resumable rather than a dead end.
 */
export async function abandon(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // Nothing useful to do; the session expires on its own.
  }
}
