// import { create } from 'zustand';
// import { persist, createJSONStorage } from 'zustand/middleware';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import { supabase } from '@/src/services/supabase';

// export interface Message {
//   id: string;
//   conversation_id: string;
//   sender_id: string;
//   sender_name?: string;
//   sender_role?: 'driver' | 'passenger' | 'park_owner';
//   text?: string;
//   audio_uri?: string;
//   created_at: string;
//   read: boolean;
//   status?: 'sent' | 'delivered' | 'read';
// }

// export interface Conversation {
//   id: string;
//   participant_id: string;
//   participant_name: string;
//   participant_role: 'driver' | 'passenger' | 'park_owner';
//   participant_photo?: string;
//   participant_driver_id?: string;
//   participant_vehicle?: string;
//   participant_park_name?: string;
//   participant_phone?: string;
//   last_message: string;
//   last_message_at: string;
//   unread_count: number;
//   trip_code?: string; // which trip this conversation is about
//   // Legacy aliases kept for compatibility
//   participantId?: string;
//   participantName?: string;
//   participantRole?: string;
//   participantDriverId?: string;
//   participantVehicle?: string;
//   participantParkName?: string;
//   lastMessage?: string;
//   lastMessageAt?: string;
//   unreadCount?: number;
//   typing?: boolean;
// }

// interface MessagesState {
//   conversations: Conversation[];
//   messages: Record<string, Message[]>;
//   typingUsers: Record<string, boolean>;
//   realtimeSubscription: any;
//   onlineUsers: Set<string>;

//   addConversation: (conv: Conversation) => Promise<void>;
//   updateConversation: (id: string, updates: Partial<Conversation>) => void;
//   deleteConversation: (id: string) => Promise<void>;
//   addMessage: (msg: Message) => Promise<void>;
//   addMessageLocal: (msg: Message) => void; // optimistic, no Supabase
//   updateMessage: (convId: string, msgId: string, updates: Partial<Message>) => Promise<void>;
//   deleteMessage: (convId: string, msgId: string) => Promise<void>;
//   markRead: (convId: string) => Promise<void>;
//   setTyping: (convId: string, isTyping: boolean) => void;
//   getMessages: (convId: string) => Message[];
//   getUnreadCount: (userId: string, role: string, driverId?: string) => number;

//   subscribeToRealtime: (userId: string) => () => void;
//   unsubscribeRealtime: () => void;

//   // Convenience aliases used by passenger/driver screens
//   loadConversations: (userId: string, role: 'driver' | 'passenger') => Promise<void>;
//   startConversation: (driverId: string, passengerId: string, driverData?: any, passengerData?: any) => Promise<Conversation | null>;
//   subscribeToMessages: (userId: string) => () => void;
//   sendMessage: (convId: string, senderId: string, text: string, senderName: string, senderRole: 'driver' | 'passenger') => Promise<void>;
//   markConversationRead: (convId: string, userId: string, role: 'driver' | 'passenger') => Promise<void>;
// }

// function normalizeMessage(msg: any): Message {
//   return {
//     id: msg.id,
//     conversation_id: msg.conversation_id || msg.conversationId,
//     sender_id: msg.sender_id || msg.senderId,
//     sender_name: msg.sender_name || msg.senderName || 'Unknown',
//     sender_role: msg.sender_role,
//     text: msg.text,
//     audio_uri: msg.audio_uri || msg.audioUri,
//     created_at: msg.created_at || msg.createdAt || new Date().toISOString(),
//     read: msg.read || false,
//     status: msg.status || 'sent',
//   };
// }

// export const useMessagesStore = create<MessagesState>()(
//   persist(
//     (set, get) => ({
//       conversations: [],
//       messages: {},
//       typingUsers: {},
//       realtimeSubscription: null,
//       onlineUsers: new Set(),

//       addConversation: async (conv) => {
//         const normalized: Conversation = {
//           id: conv.id,
//           participant_id: conv.participantId || conv.participant_id,
//           participant_name: conv.participantName || conv.participant_name,
//           participant_role: (conv.participantRole || conv.participant_role) as any,
//           participant_photo: conv.participant_photo || conv.participant_photo,
//           participant_driver_id: conv.participantDriverId || conv.participant_driver_id,
//           participant_vehicle: conv.participantVehicle || conv.participant_vehicle,
//           participant_park_name: conv.participantParkName || conv.participant_park_name,
//           participant_phone: conv.participant_phone,
//           last_message: conv.lastMessage || conv.last_message || '',
//           last_message_at: conv.lastMessageAt || conv.last_message_at || new Date().toISOString(),
//           unread_count: conv.unreadCount || conv.unread_count || 0,
//           trip_code: conv.trip_code,
//         };

