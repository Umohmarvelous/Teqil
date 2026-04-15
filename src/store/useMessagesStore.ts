// // src/store/useMessagesStore.ts
// import { create } from 'zustand';
// import { persist, createJSONStorage } from 'zustand/middleware';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import { supabase } from '@/src/services/supabase';

// export interface Message {
//   id: string;
//   conversationId: string;
//   senderId: string;
//   senderName: string;
//   text?: string;
//   audioUri?: string;
//   createdAt: string;
//   read: boolean;
//   status?: 'sent' | 'delivered' | 'read';
// }

// export interface Conversation {
//   id: string;
//   participantId: string;
//   participantName: string;
//   participantRole: 'driver' | 'passenger' | 'park_owner';
//   participantPhoto?: string;
//   participantDriverId?: string;
//   participantVehicle?: string;
//   participantParkName?: string;
//   lastMessage: string;
//   lastMessageAt: string;
//   unreadCount: number;
//   typing?: boolean;
// }

// interface MessagesState {
//   conversations: Conversation[];
//   messages: Record<string, Message[]>;
//   typingUsers: Record<string, boolean>;
//   addConversation: (conv: Conversation) => void;
//   updateConversation: (id: string, updates: Partial<Conversation>) => void;
//   deleteConversation: (id: string) => void;
//   addMessage: (msg: Message) => void;
//   updateMessage: (convId: string, msgId: string, updates: Partial<Message>) => void;
//   deleteMessage: (convId: string, msgId: string) => void;
//   markRead: (convId: string) => void;
//   setTyping: (convId: string, isTyping: boolean) => void;
//   getMessages: (convId: string) => Message[];
// }

// export const useMessagesStore = create<MessagesState>()(

//   persist(
//     (set, get) => ({

//       conversations: [],
//       messages: {},
//       typingUsers: {},

//       addConversation: (conv) =>
//         set((state) => {
//           const exists = state.conversations.find((c) => c.id === conv.id);
//           if (exists) return state;
//           return { conversations: [conv, ...state.conversations] };
//         }),

//       updateConversation: (id, updates) =>
//         set((state) => ({
//           conversations: state.conversations.map((c) =>
//             c.id === id ? { ...c, ...updates } : c
//           ),
//         })),

//       deleteConversation: (id) =>
//         set((state) => {
//           const { [id]: _, ...restMessages } = state.messages;
//           return {
//             conversations: state.conversations.filter((c) => c.id !== id),
//             messages: restMessages,
//           };
//         }),

//       addMessage: (msg) =>
//         set((state) => {
//           const convMessages = state.messages[msg.conversationId] || [];
//           const updatedMessages = {
//             ...state.messages,
//             [msg.conversationId]: [...convMessages, msg],
//           };

//           const updatedConversations = state.conversations.map((c) =>
//             c.id === msg.conversationId
//               ? {
//                   ...c,
//                   lastMessage: msg.audioUri ? '🎤 Voice message' : msg.text || '',
//                   lastMessageAt: msg.createdAt,
//                   unreadCount: c.unreadCount + (msg.senderId === c.participantId ? 0 : 1),
//                 }
//               : c
//           );

//           return {
//             messages: updatedMessages,
//             conversations: updatedConversations,
//           };
//         }),

//       updateMessage: (convId, msgId, updates) =>
//         set((state) => {
//           const convMessages = state.messages[convId] || [];
//           const updatedMessages = {
//             ...state.messages,
//             [convId]: convMessages.map((m) =>
//               m.id === msgId ? { ...m, ...updates } : m
//             ),
//           };
//           return { messages: updatedMessages };
//         }),

//       deleteMessage: (convId, msgId) =>
//         set((state) => {
//           const convMessages = state.messages[convId] || [];
//           const filtered = convMessages.filter((m) => m.id !== msgId);
//           const updatedMessages = { ...state.messages, [convId]: filtered };

//           const conversation = state.conversations.find((c) => c.id === convId);
//           if (conversation) {
//             const lastMsg = filtered[filtered.length - 1];
//             const updatedConversations = state.conversations.map((c) =>
//               c.id === convId
//                 ? {
//                     ...c,
//                     lastMessage: lastMsg
//                       ? lastMsg.audioUri
//                         ? '🎤 Voice message'
//                         : lastMsg.text || ''
//                       : '',
//                     lastMessageAt: lastMsg?.createdAt || c.lastMessageAt,
//                   }
//                 : c
//             );
//             return { messages: updatedMessages, conversations: updatedConversations };
//           }
//           return { messages: updatedMessages };
//         }),

