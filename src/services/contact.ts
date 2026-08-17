// src/services/contact.ts
//
// Phone numbers: reading a contact's, and managing your own.
//
// The rules live in supabase/migrations/migration_contact_phone.sql — you can
// read one number at a time, only for someone you already share a conversation
// with, only while they allow it. Nothing here can widen that; this file exists
// so no screen is tempted to `select('phone')` off the users table again.

import { supabase } from "./supabase";

export interface MyPhone {
  phone: string | null;
  sharePhone: boolean;
}

/**
 * The number to dial for a chat contact, in E.164, or null when there isn't one
 * to give — no number on file, sharing switched off, or a block in the way.
 *
 * Resolved at the moment the Call button is pressed rather than cached on the
 * conversation, so revoking `share_phone` takes effect on the next tap instead
 * of the next app launch.
 */
export async function getContactPhone(userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_contact_phone", { p_user: userId });
  if (error) {
    console.warn("[contact] get_contact_phone:", error.message);
    return null;
  }
  return (data as string) || null;
}

export async function getMyPhone(): Promise<MyPhone> {
  const { data, error } = await supabase.rpc("get_my_phone");
  if (error) {
    console.warn("[contact] get_my_phone:", error.message);
    return { phone: null, sharePhone: true };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { phone: row?.phone ?? null, sharePhone: row?.share_phone ?? true };
}

/**
 * Saves the number and returns the normalised form the server stored, so the UI
 * shows what will actually be dialled rather than what was typed. Throws with
 * the server's message when the number is not usable — a silent failure here
 * means a Call button that does nothing weeks later.
 */
export async function setMyPhone(phone: string, share?: boolean): Promise<string> {
  const { data, error } = await supabase.rpc("set_my_phone", {
    p_phone: phone,
    p_share: share ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Display form: +2348031234567 → 0803 123 4567. */
export function formatNgPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = e164.replace(/[^0-9]/g, "");
  const local = d.startsWith("234") ? `0${d.slice(3)}` : d;
  if (local.length !== 11) return e164;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
