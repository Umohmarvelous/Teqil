// src/store/useMessagesStore.ts
//
// Conversations and messages, offline-first: AsyncStorage is the source of
// truth for reads and Supabase is the sync target, matching the rest of the app
// (see src/services/sync.ts).
//
// Conversation carries both snake_case and camelCase spellings of the same
// fields. That is not an accident to tidy away — screens written at different
// times read different spellings, and `addConversation` normalises whatever it
// is handed into the snake_case canon.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/services/supabase';
import { useAuthStore } from '@/src/store/useStore';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name?: string;
  sender_role?: 'driver' | 'passenger' | 'park_owner';
  text?: string;
  audio_uri?: string;
  created_at: string;
  read: boolean;
  status?: 'sent' | 'delivered' | 'read';
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
  participant_phone?: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  type?: 'trip' | 'direct';
  trip_code?: string;
  // legacy aliases
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

interface MessagesState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  typingUsers: Record<string, boolean>;
  realtimeSubscription: any;
  onlineUsers: Set<string>;

  addConversation:     (conv: Conversation) => Promise<void>;
  updateConversation:  (id: string, updates: Partial<Conversation>) => void;
  deleteConversation:  (id: string) => Promise<void>;
  addMessage:          (msg: Message) => Promise<void>;
  addMessageLocal:     (msg: Message) => void;
  updateMessage:       (convId: string, msgId: string, updates: Partial<Message>) => Promise<void>;
  deleteMessage:       (convId: string, msgId: string) => Promise<void>;
  markRead:            (convId: string) => Promise<void>;
  setTyping:           (convId: string, isTyping: boolean) => void;
  getMessages:         (convId: string) => Message[];
  getUnreadCount:      (userId: string, role: string, driverId?: string) => number;
  subscribeToRealtime: (userId: string) => () => void;
  unsubscribeRealtime: () => void;
  loadConversations:   (userId: string, role: 'driver' | 'passenger') => Promise<void>;
  startConversation:   (driverId: string, passengerId: string, driverData?: any, passengerData?: any) => Promise<Conversation | null>;
  subscribeToMessages: (userId: string) => () => void;
  sendMessage:         (convId: string, senderId: string, text: string, senderName: string, senderRole: 'driver' | 'passenger') => Promise<void>;
  markConversationRead:(convId: string, userId: string, role: 'driver' | 'passenger') => Promise<void>;

  // ── NEW ─────────────────────────────────────────────────────────────────────
  /** Creates (or returns existing) direct conversation between passenger and driver. */
  startDirectChat: (passengerId: string, driverUserId: string) => Promise<Conversation>;
  /**
   * Resolves a driver by their public badge ID (e.g. "DRV-A1B2C3"),
   * then calls startDirectChat. Throws a user-facing error if not found.
   */
  fetchConversationByDriverId: (
    driverDisplayId: string,
    passengerId: string,
  ) => Promise<{ driverUser: ChatCandidate; conversation: Conversation }>;

  /** Resolve "@username" or "DRV-XXXXXX" to a person and open the chat. */
  fetchConversationByHandle: (
    handle: string,
    currentUserId: string,
  ) => Promise<{ driverUser: ChatCandidate; conversation: Conversation }>;

  /** Ranked partial matches for a type-ahead field. */
  searchUsersForChat: (query: string) => Promise<ChatCandidate[]>;
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
  // If the viewer IS the stored participant, the other side is the passenger.
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
    // These describe a driver specifically, so they only apply when the other
    // side IS the driver.
    participant_driver_id: viewerIsParticipant ? undefined : row.participant_driver_id,
    participant_vehicle:   viewerIsParticipant ? undefined : row.participant_vehicle,
    participant_park_name: viewerIsParticipant ? undefined : row.participant_park_name,
    participant_phone:     row.participant_phone,
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
    sender_role:     msg.sender_role,
    text:            msg.text,
    audio_uri:       msg.audio_uri       || msg.audioUri,
    created_at:      msg.created_at      || msg.createdAt || new Date().toISOString(),
    read:            msg.read            || false,
    status:          msg.status          || 'sent',
  };
}

