// import AsyncStorage from "@react-native-async-storage/async-storage";
// import { create } from "zustand";
// import { persist, createJSONStorage } from "zustand/middleware";

// export interface Message {
//   id: string;
//   conversationId: string;
//   senderId: string;
//   senderName: string;
//   text: string;
//   createdAt: string;
//   read: boolean;
// }

// export interface Conversation {
//   id: string;
//   participantId: string;
//   participantName: string;
//   participantRole: string;
//   participantDriverId?: string;
//   lastMessage: string;
//   lastMessageAt: string;
//   unreadCount: number;
// }

// interface MessagesStore {
//   conversations: Conversation[];
//   messages: Record<string, Message[]>; // keyed by conversationId

//   addConversation: (conv: Conversation) => void;
//   addMessage: (msg: Message) => void;
//   markRead: (conversationId: string) => void;
//   getMessages: (conversationId: string) => Message[];
// }

// export const useMessagesStore = create<MessagesStore>()(
//   persist(
//     (set, get) => ({
//       conversations: [],
//       messages: {},

//       addConversation: (conv) =>
//         set((s) => {
//           const exists = s.conversations.find((c) => c.id === conv.id);
//           if (exists) return s;
//           return { conversations: [conv, ...s.conversations] };
//         }),

//       addMessage: (msg) =>
//         set((s) => {
//           const existing = s.messages[msg.conversationId] || [];
//           const updatedConvs = s.conversations.map((c) =>
//             c.id === msg.conversationId
//               ? {
//                   ...c,
//                   lastMessage: msg.text,
//                   lastMessageAt: msg.createdAt,
//                   unreadCount: msg.read ? c.unreadCount : c.unreadCount + 1,
//                 }
//               : c
//           );
//           return {
//             messages: {
//               ...s.messages,
//               [msg.conversationId]: [...existing, msg],
//             },
//             conversations: updatedConvs,
//           };
//         }),

//       markRead: (conversationId) =>
//         set((s) => ({
//           conversations: s.conversations.map((c) =>
//             c.id === conversationId ? { ...c, unreadCount: 0 } : c
//           ),
//           messages: {
//             ...s.messages,
//             [conversationId]: (s.messages[conversationId] || []).map((m) => ({
//               ...m,
//               read: true,
//             })),
//           },
//         })),

//       getMessages: (conversationId) =>
//         get().messages[conversationId] || [],
//     }),
//     {
//       name: "teqil-messages",
//       storage: createJSONStorage(() => AsyncStorage),
//     }
//   )
// );




import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text?: string;
  audioUri?: string;
  createdAt: string;
  read: boolean;
  status?: 'sent' | 'delivered' | 'read';
}

export interface Conversation {
  id: string;
  participantId: string;
  participantName: string;
  participantRole: 'driver' | 'passenger' | 'park_owner';
  participantPhoto?: string;
  participantDriverId?: string;
  participantVehicle?: string;
  participantParkName?: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  typing?: boolean;
}

interface MessagesState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  typingUsers: Record<string, boolean>; // conversationId -> boolean
  addConversation: (conv: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  deleteConversation: (id: string) => void;
  addMessage: (msg: Message) => void;
  updateMessage: (convId: string, msgId: string, updates: Partial<Message>) => void;
  deleteMessage: (convId: string, msgId: string) => void;
  markRead: (convId: string) => void;
  setTyping: (convId: string, isTyping: boolean) => void;
  getMessages: (convId: string) => Message[];
}

export const useMessagesStore = create<MessagesState>()(
  persist(
    (set, get) => ({
      conversations: [],
      messages: {},
      typingUsers: {},

      addConversation: (conv) =>
        set((state) => {
          const exists = state.conversations.find((c) => c.id === conv.id);
          if (exists) return state;
          return { conversations: [conv, ...state.conversations] };
        }),

      updateConversation: (id, updates) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      deleteConversation: (id) =>
        set((state) => {
          const { [id]: _, ...restMessages } = state.messages;
          return {
            conversations: state.conversations.filter((c) => c.id !== id),
            messages: restMessages,
          };
        }),

      addMessage: (msg) =>
        set((state) => {
          const convMessages = state.messages[msg.conversationId] || [];
          const updatedMessages = {
            ...state.messages,
            [msg.conversationId]: [...convMessages, msg],
          };

          const updatedConversations = state.conversations.map((c) =>
            c.id === msg.conversationId
              ? {
                  ...c,
                  lastMessage: msg.audioUri ? '🎤 Voice message' : msg.text || '',
                  lastMessageAt: msg.createdAt,
                  unreadCount: c.unreadCount + (msg.senderId === c.participantId ? 0 : 1),
                }
              : c
          );

          return {
            messages: updatedMessages,
            conversations: updatedConversations,
          };
        }),

      updateMessage: (convId, msgId, updates) =>
        set((state) => {
          const convMessages = state.messages[convId] || [];
          const updatedMessages = {
            ...state.messages,
            [convId]: convMessages.map((m) =>
              m.id === msgId ? { ...m, ...updates } : m
            ),
          };
          return { messages: updatedMessages };
        }),

      deleteMessage: (convId, msgId) =>
        set((state) => {
          const convMessages = state.messages[convId] || [];
          const filtered = convMessages.filter((m) => m.id !== msgId);
          const updatedMessages = { ...state.messages, [convId]: filtered };

          // Update last message if needed
          const conversation = state.conversations.find((c) => c.id === convId);
          if (conversation) {
            const lastMsg = filtered[filtered.length - 1];
            const updatedConversations = state.conversations.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    lastMessage: lastMsg
                      ? lastMsg.audioUri
                        ? '🎤 Voice message'
                        : lastMsg.text || ''
                      : '',
                    lastMessageAt: lastMsg?.createdAt || c.lastMessageAt,
                  }
                : c
            );
            return { messages: updatedMessages, conversations: updatedConversations };
          }
          return { messages: updatedMessages };
        }),

      markRead: (convId) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === convId ? { ...c, unreadCount: 0 } : c
          ),
        })),

      setTyping: (convId, isTyping) =>
        set((state) => ({
          typingUsers: { ...state.typingUsers, [convId]: isTyping },
        })),

      getMessages: (convId) => get().messages[convId] || [],
    }),
    {
      name: 'teqil-messages',
      storage: {
        getItem: async (name) => {
          const value = await AsyncStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: AsyncStorage.setItem,
        removeItem: AsyncStorage.removeItem,
      },
    }
  )
);