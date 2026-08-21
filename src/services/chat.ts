// src/services/chat.ts
//
// Every chat operation that is not "insert a message", in one place.
//
// ── Why a service and not more store methods ───────────────────────────────
// `useMessagesStore` had grown a Supabase client inside every action, so the
// wire format and the UI state machine were the same code. Splitting them means
// the store can be read as "what the screen believes" and this file as "what the
// server does", and a change to one stops rewriting the other.
//
// ── Why the media bucket is private ────────────────────────────────────────
// `post-media` is public because a post is published. A chat is not. A public
// bucket makes the URL the only thing between a private photo and anyone who
// gets hold of it, and URLs leak — through logs, screenshots, link unfurlers and
// anything that syncs a clipboard. So `chat-media` is private and every object
// is reached through a short-lived signed URL, minted on demand and cached for
// slightly less than it is valid for.
//
// The consequence to remember: `message.media_url` holds a STORAGE PATH, not a
// URL. Anything that renders it must go through `resolveMediaUrl`.

import { supabase } from "@/src/services/supabase";

export const CHAT_BUCKET = "chat-media";

export type ChatMediaKind = "image" | "video" | "audio" | "file";

export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string | null;
  sender_role: string | null;
  text: string | null;
  audio_uri: string | null;
  media_url: string | null;
  media_type: ChatMediaKind | null;
  media_name: string | null;
  media_size: number | null;
  media_width: number | null;
  media_height: number | null;
  duration_ms: number | null;
  reply_to: { id: string; author: string; preview: string } | null;
  forwarded: boolean;
  edited_at: string | null;
  deleted_for_everyone: boolean;
  created_at: string;
  read: boolean;
  status: "sent" | "delivered" | "read";
  delivered_at: string | null;
  read_at: string | null;
  starred: boolean;
}

export interface ChatConversationRow {
  id: string;
  type: string | null;
  other_id: string | null;
  other_name: string | null;
  other_username: string | null;
  other_photo: string | null;
  other_role: "driver" | "passenger" | "park_owner" | null;
  other_driver_id: string | null;
  other_vehicle: string | null;
  other_park_name: string | null;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  muted_until: string | null;
  pinned: boolean;
  archived: boolean;
  wallpaper: string | null;
  trip_code: string | null;
}

export interface StarredRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string | null;
  text: string | null;
  media_url: string | null;
  media_type: ChatMediaKind | null;
  media_name: string | null;
  audio_uri: string | null;
  created_at: string;
  starred_at: string;
  other_name: string | null;
  other_photo: string | null;
}

export interface MediaRow {
  id: string;
  sender_id: string;
  sender_name: string | null;
  media_url: string | null;
  media_type: ChatMediaKind | null;
  media_name: string | null;
  media_size: number | null;
  text: string | null;
  created_at: string;
}

export interface SearchHitRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string | null;
  text: string | null;
  created_at: string;
  other_name: string | null;
  other_photo: string | null;
}

/** Every RPC here fails soft: the chat stays usable offline, on the cache. */
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) {
    console.warn(`[chat] ${fn}:`, error.message);
    return null;
  }
  return data as T;
}

// ═════════════════════════════════════════════════════════════════════════════
// READS
// ═════════════════════════════════════════════════════════════════════════════

export async function listConversations(): Promise<ChatConversationRow[]> {
  return (await rpc<ChatConversationRow[]>("chat_list_conversations")) ?? [];
}

export async function listMessages(conversationId: string, limit = 300): Promise<ChatMessageRow[]> {
  return (
    (await rpc<ChatMessageRow[]>("chat_list_messages", {
      p_conversation_id: conversationId,
      p_limit: limit,
    })) ?? []
  );
}

export async function listConversationMedia(
  conversationId: string,
  kind: "media" | "docs" | "links" = "media",
): Promise<MediaRow[]> {
  return (
    (await rpc<MediaRow[]>("chat_conversation_media", {
      p_conversation_id: conversationId,
      p_kind: kind,
    })) ?? []
  );
}

export async function listStarred(limit = 200): Promise<StarredRow[]> {
  return (await rpc<StarredRow[]>("chat_list_starred", { p_limit: limit })) ?? [];
}