export const useMessagesStore = create<MessagesState>()(
  persist(
    (set, get) => ({
      conversations:        [],
      messages:             {},
      typingUsers:          {},
      realtimeSubscription: null,
      onlineUsers:          new Set(),

      // ── All original actions — UNCHANGED ────────────────────────────────────

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
          participant_phone:     conv.participant_phone,
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
          const { [id]: _, ...rest } = state.messages;
          return { conversations: state.conversations.filter((c) => c.id !== id), messages: rest };
        });
        try { await supabase.from('conversations').delete().eq('id', id); } catch (e) {
          console.warn('[Messages] deleteConversation error:', e);
        }
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
            text:            normalized.text,
            audio_uri:       normalized.audio_uri,
            created_at:      normalized.created_at,
            read:            normalized.read,
            status:          'delivered',
          }]);
          // Bump the conversation so the RECIPIENT's inbox shows the preview and
          // an unread count. Without this a message arrives but the chat list
          // still reads "Tap to start chatting", which looks like it failed.
          await supabase
            .from('conversations')
            .update({
              last_message:    normalized.audio_uri ? '🎤 Voice message' : normalized.text ?? '',
              last_message_at: normalized.created_at,
            })
            .eq('id', normalized.conversation_id);

          if (error) {
            console.warn('[Messages] insert error:', error.message);
          } else {
            set((state) => {
              const msgs = state.messages[normalized.conversation_id] || [];
              return {
                messages: {
                  ...state.messages,
                  [normalized.conversation_id]: msgs.map((m) =>
                    m.id === normalized.id ? { ...m, status: 'delivered' as const } : m,
                  ),
                },
              };
            });
          }
        } catch (e) {
          console.warn('[Messages] addMessage network error:', e);
        }
      },

      addMessageLocal: (msg) => {
        const normalized = normalizeMessage(msg);
        set((state) => {
          const convId   = normalized.conversation_id;
          const existing = state.messages[convId] || [];
          if (existing.find((m) => m.id === normalized.id)) return state;
          return {
            messages: { ...state.messages, [convId]: [...existing, normalized] },
            conversations: state.conversations.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    last_message:    normalized.audio_uri ? '🎤 Voice message' : normalized.text || '',
                    last_message_at: normalized.created_at,
                    unread_count:    c.unread_count + 1,
                  }
                : c,
            ),
          };
        });
      },

      updateMessage: async (convId, msgId, updates) => {
        set((state) => ({
          messages: {
            ...state.messages,
            [convId]: (state.messages[convId] || []).map((m) =>
              m.id === msgId ? { ...m, ...updates } : m,
            ),
          },
        }));
        try { await supabase.from('messages').update(updates).eq('id', msgId); } catch (e) {
          console.warn('[Messages] updateMessage error:', e);
        }
      },

      deleteMessage: async (convId, msgId) => {
        set((state) => {
          const filtered = (state.messages[convId] || []).filter((m) => m.id !== msgId);
          const last     = filtered[filtered.length - 1];
          return {
            messages: { ...state.messages, [convId]: filtered },
            conversations: state.conversations.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    last_message:    last ? (last.audio_uri ? '🎤 Voice message' : last.text || '') : '',
                    last_message_at: last?.created_at || c.last_message_at,
                  }
                : c,
            ),
          };
        });
        try { await supabase.from('messages').delete().eq('id', msgId); } catch (e) {
          console.warn('[Messages] deleteMessage error:', e);
        }
      },

      markRead: async (convId) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === convId ? { ...c, unread_count: 0 } : c,
          ),
          messages: {
            ...state.messages,
            [convId]: (state.messages[convId] || []).map((m) => ({
              ...m,
              read:   true,
              status: 'read' as const,
            })),
          },
        }));
        try {
          await supabase
            .from('messages')
            .update({ read: true, status: 'read' })
            .eq('conversation_id', convId);
        } catch (e) {
          console.warn('[Messages] markRead error:', e);
        }
      },

      setTyping: (convId, isTyping) =>
        set((state) => ({ typingUsers: { ...state.typingUsers, [convId]: isTyping } })),

      getMessages:    (convId) => get().messages[convId] || [],

      getUnreadCount: (userId, role, driverId) =>
        get()
          .conversations.filter((c) => {
            if (role === 'driver')    return c.participant_driver_id === driverId || c.participant_id === userId;
            if (role === 'passenger') return c.participant_role === 'driver';
            return true;
          })
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
              const conv = get().conversations.find((c) => c.id === msg.conversation_id);
              if (!conv) return;
              get().addMessageLocal(msg);
              try {
                const N = await import('expo-notifications');
                await N.default.scheduleNotificationAsync({
                  content: {
                    title: `New message from ${msg.sender_name || 'User'}`,
                    body:  msg.text || '🎤 Voice message',
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
              get().updateMessage(u.conversation_id, u.id, u);
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

      loadConversations: async (userId, role) => {
        try {
          // RLS now restricts this to conversations the caller is in, so the
          // client-side filter is belt and braces rather than the access rule.
          const { data, error } = await supabase
            .from('conversations')
            .select('*')
            .order('last_message_at', { ascending: false });
          if (error || !data) return;
          const filtered = data.filter((c: any) =>
            c.participant_id === userId || c.passenger_id === userId
          );
          const normalized: Conversation[] = filtered.map((c: any) =>
            conversationForViewer(c, userId),
          );
          set({ conversations: normalized });
          for (const conv of normalized) {
            const { data: msgs } = await supabase
              .from('messages')
              .select('*')
              .eq('conversation_id', conv.id)
              .order('created_at', { ascending: true });
            if (msgs) {
              set((s) => ({ messages: { ...s.messages, [conv.id]: msgs.map(normalizeMessage) } }));
            }
          }
        } catch (e) { console.warn('[Messages] loadConversations error:', e); }
      },

      startConversation: async (driverId, passengerId, driverData, passengerData) => {
        const convId   = `conv_${[driverId, passengerId].sort().join('_')}`;
        const existing = get().conversations.find((c) => c.id === convId);
        if (existing) return existing;

        const { data: remote } = await supabase
          .from('conversations').select('*').eq('id', convId).single();
        if (remote) {
          const n: Conversation = {
            id:               remote.id,
            participant_id:   remote.participant_id,
            participant_name: remote.participant_name || 'Driver',
            participant_role: remote.participant_role || 'driver',
            participant_photo:     remote.participant_photo,
            participant_driver_id: remote.participant_driver_id,
            last_message:     remote.last_message   || '',
            last_message_at:  remote.last_message_at || new Date().toISOString(),
            unread_count:     remote.unread_count    || 0,
          };
          set((s) => ({
            conversations: s.conversations.find((c) => c.id === convId)
              ? s.conversations
              : [n, ...s.conversations],
          }));
          return n;
        }

        if (!driverData) {
          const { data } = await supabase
            .from('users').select('full_name, phone, driver_id, profile_photo').eq('id', driverId).single();
          driverData = data;
        }
        if (!passengerData) {
          const { data } = await supabase
            .from('users').select('full_name, phone').eq('id', passengerId).single();
          passengerData = data;
        }

        const newConv: Conversation = {
          id:                    convId,
          participant_id:        driverId,
          participant_name:      driverData?.full_name || 'Driver',
          participant_role:      'driver',
          participant_driver_id: driverData?.driver_id,
          participant_photo:     driverData?.profile_photo,
          participant_phone:     driverData?.phone,
          last_message:          '',
          last_message_at:       new Date().toISOString(),
          unread_count:          0,
        };
        try {
          await supabase.from('conversations').insert([{
            id:                    convId,
            participant_id:        driverId,
            participant_name:      newConv.participant_name,
            participant_role:      'driver',
            participant_driver_id: newConv.participant_driver_id,
            participant_photo:     newConv.participant_photo,
            participant_phone:     newConv.participant_phone,
            passenger_id:          passengerId,
            passenger_name:        passengerData?.full_name || 'Passenger',
            last_message:          '',
            last_message_at:       newConv.last_message_at,
            unread_count:          0,
          }]);
        } catch (e) { console.warn('[Messages] startConversation insert error:', e); }
        set((s) => ({ conversations: [newConv, ...s.conversations] }));
        return newConv;
      },

      subscribeToMessages: (userId) => get().subscribeToRealtime(userId),

      sendMessage: async (convId, senderId, text, senderName, senderRole) => {
        const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await get().addMessage({
          id: msgId, conversation_id: convId, sender_id: senderId,
          sender_name: senderName, sender_role: senderRole,
          text, created_at: new Date().toISOString(), read: false, status: 'sent',
        });
        try {
          await supabase.from('conversations')
            .update({ last_message: text, last_message_at: new Date().toISOString() })
            .eq('id', convId);
        } catch (e) { console.warn('[Messages] sendMessage update error:', e); }
      },

      markConversationRead: async (convId, _userId, _role) => get().markRead(convId),

      // ── NEW ACTIONS ──────────────────────────────────────────────────────────

      startDirectChat: async (passengerId, driverUserId) => {
        // Sorted so both sides produce the same deterministic key
        const convId   = `direct_${[passengerId, driverUserId].sort().join('_')}`;
        const existing = get().conversations.find((c) => c.id === convId);
        if (existing) return existing;

        // Check Supabase — the other device may have already created it
        const { data: remote } = await supabase
          .from('conversations').select('*').eq('id', convId).maybeSingle();

        if (remote) {
          // Same rule as loadConversations: render the side that ISN'T me.
          // Reading `participant_*` unconditionally here would show the
          // recipient a chat with themselves.
          const normalized = conversationForViewer(remote, passengerId);
          set((s) => ({
            conversations: s.conversations.find((c) => c.id === convId)
              ? s.conversations
              : [normalized, ...s.conversations],
          }));
          return normalized;
        }

        // Resolve the other person's display fields.
        //
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
          participant_role:      'driver',
          participant_photo:     driver.profile_photo   ?? undefined,
          participant_driver_id: driver.driver_id       ?? undefined,
          participant_vehicle:   driver.vehicle_details ?? undefined,
          participant_park_name: driver.park_name       ?? undefined,
          // NOTE: get_driver_public deliberately does not return `phone`, so the
          // in-chat Call button has no number for a direct chat. Exposing phone
          // numbers to anyone who can resolve a handle is a privacy decision,
          // not an oversight — it needs a deliberate change to that RPC.
          participant_phone:     driver.phone           ?? undefined,
          last_message:          '',
          last_message_at:       new Date().toISOString(),
          unread_count:          0,
        };

        // Persist BOTH sides.
        //
        // The row used to describe only `participant_*` (the person being
        // messaged) plus a bare `passenger_id`. Since the client always renders
        // `participant_*` as "the other person", the recipient opening their
        // inbox saw a conversation with THEMSELVES — their own name and photo.
        // Writing the initiator's display fields too is what lets each side
        // pick the one that isn't them (see loadConversations).
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
          passenger_username:    me?.username                  ?? null,
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
       * This used to query `users` directly. That could never have worked for
       * anyone else's account: RLS on `users` is own-row only, so the select
       * came back empty regardless of how the handle was spelled. Resolution now
       * goes through `find_user_for_chat`, a SECURITY DEFINER RPC that returns
       * only display-safe columns (see migration_chat_handles.sql).
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

      // Kept so the four existing call sites keep working; they gain username
      // support for free by delegating.
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