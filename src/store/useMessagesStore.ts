// src/store/useMessagesStore.ts
//
// Conversations and messages. Offline-first: the persisted cache is what the
// screen renders, the server is what it reconciles against.
//
// ── What changed, and why it had to ────────────────────────────────────────
// This store used to talk to Supabase table-by-table from inside every action,
// and three of those queries were wrong in ways that only show up with two real
// accounts:
//
//   • `markRead` ran `update messages set read = true` over the WHOLE
//     conversation with no sender filter, so opening your own chat marked your
//     own outgoing messages as read and turned your ticks blue.
//   • `addMessageLocal` incremented `unread_count` for every message including
//     your own, so sending a message made the chat unread — for you.
//   • `unread_count` was one integer on a row BOTH people share. Whoever read
//     it cleared it for both.
//
// Unread is per-viewer by definition, so it now comes from the server computed
// against this user's `last_read_at` (see migration_chat_features.sql), and the
// wire calls live in `src/services/chat.ts`. This file is the state machine.
//
// ── Optimistic sends ───────────────────────────────────────────────────────
// A message appears the instant you hit send, marked `pending`. The insert then
// either confirms it or marks it `failed`, and a failed message keeps a retry.
// The old code awaited the network before rendering anything, which on a Lagos
// 3G connection is two seconds of a chat that looks broken.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/services/supabase';
import { useAuthStore } from '@/src/store/useStore';
import * as chat from '@/src/services/chat';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name?: string;
  sender_role?: 'driver' | 'passenger' | 'park_owner';
  text?: string;
  /** Voice note. A storage path since the upload landed; a `file://` on old rows. */
  audio_uri?: string;
  /** Storage path in `chat-media`, NOT a URL — resolve with `resolveMediaUrl`. */
  media_url?: string;
  media_type?: chat.ChatMediaKind;
  media_name?: string;
  media_size?: number;
  media_width?: number;
  media_height?: number;
  duration_ms?: number;
  created_at: string;
  read: boolean;
  status?: 'sent' | 'delivered' | 'read';
  /**
   * The message this one answers, denormalised at send time.
   *
   * Storing the author and a preview rather than only an id is deliberate: a
   * quote must still render when the original has been deleted, and it must
   * render without a second lookup while scrolling.
   */
  reply_to?: { id: string; author: string; preview: string } | null;
  starred?: boolean;
  forwarded?: boolean;
  edited_at?: string | null;
  deleted_for_everyone?: boolean;
  /** Client-only, never sent: an optimistic message still in flight. */
  pending?: boolean;
  failed?: boolean;
}

export interface Conversation {
  id: string;
  participant_id: string;
  participant_name: string;
  participant_role: 'driver' | 'passenger' | 'park_owner';
  participant_photo?: string;
  participant_driver_id?: string;
  participant_vehicle?: string;
  participant_park_name?: string;
  participant_username?: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  type?: 'trip' | 'direct';
  trip_code?: string;
  /** One-sided, per this user. Never a property of the shared row. */
  muted_until?: string | null;
  pinned?: boolean;
  archived?: boolean;
  wallpaper?: string | null;
  // legacy aliases — screens written at different times read different
  // spellings, and `addConversation` normalises whatever it is handed.
  participantId?: string;
  participantName?: string;
  participantRole?: string;
  participantDriverId?: string;
  participantVehicle?: string;
  participantParkName?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  typing?: boolean;
}

/**
 * A person you can start a chat with.
 *
 * Exactly the columns `find_user_for_chat` / `search_users_for_chat` return —
 * display-safe only. If you find yourself wanting a phone or an email here,
 * that is a signal to change the RPC deliberately, not to widen this type.
 */
export interface ChatCandidate {
  id: string;
  full_name: string | null;
  username: string | null;
  role: 'driver' | 'passenger' | 'park_owner';
  driver_id: string | null;
  profile_photo: string | null;
  vehicle_details: string | null;
  park_name?: string | null;
  avg_rating: number | null;
}

/** What to send. Everything except the ids, which the store fills in. */
export interface OutgoingMessage {
  text?: string;
  /** A local file:// URI. It is uploaded before the insert. */
  localMediaUri?: string;
  mediaKind?: chat.ChatMediaKind;
  mediaName?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  durationMs?: number;
  replyTo?: Message | null;
}

