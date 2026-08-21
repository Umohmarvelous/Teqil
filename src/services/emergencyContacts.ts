// src/services/emergencyContacts.ts
//
// Emergency contacts: the client half.
//
// ── What this replaces ─────────────────────────────────────────────────────
// One `{ name, phone }` in a Zustand store persisted to AsyncStorage, and a
// `notifyEmergencyContacts()` in src/services/notifications.ts that was a
// console.log with a comment saying "simulated — replace with Twilio". The
// alert had never left the handset, and the contact vanished on reinstall.
//
// ── The one thing to understand before changing anything here ──────────────
// The server can reach a contact who has an EMILGO account, and CANNOT reach
// one who does not. There is no SMS provider (SETUP-KEYS §4.8). So `dispatch`
// returns the unreachable contacts rather than pretending, and the caller opens
// the device's own composer for them. Everything in this file is arranged
// around not claiming a message was sent when it was not.

import * as Contacts from "expo-contacts";
import { Linking, Platform } from "react-native";

import { supabase } from "@/src/services/supabase";
import { toWhatsAppNumber } from "@/src/services/whatsapp";

// ═════════════════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════════════════

export type ECStatus = "pending" | "verified" | "declined";
export type ECChannel = "auto" | "in_app" | "sms" | "whatsapp";
export type ECKind = "trip_start" | "trip_end" | "sos" | "route_deviation" | "no_movement" | "test";

export interface EmergencyContact {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  relationship: string | null;
  priority: number;

  status: ECStatus;
  verified_at: string | null;
  contact_user_id: string | null;
  invited_at: string | null;

  notify_trip_start: boolean;
  notify_trip_end: boolean;
  notify_sos: boolean;
  notify_route_deviation: boolean;
  notify_no_movement: boolean;
  share_live_location: boolean;
  channel: ECChannel;
  custom_message: string | null;
  silent_from: string | null;
  silent_to: string | null;
  muted_until: string | null;

  created_at: string;
  updated_at: string;
}

/** A contact the server could not reach, handed back for the device composer. */
export interface UnreachableContact {
  contact_id: string;
  name: string;
  phone: string;
  channel: "sms" | "whatsapp";
  custom_message: string | null;
}

export interface ECRequest {
  id: string;
  owner_id: string;
  owner_name: string | null;
  owner_photo: string | null;
  relationship: string | null;
  status: ECStatus;
  created_at: string;
}

export interface ECEvent {
  id: string;
  contact_id: string | null;
  kind: string;
  trip_id: string | null;
  channel: string | null;
  outcome: "sent" | "skipped_muted" | "skipped_unverified" | "skipped_quiet" | "failed";
  created_at: string;
}

export interface ECAlert {
  id: string;
  from_user_id: string;
  from_name: string | null;
  from_photo: string | null;
  kind: string;
  title: string;
  body: string;
  trip_id: string | null;
  trip_code: string | null;
  lat: number | null;
  lng: number | null;
  read_at: string | null;
  created_at: string;
}

export const MAX_CONTACTS = 10;

export type AddFailure =
  | "name_required" | "phone_invalid" | "own_number"
  | "duplicate" | "limit_reached" | "not_found";

/** Why an add or edit was refused, in words a person can act on. */
export const FAILURE_TEXT: Record<AddFailure, string> = {
  name_required: "Give this contact a name.",
  phone_invalid: "That phone number doesn't look right.",
  own_number: "That's your own number — an emergency contact has to be someone else.",
  duplicate: "That number is already on your list.",
  limit_reached: `You can have ${MAX_CONTACTS} emergency contacts.`,
  not_found: "That contact no longer exists.",
};

// ═════════════════════════════════════════════════════════════════════════════
// READING
// ═════════════════════════════════════════════════════════════════════════════

export async function list(): Promise<EmergencyContact[]> {
  const { data, error } = await supabase.rpc("ec_list");
  if (error) {
    console.warn("[EC] list:", error.message);
    return [];
  }
  return (data ?? []) as EmergencyContact[];
}

/** People who added ME, waiting on an answer. */
export async function requestsForMe(): Promise<ECRequest[]> {
  const { data, error } = await supabase.rpc("ec_requests_for_me");
  if (error) {
    console.warn("[EC] requests:", error.message);
    return [];
  }
  return (data ?? []) as ECRequest[];
}

export async function events(limit = 100): Promise<ECEvent[]> {
  const { data, error } = await supabase.rpc("ec_events", { p_limit: limit });
  if (error) return [];
  return (data ?? []) as ECEvent[];
}

export async function myAlerts(limit = 100): Promise<ECAlert[]> {
  const { data, error } = await supabase.rpc("ec_my_alerts", { p_limit: limit });
  if (error) return [];
  return (data ?? []) as ECAlert[];
}

export async function markAlertRead(id: string): Promise<void> {
  await supabase.from("emergency_alerts").update({ read_at: new Date().toISOString() }).eq("id", id);
}

// ═════════════════════════════════════════════════════════════════════════════
// WRITING
// ═════════════════════════════════════════════════════════════════════════════

