import { useEffect } from 'react';
import { supabase } from '@/src/services/supabase';
import { Message } from '@/src/types/chat';

export function useChatSubscription(chatId: string, currentUserId: string) {
  useEffect(() => {
    if (!chatId) return;

    // Subscribe to new messages
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        async (payload) => {
          const newMessage = payload.new as Message;
          
          // If we received a message from the OTHER person, mark it as delivered
          if (newMessage.sender_id !== currentUserId && newMessage.status === 'sent') {
            await supabase
              .from('messages')
              .update({ status: 'delivered' })
              .eq('id', newMessage.id);
          }
          
          // TODO: Dispatch newMessage to your local Zustand store here
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          // TODO: Update local Zustand store to reflect new status (e.g., sent -> delivered)
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, currentUserId]);
}

export function useMessageActions() {
  const sendMessage = async (chatId: string, senderId: string, text: string) => {
    // 1. Create optimistic local message object
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      chat_id: chatId,
      sender_id: senderId,
      text,
      status: 'queued',
      created_at: new Date().toISOString(),
    };

    // TODO: Instantly add `optimisticMsg` to your Zustand store (which is persisted via AsyncStorage)

    try {
      // 2. Attempt to send to Supabase
      const { data, error } = await supabase
        .from('messages')
        .insert([{ chat_id: chatId, sender_id: senderId, text, status: 'sent' }])
        .select()
        .single();

      if (error) throw error;

      // 3. Update local store: replace tempId with real ID and status with 'sent'
    } catch (error) {
      console.error('Failed to send, remaining in queue:', error);
      // Message remains 'queued' in local store. 
      // A background sync mechanism should retry sending these later.
    }
  };

  return { sendMessage };
}