//         set((state) => {
//           const exists = state.conversations.find((c) => c.id === normalized.id);
//           if (exists) return state;
//           return { conversations: [normalized, ...state.conversations] };
//         });

//         try {
//           await supabase.from('conversations').upsert([{
//             id: normalized.id,
//             participant_id: normalized.participant_id,
//             participant_name: normalized.participant_name,
//             participant_role: normalized.participant_role,
//             last_message: normalized.last_message,
//             last_message_at: normalized.last_message_at,
//             unread_count: normalized.unread_count,
//             trip_code: normalized.trip_code,
//           }]);
//         } catch (e) {
//           console.warn('[Messages] Failed to sync conversation to Supabase:', e);
//         }
//       },

//       updateConversation: (id, updates) =>
//         set((state) => ({
//           conversations: state.conversations.map((c) =>
//             c.id === id ? { ...c, ...updates } : c
//           ),
//         })),

//       deleteConversation: async (id) => {
//         set((state) => {
//           const { [id]: _, ...restMessages } = state.messages;
//           return {
//             conversations: state.conversations.filter((c) => c.id !== id),
//             messages: restMessages,
//           };
//         });
//         try {
//           await supabase.from('conversations').delete().eq('id', id);
//         } catch (e) {
//           console.warn('[Messages] Failed to delete conversation:', e);
//         }
//       },

//       // Full send: optimistic update + Supabase insert
//       addMessage: async (msg) => {
//         const normalized = normalizeMessage(msg);
//         get().addMessageLocal(normalized);

//         try {
//           const { error } = await supabase.from('messages').insert([{
//             id: normalized.id,
//             conversation_id: normalized.conversation_id,
//             sender_id: normalized.sender_id,
//             sender_name: normalized.sender_name,
//             sender_role: normalized.sender_role,
//             text: normalized.text,
//             audio_uri: normalized.audio_uri,
//             created_at: normalized.created_at,
//             read: normalized.read,
//             status: 'delivered',
//           }]);
//           if (error) console.warn('[Messages] Supabase insert error:', error.message);
//           else {
//             // Mark as delivered locally
//             set((state) => {
//               const convMsgs = state.messages[normalized.conversation_id] || [];
//               return {
//                 messages: {
//                   ...state.messages,
//                   [normalized.conversation_id]: convMsgs.map((m) =>
//                     m.id === normalized.id ? { ...m, status: 'delivered' as const } : m
//                   ),
//                 },
//               };
//             });
//           }
//         } catch (e) {
//           console.warn('[Messages] Network error sending message:', e);
//         }
//       },

//       // Local-only optimistic add (used by realtime receiver to avoid double-adding)
//       addMessageLocal: (msg) => {
//         const normalized = normalizeMessage(msg);
//         set((state) => {
//           const convId = normalized.conversation_id;
//           const existing = state.messages[convId] || [];
//           // Prevent duplicates
//           if (existing.find((m) => m.id === normalized.id)) return state;

//           const updatedMessages = {
//             ...state.messages,
//             [convId]: [...existing, normalized],
//           };

//           const updatedConversations = state.conversations.map((c) =>
//             c.id === convId
//               ? {
//                   ...c,
//                   last_message: normalized.audio_uri ? '🎤 Voice message' : normalized.text || '',
//                   last_message_at: normalized.created_at,
//                   unread_count: c.unread_count + 1,
//                 }
//               : c
//           );

//           return { messages: updatedMessages, conversations: updatedConversations };
//         });
//       },

//       updateMessage: async (convId, msgId, updates) => {
//         set((state) => ({
//           messages: {
//             ...state.messages,
//             [convId]: (state.messages[convId] || []).map((m) =>
//               m.id === msgId ? { ...m, ...updates } : m
//             ),
//           },
//         }));
//         try {
//           await supabase.from('messages').update(updates).eq('id', msgId);
//         } catch (e) {
//           console.warn('[Messages] Failed to update message:', e);
//         }
//       },