//       markRead: (convId) =>
//         set((state) => ({
//           conversations: state.conversations.map((c) =>
//             c.id === convId ? { ...c, unreadCount: 0 } : c
//           ),
//         })),

//       setTyping: (convId, isTyping) =>
//         set((state) => ({
//           typingUsers: { ...state.typingUsers, [convId]: isTyping },
//         })),

//       getMessages: (convId) => get().messages[convId] || [],
//     }),
//     {
//       name: 'teqil-messages',
//       storage: createJSONStorage(() => AsyncStorage),
//     }
//   )
// );



// src/store/useMessagesStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/services/supabase';

export interface Message {
  id: string;
  conversation_id: string;      // matches database column
  conversationId?: string;      // legacy alias (we'll map internally)
  sender_id: string;
  sender_name?: string;
  senderName?: string;          // legacy alias
  text?: string;
  audio_uri?: string;
  audioUri?: string;            // legacy alias
  created_at: string;
  createdAt?: string;           // legacy alias
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
  last_message: string;
  last_message_at: string;
  unread_count: number;
  // Legacy aliases for frontend compatibility
  participantId?: string;
  participantName?: string;
  participantRole?: string;
  participantPhoto?: string;
  participantDriverId?: string;
  participantVehicle?: string;
  participantParkName?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  typing?: boolean;
}

interface MessagesState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  typingUsers: Record<string, boolean>;
  realtimeSubscription: any;

  // Actions
  addConversation: (conv: Conversation) => Promise<void>;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  deleteConversation: (id: string) => Promise<void>;
  addMessage: (msg: Message) => Promise<void>;
  updateMessage: (convId: string, msgId: string, updates: Partial<Message>) => Promise<void>;
  deleteMessage: (convId: string, msgId: string) => Promise<void>;
  markRead: (convId: string) => Promise<void>;
  setTyping: (convId: string, isTyping: boolean) => void;
  getMessages: (convId: string) => Message[];

  // Realtime
  subscribeToRealtime: (userId: string) => () => void;
  unsubscribeRealtime: () => void;
}

// Helper to normalize message fields
function normalizeMessage(msg: any): Message {
  return {
    id: msg.id,
    conversation_id: msg.conversation_id || msg.conversationId,
    conversationId: msg.conversationId || msg.conversation_id,
    sender_id: msg.sender_id || msg.senderId,
    senderId: msg.senderId || msg.sender_id,
    sender_name: msg.sender_name || msg.senderName || 'Unknown',
    senderName: msg.senderName || msg.sender_name || 'Unknown',
    text: msg.text,
    audio_uri: msg.audio_uri || msg.audioUri,
    audioUri: msg.audioUri || msg.audio_uri,
    created_at: msg.created_at || msg.createdAt,
    createdAt: msg.createdAt || msg.created_at,
    read: msg.read || false,
    status: msg.status || 'sent',
  };
}