export type AddResult =
  | { ok: true; id: string; phone: string; reachableInApp: boolean }
  | { ok: false; reason: AddFailure; message: string };

export async function add(
  name: string,
  phone: string,
  relationship?: string,
): Promise<AddResult> {
  const { data, error } = await supabase.rpc("ec_add", {
    p_name: name,
    p_phone: phone,
    p_relationship: relationship ?? null,
  });
  if (error) return { ok: false, reason: "not_found", message: error.message };

  const r = data as any;
  if (!r?.ok) {
    const reason = (r?.reason ?? "not_found") as AddFailure;
    return { ok: false, reason, message: FAILURE_TEXT[reason] ?? "Could not add that contact." };
  }
  return { ok: true, id: r.id, phone: r.phone, reachableInApp: !!r.reachable_in_app };
}

/** Every editable field. Anything left undefined is untouched, not cleared. */
export interface ECPatch {
  name?: string;
  relationship?: string | null;
  phone?: string;
  notifyTripStart?: boolean;
  notifyTripEnd?: boolean;
  notifySos?: boolean;
  notifyRouteDeviation?: boolean;
  notifyNoMovement?: boolean;
  shareLiveLocation?: boolean;
  channel?: ECChannel;
  customMessage?: string | null;
  silentFrom?: string | null;
  silentTo?: string | null;
  clearSilent?: boolean;
  mutedUntil?: string | null;
  clearMute?: boolean;
}

export async function update(id: string, patch: ECPatch): Promise<AddResult> {
  const { data, error } = await supabase.rpc("ec_update", {
    p_id: id,
    p_name: patch.name ?? null,
    p_relationship: patch.relationship ?? null,
    p_phone: patch.phone ?? null,
    p_notify_trip_start: patch.notifyTripStart ?? null,
    p_notify_trip_end: patch.notifyTripEnd ?? null,
    p_notify_sos: patch.notifySos ?? null,
    p_notify_route_deviation: patch.notifyRouteDeviation ?? null,
    p_notify_no_movement: patch.notifyNoMovement ?? null,
    p_share_live_location: patch.shareLiveLocation ?? null,
    p_channel: patch.channel ?? null,
    p_custom_message: patch.customMessage ?? null,
    p_silent_from: patch.silentFrom ?? null,
    p_silent_to: patch.silentTo ?? null,
    p_clear_silent: patch.clearSilent ?? false,
    p_muted_until: patch.mutedUntil ?? null,
    p_clear_mute: patch.clearMute ?? false,
  });
  if (error) return { ok: false, reason: "not_found", message: error.message };

  const r = data as any;
  if (!r?.ok) {
    const reason = (r?.reason ?? "not_found") as AddFailure;
    return { ok: false, reason, message: FAILURE_TEXT[reason] ?? "Could not save." };
  }
  return { ok: true, id, phone: "", reachableInApp: !!r.reachable_in_app };
}

export async function remove(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("ec_delete", { p_id: id });
  return !error && !!data;
}

export async function reorder(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc("ec_reorder", { p_ids: ids });
  if (error) console.warn("[EC] reorder:", error.message);
}

export async function respond(id: string, accept: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc("ec_respond", { p_id: id, p_accept: accept });
  return !error && !!(data as any)?.ok;
}

// ═════════════════════════════════════════════════════════════════════════════
// PHONEBOOK
// ═════════════════════════════════════════════════════════════════════════════

export interface PhonebookEntry {
  id: string;
  name: string;
  phone: string;
}

/**
 * Read the device's address book.
 *
 * Only name and phone are requested. Asking for `Contacts.Fields.Emails` or
 * anything else would hand the app data it has no use for, and on iOS the
 * permission prompt is the same either way — so the restraint is invisible to
 * the user and real in the data.
 *
 * Throws with a message worth showing when permission is refused; a silent
 * empty list is indistinguishable from an empty address book.
 */