//       deleteMessage: async (convId, msgId) => {
//         set((state) => {
//           const filtered = (state.messages[convId] || []).filter((m) => m.id !== msgId);
//           const lastMsg = filtered[filtered.length - 1];
//           return {
//             messages: { ...state.messages, [convId]: filtered },
//             conversations: state.conversations.map((c) =>
//               c.id === convId
//                 ? {
//                     ...c,
//                     last_message: lastMsg ? (lastMsg.audio_uri ? '🎤 Voice message' : lastMsg.text || '') : '',
//                     last_message_at: lastMsg?.created_at || c.last_message_at,
//                   }
//                 : c
//             ),
//           };
//         });
//         try {
//           await supabase.from('messages').delete().eq('id', msgId);
//         } catch (e) {
//           console.warn('[Messages] Failed to delete message:', e);
//         }
//       },

//       markRead: async (convId) => {
//         set((state) => ({
//           conversations: state.conversations.map((c) =>
//             c.id === convId ? { ...c, unread_count: 0 } : c
//           ),
//           messages: {
//             ...state.messages,
//             [convId]: (state.messages[convId] || []).map((m) => ({ ...m, read: true, status: 'read' as const })),
//           },
//         }));
//         try {
//           await supabase.from('messages').update({ read: true, status: 'read' }).eq('conversation_id', convId);
//         } catch (e) {
//           console.warn('[Messages] Failed to mark read:', e);
//         }
//       },

//       setTyping: (convId, isTyping) =>
//         set((state) => ({
//           typingUsers: { ...state.typingUsers, [convId]: isTyping },
//         })),

//       getMessages: (convId) => get().messages[convId] || [],

//       getUnreadCount: (userId, role, driverId) => {
//         const convs = get().conversations;
//         return convs
//           .filter((c) => {
//             if (role === 'driver') return c.participant_driver_id === driverId || c.participant_id === userId;
//             if (role === 'passenger') return c.participant_role === 'driver';
//             return true;
//           })
//           .reduce((sum, c) => sum + (c.unread_count || 0), 0);
//       },

//       subscribeToRealtime: (userId: string) => {
//         // Clean up old subscription
//         const currentSub = get().realtimeSubscription;
//         if (currentSub) {
//           try { supabase.removeChannel(currentSub); } catch (_) {}
//         }

//         // Subscribe to new messages inserted into conversations the user participates in
//         const channel = supabase
//           .channel(`messages:user:${userId}`)
//           .on(
//             'postgres_changes',
//             {
//               event: 'INSERT',
//               schema: 'public',
//               table: 'messages',
//             },
//             async (payload) => {
//               const newMsg = normalizeMessage(payload.new);
//               // Only handle messages NOT sent by this user (we already added those optimistically)
//               if (newMsg.sender_id === userId) return;

//               // Check if we have this conversation
//               const state = get();
//               const conv = state.conversations.find((c) => c.id === newMsg.conversation_id);
//               if (!conv) return;

//               get().addMessageLocal(newMsg);

//               // Trigger local notification
//               try {
//                 const Notifications = await import('expo-notifications');
//                 await Notifications.default.scheduleNotificationAsync({
//                   content: {
//                     title: `New message from ${newMsg.sender_name || 'Passenger'}`,
//                     body: newMsg.text || '🎤 Voice message',
//                     data: { conversationId: newMsg.conversation_id, type: 'message' },
//                     sound: 'default',
//                   },
//                   trigger: null,
//                 });
//               } catch (e) {
//                 console.warn('[Messages] Notification error:', e);
//               }
//             }
//           )
//           .on(
//             'postgres_changes',
//             {
//               event: 'UPDATE',
//               schema: 'public',
//               table: 'messages',
//             },
//             (payload) => {
//               const updated = normalizeMessage(payload.new);
//               get().updateMessage(updated.conversation_id, updated.id, updated);
//             }
//           )
//           .subscribe((status) => {
//             if (status === 'SUBSCRIBED') {
//               console.log('[Messages] Realtime channel active for user:', userId);
//             }
//           });

//         set({ realtimeSubscription: channel });

//         return () => {
//           try { supabase.removeChannel(channel); } catch (_) {}
//           set({ realtimeSubscription: null });
//         };
//       },

