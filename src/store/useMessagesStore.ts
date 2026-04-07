import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
  read: boolean;
}

export interface Conversation {
  id: string;
  participantId: string;
  participantName: string;
  participantRole: string;
  participantDriverId?: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface MessagesStore {
  conversations: Conversation[];
  messages: Record<string, Message[]>; // keyed by conversationId

  addConversation: (conv: Conversation) => void;
  addMessage: (msg: Message) => void;
  markRead: (conversationId: string) => void;
  getMessages: (conversationId: string) => Message[];
}

export const useMessagesStore = create<MessagesStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      messages: {},

      addConversation: (conv) =>
        set((s) => {
          const exists = s.conversations.find((c) => c.id === conv.id);
          if (exists) return s;
          return { conversations: [conv, ...s.conversations] };
        }),

      addMessage: (msg) =>
        set((s) => {
          const existing = s.messages[msg.conversationId] || [];
          const updatedConvs = s.conversations.map((c) =>
            c.id === msg.conversationId
              ? {
                  ...c,
                  lastMessage: msg.text,
                  lastMessageAt: msg.createdAt,
                  unreadCount: msg.read ? c.unreadCount : c.unreadCount + 1,
                }
              : c
          );
          return {
            messages: {
              ...s.messages,
              [msg.conversationId]: [...existing, msg],
            },
            conversations: updatedConvs,
          };
        }),

      markRead: (conversationId) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId ? { ...c, unreadCount: 0 } : c
          ),
          messages: {
            ...s.messages,
            [conversationId]: (s.messages[conversationId] || []).map((m) => ({
              ...m,
              read: true,
            })),
          },
        })),

      getMessages: (conversationId) =>
        get().messages[conversationId] || [],
    }),
    {
      name: "teqil-messages",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);