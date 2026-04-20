import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMessagesStore, Conversation, Message } from '@/src/store/useMessagesStore';
import { Colors } from '@/constants/colors';
import Avatar from '@/components/Avatar';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { ArrowLeft01Icon, TelegramIcon } from '@hugeicons/core-free-icons';

interface ChatScreenProps {
  conversation: Conversation;
  onBack: () => void;
  currentUserId: string;
  currentUserRole: 'driver' | 'passenger';
}

export default function ChatScreen({ conversation, onBack, currentUserId, currentUserRole }: ChatScreenProps) {
  const insets = useSafeAreaInsets();
  const { messages, sendMessage, markConversationRead } = useMessagesStore();
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const convMessages = messages[conversation.id] || [];
  const otherUserName = currentUserRole === 'passenger' ? conversation.participant_name : conversation.passenger_name;
  const otherUserPhoto = currentUserRole === 'passenger' ? conversation.participant_photo : undefined;

  useEffect(() => {
    markConversationRead(conversation.id, currentUserId, currentUserRole);
  }, [conversation.id]);

  useEffect(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [convMessages.length]);

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const senderName = currentUserRole === 'passenger' ? conversation.passenger_name || 'You' : conversation.participant_name;
    await sendMessage(conversation.id, currentUserId, inputText.trim(), senderName, currentUserRole);
    setInputText('');
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUserId;
    return (
      <View style={[styles.messageRow, isMe ? styles.myMessage : styles.theirMessage]}>
        {!isMe && (
          <Avatar name={otherUserName} size={30} photoUri={otherUserPhoto} style={{ marginRight: 8 }} />
        )}
        <View style={[
          styles.bubble,
          isMe ? styles.myBubble : styles.theirBubble,
        ]}>
          <Text style={[styles.messageText, { color: isMe ? '#fff' : Colors.text }]}>
            {item.text}
          </Text>
          <Text style={[styles.timeText, { color: isMe ? 'rgba(255,255,255,0.7)' : Colors.textTertiary }]}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {isMe && (
              <Text>  {item.status === 'read' ? '✓✓' : '✓'}</Text>
            )}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={24} color={Colors.text} />
        </Pressable>
        <Avatar icon={otherUserName} size={40} photoUri={otherUserPhoto} />
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{otherUserName}</Text>
          <Text style={styles.headerStatus}>
            {currentUserRole === 'passenger' ? 'Driver' : 'Passenger'}
          </Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={convMessages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <Pressable onPress={handleSend} style={styles.sendButton}>
          <HugeiconsIcon icon={TelegramIcon} size={24} color={Colors.primary} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8ECF0',
  },
  backButton: { marginRight: 12 },
  headerInfo: { marginLeft: 12, flex: 1 },
  headerName: { fontFamily: 'Poppins_600SemiBold', fontSize: 16 },
  headerStatus: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: Colors.textSecondary },
  messageList: { padding: 16, paddingBottom: 20 },
  messageRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  myMessage: { justifyContent: 'flex-end' },
  theirMessage: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '75%',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  myBubble: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: '#F0F0F0',
    borderBottomLeftRadius: 4,
  },
  messageText: { fontFamily: 'Poppins_400Regular', fontSize: 15 },
  timeText: { fontFamily: 'Poppins_400Regular', fontSize: 10, marginTop: 4, textAlign: 'right' },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8ECF0',
  },
  input: {
    flex: 1,
    backgroundColor: '#F4F6FA',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: 'Poppins_400Regular',
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: { marginLeft: 12, padding: 8 },
});