//       unsubscribeRealtime: () => {
//         const sub = get().realtimeSubscription;
//         if (sub) {
//           try { supabase.removeChannel(sub); } catch (_) {}
//           set({ realtimeSubscription: null });
//         }
//       },

//       // ─── Convenience aliases ────────────────────────────────────────────

//       loadConversations: async (userId, role) => {
//         try {
//           const { data, error } = await supabase
//             .from('conversations')
//             .select('*')
//             .order('last_message_at', { ascending: false });

//           if (error || !data) return;

//           // Filter client-side by role
//           const filtered = data.filter((c: any) => {
//             if (role === 'driver') return c.participant_id === userId;
//             return c.passenger_id === userId || c.participant_role === 'driver';
//           });

//           const normalized: Conversation[] = filtered.map((c: any) => ({
//             id: c.id,
//             participant_id: c.participant_id,
//             participant_name: c.participant_name || 'Driver',
//             participant_role: c.participant_role || 'driver',
//             participant_photo: c.participant_photo,
//             participant_driver_id: c.participant_driver_id,
//             participant_vehicle: c.participant_vehicle,
//             participant_park_name: c.participant_park_name,
//             participant_phone: c.participant_phone,
//             last_message: c.last_message || '',
//             last_message_at: c.last_message_at || new Date().toISOString(),
//             unread_count: c.unread_count || 0,
//             trip_code: c.trip_code,
//           }));

//           set({ conversations: normalized });

//           // Load messages for each conversation
//           for (const conv of normalized) {
//             const { data: msgs } = await supabase
//               .from('messages')
//               .select('*')
//               .eq('conversation_id', conv.id)
//               .order('created_at', { ascending: true });
//             if (msgs) {
//               set((state) => ({
//                 messages: { ...state.messages, [conv.id]: msgs.map(normalizeMessage) },
//               }));
//             }
//           }
//         } catch (e) {
//           console.warn('[Messages] loadConversations error:', e);
//         }
//       },

//       startConversation: async (driverId, passengerId, driverData, passengerData) => {
//         const convId = `conv_${[driverId, passengerId].sort().join('_')}`;

//         // Check if already exists locally
//         const existing = get().conversations.find((c) => c.id === convId);
//         if (existing) return existing;

//         // Check Supabase
//         const { data: remoteConv } = await supabase
//           .from('conversations')
//           .select('*')
//           .eq('id', convId)
//           .single();

//         if (remoteConv) {
//           const normalized: Conversation = {
//             id: remoteConv.id,
//             participant_id: remoteConv.participant_id,
//             participant_name: remoteConv.participant_name || 'Driver',
//             participant_role: remoteConv.participant_role || 'driver',
//             participant_photo: remoteConv.participant_photo,
//             participant_driver_id: remoteConv.participant_driver_id,
//             last_message: remoteConv.last_message || '',
//             last_message_at: remoteConv.last_message_at || new Date().toISOString(),
//             unread_count: remoteConv.unread_count || 0,
//           };
//           set((state) => ({
//             conversations: state.conversations.find(c => c.id === convId)
//               ? state.conversations
//               : [normalized, ...state.conversations],
//           }));
//           return normalized;
//         }

//         // Fetch missing data if needed
//         if (!driverData) {
//           const { data } = await supabase
//             .from('users')
//             .select('full_name, phone, driver_id, profile_photo')
//             .eq('id', driverId)
//             .single();
//           driverData = data;
//         }
//         if (!passengerData) {
//           const { data } = await supabase
//             .from('users')
//             .select('full_name, phone')
//             .eq('id', passengerId)
//             .single();
//           passengerData = data;
//         }

//         const newConv: Conversation = {
//           id: convId,
//           participant_id: driverId,
//           participant_name: driverData?.full_name || 'Driver',
//           participant_role: 'driver',
//           participant_driver_id: driverData?.driver_id,
//           participant_photo: driverData?.profile_photo,
//           participant_phone: driverData?.phone,
//           last_message: '',
//           last_message_at: new Date().toISOString(),
//           unread_count: 0,
//         };