export async function readPhonebook(): Promise<PhonebookEntry[]> {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== "granted") {
    throw new Error(
      "EMILGO needs access to your contacts to pick one. You can still type the number by hand.",
    );
  }

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
  });

  const out: PhonebookEntry[] = [];
  for (const c of data) {
    const numbers = c.phoneNumbers ?? [];
    if (!numbers.length) continue;
    const name = (c.name || [c.firstName, c.lastName].filter(Boolean).join(" ")).trim();
    if (!name) continue;
    // One row per NUMBER, not per person: a contact with a work and a mobile
    // number is two different people to reach, and picking the wrong one is
    // the failure this feature exists to avoid.
    for (const n of numbers) {
      const digits = (n.number ?? "").replace(/[^\d+]/g, "");
      if (digits.length < 7) continue;
      out.push({ id: `${c.id}-${digits}`, name, phone: digits });
    }
  }

  // Deduplicate by number — the same mobile often appears under two entries.
  const seen = new Set<string>();
  return out
    .filter((e) => (seen.has(e.phone) ? false : (seen.add(e.phone), true)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ═════════════════════════════════════════════════════════════════════════════
// DISPATCH
// ═════════════════════════════════════════════════════════════════════════════

export interface DispatchInput {
  kind: ECKind;
  title: string;
  body: string;
  tripId?: string;
  tripCode?: string;
  lat?: number;
  lng?: number;
}

/**
 * Tell the contacts who are due to hear about this.
 *
 * Returns the ones the SERVER could not reach. It is not an error — it is the
 * list the caller should offer to send from the device's own composer. Ignoring
 * the return value means those people are silently not told, which is why it is
 * a return value rather than a fire-and-forget.
 */
export async function dispatch(input: DispatchInput): Promise<UnreachableContact[]> {
  const { data, error } = await supabase.rpc("ec_dispatch", {
    p_kind: input.kind,
    p_title: input.title,
    p_body: input.body,
    p_trip_id: input.tripId ?? null,
    p_trip_code: input.tripCode ?? null,
    p_lat: input.lat ?? null,
    p_lng: input.lng ?? null,
  });
  if (error) {
    console.warn("[EC] dispatch:", error.message);
    return [];
  }
  return (data ?? []) as UnreachableContact[];
}

/**
 * Open the device's own SMS or WhatsApp composer, pre-filled.
 *
 * Deliberately NOT automatic. The message leaves the user's own number, which
 * is both the only thing available without an SMS provider and the version a
 * worried relative is most likely to trust. `sms:` takes `&body=` on Android
 * and `?body=` on iOS — getting that wrong opens an empty composer.
 */
export async function openComposer(
  contact: UnreachableContact,
  message: string,
): Promise<boolean> {
  const body = contact.custom_message ? `${contact.custom_message} — ${message}` : message;

  if (contact.channel === "whatsapp") {
    const wa = toWhatsAppNumber(contact.phone);
    if (wa) {
      const url = `whatsapp://send?phone=${wa}&text=${encodeURIComponent(body)}`;
      if (await Linking.canOpenURL(url).catch(() => false)) {
        await Linking.openURL(url);
        return true;
      }
    }
    // Falls through to SMS rather than failing: the point is that the person
    // gets told, not which app told them.
  }

  const sep = Platform.OS === "ios" ? "&" : "?";
  const url = `sms:${contact.phone}${sep}body=${encodeURIComponent(body)}`;
  if (!(await Linking.canOpenURL(url).catch(() => false))) return false;
  await Linking.openURL(url);
  return true;
}

/** The wording used for each kind, in one place so it cannot drift per screen. */
export function messageFor(
  kind: ECKind,
  opts: { name: string; tripCode?: string; place?: string; mapUrl?: string },
): { title: string; body: string } {
  const where = opts.place ? ` from ${opts.place}` : "";
  const code = opts.tripCode ? ` Trip code ${opts.tripCode}.` : "";
  const map = opts.mapUrl ? ` ${opts.mapUrl}` : "";

  switch (kind) {
    case "trip_start":
      return {
        title: `${opts.name} started a trip`,
        body: `${opts.name} has started a trip${where}.${code}${map}`,
      };
    case "trip_end":
      return {
        title: `${opts.name} arrived`,
        body: `${opts.name} has finished their trip safely.${code}`,
      };
    case "sos":
      return {
        title: `${opts.name} needs help`,
        body: `EMERGENCY: ${opts.name} triggered an SOS${where}.${code}${map}`,
      };
    case "route_deviation":
      return {
        title: `${opts.name}'s trip changed route`,
        body: `${opts.name}'s trip has left the expected route.${code}${map}`,
      };
    case "no_movement":
      return {
        title: `${opts.name}'s trip has stopped`,
        body: `${opts.name}'s trip has not moved for a while.${code}${map}`,
      };
    case "test":
      return {
        title: `Test alert from ${opts.name}`,
        body: `This is what you would receive if ${opts.name} needed help. No action needed.`,
      };
  }
}

/** A link a relative can open in any map app, from a plain SMS. */
export function mapLink(lat?: number | null, lng?: number | null): string | undefined {
  if (lat == null || lng == null) return undefined;
  return `https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// MIGRATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Carry the old single AsyncStorage contact into the real table, once.
 *
 * Anyone who set an emergency contact before this feature existed had it stored
 * as `{ name, phone }` in `useSettingsStore`, on one device. Shipping the new
 * screen without this would show them an empty list and quietly drop the one
 * person they had nominated — the worst possible thing for this particular
 * feature to lose.
 *
 * Idempotent by construction: the local copy is cleared only after the server
 * has it (or has told us it already does), so an interrupted run retries and a
 * completed one never repeats.
 */
export async function migrateLegacyEmergencyContact(
  legacy: { name: string; phone: string } | null | undefined,
  clearLegacy: (v: null) => void,
): Promise<void> {
  if (!legacy?.name || !legacy?.phone) return;

  const res = await add(legacy.name, legacy.phone);
  // "duplicate" means a previous run already landed it. Both outcomes mean the
  // server now holds the contact, which is the condition for dropping the copy.
  if (res.ok || res.reason === "duplicate") {
    clearLegacy(null);
  }
}
