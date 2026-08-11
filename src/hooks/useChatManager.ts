// src/hooks/useChatManager.ts
//
// Realtime chat plumbing for a single conversation.
//
// Both hooks used to end in TODOs — the subscription received rows and dropped
// them, and the send path never told anyone what it had written. They now hand
// their results to the caller through callbacks, which keeps the transport here
// and the state where the screen wants it.
//
// Delivery receipts follow the usual four-state ladder:
//   queued    — written locally, not yet accepted by the server
//   sent      — the server has it
//   delivered — the recipient's client has seen the row arrive
//   read      — the recipient has opened the thread
//
// "delivered" is set by the RECIPIENT when the realtime INSERT lands on their
// device, which is why that promotion lives in the subscription rather than in
// the sender's code path.

import { useEffect, useRef } from 'react';
import { supabase } from '@/src/services/supabase';
import { Message } from '@/src/types/chat';

export interface ChatSubscriptionHandlers {
  /** A new message arrived on this thread. */
  onInsert?: (message: Message) => void;
  /** An existing message changed — almost always a delivery-status promotion. */
  onUpdate?: (message: Message) => void;
}

export function useChatSubscription(
  chatId: string,
  currentUserId: string,
  handlers: ChatSubscriptionHandlers = {},
) {
  // Held in a ref so re-rendering the screen doesn't tear down the channel.
  // Resubscribing on every render is how you end up missing messages.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!chatId) return;

    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        async (payload) => {
          const message = payload.new as Message;
          handlersRef.current.onInsert?.(message);

          // We are the recipient and this is the first time we've seen it —
          // promote it so the sender's ticks advance.
          if (message.sender_id !== currentUserId && message.status === 'sent') {
            await supabase
              .from('messages')
              .update({ status: 'delivered' })
              .eq('id', message.id);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          handlersRef.current.onUpdate?.(payload.new as Message);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, currentUserId]);
}

/** Fetch a thread's history, oldest first. */
export async function fetchMessages(chatId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[chat] failed to load history:', error.message);
    return [];
  }
  return (data ?? []) as Message[];
}

/** Mark everything the other party sent as read. Safe to call repeatedly. */
export async function markThreadRead(chatId: string, currentUserId: string) {
  if (!chatId || !currentUserId) return;
  await supabase
    .from('messages')
    .update({ status: 'read' })
    .eq('chat_id', chatId)
    .neq('sender_id', currentUserId)
    .eq('status', 'delivered');
}

export interface SendResult {
  /** The optimistic row, so the caller can render it immediately. */
  optimistic: Message;
  /** Resolves to the server's row, or null if the send failed. */
  confirmed: Promise<Message | null>;
}

export function useMessageActions() {
  /**
   * Writes a message and reports back twice: once synchronously with an
   * optimistic row to paint, then again when the server confirms.
   *
   * A failed send leaves the message 'queued' rather than dropping it, so the
   * thread still shows what the user typed and a retry can pick it up.
   */
  const sendMessage = (chatId: string, senderId: string, text: string): SendResult => {
    const optimistic: Message = {
      id: `temp_${Date.now()}`,
      chat_id: chatId,
      sender_id: senderId,
      text,
      status: 'queued',
      created_at: new Date().toISOString(),
    };

    const confirmed = (async (): Promise<Message | null> => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .insert([{ chat_id: chatId, sender_id: senderId, text, status: 'sent' }])
          .select()
          .single();

        if (error) throw error;
        return data as Message;
      } catch (error) {
        console.warn('[chat] send failed, message stays queued:', error);
        return null;
      }
    })();

    return { optimistic, confirmed };
  };

  return { sendMessage };
}