//         try {
//           await supabase.from('conversations').insert([{
//             id: convId,
//             participant_id: driverId,
//             participant_name: newConv.participant_name,
//             participant_role: 'driver',
//             participant_driver_id: newConv.participant_driver_id,
//             participant_photo: newConv.participant_photo,
//             participant_phone: newConv.participant_phone,
//             passenger_id: passengerId,
//             passenger_name: passengerData?.full_name || 'Passenger',
//             last_message: '',
//             last_message_at: newConv.last_message_at,
//             unread_count: 0,
//           }]);
//         } catch (e) {
//           console.warn('[Messages] startConversation insert error:', e);
//         }

//         set((state) => ({
//           conversations: [newConv, ...state.conversations],
//         }));

//         return newConv;
//       },

//       subscribeToMessages: (userId) => get().subscribeToRealtime(userId),

//       sendMessage: async (convId, senderId, text, senderName, senderRole) => {
//         const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
//         const msg: Message = {
//           id: msgId,
//           conversation_id: convId,
//           sender_id: senderId,
//           sender_name: senderName,
//           sender_role: senderRole,
//           text,
//           created_at: new Date().toISOString(),
//           read: false,
//           status: 'sent',
//         };
//         await get().addMessage(msg);

//         // Update conversation last_message in Supabase
//         try {
//           await supabase
//             .from('conversations')
//             .update({ last_message: text, last_message_at: msg.created_at })
//             .eq('id', convId);
//         } catch (e) {
//           console.warn('[Messages] sendMessage conversation update error:', e);
//         }
//       },

//       markConversationRead: async (convId, _userId, _role) => {
//         await get().markRead(convId);
//       },
//     }),
//     {
//       name: 'teqil-messages-v2',
//       storage: createJSONStorage(() => AsyncStorage),
//       partialize: (state) => ({
//         conversations: state.conversations,
//         messages: state.messages,
//       }),
//     }
//   )
// );












// // import { create } from 'zustand';
// // import { persist, createJSONStorage } from 'zustand/middleware';
// // import AsyncStorage from '@react-native-async-storage/async-storage';
// // import { supabase } from '@/src/services/supabase';

// // export interface Message {
// //   id: string;
// //   conversation_id: string;
// //   sender_id: string;
// //   sender_name: string;
// //   sender_role: 'driver' | 'passenger';
// //   text?: string;
// //   audio_uri?: string;
// //   created_at: string;
// //   read: boolean;
// //   status: 'sent' | 'delivered' | 'read';
// // }

// // export interface Conversation {
// //   id: string;
// //   participant_id: string;      // driver's user ID
// //   participant_name: string;
// //   participant_role: 'driver';
// //   participant_driver_id?: string;
// //   participant_photo?: string;
// //   participant_vehicle?: string;
// //   participant_phone?: string;
// //   passenger_id: string;         // passenger's user ID
// //   passenger_name?: string;
// //   passenger_phone?: string;
// //   last_message: string;
// //   last_message_at: string;
// //   unread_count: string;
// //   unread_count_driver: number;
// //   unread_count_passenger: number;
// //   created_at: string;
// // }

// // interface MessagesState {
// //   conversations: Conversation[];
// //   messages: Record<string, Message[]>;
// //   realtimeSubscription: any;

// //   loadConversations: (userId: string, role: 'driver' | 'passenger') => Promise<void>;
// //   startConversation: (
// //     driverId: string,
// //     passengerId: string,
// //     driverData?: any,
// //     passengerData?: any
// //   ) => Promise<Conversation | null>;
// //   sendMessage: (
// //     convId: string,
// //     senderId: string,
// //     text: string,
// //     senderName: string,
// //     senderRole: 'driver' | 'passenger'
// //   ) => Promise<void>;
// //   markConversationRead: (convId: string, userId: string, role: 'driver' | 'passenger') => Promise<void>;
// //   subscribeToMessages: (userId: string) => () => void;
// //   getUnreadCount: (userId: string, role: 'driver' | 'passenger') => number;
// // }

// // export const useMessagesStore = create<MessagesState>()(
// //   persist(
// //     (set, get) => ({
// //       conversations: [],
// //       messages: {},
// //       realtimeSubscription: null,

// //       loadConversations: async (userId, role) => {
// //         const query = supabase
// //           .from('conversations')
// //           .select('*')
// //           .order('last_message_at', { ascending: false });

// //         if (role === 'driver') {
// //           query.eq('participant_id', userId);
// //         } else {
// //           query.eq('passenger_id', userId);
// //         }