export async function searchMessages(
  query: string,
  conversationId?: string,
): Promise<SearchHitRow[]> {
  if (query.trim().length < 2) return [];
  return (
    (await rpc<SearchHitRow[]>("chat_search_messages", {
      p_query: query.trim(),
      p_conversation_id: conversationId ?? null,
    })) ?? []
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// RECEIPTS + PREFERENCES
// ═════════════════════════════════════════════════════════════════════════════

export const markRead = (conversationId: string) =>
  rpc<number>("chat_mark_read", { p_conversation_id: conversationId });

export const markDelivered = (conversationId?: string) =>
  rpc<number>("chat_mark_delivered", { p_conversation_id: conversationId ?? null });

export const markUnread = (conversationId: string) =>
  rpc<void>("chat_mark_unread", { p_conversation_id: conversationId });

export const clearHistory = (conversationId: string) =>
  rpc<void>("chat_clear_history", { p_conversation_id: conversationId });

export interface PrefPatch {
  mutedUntil?: string | null;
  /** Explicit, because `null` on `mutedUntil` means "don't touch it". */
  clearMute?: boolean;
  pinned?: boolean;
  archived?: boolean;
  wallpaper?: string;
  clearWallpaper?: boolean;
}

export const setPrefs = (conversationId: string, patch: PrefPatch) =>
  rpc<void>("chat_set_prefs", {
    p_conversation_id: conversationId,
    p_muted_until: patch.mutedUntil ?? null,
    p_clear_mute: patch.clearMute ?? false,
    p_pinned: patch.pinned ?? null,
    p_archived: patch.archived ?? null,
    p_wallpaper: patch.wallpaper ?? null,
    p_clear_wallpaper: patch.clearWallpaper ?? false,
  });

/** Mute presets, in the order the sheet offers them. */
export const MUTE_OPTIONS: { label: string; hours: number | null }[] = [
  { label: "8 hours", hours: 8 },
  { label: "1 week", hours: 24 * 7 },
  { label: "Always", hours: null },
];

/** `null` hours means forever — stored as a date far enough out to mean it. */
export function muteUntilISO(hours: number | null): string {
  const ms = hours === null ? 1000 * 60 * 60 * 24 * 365 * 50 : hours * 3_600_000;
  return new Date(Date.now() + ms).toISOString();
}

export function isMuted(mutedUntil: string | null | undefined): boolean {
  return !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();
}

// ═════════════════════════════════════════════════════════════════════════════
// MESSAGE ACTIONS
// ═════════════════════════════════════════════════════════════════════════════

export const toggleStar = (messageId: string) =>
  rpc<boolean>("chat_toggle_star", { p_message_id: messageId });

export const deleteForMe = (messageIds: string[]) =>
  rpc<number>("chat_delete_for_me", { p_message_ids: messageIds });

export const deleteForEveryone = (messageIds: string[]) =>
  rpc<number>("chat_delete_for_everyone", { p_message_ids: messageIds });

export async function editMessage(messageId: string, text: string): Promise<string | null> {
  const { error } = await supabase.rpc("chat_edit_message", {
    p_message_id: messageId,
    p_text: text,
  });
  // The only RPC whose error is worth showing: "you can no longer edit this" is
  // the answer to a question the user just asked, not a background failure.
  return error ? error.message : null;
}

export const forwardMessages = (messageIds: string[], conversationIds: string[]) =>
  rpc<number>("chat_forward", {
    p_message_ids: messageIds,
    p_conversation_ids: conversationIds,
  });

/** WhatsApp's window, and the reason the menu hides the option on old messages. */
export const DELETE_FOR_EVERYONE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export const canDeleteForEveryone = (createdAt: string, isMine: boolean) =>
  isMine && Date.now() - new Date(createdAt).getTime() < DELETE_FOR_EVERYONE_WINDOW_MS;

export const canEdit = (createdAt: string, isMine: boolean, hasMedia: boolean) =>
  isMine && !hasMedia && Date.now() - new Date(createdAt).getTime() < EDIT_WINDOW_MS;

// ═════════════════════════════════════════════════════════════════════════════
// MEDIA
// ═════════════════════════════════════════════════════════════════════════════

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  heic: "image/heic", gif: "image/gif",
  mp4: "video/mp4", mov: "video/quicktime",
  m4a: "audio/m4a", aac: "audio/aac", mp3: "audio/mpeg", wav: "audio/wav",
  pdf: "application/pdf", txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function extOf(uri: string, fallback: string): string {
  const clean = uri.split("?")[0].split("#")[0];
  const ext = clean.split(".").pop()?.toLowerCase() ?? "";
  return ext && ext.length <= 5 ? ext : fallback;
}

/**
 * Uploads one local file and returns its STORAGE PATH.
 *
 * The path's first segment is the conversation id, because that is exactly the
 * question the storage policy asks: "is the caller in this conversation?". Any
 * other layout would need a lookup table to answer it.
 *
 * `new File(uri).bytes()` is expo-file-system's SDK 54 API. `fetch(uri).blob()`
 * is unreliable for `file://` on iOS — that is why it is not used here.
 */
export async function uploadChatMedia(
  conversationId: string,
  localUri: string,
  kind: ChatMediaKind,
  onProgress?: (fraction: number) => void,
): Promise<{ path: string; size: number; contentType: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error("Sign in to send media");

  const { File } = await import("expo-file-system");
  onProgress?.(0.05);
  const bytes = await new File(localUri).bytes();
  onProgress?.(0.45);

  const fallback = kind === "video" ? "mp4" : kind === "audio" ? "m4a" : kind === "file" ? "bin" : "jpg";
  const ext = extOf(localUri, fallback);
  const contentType = MIME[ext];

  // The bucket carries an allow-list of MIME types, so an unknown extension is
  // rejected by storage with "mime type not supported" — which surfaces as a
  // failed send with no explanation. Refusing here says what is wrong while the
  // user still has the picker in mind. Widening the bucket to
  // application/octet-stream instead would make the allow-list meaningless.
  if (!contentType) {
    throw new Error(`.${ext} files can't be sent yet. Try a PDF, an image, or an Office document.`);
  }

  // The random suffix is not decoration: two devices on one account uploading in
  // the same millisecond would otherwise overwrite each other.
  const path = `${conversationId}/${uid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(CHAT_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(error.message);

  onProgress?.(1);
  return { path, size: bytes.byteLength, contentType };
}

// ── Signed URLs ─────────────────────────────────────────────────────────────
//
// Minted on demand and cached until shortly before they expire. Without the
// cache a scrolling gallery would sign the same object once per re-render.

const SIGNED_TTL_SECONDS = 60 * 60 * 6;
const signedCache = new Map<string, { url: string; expires: number }>();

/**
 * Turns a stored `media_url` into something an <Image> can load.
 *
 * Passes through anything that is already a URL or a local file — legacy voice
 * notes stored a `file://` path, and on the device that recorded them it still
 * plays. Everything else is treated as a `chat-media` path and signed.
 */
export async function resolveMediaUrl(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  if (/^(https?:|file:|data:|content:|ph:|assets-library:)/.test(stored)) return stored;

  const hit = signedCache.get(stored);
  if (hit && hit.expires > Date.now()) return hit.url;

  const { data, error } = await supabase.storage
    .from(CHAT_BUCKET)
    .createSignedUrl(stored, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.warn("[chat] sign media:", error?.message);
    return null;
  }
  // Expire the cache entry a minute early so a URL is never handed out at the
  // exact moment it stops working.
  signedCache.set(stored, {
    url: data.signedUrl,
    expires: Date.now() + (SIGNED_TTL_SECONDS - 60) * 1000,
  });
  return data.signedUrl;
}

/** Sign many at once, for a gallery. Failures come back as null, not throws. */
export async function resolveMediaUrls(stored: (string | null)[]): Promise<(string | null)[]> {
  return Promise.all(stored.map(resolveMediaUrl));
}

export function humanFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** First URL in a message body — the links tab renders these. */
export function firstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/(https?:\/\/|www\.)[^\s]+/i);
  if (!m) return null;
  return m[0].startsWith("http") ? m[0] : `https://${m[0]}`;
}