export const useMessagesStore = create<MessagesState>()(
  persist(
    (set, get) => ({
      conversations: [],
      messages: {},
      typingUsers: {},
      realtimeSubscription: null,

      addConversation: async (conv) => {
        // Normalize for storage
        const dbConv = {
          id: conv.id,
          participant_id: conv.participantId || conv.participant_id,
          participant_name: conv.participantName || conv.participant_name,
          participant_role: conv.participantRole || conv.participant_role,
          participant_photo: conv.participantPhoto || conv.participant_photo,
          participant_driver_id: conv.participantDriverId || conv.participant_driver_id,
          participant_vehicle: conv.participantVehicle || conv.participant_vehicle,
          participant_park_name: conv.participantParkName || conv.participant_park_name,
          last_message: conv.lastMessage || conv.last_message || '',
          last_message_at: conv.lastMessageAt || conv.last_message_at || new Date().toISOString(),
          unread_count: conv.unreadCount || conv.unread_count || 0,
        };

        // Optimistic update
        set((state) => {
          const exists = state.conversations.find((c) => c.id === dbConv.id);
          if (exists) return state;
          return { conversations: [dbConv as Conversation, ...state.conversations] };
        });

        // Sync to Supabase
        const { error } = await supabase.from('conversations').upsert([dbConv]);
        if (error) console.warn('Failed to sync conversation:', error);
      },

      updateConversation: (id, updates) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      deleteConversation: async (id) => {
        set((state) => {
          const { [id]: _, ...restMessages } = state.messages;
          return {
            conversations: state.conversations.filter((c) => c.id !== id),
            messages: restMessages,
          };
        });
        await supabase.from('conversations').delete().eq('id', id);
      },

      addMessage: async (msg) => {
        const normalized = normalizeMessage(msg);
        
        // Optimistic update
        set((state) => {
          const convMessages = state.messages[normalized.conversation_id] || [];
          const updatedMessages = {
            ...state.messages,
            [normalized.conversation_id]: [...convMessages, normalized],
          };

          const updatedConversations = state.conversations.map((c) =>
            c.id === normalized.conversation_id
              ? {
                  ...c,
                  last_message: normalized.audio_uri ? '🎤 Voice message' : normalized.text || '',
                  last_message_at: normalized.created_at,
                  unread_count: c.unread_count + (normalized.sender_id === c.participant_id ? 0 : 1),
                }
              : c
          );

          return {
            messages: updatedMessages,
            conversations: updatedConversations,
          };
        });

        // Sync to Supabase
        const { error } = await supabase.from('messages').insert([{
          id: normalized.id,
          conversation_id: normalized.conversation_id,
          sender_id: normalized.sender_id,
          sender_name: normalized.sender_name,
          text: normalized.text,
          audio_uri: normalized.audio_uri,
          created_at: normalized.created_at,
          read: normalized.read,
          status: normalized.status,
        }]);
        if (error) console.warn('Failed to sync message:', error);
      },

      updateMessage: async (convId, msgId, updates) => {
        set((state) => {
          const convMessages = state.messages[convId] || [];
          const updatedMessages = {
            ...state.messages,
            [convId]: convMessages.map((m) =>
              m.id === msgId ? { ...m, ...updates } : m
            ),
          };
          return { messages: updatedMessages };
        });
        await supabase.from('messages').update(updates).eq('id', msgId);
      },

      deleteMessage: async (convId, msgId) => {
        set((state) => {
          const convMessages = state.messages[convId] || [];
          const filtered = convMessages.filter((m) => m.id !== msgId);
          const updatedMessages = { ...state.messages, [convId]: filtered };

          const conversation = state.conversations.find((c) => c.id === convId);
          if (conversation) {
            const lastMsg = filtered[filtered.length - 1];
            const updatedConversations = state.conversations.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    last_message: lastMsg
                      ? lastMsg.audio_uri
                        ? '🎤 Voice message'
                        : lastMsg.text || ''
                      : '',
                    last_message_at: lastMsg?.created_at || c.last_message_at,
                  }
                : c
            );
            return { messages: updatedMessages, conversations: updatedConversations };
          }
          return { messages: updatedMessages };
        });
        await supabase.from('messages').delete().eq('id', msgId);
      },

      markRead: async (convId) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === convId ? { ...c, unread_count: 0 } : c
          ),
        }));
        await supabase
          .from('messages')
          .update({ read: true })
          .eq('conversation_id', convId);
      },

      setTyping: (convId, isTyping) =>
        set((state) => ({
          typingUsers: { ...state.typingUsers, [convId]: isTyping },
        })),

      getMessages: (convId) => get().messages[convId] || [],

      subscribeToRealtime: (userId: string) => {
        // Unsubscribe any existing subscription
        const currentSub = get().realtimeSubscription;
        if (currentSub) {
          supabase.removeChannel(currentSub);
        }

        // Subscribe to new messages in conversations where the user is a participant
        const subscription = supabase
          .channel('messages')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
              filter: `conversation_id=in.(select id from conversations where participant_id=eq.${userId})`,
            },
            (payload) => {
              const newMsg = normalizeMessage(payload.new);
              get().addMessage(newMsg);
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'messages',
              filter: `conversation_id=in.(select id from conversations where participant_id=eq.${userId})`,
            },
            (payload) => {
              const updated = normalizeMessage(payload.new);
              get().updateMessage(updated.conversation_id, updated.id, updated);
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('Realtime subscription active');
            }
          });

        // set({ realtimeSubscription: subscription });

        // Return unsubscribe function
        return () => {
          supabase.removeChannel(subscription);
          set({ realtimeSubscription: null });
        };
      },

      unsubscribeRealtime: () => {
        const sub = get().realtimeSubscription;
        if (sub) {
          supabase.removeChannel(sub);
          set({ realtimeSubscription: null });
        }
      },
    }),
    {
      name: 'teqil-messages',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);