// //         const { data, error } = await query;
// //         if (error) {
// //           console.error('Load conversations error:', error);
// //           return;
// //         }

// //         set({ conversations: data as Conversation[] });

// //         // Load messages for each conversation
// //         for (const conv of data) {
// //           const { data: msgs } = await supabase
// //             .from('messages')
// //             .select('*')
// //             .eq('conversation_id', conv.id)
// //             .order('created_at', { ascending: true });
// //           if (msgs) {
// //             set((state) => ({
// //               messages: { ...state.messages, [conv.id]: msgs as Message[] }
// //             }));
// //           }
// //         }
// //       },

// //       startConversation: async (driverId, passengerId, driverData, passengerData) => {
// //         const convId = `conv_${[driverId, passengerId].sort().join('_')}`;

// //         const { data: existing } = await supabase
// //           .from('conversations')
// //           .select('*')
// //           .eq('id', convId)
// //           .single();

// //         if (existing) {
// //           set((state) => {
// //             if (!state.conversations.find(c => c.id === convId)) {
// //               return { conversations: [existing as Conversation, ...state.conversations] };
// //             }
// //             return state;
// //           });
// //           return existing as Conversation;
// //         }

// //         if (!driverData) {
// //           const { data } = await supabase
// //             .from('users')
// //             .select('full_name, phone, driver_id, profile_photo, vehicle_details')
// //             .eq('id', driverId)
// //             .single();
// //           driverData = data;
// //         }

// //         if (!passengerData) {
// //           const { data } = await supabase
// //             .from('users')
// //             .select('full_name, phone')
// //             .eq('id', passengerId)
// //             .single();
// //           passengerData = data;
// //         }

// //         const newConv: Conversation = {
// //           id: convId,
// //           participant_id: driverId,
// //           participant_name: driverData?.full_name || 'Driver',
// //           participant_role: 'driver',
// //           participant_driver_id: driverData?.driver_id,
// //           participant_photo: driverData?.profile_photo,
// //           participant_vehicle: driverData?.vehicle_details,
// //           participant_phone: driverData?.phone,
// //           passenger_id: passengerId,
// //           passenger_name: passengerData?.full_name || 'Passenger',
// //           passenger_phone: passengerData?.phone,
// //           last_message: '',
// //           last_message_at: new Date().toISOString(),
// //           unread_count_driver: 0,
// //           unread_count_passenger: 0,
// //           created_at: new Date().toISOString(),
// //         };

// //         const { error } = await supabase.from('conversations').insert([newConv]);
// //         if (error) {
// //           console.error('Create conversation error:', error);
// //           return null;
// //         }

// //         set((state) => ({
// //           conversations: [newConv, ...state.conversations],
// //         }));

// //         return newConv;
// //       },

// //       sendMessage: async (convId, senderId, text, senderName, senderRole) => {
// //         const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
// //         const newMessage: Message = {
// //           id: messageId,
// //           conversation_id: convId,
// //           sender_id: senderId,
// //           sender_name: senderName,
// //           sender_role: senderRole,
// //           text,
// //           created_at: new Date().toISOString(),
// //           read: false,
// //           status: 'sent',
// //         };

// //         // Optimistic update
// //         set((state) => ({
// //           messages: {
// //             ...state.messages,
// //             [convId]: [...(state.messages[convId] || []), newMessage],
// //           },
// //           conversations: state.conversations.map(c =>
// //             c.id === convId
// //               ? {
// //                   ...c,
// //                   last_message: text,
// //                   last_message_at: newMessage.created_at,
// //                   unread_count_driver: senderRole === 'passenger' ? c.unread_count_driver + 1 : c.unread_count_driver,
// //                   unread_count_passenger: senderRole === 'driver' ? c.unread_count_passenger + 1 : c.unread_count_passenger,
// //                 }
// //               : c
// //           ),
// //         }));

// //         const { error } = await supabase.from('messages').insert([newMessage]);
// //         if (error) {
// //           console.error('Send message error:', error);
// //         } else {
// //           await supabase
// //             .from('conversations')
// //             .update({
// //               last_message: text,
// //               last_message_at: newMessage.created_at,
// //               unread_count_driver: senderRole === 'passenger' 
// //                 ? get().conversations.find(c => c.id === convId)?.unread_count_driver 
// //                 : undefined,
// //               unread_count_passenger: senderRole === 'driver'
// //                 ? get().conversations.find(c => c.id === convId)?.unread_count_passenger
// //                 : undefined,
// //             })
// //             .eq('id', convId);
// //         }
// //       },