interface MessagesState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  typingUsers: Record<string, boolean>;
  realtimeSubscription: any;
  /** Per-conversation presence + typing channels, keyed by conversation id. */
  liveChannels: Record<string, any>;
  onlineUsers: Record<string, boolean>;
  viewerRole: 'driver' | 'passenger' | null;
  loadingConversations: boolean;

  addConversation:     (conv: Conversation) => Promise<void>;
  updateConversation:  (id: string, updates: Partial<Conversation>) => void;
  deleteConversation:  (id: string) => Promise<void>;
  addMessage:          (msg: Message) => Promise<void>;
  addMessageLocal:     (msg: Message) => void;
  /** The send path: optimistic insert, upload if needed, confirm or fail. */
  sendMessage2:        (convId: string, out: OutgoingMessage) => Promise<void>;
  retryMessage:        (convId: string, msgId: string) => Promise<void>;
  updateMessage:       (convId: string, msgId: string, updates: Partial<Message>) => Promise<void>;
  updateMessageLocal:  (convId: string, msgId: string, updates: Partial<Message>) => void;
  deleteMessage:       (convId: string, msgId: string) => Promise<void>;
  deleteForMe:         (convId: string, msgIds: string[]) => Promise<void>;
  deleteForEveryone:   (convId: string, msgIds: string[]) => Promise<void>;
  toggleStar:          (convId: string, msgId: string) => Promise<void>;
  editMessage:         (convId: string, msgId: string, text: string) => Promise<string | null>;
  forwardMessages:     (msgIds: string[], convIds: string[]) => Promise<number>;
  markRead:            (convId: string) => Promise<void>;
  markUnread:          (convId: string) => Promise<void>;
  clearHistory:        (convId: string) => Promise<void>;
  setPrefs:            (convId: string, patch: chat.PrefPatch) => Promise<void>;
  setTyping:           (convId: string, isTyping: boolean) => void;
  getMessages:         (convId: string) => Message[];
  getUnreadCount:      (userId?: string, role?: string, driverId?: string) => number;
  subscribeToRealtime: (userId: string) => () => void;
  unsubscribeRealtime: () => void;
  /** Typing + presence for ONE open chat. Returns its own teardown. */
  joinConversation:    (convId: string, userId: string) => () => void;
  loadConversations:   (userId?: string, role?: 'driver' | 'passenger') => Promise<void>;
  loadMessages:        (convId: string) => Promise<void>;
  startConversation:   (driverId: string, passengerId: string, driverData?: any, passengerData?: any) => Promise<Conversation | null>;
  subscribeToMessages: (userId: string) => () => void;
  sendMessage:         (convId: string, senderId: string, text: string, senderName: string, senderRole: 'driver' | 'passenger') => Promise<void>;
  markConversationRead:(convId: string, userId: string, role: 'driver' | 'passenger') => Promise<void>;

  /** Creates (or returns existing) direct conversation between two users. */
  startDirectChat: (passengerId: string, driverUserId: string) => Promise<Conversation>;
  fetchConversationByDriverId: (
    driverDisplayId: string,
    passengerId: string,
  ) => Promise<{ driverUser: ChatCandidate; conversation: Conversation }>;
  fetchConversationByHandle: (
    handle: string,
    currentUserId: string,
  ) => Promise<{ driverUser: ChatCandidate; conversation: Conversation }>;
  searchUsersForChat: (query: string) => Promise<ChatCandidate[]>;
}

/** Server row → the one-sided shape the UI reads. */
function fromServerConversation(r: chat.ChatConversationRow): Conversation {
  return {
    id: r.id,
    type: (r.type as any) || 'direct',
    participant_id: r.other_id ?? '',
    participant_name: r.other_name || (r.other_role === 'passenger' ? 'Passenger' : 'Driver'),
    participant_role: (r.other_role || 'driver') as any,
    participant_photo: r.other_photo ?? undefined,
    participant_username: r.other_username ?? undefined,
    participant_driver_id: r.other_driver_id ?? undefined,
    participant_vehicle: r.other_vehicle ?? undefined,
    participant_park_name: r.other_park_name ?? undefined,
    last_message: r.last_message || '',
    last_message_at: r.last_message_at,
    unread_count: r.unread_count ?? 0,
    muted_until: r.muted_until,
    pinned: !!r.pinned,
    archived: !!r.archived,
    wallpaper: r.wallpaper,
    trip_code: r.trip_code ?? undefined,
  };
}

/**
 * Turn a stored conversation row into "the other person", from `viewerId`'s
 * point of view.
 *
 * A conversation row is symmetric — it describes both sides — but a
 * `Conversation` in the UI is one-sided: `participant_*` always means "who I am
 * talking to". Which stored side that is depends entirely on who is asking, and
 * getting it wrong is what made a driver's inbox show a chat with themselves.
 */
function conversationForViewer(row: any, viewerId: string): Conversation {
  const viewerIsParticipant = row.participant_id === viewerId;
  return {
    id:   row.id,
    type: row.type,
    participant_id: viewerIsParticipant ? row.passenger_id : row.participant_id,
    participant_name: viewerIsParticipant
      ? row.passenger_name || 'Passenger'
      : row.participant_name || 'Driver',
    participant_role: (viewerIsParticipant ? 'passenger' : row.participant_role || 'driver') as any,
    participant_photo: viewerIsParticipant ? row.passenger_photo : row.participant_photo,
    participant_username: viewerIsParticipant ? row.passenger_username : row.participant_username,
    participant_driver_id: viewerIsParticipant ? undefined : row.participant_driver_id,
    participant_vehicle:   viewerIsParticipant ? undefined : row.participant_vehicle,
    participant_park_name: viewerIsParticipant ? undefined : row.participant_park_name,
    // No phone here. A number cached on a conversation outlives the consent
    // that produced it; the Call button asks `get_contact_phone` at press time
    // instead. See src/services/contact.ts.
    last_message:    row.last_message    || '',
    last_message_at: row.last_message_at || new Date().toISOString(),
    unread_count:    row.unread_count    || 0,
    trip_code:       row.trip_code,
  };
}

