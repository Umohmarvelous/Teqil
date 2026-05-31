// // app/direct-chat/[conversationId].tsx
// //
// // Thin wrapper: pulls conversationId + display params from the URL,
// // finds (or loads) the conversation from the store, then renders the
// // existing ChatScreen component extracted from messages.tsx.
// //
// // Bottom tabs and sidebar are deliberately hidden here (full-screen chat UX).

// import React, { useEffect, useRef } from 'react';
// import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
// import { useLocalSearchParams } from 'expo-router';
// import { GestureHandlerRootView } from 'react-native-gesture-handler';
// import { useAuthStore }     from '@/src/store/useStore';
// import { useMessagesStore } from '@/src/store/useMessagesStore';
// import { useSettingsStore } from '@/src/store/useSettingsStore';
// import { Colors }           from '@/constants/colors';

// // ChatScreen is a named export in messages.tsx — we re-export it there.
// // If your project does not yet export it, see the note in messages.tsx below.
// import { ChatScreen } from '@/app/(main)/messages';

// export default function DirectChatRoute() {
//   const { conversationId, driverName, driverId } = useLocalSearchParams<{
//     conversationId: string;
//     driverName:     string;
//     driverId:       string;
//   }>();

//   const { user }         = useAuthStore();
//   const { conversations, subscribeToRealtime } = useMessagesStore();
//   const { theme }        = useSettingsStore();
//   const isDark           = theme === 'dark';

//   // Subscribe to realtime on mount; unsubscribe on unmount
//   const unsubRef = useRef<(() => void) | null>(null);
//   useEffect(() => {
//     if (!user?.id) return;
//     unsubRef.current = subscribeToRealtime(user.id);
//     return () => { unsubRef.current?.(); };
//   }, [user?.id]);           // eslint-disable-line react-hooks/exhaustive-deps

//   const conversation = conversations.find((c) => c.id === conversationId);

//   // Fallback while the store hydrates from AsyncStorage
//   if (!conversation) {
//     return (
//       <View style={[styles.center, { backgroundColor: isDark ? Colors.background : Colors.border }]}>
//         <ActivityIndicator color={Colors.primary} size="large" />
//         <Text style={[styles.loadingText, { color: isDark ? Colors.textSecondary : Colors.textTertiary }]}>
//           Loading conversation…
//         </Text>
//       </View>
//     );
//   }

//   // Patch display fields from URL params if the conversation was just created
//   // and the store entry doesn't yet have participant_name populated.
//   const hydratedConversation = {
//     ...conversation,
//     participant_name:      conversation.participant_name      || driverName || 'Driver',
//     participant_driver_id: conversation.participant_driver_id || driverId   || undefined,
//   };

//   return (
//     <GestureHandlerRootView style={styles.root}>
//       <ChatScreen
//         conversation={hydratedConversation}
//         onBack={() => {
//           // router.back() is called inside ChatScreen via the arrow button,
//           // so we only need to satisfy the prop type here.
//           // If you need custom back behavior, add it here.
//         }}
//         isDark={isDark}
//         invalidId={false}
//       />
//     </GestureHandlerRootView>
//   );
// }

// const styles = StyleSheet.create({
//   root:        { flex: 1 },
//   center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
//   loadingText: { fontFamily: 'Poppins_400Regular', fontSize: 14 },
// });

























import React, { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router'; // Assuming Expo Router based on your previous files
import { useAuthStore } from '@/src/store/useStore';
import { useSettingsStore } from '@/src/store/useSettingsStore';
import { useChatSubscription, useMessageActions } from '@/src/hooks/useChatManager';
import { supabase } from '@/src/services/supabase';
import { Message } from '@/src/types/chat';
import { MessageBubble } from '@/components/MessageBubble'; // Make sure this path is correct

export default function ChatScreen() {
  // Use Expo Router's search params instead of the old React Navigation route prop
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const chatId = conversationId ?? '';
  
  const { user } = useAuthStore();
  const { theme } = useSettingsStore();
  const { sendMessage } = useMessageActions();
  
  // Explicitly type the state array so TS knows item.id and item.sender_id exist
  const [messages, setMessages] = useState<Message[]>([]); 

  // Provide a fallback empty string if user?.id is undefined
  useChatSubscription(chatId, user?.id ?? '');

  useEffect(() => {
    // Satisfy ESLint exhaustive-deps and prevent execution if user isn't loaded
    if (!user?.id || !chatId) return; 

    supabase
      .from('messages')
      .update({ status: 'read' })
      .eq('chat_id', chatId)
      .neq('sender_id', user.id)
      .eq('status', 'delivered')
      .then();
  }, [chatId, user?.id]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <FlatList
        data={messages}
        inverted={true}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble 
            message={item} 
            isMe={item.sender_id === user?.id} 
            isDark={theme === 'dark'} 
          />
        )}
        removeClippedSubviews={true}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={10}
      />
      {/* Input UI here... calls sendMessage(chatId, user.id, text) */}
    </KeyboardAvoidingView>
  );
}