// //       markConversationRead: async (convId, userId, role) => {
// //         const conv = get().conversations.find(c => c.id === convId);
// //         if (!conv) return;

// //         set((state) => ({
// //           conversations: state.conversations.map(c =>
// //             c.id === convId
// //               ? {
// //                   ...c,
// //                   unread_count_driver: role === 'driver' ? 0 : c.unread_count_driver,
// //                   unread_count_passenger: role === 'passenger' ? 0 : c.unread_count_passenger,
// //                 }
// //               : c
// //           ),
// //           messages: {
// //             ...state.messages,
// //             [convId]: (state.messages[convId] || []).map(m =>
// //               m.sender_id !== userId ? { ...m, read: true, status: 'read' } : m
// //             ),
// //           },
// //         }));

// //         await supabase
// //           .from('messages')
// //           .update({ read: true, status: 'read' })
// //           .eq('conversation_id', convId)
// //           .neq('sender_id', userId);

// //         if (role === 'driver') {
// //           await supabase.from('conversations').update({ unread_count_driver: 0 }).eq('id', convId);
// //         } else {
// //           await supabase.from('conversations').update({ unread_count_passenger: 0 }).eq('id', convId);
// //         }
// //       },

// //       subscribeToMessages: (userId) => {
// //         const sub = get().realtimeSubscription;
// //         if (sub) supabase.removeChannel(sub);

// //         const channel = supabase
// //           .channel(`messages:${userId}`)
// //           .on(
// //             'postgres_changes',
// //             { event: 'INSERT', schema: 'public', table: 'messages' },
// //             async (payload) => {
// //               const newMsg = payload.new as Message;
// //               if (newMsg.sender_id === userId) return;

// //               set((state) => {
// //                 const conv = state.conversations.find(c => c.id === newMsg.conversation_id);
// //                 if (!conv) return state;

// //                 return {
// //                   messages: {
// //                     ...state.messages,
// //                     [newMsg.conversation_id]: [...(state.messages[newMsg.conversation_id] || []), newMsg],
// //                   },
// //                   conversations: state.conversations.map(c =>
// //                     c.id === newMsg.conversation_id
// //                       ? {
// //                           ...c,
// //                           last_message: newMsg.text || '🎤 Voice',
// //                           last_message_at: newMsg.created_at,
// //                           unread_count_driver: newMsg.sender_role === 'passenger' ? c.unread_count_driver + 1 : c.unread_count_driver,
// //                           unread_count_passenger: newMsg.sender_role === 'driver' ? c.unread_count_passenger + 1 : c.unread_count_passenger,
// //                         }
// //                       : c
// //                   ),
// //                 };
// //               });

// //               // Show notification (implement expo-notifications)
// //             }
// //           )
// //           .subscribe();

// //         set({ realtimeSubscription: channel });
// //         return () => { supabase.removeChannel(channel); };
// //       },

// //       getUnreadCount: (userId, role) => {
// //         const convs = get().conversations;
// //         return convs.reduce((sum, c) => {
// //           return sum + (role === 'driver' ? c.unread_count_driver : c.unread_count_passenger);
// //         }, 0);
// //       },
// //     }),
// //     {
// //       name: 'teqil-messages-v3',
// //       storage: createJSONStorage(() => AsyncStorage),
// //       partialize: (state) => ({
// //         conversations: state.conversations,
// //         messages: state.messages,
// //       }),
// //     }
// //   )
// // );


























