import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Checkmark, TaskDone01Icon } from '@hugeicons/core-free-icons';
import { Message } from '@/src/types/chat';
import { Colors } from '@/constants/colors';

interface MessageBubbleProps {
  message: Message;
  isMe: boolean;
  isDark: boolean;
}

export function MessageBubble({ message, isMe, isDark }: MessageBubbleProps) {
  const bubbleColor = isMe ? Colors.primary : (isDark ? '#1E2820' : '#F0F0F0');
  const textColor = isMe ? '#fff' : (isDark ? '#fff' : '#000');
  
  const renderTicks = () => {
    if (!isMe) return null;
    
    switch (message.status) {
      case 'queued':
        return <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>🕒</Text>;
      case 'sent':
        return <HugeiconsIcon icon={Checkmark} size={14} color="rgba(255,255,255,0.6)" />;
      case 'delivered':
        return <HugeiconsIcon icon={TaskDone01Icon} size={14} color="rgba(255,255,255,0.6)" />;
      case 'read':
        return <HugeiconsIcon icon={TaskDone01Icon} size={14} color="#34B7F1" />;
      default:
        return null;
    }
  };

  return (
    <View style={[S.container, isMe ? S.me : S.them]}>
      <View style={[S.bubble, { backgroundColor: bubbleColor }]}>
        <Text style={{ color: textColor }}>{message.text}</Text>
        <View style={S.meta}>
          <Text style={[S.time, { color: isMe ? 'rgba(255,255,255,0.6)' : 'gray' }]}>
            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {renderTicks()}
        </View>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  container: { marginVertical: 4, paddingHorizontal: 12 },
  me: { alignItems: 'flex-end' },
  them: { alignItems: 'flex-start' },
  bubble: { maxWidth: '80%', padding: 10, borderRadius: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
  time: { fontSize: 10 },
});