function normalizeMessage(msg: any): Message {
  return {
    id:              msg.id,
    conversation_id: msg.conversation_id || msg.conversationId,
    sender_id:       msg.sender_id       || msg.senderId,
    sender_name:     msg.sender_name     || msg.senderName || 'Unknown',
    sender_role:     msg.sender_role ?? undefined,
    text:            msg.text ?? undefined,
    audio_uri:       msg.audio_uri       || msg.audioUri || undefined,
    media_url:       msg.media_url ?? undefined,
    media_type:      msg.media_type ?? undefined,
    media_name:      msg.media_name ?? undefined,
    media_size:      msg.media_size ?? undefined,
    media_width:     msg.media_width ?? undefined,
    media_height:    msg.media_height ?? undefined,
    duration_ms:     msg.duration_ms ?? undefined,
    reply_to:        msg.reply_to ?? null,
    starred:         !!msg.starred,
    forwarded:       !!msg.forwarded,
    edited_at:       msg.edited_at ?? null,
    deleted_for_everyone: !!msg.deleted_for_everyone,
    created_at:      msg.created_at      || msg.createdAt || new Date().toISOString(),
    read:            msg.read            || false,
    status:          msg.status          || 'sent',
    pending:         msg.pending ?? undefined,
    failed:          msg.failed ?? undefined,
  };
}

/** What the inbox row should say for a message with no text. */
function previewOf(m: Message): string {
  if (m.text) return m.text;
  switch (m.media_type) {
    case 'image': return '📷 Photo';
    case 'video': return '🎥 Video';
    case 'audio': return '🎤 Voice message';
    case 'file':  return `📄 ${m.media_name || 'Document'}`;
  }
  return m.audio_uri ? '🎤 Voice message' : '';
}

const newId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

/** Chronological, so a confirmed message never jumps past a pending one. */
const byTime = (a: Message, b: Message) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