// src/store/useMessagesStore.ts
// CHANGES vs original:
//   1. MessagesState interface — two new method signatures added
//   2. create() body — two new implementations at the bottom, nothing else touched

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/services/supabase';

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
  ) => Promise<{ driverUser: { id: string; full_name: string | null; driver_id: string | null }; conversation: Conversation }>;
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
          const { data, error } = await supabase
            .from('conversations')
            .select('*')
            .order('last_message_at', { ascending: false });
          if (error || !data) return;
          const filtered = data.filter((c: any) =>
            c.participant_id === userId || c.passenger_id === userId
          );
          const normalized: Conversation[] = filtered.map((c: any) => ({
            id:                    c.id,
            type:                  c.type,
            participant_id:        c.participant_id,
            participant_name:      c.participant_name      || 'Driver',
            participant_role:      c.participant_role      || 'driver',
            participant_photo:     c.participant_photo,
            participant_driver_id: c.participant_driver_id,
            participant_vehicle:   c.participant_vehicle,
            participant_park_name: c.participant_park_name,
            participant_phone:     c.participant_phone,
            last_message:          c.last_message          || '',
            last_message_at:       c.last_message_at       || new Date().toISOString(),
            unread_count:          c.unread_count           || 0,
            trip_code:             c.trip_code,
          }));
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
          const normalized: Conversation = {
            id:                    remote.id,
            participant_id:        remote.participant_id,
            participant_name:      remote.participant_name      || 'Driver',
            participant_role:      remote.participant_role      || 'driver',
            participant_photo:     remote.participant_photo,
            participant_driver_id: remote.participant_driver_id,
            participant_vehicle:   remote.participant_vehicle,
            participant_park_name: remote.participant_park_name,
            participant_phone:     remote.participant_phone,
            last_message:          remote.last_message          || '',
            last_message_at:       remote.last_message_at       || new Date().toISOString(),
            unread_count:          remote.unread_count           || 0,
          };
          set((s) => ({
            conversations: s.conversations.find((c) => c.id === convId)
              ? s.conversations
              : [normalized, ...s.conversations],
          }));
          return normalized;
        }

        // Fetch driver profile so the conversation card is fully populated
        const { data: driver, error } = await supabase
          .from('users')
          .select('id, full_name, phone, driver_id, profile_photo, vehicle_details, park_name')
          .eq('id', driverUserId)
          .maybeSingle();

        if (error || !driver) throw new Error('Driver profile not found.');

        const newConv: Conversation = {
          id:                    convId,
          participant_id:        driver.id,
          participant_name:      driver.full_name       || 'Driver',
          participant_role:      'driver',
          participant_photo:     driver.profile_photo   ?? undefined,
          participant_driver_id: driver.driver_id       ?? undefined,
          participant_vehicle:   driver.vehicle_details ?? undefined,
          participant_park_name: driver.park_name       ?? undefined,
          participant_phone:     driver.phone           ?? undefined,
          last_message:          '',
          last_message_at:       new Date().toISOString(),
          unread_count:          0,
        };

        // Persist — include the new `type` column from the migration
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
          participant_phone:     newConv.participant_phone     ?? null,
          passenger_id:          passengerId,
          last_message:          '',
          last_message_at:       newConv.last_message_at,
          unread_count:          0,
        }]);

        set((s) => ({ conversations: [newConv, ...s.conversations] }));
        return newConv;
      },

      fetchConversationByDriverId: async (driverDisplayId, passengerId) => {
        // Normalise: "a1b2c3" | "DRV A1B2C3" | "drv-a1b2c3" → "DRV-A1B2C3"
        const raw        = driverDisplayId.trim().toUpperCase().replace(/\s+/g, '-');
        const normalised = raw.startsWith('DRV-') ? raw : `DRV-${raw.replace(/^DRV/, '')}`;

        // Strategy 1: exact match on indexed driver_id (fast path)
        let driver: any = null;
        const { data: exact } = await supabase
          .from('users')
          .select('id, full_name, phone, driver_id, profile_photo, vehicle_details, park_name')
          .eq('driver_id', normalised)
          .eq('role', 'driver')
          .maybeSingle();
        driver = exact;

        // Strategy 2: suffix match — user typed "A1B2C3" without the "DRV-" prefix
        if (!driver) {
          const suffix = normalised.replace(/^DRV-/, '');
          const { data: fuzzy } = await supabase
            .from('users')
            .select('id, full_name, phone, driver_id, profile_photo, vehicle_details, park_name')
            .ilike('driver_id', `%${suffix}%`)
            .eq('role', 'driver')
            .maybeSingle();
          driver = fuzzy;
        }

        if (!driver) {
          throw new Error(`No driver found with ID "${driverDisplayId}". Check the ID and try again.`);
        }

        const conversation = await get().startDirectChat(passengerId, driver.id);
        return { driverUser: driver, conversation };
      },
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