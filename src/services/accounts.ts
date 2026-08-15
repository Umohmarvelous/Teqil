// src/services/accounts.ts
//
// Multiple signed-in accounts on one device, and switching between them without
// retyping a password — the behaviour people expect from the avatar menu in
// Gmail, Instagram or X.
//
// ── How switching works ──────────────────────────────────────────────────────
// Supabase issues an access token (short-lived) and a refresh token (long-lived)
// per session. Keeping the refresh token for each account means a switch is
// `supabase.auth.setSession(...)`, which exchanges it for a fresh session — no
// password, no re-authentication round trip the user can see.
//
// ── Where the tokens live ────────────────────────────────────────────────────
// SecureStore — the iOS Keychain / Android Keystore — never AsyncStorage. A
// refresh token IS the account: anything that can read it can act as that user
// until it is revoked. AsyncStorage is plain, world-readable-on-root storage, so
// putting them there would be handing out long-lived credentials.
//
// Only display fields (name, photo, role) are kept alongside, because the
// account picker has to render a row for an account whose session is not
// currently loaded.
//
// ── Failure is expected, not exceptional ─────────────────────────────────────
// A refresh token can be revoked server-side (password change, sign-out
// everywhere, expiry). `switchAccount` therefore returns a result rather than
// throwing, and a failed switch removes the dead entry and tells the caller to
// send the user to a normal sign-in — silently doing nothing would look like a
// broken button.

import { supabase } from "./supabase";
import { secureSet, secureGet, secureDelete } from "./secureStore";
import type { User, UserRole } from "../models/types";

const ACCOUNTS_KEY = "teqil_saved_accounts";

export interface SavedAccount {
  id: string;
  email: string;
  full_name: string | null;
  username?: string;
  profile_photo?: string;
  role?: UserRole;
  /** Long-lived Supabase refresh token. Never leaves SecureStore. */
  refresh_token: string;
  /** ISO — used to order the picker most-recent-first. */
  lastUsedAt: string;
}

/** What the picker renders. Deliberately excludes the token. */
export type AccountSummary = Omit<SavedAccount, "refresh_token">;

async function readAll(): Promise<SavedAccount[]> {
  try {
    const raw = await secureGet(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A corrupt registry must not lock anyone out of the app: treat it as empty
    // and let the next successful sign-in rewrite it.
    return [];
  }
}

async function writeAll(accounts: SavedAccount[]): Promise<void> {
  await secureSet(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/** Saved accounts, most recently used first, without their tokens. */
export async function listAccounts(): Promise<AccountSummary[]> {
  const all = await readAll();
  return all
    .map(({ refresh_token: _omit, ...rest }) => rest)
    .sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime());
}

/**
 * Record the account that just signed in.
 *
 * Safe to call on every sign-in: it updates in place rather than duplicating,
 * and refreshes the stored token, which matters because Supabase rotates
 * refresh tokens — a stale one will not switch.
 */
export async function rememberAccount(user: User): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const refresh = data.session?.refresh_token;
  if (!refresh) return;

  const all = await readAll();
  const entry: SavedAccount = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    username: user.username,
    profile_photo: user.profile_photo,
    role: user.role,
    refresh_token: refresh,
    lastUsedAt: new Date().toISOString(),
  };

  const at = all.findIndex((a) => a.id === user.id);
  if (at >= 0) all[at] = entry;
  else all.push(entry);

  await writeAll(all);
}

/** Drop an account from the picker. Does not touch the current session. */
export async function forgetAccount(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((a) => a.id !== id));
}

export async function clearAccounts(): Promise<void> {
  await secureDelete(ACCOUNTS_KEY);
}

export type SwitchResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "unknown_account" | "expired"; message: string };

/**
 * Switch to a previously signed-in account.
 *
 * On success the Supabase session is replaced, which fires `onAuthStateChange`
 * in the root layout and re-drives the auth store — callers don't have to
 * update it themselves.
 */
export async function switchAccount(id: string): Promise<SwitchResult> {
  const all = await readAll();
  const account = all.find((a) => a.id === id);

  if (!account) {
    return {
      ok: false,
      reason: "unknown_account",
      message: "That account is no longer saved on this device.",
    };
  }

  const { data, error } = await supabase.auth.setSession({
    // setSession takes both, but an expired access token is fine: the client
    // exchanges the refresh token for a new pair.
    access_token: "",
    refresh_token: account.refresh_token,
  });

  if (error || !data.session) {
    // The token is dead — a revoked session, a password change, or expiry.
    // Remove it so the picker stops offering something that cannot work.
    await forgetAccount(id);
    return {
      ok: false,
      reason: "expired",
      message: "That session has expired. Please sign in again.",
    };
  }

  // Supabase rotates refresh tokens on use, so the stored one is now spent.
  const rotated = data.session.refresh_token;
  const at = all.findIndex((a) => a.id === id);
  if (at >= 0) {
    all[at] = { ...all[at], refresh_token: rotated, lastUsedAt: new Date().toISOString() };
    await writeAll(all);
  }

  return { ok: true, userId: id };
}