export const useMessagesStore = create<MessagesState>()(
  persist(
    (set, get) => ({
      conversations:        [],
      messages:             {},
      typingUsers:          {},
      realtimeSubscription: null,
      liveChannels:         {},
      onlineUsers:          {},
      viewerRole:           null,
      loadingConversations: false,

      addConversation: async (conv) => {
        const normalized: Conversation = {
          id:                    conv.id,
          participant_id:        conv.participantId        || conv.participant_id,
          participant_name:      conv.participantName      || conv.participant_name,
          participant_role:      (conv.participantRole     || conv.participant_role) as any,
          participant_photo:     conv.participant_photo,
          participant_driver_id: conv.participantDriverId  || conv.participant_driver_id,
          participant_vehicle:   conv.participantVehicle   || conv.participant_vehicle,
          participant_park_name: conv.participantParkName  || conv.participant_park_name,
          last_message:          conv.lastMessage          || conv.last_message      || '',
          last_message_at:       conv.lastMessageAt        || conv.last_message_at   || new Date().toISOString(),
          unread_count:          conv.unreadCount          || conv.unread_count      || 0,
          trip_code:             conv.trip_code,
        };
        set((state) => {
          if (state.conversations.find((c) => c.id === normalized.id)) return state;
          return { conversations: [normalized, ...state.conversations] };
        });
        try {
          await supabase.from('conversations').upsert([{
            id:               normalized.id,
            participant_id:   normalized.participant_id,
            participant_name: normalized.participant_name,
            participant_role: normalized.participant_role,
            last_message:     normalized.last_message,
            last_message_at:  normalized.last_message_at,
            unread_count:     normalized.unread_count,
            trip_code:        normalized.trip_code,
          }]);
        } catch (e) {
          console.warn('[Messages] addConversation sync error:', e);
        }
      },

      updateConversation: (id, updates) =>
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),

      deleteConversation: async (id) => {
        set((state) => {
          const { [id]: _removed, ...rest } = state.messages;
          return { conversations: state.conversations.filter((c) => c.id !== id), messages: rest };
        });
        try { await supabase.from('conversations').delete().eq('id', id); } catch (e) {
          console.warn('[Messages] deleteConversation error:', e);
        }
      },

      // ── Sending ───────────────────────────────────────────────────────────

      sendMessage2: async (convId, out) => {
        const user = useAuthStore.getState().user;
        if (!user?.id) return;

        const id = newId();
        const optimistic: Message = normalizeMessage({
          id,
          conversation_id: convId,
          sender_id:   user.id,
          sender_name: user.full_name || 'Me',
          sender_role: user.role,
          text: out.text?.trim() || undefined,
          // Render the LOCAL uri while the upload runs, so a photo appears
          // immediately instead of after the round trip.
          media_url:   out.localMediaUri,
          media_type:  out.mediaKind,
          media_name:  out.mediaName,
          media_width: out.mediaWidth,
          media_height: out.mediaHeight,
          duration_ms: out.durationMs,
          audio_uri:   out.mediaKind === 'audio' ? out.localMediaUri : undefined,
          created_at:  new Date().toISOString(),
          read: false,
          status: 'sent',
          pending: true,
          reply_to: out.replyTo
            ? {
                id:      out.replyTo.id,
                author:  out.replyTo.sender_id === user.id ? 'You' : out.replyTo.sender_name || 'User',
                preview: previewOf(out.replyTo) || 'Message',
              }
            : null,
        });

        get().addMessageLocal(optimistic);

        try {
          let storedPath = out.localMediaUri;
          if (out.localMediaUri && out.mediaKind) {
            const up = await chat.uploadChatMedia(convId, out.localMediaUri, out.mediaKind);
            storedPath = up.path;
            get().updateMessageLocal(convId, id, { media_size: up.size });
          }

          const row: Record<string, any> = {
            id,
            conversation_id: convId,
            sender_id:   user.id,
            sender_name: user.full_name || 'Me',
            sender_role: user.role,
            text:        optimistic.text ?? null,
            reply_to:    optimistic.reply_to,
            created_at:  optimistic.created_at,
            read:        false,
            status:      'sent',
          };
          if (out.mediaKind === 'audio') {
            row.audio_uri  = storedPath;
            row.media_url  = storedPath;
            row.media_type = 'audio';
            row.duration_ms = out.durationMs ?? null;
          } else if (out.mediaKind) {
            row.media_url    = storedPath;
            row.media_type   = out.mediaKind;
            row.media_name   = out.mediaName ?? null;
            row.media_width  = out.mediaWidth ?? null;
            row.media_height = out.mediaHeight ?? null;
          }

          const { error } = await supabase.from('messages').insert([row]);
          if (error) throw new Error(error.message);

          // The path replaces the local uri only once the object is on the
          // server; swapping earlier would break the preview if the upload
          // failed halfway.
          get().updateMessageLocal(convId, id, {
            pending: false,
            failed: false,
            status: 'sent',
            media_url: out.mediaKind ? storedPath : undefined,
            audio_uri: out.mediaKind === 'audio' ? storedPath : undefined,
          });
        } catch (e: any) {
          console.warn('[Messages] send failed:', e?.message ?? e);
          get().updateMessageLocal(convId, id, { pending: false, failed: true });
        }
      },

      retryMessage: async (convId, msgId) => {
        const msg = (get().messages[convId] || []).find((m) => m.id === msgId);
        if (!msg) return;
        // Drop the failed copy and send it again: reusing the id would collide
        // if the original insert actually landed and only the reply was lost.
        set((s) => ({
          messages: {
            ...s.messages,
            [convId]: (s.messages[convId] || []).filter((m) => m.id !== msgId),
          },
        }));
        await get().sendMessage2(convId, {
          text: msg.text,
          localMediaUri: msg.media_url,
          mediaKind: msg.media_type,
          mediaName: msg.media_name,
          mediaWidth: msg.media_width,
          mediaHeight: msg.media_height,
          durationMs: msg.duration_ms,
          replyTo: null,
        });
      },

      addMessage: async (msg) => {
        const normalized = normalizeMessage(msg);
        get().addMessageLocal(normalized);
        try {
          const { error } = await supabase.from('messages').insert([{
            id:              normalized.id,
            conversation_id: normalized.conversation_id,
            sender_id:       normalized.sender_id,
            sender_name:     normalized.sender_name,
            sender_role:     normalized.sender_role,
            text:            normalized.text ?? null,
            audio_uri:       normalized.audio_uri ?? null,
            media_url:       normalized.media_url ?? null,
            media_type:      normalized.media_type ?? null,
            reply_to:        normalized.reply_to,
            created_at:      normalized.created_at,
            read:            false,
            status:          'sent',
          }]);
          if (error) {
            console.warn('[Messages] insert error:', error.message);
            get().updateMessageLocal(normalized.conversation_id, normalized.id, { failed: true });
          }
          // The conversation preview is bumped by a trigger now, so there is no
          // second round trip here. A client-side update could only ever cover
          // its own sends anyway — forwards and other devices bypassed it.
        } catch (e) {
          console.warn('[Messages] addMessage network error:', e);
        }
      },

      addMessageLocal: (msg) => {
        const normalized = normalizeMessage(msg);
        const me = useAuthStore.getState().user?.id;
        set((state) => {
          const convId   = normalized.conversation_id;
          const existing = state.messages[convId] || [];
          if (existing.find((m) => m.id === normalized.id)) return state;
          const mine = normalized.sender_id === me;
          return {
            messages: { ...state.messages, [convId]: [...existing, normalized].sort(byTime) },
            conversations: state.conversations.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    last_message:    previewOf(normalized),
                    last_message_at: normalized.created_at,
                    // Your own message is not unread FOR YOU. The old code
                    // incremented unconditionally, so sending marked the chat
                    // unread and the tab badge counted your own words.
                    unread_count: mine ? c.unread_count : (c.unread_count || 0) + 1,
                  }
                : c,
            ),
          };
        });
      },

      updateMessageLocal: (convId, msgId, updates) =>
        set((state) => ({
          messages: {
            ...state.messages,
            [convId]: (state.messages[convId] || []).map((m) =>
              m.id === msgId ? { ...m, ...updates } : m,
            ),
          },
        })),

      updateMessage: async (convId, msgId, updates) => {
        get().updateMessageLocal(convId, msgId, updates);
        // Only the sender may UPDATE a message row now, and receipts go through
        // `chat_mark_read`. Anything else here would be rejected by RLS.
        const me = useAuthStore.getState().user?.id;
        const msg = (get().messages[convId] || []).find((m) => m.id === msgId);
        if (!msg || msg.sender_id !== me) return;
        const { pending, failed, starred, ...wire } = updates as any;
        if (Object.keys(wire).length === 0) return;
        try { await supabase.from('messages').update(wire).eq('id', msgId); } catch (e) {
          console.warn('[Messages] updateMessage error:', e);
        }
      },

      /** The old blanket delete. Kept because call sites use it; delete-for-me. */
      deleteMessage: async (convId, msgId) => get().deleteForMe(convId, [msgId]),

      deleteForMe: async (convId, msgIds) => {
        const ids = new Set(msgIds);
        set((state) => {
          const filtered = (state.messages[convId] || []).filter((m) => !ids.has(m.id));
          const last     = filtered[filtered.length - 1];
          return {
            messages: { ...state.messages, [convId]: filtered },
            conversations: state.conversations.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    last_message:    last ? previewOf(last) : '',
                    last_message_at: last?.created_at || c.last_message_at,
                  }
                : c,
            ),
          };
        });
        await chat.deleteForMe(msgIds);
      },

      deleteForEveryone: async (convId, msgIds) => {
        const ids = new Set(msgIds);
        set((state) => ({
          messages: {
            ...state.messages,
            [convId]: (state.messages[convId] || []).map((m) =>
              ids.has(m.id)
                ? { ...m, deleted_for_everyone: true, text: undefined, media_url: undefined,
                    media_type: undefined, audio_uri: undefined, reply_to: null }
                : m,
            ),
          },
        }));
        await chat.deleteForEveryone(msgIds);
      },

      toggleStar: async (convId, msgId) => {
        const cur = (get().messages[convId] || []).find((m) => m.id === msgId)?.starred ?? false;
        get().updateMessageLocal(convId, msgId, { starred: !cur });
        const now = await chat.toggleStar(msgId);
        if (now !== null && now !== !cur) get().updateMessageLocal(convId, msgId, { starred: now });
      },

      editMessage: async (convId, msgId, text) => {
        const err = await chat.editMessage(msgId, text);
        if (!err) {
          get().updateMessageLocal(convId, msgId, { text, edited_at: new Date().toISOString() });
        }
        return err;
      },

      forwardMessages: async (msgIds, convIds) => {
        const n = await chat.forwardMessages(msgIds, convIds);
        // Pull the copies back rather than inventing them client-side: the ids
        // are minted server-side, and guessing them would break dedupe.
        await Promise.all(convIds.map((id) => get().loadMessages(id)));
        await get().loadConversations();
        return n ?? 0;
      },

      markRead: async (convId) => {
        const me = useAuthStore.getState().user?.id;
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === convId ? { ...c, unread_count: 0 } : c,
          ),
          messages: {
            ...state.messages,
            // Only the OTHER side's messages become read. Marking your own
            // read is what turned your ticks blue by opening your own chat.
            [convId]: (state.messages[convId] || []).map((m) =>
              m.sender_id === me ? m : { ...m, read: true, status: 'read' as const },
            ),
          },
        }));
        await chat.markRead(convId);
      },

      markUnread: async (convId) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === convId ? { ...c, unread_count: Math.max(1, c.unread_count || 0) } : c,
          ),
        }));
        await chat.markUnread(convId);
      },

      clearHistory: async (convId) => {
        set((state) => ({
          messages: { ...state.messages, [convId]: [] },
          conversations: state.conversations.map((c) =>
            c.id === convId ? { ...c, last_message: '', unread_count: 0 } : c,
          ),
        }));
        await chat.clearHistory(convId);
      },

      setPrefs: async (convId, patch) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  muted_until: patch.clearMute ? null : (patch.mutedUntil ?? c.muted_until),
                  pinned:      patch.pinned   ?? c.pinned,
                  archived:    patch.archived ?? c.archived,
                  wallpaper:   patch.clearWallpaper ? null : (patch.wallpaper ?? c.wallpaper),
                }
              : c,
          ),
        }));
        await chat.setPrefs(convId, patch);
      },

      // ── Typing + presence ────────────────────────────────────────────────
      //
      // Typing used to be written into `typingUsers[conversationId]` by the
      // person doing the typing, and read back by the same screen — so the
      // header said "typing…" whenever YOU typed. It is a broadcast now, and
      // only the other side's events reach this state.

      setTyping: (convId, isTyping) => {
        const me = useAuthStore.getState().user?.id;
        const ch = get().liveChannels[convId];
        if (!ch || !me) return;
        ch.send({
          type: 'broadcast',
          event: 'typing',
          payload: { user_id: me, typing: isTyping },
        }).catch?.(() => {});
      },

      joinConversation: (convId, userId) => {
        const existing = get().liveChannels[convId];
        if (existing) { try { supabase.removeChannel(existing); } catch {} }

        let idle: ReturnType<typeof setTimeout> | null = null;

        const ch = supabase
          .channel(`chat:${convId}`, { config: { presence: { key: userId } } })
          .on('broadcast', { event: 'typing' }, ({ payload }) => {
            if (!payload || payload.user_id === userId) return;
            set((s) => ({ typingUsers: { ...s.typingUsers, [convId]: !!payload.typing } }));
            // A "stopped typing" event can be lost. Without this timeout the
            // header would say "typing…" forever after one dropped packet.
            if (idle) clearTimeout(idle);
            if (payload.typing) {
              idle = setTimeout(
                () => set((s) => ({ typingUsers: { ...s.typingUsers, [convId]: false } })),
                6000,
              );
            }
          })
          .on('presence', { event: 'sync' }, () => {
            const state = ch.presenceState() as Record<string, unknown[]>;
            const online: Record<string, boolean> = {};
            Object.keys(state).forEach((k) => { online[k] = true; });
            set({ onlineUsers: online });
          })
          .subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED') {
              await ch.track({ at: new Date().toISOString() });
            }
          });

        set((s) => ({ liveChannels: { ...s.liveChannels, [convId]: ch } }));

        return () => {
          if (idle) clearTimeout(idle);
          try { supabase.removeChannel(ch); } catch {}
          set((s) => {
            const { [convId]: _gone, ...rest } = s.liveChannels;
            return {
              liveChannels: rest,
              typingUsers: { ...s.typingUsers, [convId]: false },
            };
          });
        };
      },

      getMessages: (convId) => get().messages[convId] || [],

      /**
       * Total unread across the inbox.
       *
       * The server already answers this per viewer, so the old role/driverId
       * filtering — which counted a driver's own conversations twice — is gone.
       * Muted chats still count: muting silences the alert, not the badge.
       */
      getUnreadCount: () =>
        get().conversations
          .filter((c) => !c.archived)
          .reduce((s, c) => s + (c.unread_count || 0), 0),

      subscribeToRealtime: (userId) => {
        const cur = get().realtimeSubscription;
        if (cur) { try { supabase.removeChannel(cur); } catch (_) {} }

        const channel = supabase
          .channel(`messages:user:${userId}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
            async (payload) => {
              const msg = normalizeMessage(payload.new);
              if (msg.sender_id === userId) return;

              // The FIRST message of a new conversation arrives before that
              // conversation exists locally, and the old code returned here —
              // which is why a chat someone else started only ever appeared
              // after a manual refresh. Pull the list, then deliver.
              let conv = get().conversations.find((c) => c.id === msg.conversation_id);
              if (!conv) {
                await get().loadConversations();
                conv = get().conversations.find((c) => c.id === msg.conversation_id);
                if (!conv) return; // genuinely not ours to see
              }

              get().addMessageLocal(msg);
              chat.markDelivered(msg.conversation_id);

              // Muting is the whole point of muting.
              if (chat.isMuted(conv.muted_until)) return;
              try {
                const N = await import('expo-notifications');
                await N.default.scheduleNotificationAsync({
                  content: {
                    title: `New message from ${msg.sender_name || 'User'}`,
                    body:  previewOf(msg) || 'New message',
                    data:  { conversationId: msg.conversation_id, type: 'message' },
                    sound: 'default',
                  },
                  trigger: null,
                });
              } catch (e) { console.warn('[Messages] notification error:', e); }
            },
          )
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' },
            (payload) => {
              const u = normalizeMessage(payload.new);
              // LOCAL only. Writing back here would echo the change straight
              // into the same subscription that delivered it.
              get().updateMessageLocal(u.conversation_id, u.id, {
                text: u.text,
                read: u.read,
                status: u.status,
                edited_at: u.edited_at,
                deleted_for_everyone: u.deleted_for_everyone,
                ...(u.deleted_for_everyone
                  ? { media_url: undefined, media_type: undefined, audio_uri: undefined, reply_to: null }
                  : {}),
              });
            },
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') console.log('[Messages] realtime active:', userId);
          });

        set({ realtimeSubscription: channel });
        return () => {
          try { supabase.removeChannel(channel); } catch (_) {}
          set({ realtimeSubscription: null });
        };
      },

      unsubscribeRealtime: () => {
        const sub = get().realtimeSubscription;
        if (sub) {
          try { supabase.removeChannel(sub); } catch (_) {}
          set({ realtimeSubscription: null });
        }
      },

      /**
       * The inbox.
       *
       * One RPC now, which returns the rows already resolved to "the other
       * person" with this viewer's unread, mute, pin and wallpaper attached.
       * The old version selected the whole table, filtered on the client and
       * then fired one message query PER CONVERSATION — 30 chats meant 31 round
       * trips before the list could paint.
       */
      loadConversations: async (userId?: string, role?: 'driver' | 'passenger') => {
        if (role) set({ viewerRole: role });
        set({ loadingConversations: true });
        try {
          const rows = await chat.listConversations();
          const uid = userId ?? useAuthStore.getState().user?.id;
          if (!rows.length && !uid) return;
          set({ conversations: rows.map(fromServerConversation) });
          chat.markDelivered();
        } catch (e) {
          console.warn('[Messages] loadConversations error:', e);
        } finally {
          set({ loadingConversations: false });
        }
      },

      /** One thread. Server rows win over the cache — hides and clears live there. */
      loadMessages: async (convId) => {
        try {
          const rows = await chat.listMessages(convId);
          set((s) => {
            // Keep anything still in flight; the server has never heard of it.
            const inflight = (s.messages[convId] || []).filter((m) => m.pending || m.failed);
            const seen = new Set(rows.map((r) => r.id));
            return {
              messages: {
                ...s.messages,
                [convId]: [...rows.map(normalizeMessage), ...inflight.filter((m) => !seen.has(m.id))]
                  .sort(byTime),
              },
            };
          });
        } catch (e) {
          console.warn('[Messages] loadMessages error:', e);
        }
      },

      startConversation: async (driverId, passengerId, driverData, passengerData) => {
        const convId   = `conv_${[driverId, passengerId].sort().join('_')}`;
        const existing = get().conversations.find((c) => c.id === convId);
        if (existing) return existing;

        const { data: remote } = await supabase
          .from('conversations').select('*').eq('id', convId).maybeSingle();
        if (remote) {
          const n = conversationForViewer(remote, passengerId);
          set((s) => ({
            conversations: s.conversations.find((c) => c.id === convId)
              ? s.conversations
              : [n, ...s.conversations],
          }));
          return n;
        }

        // `public.users` is no longer cross-readable — the blanket
        // "publicly readable" policy is gone (migration_user_privacy.sql), and
        // a direct select for someone else's row now returns nothing. Display
        // fields come from an RPC whose select list is the access control.
        if (!driverData || !passengerData) {
          const need = [
            !driverData ? driverId : null,
            !passengerData ? passengerId : null,
          ].filter(Boolean) as string[];

          const { data: profiles } = await supabase.rpc('get_public_profiles', { p_ids: need });
          const byId = new Map<string, any>((profiles ?? []).map((r: any) => [r.id, r]));
          if (!driverData) driverData = byId.get(driverId) ?? null;
          if (!passengerData) passengerData = byId.get(passengerId) ?? null;
        }

        const newConv: Conversation = {
          id:                    convId,
          participant_id:        driverId,
          participant_name:      driverData?.full_name || 'Driver',
          participant_role:      'driver',
          participant_driver_id: driverData?.driver_id,
          participant_photo:     driverData?.profile_photo,
          last_message:          '',
          last_message_at:       new Date().toISOString(),
          unread_count:          0,
        };
        try {
          await supabase.from('conversations').insert([{
            id:                    convId,
            type:                  'trip',
            participant_id:        driverId,
            participant_name:      newConv.participant_name,
            participant_role:      'driver',
            participant_driver_id: newConv.participant_driver_id,
            participant_photo:     newConv.participant_photo,
            passenger_id:          passengerId,
            passenger_name:        passengerData?.full_name || 'Passenger',
            passenger_photo:       passengerData?.profile_photo ?? null,
            last_message:          '',
            last_message_at:       newConv.last_message_at,
            unread_count:          0,
          }]);
        } catch (e) { console.warn('[Messages] startConversation insert error:', e); }
        set((s) => ({ conversations: [newConv, ...s.conversations] }));
        return newConv;
      },

      subscribeToMessages: (userId) => get().subscribeToRealtime(userId),

      sendMessage: async (convId, _senderId, text) => get().sendMessage2(convId, { text }),

      markConversationRead: async (convId) => get().markRead(convId),

      startDirectChat: async (passengerId, driverUserId) => {
        // Sorted so both sides produce the same deterministic key
        const convId   = `direct_${[passengerId, driverUserId].sort().join('_')}`;
        const existing = get().conversations.find((c) => c.id === convId);
        if (existing) return existing;

        const { data: remote } = await supabase
          .from('conversations').select('*').eq('id', convId).maybeSingle();

        if (remote) {
          // Same rule as loadConversations: render the side that ISN'T me.
          const normalized = conversationForViewer(remote, passengerId);
          set((s) => ({
            conversations: s.conversations.find((c) => c.id === convId)
              ? s.conversations
              : [normalized, ...s.conversations],
          }));
          return normalized;
        }

        // This used to be `from('users').select().eq('id', …)`, which cannot
        // work: RLS on `users` is own-row only, so looking up ANYONE else
        // returned nothing and this threw "Driver profile not found." every
        // time. get_driver_public is a SECURITY DEFINER RPC that returns only
        // display-safe columns, and it accepts a UUID as well as a badge ID.
        const { data: rpcRows, error } = await supabase.rpc('get_driver_public', {
          p_driver_id: driverUserId,
        });
        const driver = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
        if (error || !driver) throw new Error('Could not load that profile.');

        const newConv: Conversation = {
          id:                    convId,
          participant_id:        driver.id,
          participant_name:      driver.full_name       || 'Driver',
          participant_role:      (driver.role || 'driver') as any,
          participant_photo:     driver.profile_photo   ?? undefined,
          participant_username:  driver.username        ?? undefined,
          participant_driver_id: driver.driver_id       ?? undefined,
          participant_vehicle:   driver.vehicle_details ?? undefined,
          participant_park_name: driver.park_name       ?? undefined,
          // NOTE: get_driver_public deliberately does not return `phone`, so the
          // in-chat Call button has no number for a direct chat. Exposing phone
          // numbers to anyone who can resolve a handle is a privacy decision,
          // not an oversight — it needs a deliberate change to that RPC.
          last_message:          '',
          last_message_at:       new Date().toISOString(),
          unread_count:          0,
        };

        // Persist BOTH sides. The row used to describe only `participant_*`
        // plus a bare `passenger_id`, and since the client always renders
        // `participant_*` as "the other person", the recipient opening their
        // inbox saw a conversation with THEMSELVES.
        const me = useAuthStore.getState().user;

        await supabase.from('conversations').insert([{
          id:                    newConv.id,
          type:                  'direct',
          participant_id:        newConv.participant_id,
          participant_name:      newConv.participant_name,
          participant_role:      newConv.participant_role,
          participant_photo:     newConv.participant_photo     ?? null,
          participant_driver_id: newConv.participant_driver_id ?? null,
          participant_vehicle:   newConv.participant_vehicle   ?? null,
          participant_park_name: newConv.participant_park_name ?? null,
          participant_username:  driver.username               ?? null,
          passenger_id:          passengerId,
          passenger_name:        me?.full_name                 ?? null,
          passenger_username:    (me as any)?.username         ?? null,
          passenger_photo:       me?.profile_photo             ?? null,
          last_message:          '',
          last_message_at:       newConv.last_message_at,
          unread_count:          0,
        }]);

        set((s) => ({ conversations: [newConv, ...s.conversations] }));
        return newConv;
      },

      /**
       * Resolve a username or an ID to a person, and open a chat with them.
       *
       * Accepts "@ada", "ada", "DRV-A1B2C3", "a1b2c3" — and works in both
       * directions, so a driver can reach a passenger the same way.
       */
      fetchConversationByHandle: async (handle, currentUserId) => {
        const typed = handle.trim();
        if (!typed) throw new Error('Enter a username or ID to start a chat.');

        const { data, error } = await supabase.rpc('find_user_for_chat', { p_handle: typed });
        if (error) {
          console.warn('[Messages] find_user_for_chat error:', error.message);
          throw new Error('Could not search right now. Check your connection and try again.');
        }

        const person = Array.isArray(data) ? data[0] : data;
        if (!person) {
          throw new Error(`Nobody found for "${typed}". Check the username or ID and try again.`);
        }

        const conversation = await get().startDirectChat(currentUserId, person.id);
        return { driverUser: person, conversation };
      },

      /** Ranked partial matches for type-ahead. Prefix-matched, see the migration. */
      searchUsersForChat: async (query) => {
        const typed = query.trim();
        if (typed.replace(/^@/, '').length < 2) return [];

        const { data, error } = await supabase.rpc('search_users_for_chat', {
          p_query: typed,
          p_limit: 10,
        });
        if (error) {
          console.warn('[Messages] search_users_for_chat error:', error.message);
          return [];
        }
        return (data ?? []) as ChatCandidate[];
      },

      fetchConversationByDriverId: async (driverDisplayId, passengerId) =>
        get().fetchConversationByHandle(driverDisplayId, passengerId),
    }),
    {
      name:       'teqil-messages-v2',
      storage:    createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        conversations: state.conversations,
        messages:      state.messages,
      }),
    },
  ),
);
