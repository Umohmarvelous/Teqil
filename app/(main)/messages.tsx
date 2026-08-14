// app/(main)/messages.tsx
//
// CHANGES vs original:
//   1. ChatScreen and MessageBubble are now named exports so direct-chat/[conversationId].tsx
//      can import ChatScreen without duplicating it.
//   2. NewChatModal: replaced the single search flow with two tabs —
//      "Trip Code" (existing) and "Driver ID" (new).  Driver ID tab calls
//      fetchConversationByDriverId then navigates to direct-chat/[conversationId].
//   3. ConvItem: direct conversations show a UserIcon instead of a car.
//   4. ConvList filter: includes direct conversations for the current user.
//   5. Everything else (ChatScreen, MessageBubble, realtime, sidebar, bottom tabs)
//      is identical to the original.

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Linking,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router }               from 'expo-router';
import { useSafeAreaInsets }    from 'react-native-safe-area-context';
import * as Haptics             from 'expo-haptics';
import { useAuthStore }         from '@/src/store/useStore';
import { useSettingsStore }     from '@/src/store/useSettingsStore';
import {
  useMessagesStore,
  type Conversation,
  type Message,
} from '@/src/store/useMessagesStore';
import { Colors }   from '@/constants/colors';
import Avatar       from '@/components/Avatar';
import { generateId } from '@/src/utils/helpers';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  ArrowLeft01Icon,
  Message02Icon,
  PlusSignIcon,
  TelegramIcon,
  Delete01Icon,
  MoreVerticalIcon,
  Copy01Icon,
  Reply,
  TaskDone01Icon,
  Checkmark,
  CallIcon,
  Search01Icon,
  Mic01Icon,
  MicOff01Icon,
  UserIcon,        // ← new: used for direct-chat list items
  Car01Icon,       // ← new: used for trip-based list items
  IdentityCardIcon, // ← new: Driver ID tab icon
  Chat, // ← new: Driver ID tab icon
  MoreHorizontalCircleIcon, // ← new: Driver ID tab icon
  BellOff, // ← new: Driver ID tab icon
  Search02Icon, // ← new: Driver ID tab icon
} from '@hugeicons/core-free-icons';
import { StatusBar }  from 'expo-status-bar';
import Swipeable      from 'react-native-gesture-handler/Swipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase }   from '@/src/services/supabase';
import { Glass, iosAlert, useIOSTheme } from "@/components/ios";
import { SymbolView } from 'expo-symbols';
// expo-av was removed in Expo SDK 57 — stub so the voice-recording code compiles.
// Recording is disabled (permission returns "denied") until migrated to expo-audio.
const Audio: any = {
  requestPermissionsAsync: async () => ({ status: 'denied' }),
  setAudioModeAsync: async () => {},
  Recording: { createAsync: async () => { throw new Error('Voice recording unavailable'); } },
  RecordingOptionsPresets: { HIGH_QUALITY: {} },
};

// ─── Helpers ───────── ──────────── ──────────── ─────────── ─────────── ───────────

function normaliseDriverId(raw: string): string {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, '-');
  if (upper.startsWith('DRV-')) return upper;
  if (upper.startsWith('DRV'))  return `DRV-${upper.slice(3)}`;
  return `DRV-${upper}`;
}

// ─── Contact Info Modal (unchanged) ──────────────────────────────────────────

function ContactInfoModal({
  visible, onClose, conversation, isDark,
}: { visible: boolean; onClose: () => void; conversation: Conversation | null; isDark: boolean }) {
  if (!conversation) return null;
  const textColor = isDark ? Colors.textWhite    : Colors.text;
  const subTextColor  = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg    = isDark ? Colors.primaryDarker : '#FFFFFF';

  const call = () => {
    const phone = conversation.participant_phone;
    if (!phone) { iosAlert('No phone number', 'This driver has no phone number on record.'); return; }
    Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={S.backdrop} onPress={onClose} />
        <View style={[S.infoSheet, { backgroundColor: cardBg }]}>
          <View style={S.handle} />
          <View style={S.infoHeader}>
            <Text style={[S.infoTitle, { color: textColor }]}>Contact Info</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <HugeiconsIcon icon={ArrowLeft01Icon} size={24} color={textColor} />
            </Pressable>
          </View>
          <View style={S.infoAvatarRow}>
            <Avatar name={conversation.participant_name || 'Driver'} size={72} />
            <Text style={[S.infoName, { color: textColor }]}>{conversation.participant_name}</Text>
            <Text style={[S.infoSub,  { color: Colors.primary }]}>{conversation.participant_driver_id}</Text>
            {conversation.participant_vehicle
              ? <Text style={[S.infoSub, { color: subTextColor }]}>🚗 {conversation.participant_vehicle}</Text>
              : null}
          </View>
          <View style={S.infoActions}>
            <Pressable style={[S.infoActionBtn, { backgroundColor: Colors.primary }]} onPress={call}>
              <HugeiconsIcon icon={CallIcon} size={20} color="#fff" />
              <Text style={S.infoActionText}>Call</Text>
            </Pressable>
            <Pressable style={[S.infoActionBtn, { backgroundColor: Colors.primaryDarker }]} onPress={onClose}>
              <HugeiconsIcon icon={Message02Icon} size={20} color="#fff" />
              <Text style={S.infoActionText}>Message</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Message Bubble (named export for direct-chat route) ──────────────────────

export function MessageBubble({
  message, isMe, onReply, onDelete, onCopy, isDark, textColor, subTextColor,
}: {
  message: Message; isMe: boolean;
  onReply: () => void; onDelete: () => void; onCopy: () => void;
  isDark: boolean; textColor: string; subTextColor: string;
}) {
  const timeStr = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <Swipeable
      renderRightActions={() => (
        <View style={S.swipeActions}>
          <Pressable onPress={onReply}  style={[S.swipeAction, { backgroundColor: Colors.gold }]}>
            <HugeiconsIcon icon={Reply}      size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={onCopy}   style={[S.swipeAction, { backgroundColor: Colors.primary }]}>
            <HugeiconsIcon icon={Copy01Icon} size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={onDelete} style={[S.swipeAction, { backgroundColor: Colors.error }]}>
            <HugeiconsIcon icon={Delete01Icon} size={18} color="#fff" />
          </Pressable>
        </View>
      )}
      overshootRight={false}
    >
      <View style={[S.bubbleWrap, isMe ? S.bubbleWrapMe : S.bubbleWrapThem]}>
        <View style={[
          S.bubble,
          isMe ? S.bubbleMe : [S.bubbleThem, { backgroundColor: isDark ? '#1E2820' : '#F0F0F0' }],
        ]}>
          <Text style={[S.bubbleText, { color: isMe ? '#fff' : textColor }]}>
            {message.audio_uri ? '🎤 Voice message' : message.text}
          </Text>
          <View style={S.bubbleMeta}>
            <Text style={[S.bubbleTime, { color: isMe ? 'rgba(255,255,255,0.55)' : subTextColor }]}>
              {timeStr}
            </Text>
            {isMe && (
              <HugeiconsIcon
                icon={message.status === 'read' ? TaskDone01Icon : Checkmark}
                size={13}
                color={message.status === 'read' ? '#34B7F1' : 'rgba(255,255,255,0.45)'}
              />
            )}
          </View>
        </View>
      </View>
    </Swipeable>
  );
}

// ─── Chat Screen (named export so direct-chat/[conversationId].tsx can reuse) ─

export function ChatScreen({
  conversation, onBack, isDark, invalidId = false,
}: {
  conversation: Conversation; onBack: () => void; isDark: boolean; invalidId?: boolean;
}) {
  const { user } = useAuthStore();
  const {
    addMessage, markRead, messages: allMessages,
    setTyping, typingUsers, deleteMessage, subscribeToRealtime,
  } = useMessagesStore();

  const [text,        setText]        = useState('');
  const [sending,     setSending]     = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const recordingRef = useRef<any>(null);
  const listRef      = useRef<FlatList>(null);
  const typingTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets       = useSafeAreaInsets();

  const subscribeRef = useRef(subscribeToRealtime);
  const markReadRef  = useRef(markRead);
  useEffect(() => { subscribeRef.current = subscribeToRealtime; });
  useEffect(() => { markReadRef.current  = markRead; });

  const bg        = isDark ? Colors.background   : '#F5F5F5';
  const textColor = isDark ? Colors.textWhite     : Colors.text;
  const subTextColor  = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg    = isDark ? Colors.primaryDarker : '#FFFFFF';
  const border    = isDark ? 'rgba(255,255,255,0.08)' : '#E8ECF0';
  const inputBg   = isDark ? '#1C2921' : '#F0F0F0';
  const topPad    = Platform.OS === 'web' ? 67 : insets.top;

  const messages    = allMessages[conversation.id] || [];
  const otherTyping = typingUsers[conversation.id] || false;

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeRef.current(user.id);
    return () => unsub?.();
  }, [user?.id]);

  useEffect(() => { markReadRef.current(conversation.id); }, [conversation.id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleTyping = (v: string) => {
    setText(v);
    setTyping(conversation.id, true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(conversation.id, false), 1500);
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user?.id || sending) return;
    setSending(true);
    setText('');
    setTyping(conversation.id, false);
    await addMessage({
      id:              generateId(),
      conversation_id: conversation.id,
      sender_id:       user.id,
      sender_name:     user.full_name || 'Me',
      sender_role:     user.role as any,
      text:            trimmed,
      created_at:      new Date().toISOString(),
      read:            false,
      status:          'sent',
    });
    setSending(false);
  };

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        iosAlert('Permission required', 'Microphone access is needed for voice messages.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { iosAlert('Error', 'Could not start recording.'); }
  };

  const stopRecording = async () => {
    if (!recordingRef.current || !user?.id) return;
    setIsRecording(false);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (uri) {
        await addMessage({
          id:              generateId(),
          conversation_id: conversation.id,
          sender_id:       user.id,
          sender_name:     user.full_name || 'Me',
          sender_role:     user.role as any,
          audio_uri:       uri,
          created_at:      new Date().toISOString(),
          read:            false,
          status:          'sent',
        });
      }
    } catch { iosAlert('Error', 'Could not save voice message.'); }
  };

  const cancelRecording = async () => {
    if (!recordingRef.current) return;
    setIsRecording(false);
    try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
    recordingRef.current = null;
  };

  const handleCall = () => {
    const phone = conversation.participant_phone;
    if (!phone) { iosAlert('No phone', 'This driver has no phone number on record.'); return; }
    Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
  };

  const handleReply = (m: Message) => {
    if (!m.text) return;
    setText(`↩ ${m.sender_name || 'User'}: ${m.text}\n`);
  };

  const handleCopy = (m: Message) => {
    if (!m.text) return;
    if (Platform.OS === 'web' && navigator?.clipboard) navigator.clipboard.writeText(m.text);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const InputRight = () =>
    text.trim() ? (
      <Pressable
        style={[S.sendBtn, { backgroundColor: Colors.primary, opacity: sending ? 0.6 : 1 }]}
        onPress={handleSend}
        disabled={sending}
      >
        {sending
          ? <ActivityIndicator size="small" color="#fff" />
          : <HugeiconsIcon icon={TelegramIcon} size={20} color="#fff" />}
      </Pressable>
    ) : (
      <Pressable
        style={[S.sendBtn, { backgroundColor: isRecording ? Colors.error : Colors.primary }]}
        onLongPress={startRecording}
        onPressOut={isRecording ? stopRecording : undefined}
        delayLongPress={200}
      >
        <HugeiconsIcon icon={isRecording ? MicOff01Icon : Mic01Icon} size={20} color="#fff" />
      </Pressable>
    );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[S.chatHeader, { backgroundColor: cardBg, borderBottomColor: border, paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => { onBack(); router.back(); }} style={S.chatBack} hitSlop={8}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={25} color={textColor} />
        </Pressable>
        <Pressable style={S.chatHeaderInfo} onPress={() => setInfoVisible(true)}>
          <Avatar name={conversation.participant_name || 'Driver'} size={38} />
          <View style={{ flex: 1 }}>
            <Text style={[S.chatHeaderName, { color: textColor }]} numberOfLines={1}>
              {conversation.participant_name}
            </Text>
            {otherTyping
              ? <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 11, fontStyle: 'italic', color: Colors.primary }}>typing…</Text>
              : <Text style={[S.chatHeaderSub, { color: Colors.primary }]} numberOfLines={1}>
                  {conversation.participant_driver_id || 'Direct message'}
                </Text>
            }
          </View>
        </Pressable>
        <Pressable onPress={handleCall} style={S.chatCallBtn} hitSlop={8}>
          <HugeiconsIcon icon={CallIcon} size={22} color={Colors.primary} />
        </Pressable>
        <Pressable onPress={() => setInfoVisible(true)} hitSlop={8}>
          <HugeiconsIcon icon={MoreVerticalIcon} size={24} color={textColor} />
        </Pressable>
      </View>

      {invalidId && (
        <View style={[S.warnBanner, { backgroundColor: Colors.gold + '22' }]}>
          <Text style={[S.warnText, { color: Colors.gold }]}>
            ⚠ Invalid driver_id — this driver could not be verified. Messages may not be delivered.
          </Text>
        </View>
      )}

      {isRecording && (
        <View style={[S.recBanner, { backgroundColor: Colors.error + '22' }]}>
          <View style={S.recDot} />
          <Text style={[S.recText, { color: Colors.error }]}>Recording… release to send</Text>
          <Pressable onPress={cancelRecording} hitSlop={8}>
            <Text style={{ color: Colors.error, fontSize: 20, lineHeight: 22 }}>×</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={S.messageList}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            isMe={item.sender_id === user?.id}
            onReply={() => handleReply(item)}
            onDelete={() => deleteMessage(conversation.id, item.id)}
            onCopy={() => handleCopy(item)}
            isDark={isDark}
            textColor={textColor}
            subTextColor={subTextColor}
          />
        )}
        ListEmptyComponent={
          <View style={S.emptyChat}>
            <HugeiconsIcon icon={Message02Icon} size={44} color={subTextColor} />
            <Text style={[S.emptyChatText, { color: subTextColor }]}>No messages yet. Say hello!</Text>
          </View>
        }
      />

      <View style={[S.inputBar, { backgroundColor: cardBg, borderTopColor: border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={[S.textInput, { backgroundColor: inputBg, color: textColor }]}
          placeholder="Type a message…"
          placeholderTextColor={subTextColor}
          value={text}
          onChangeText={handleTyping}
          multiline
          maxLength={2000}
        />
        <InputRight />
      </View>

      <ContactInfoModal
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
        conversation={conversation}
        isDark={isDark}
      />
    </KeyboardAvoidingView>
  );
}

// ─── New Chat Modal — now with Trip Code / Driver ID tabs ─────────────────────

type SearchTab    = 'trip' | 'driver';
type SearchStatus = 'idle' | 'searching' | 'found' | 'invalid';

interface DriverRecord {
  id:               string;
  full_name:        string | null;
  phone:            string | null;
  driver_id:        string | null;
  vehicle_details:  string | null;
  park_name:        string | null;
  role?:            string | null;
}

function NewChatModal({
  visible, onClose, onStart, isDark,
}: {
  visible:  boolean;
  onClose:  () => void;
  onStart:  (conv: Conversation, invalidId: boolean) => void;
  isDark:   boolean;
}) {
  const { user }                          = useAuthStore();
  const { fetchConversationByDriverId }   = useMessagesStore();

  const [tab,     setTab]     = useState<SearchTab>('trip');
  const [query,   setQuery]   = useState('');
  const [status,  setStatus]  = useState<SearchStatus>('idle');
  const [result,  setResult]  = useState<DriverRecord | null>(null);

  // Driver ID tab — loading state for fetchConversationByDriverId
  const [driverLoading, setDriverLoading] = useState(false);
  const [driverError,   setDriverError]   = useState('');

  const textColor = isDark ? Colors.textWhite     : Colors.text;
  const subTextColor  = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg    = isDark ? Colors.primaryDarker : '#FFFFFF';
  const border    = isDark ? 'rgba(255,255,255,0.12)' : '#E8ECF0';
  const inputBg   = isDark ? Colors.background    : '#F4F6FA';
  const tabBg     = isDark ? '#1A1A2E' : '#F0F2F5';
  const bg     = isDark ? Colors.overlayLight : Colors.border;

  useEffect(() => {
    if (!visible) {
      setQuery(''); setResult(null); setStatus('idle');
      setDriverError(''); setDriverLoading(false);
    }
  }, [visible]);

  const reset = () => { setResult(null); setStatus('idle'); setDriverError(''); };

  // ── Trip-code search (original logic, unchanged) ──────────────────────────
  const handleTripSearch = async () => {
    const raw = query.trim();
    if (!raw || !user?.id) return;
    setStatus('searching');
    setResult(null);

    let found: DriverRecord | null = null;
    try {
      const normalised = normaliseDriverId(raw);
      const { data: s1 } = await supabase
        .from('users')
        .select('id, full_name, phone, driver_id, vehicle_details, park_name, role')
        .eq('driver_id', normalised).maybeSingle();
      if (s1 && (!s1.role || s1.role === 'driver')) found = s1 as DriverRecord;

      if (!found) {
        const { data: s2 } = await supabase
          .from('users')
          .select('id, full_name, phone, driver_id, vehicle_details, park_name, role')
          .eq('id', raw).maybeSingle();
        if (s2) {
          if (user.role === 'driver' || !s2.role || s2.role === 'driver') found = s2 as DriverRecord;
        }
      }

      if (!found) {
        const suffix = raw.replace(/^DRV-?/i, '');
        const { data: s3 } = await supabase
          .from('users')
          .select('id, full_name, phone, driver_id, vehicle_details, park_name, role')
          .ilike('driver_id', `%${suffix}%`).maybeSingle();
        if (s3 && (!s3.role || s3.role === 'driver')) found = s3 as DriverRecord;
      }
    } catch (err: any) {
      console.warn('[Messages] trip search error:', err?.message ?? err);
    }

    if (found) { setResult(found); setStatus('found'); }
    else {
      setResult({ id: `invalid_${raw}`, full_name: raw, phone: null, driver_id: raw, vehicle_details: null, park_name: null });
      setStatus('invalid');
    }
  };

  const handleTripOpen = () => {
    if (!result || !user?.id) return;
    const isInvalid = status === 'invalid';
    const convId    = isInvalid
      ? `conv_invalid_${user.id}_${result.driver_id}`
      : `conv_${[user.id, result.id].sort().join('_')}`;
    const conv: Conversation = {
      id:                    convId,
      participant_id:        result.id,
      participant_name:      result.full_name   || 'Unknown',
      participant_role:      (result.role as any) || 'driver',
      participant_driver_id: result.driver_id   ?? undefined,
      participant_vehicle:   result.vehicle_details ?? undefined,
      participant_park_name: result.park_name   ?? undefined,
      participant_phone:     result.phone       ?? undefined,
      last_message:          '',
      last_message_at:       new Date().toISOString(),
      unread_count:          0,
    };
    onStart(conv, isInvalid);
    onClose();
  };

  // ── Driver ID direct-chat (new) ───────────────────────────────────────────
  const handleDriverIdSearch = async () => {
    const raw = query.trim();
    if (!raw || !user?.id) return;
    setDriverLoading(true);
    setDriverError('');
    try {
      const { driverUser, conversation } = await fetchConversationByDriverId(raw, user.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      router.push({
        pathname: '/direct-chat/[conversationId]',
        params: {
          conversationId: conversation.id,
          driverName:     driverUser.full_name ?? 'Driver',
          driverId:       driverUser.driver_id ?? '',
        },
      });
    } catch (err: any) {
      setDriverError(err?.message ?? 'Driver not found. Check the ID and try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setDriverLoading(false);
    }
  };

  const isFound   = status === 'found';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end',  }}
      >
        <Pressable style={S.backdrop} onPress={onClose} />
        <View style={[S.newSheet, { backgroundColor: bg }]}>
          <View style={S.handle} />
          <Text style={[S.newTitle, { color: textColor }]}>New Message</Text>

          {/* ── Tab switcher ── */}
          <View style={[S.tabRow, { backgroundColor: border }]}>
            <Pressable
              style={[S.tabBtn, tab === 'trip' && { backgroundColor: cardBg }]}
              onPress={() => { setTab('trip'); reset(); setQuery(''); }}
            >
              <HugeiconsIcon icon={Car01Icon} size={14} color={tab === 'trip' ? Colors.primary : subTextColor} />
              <Text style={[S.tabBtnText, { color: tab === 'trip' ? Colors.primary : subTextColor }]}>Trip Code</Text>
            </Pressable>
            <Pressable
              style={[S.tabBtn, tab === 'driver' && { backgroundColor: cardBg }]}
              onPress={() => { setTab('driver'); reset(); setQuery(''); }}
            >
              <HugeiconsIcon icon={IdentityCardIcon} size={14} color={tab === 'driver' ? Colors.primary : subTextColor} />
              <Text style={[S.tabBtnText, { color: tab === 'driver' ? Colors.primary : subTextColor }]}>Driver ID</Text>
            </Pressable>
          </View>

          <Text style={[S.newSub, { color: subTextColor }]}>
            {tab === 'trip'
              ? user?.role === 'driver' ? 'Enter a passengers user ID to start chatting' : 'Enter the drivers ID (e.g. DRV-A3X9KL) or their user ID'
              : 'Enter the drivers badge ID (e.g. DRV-A1B2C3) to start a private chat'}
          </Text>

          {/* ── Input ── */}
          <View style={[S.newInputRow, { backgroundColor: inputBg, borderColor: border }]}>
            <HugeiconsIcon icon={Search01Icon} size={18} color={subTextColor} />
            <TextInput
              style={[S.newInput, { color: textColor }]}
              placeholder={tab === 'trip' ? 'DRV-A3X9KL or user ID' : 'DRV-A1B2C3'}
              placeholderTextColor={subTextColor}
              value={query}
              onChangeText={(v) => { setQuery(tab === 'driver' ? v.toUpperCase() : v); reset(); }}
              autoFocus
              autoCapitalize={tab === 'driver' ? 'characters' : 'none'}
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={tab === 'trip' ? handleTripSearch : handleDriverIdSearch}
            />
            {query.length > 0 && (
              <Pressable hitSlop={8} onPress={() => { setQuery(''); reset(); }}>
                <Text style={{ color: subTextColor, fontSize: 18 }}>×</Text>
              </Pressable>
            )}
          </View>

          {/* Driver ID error */}
          {tab === 'driver' && driverError ? (
            <Text style={[S.driverError, { color: Colors.error }]}>{driverError}</Text>
          ) : null}

          {/* Search / Start button */}
          {tab === 'driver' ? (
            <Pressable
              style={[S.newSearchBtn, {
                backgroundColor: query.trim() ? Colors.primary : isDark ? '#2A2A2A' : '#E5E7EB',
                opacity: driverLoading ? 0.7 : 1,
              }]}
              onPress={handleDriverIdSearch}
              disabled={!query.trim() || driverLoading}
            >
              {driverLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[S.newSearchBtnText, { color: query.trim() ? '#fff' : subTextColor }]}>Find & Open Chat</Text>
              }
            </Pressable>
          ) : (
            <>
              <Pressable
                style={[S.newSearchBtn, {
                  backgroundColor: query.trim() ? Colors.primary : isDark ? '#2A2A2A' : '#E5E7EB',
                  opacity: status === 'searching' ? 0.7 : 1,
                }]}
                onPress={handleTripSearch}
                disabled={!query.trim() || status === 'searching'}
              >
                {status === 'searching'
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={[S.newSearchBtnText, { color: query.trim() ? '#fff' : subTextColor }]}>Search Driver</Text>
                }
              </Pressable>

              {/* Trip search result card */}
              {result && (
                <View style={[S.resultCard, {
                  backgroundColor: isFound ? (isDark ? '#1C2921' : '#F0FDF4') : (isDark ? '#221A1A' : '#FFF8F0'),
                  borderColor:     isFound ? Colors.primary + '55' : Colors.gold + '99',
                }]}>
                  <Avatar name={isFound ? result.full_name || 'Driver' : '?'} size={50} />
                  <View style={{ flex: 1, gap: 2 }}>
                    {isFound ? (
                      <>
                        <Text style={[S.resultName, { color: textColor }]}>{result.full_name || 'Driver'}</Text>
                        <Text style={[S.resultDriverId, { color: Colors.primary }]}>{result.driver_id}</Text>
                        {result.vehicle_details
                          ? <Text style={[S.resultSub, { color: subTextColor }]}>🚗 {result.vehicle_details}</Text>
                          : null}
                      </>
                    ) : (
                      <>
                        <Text style={[S.resultName, { color: Colors.gold }]}>Invalid driver_id</Text>
                        <Text style={[S.resultSub, { color: subTextColor }]}>
                          {`"${query.trim()}" is not a registered driver. You can still open a chat but messages won't be delivered.`}
                        </Text>
                      </>
                    )}
                  </View>
                  <Pressable
                    style={[S.chatBtn, { backgroundColor: isFound ? Colors.primary : Colors.gold }]}
                    onPress={handleTripOpen}
                  >
                    <Text style={S.chatBtnText}>{isFound ? 'Chat' : 'Open anyway'}</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Conversation List Item ───────────────────────────────────────────────────

function ConvItem({
  item, onPress, onDelete, isDark, textColor, subTextColor, cardBg, border,
}: {
  item:      Conversation;
  onPress:   () => void;
  onDelete:  () => void;
  isDark:    boolean;
  textColor: string;
  subTextColor:  string;
  cardBg:    string;
  border:    string;
}) {
  const timeStr = item.last_message_at
    ? new Date(item.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  // Direct chats get a person icon; trip-based chats keep the default
  const isDirectChat = item.id.startsWith('direct_');

  return (
    <Swipeable
      renderRightActions={() => (
        <Pressable style={[S.deleteSwipe, { backgroundColor: Colors.error }]} onPress={onDelete}>
          <HugeiconsIcon icon={Delete01Icon} size={22} color="#fff" />
        </Pressable>
      )}
    >
      <Pressable
        style={({ pressed }) => [
          S.convItem,
          { backgroundColor: cardBg, borderBottomColor: border },
          pressed && { opacity: 0.85 },
        ]}
        onPress={onPress}
      >
        <View style={{ position: 'relative' }}>
          <Avatar name={item.participant_name || 'Driver'} size={50} />
          {/* Direct-chat badge */}
          {isDirectChat && (
            <View style={[S.directBadge, { backgroundColor: Colors.primary }]}>
              <HugeiconsIcon icon={UserIcon} size={9} color="#fff" />
            </View>
          )}
          {(item.unread_count ?? 0) > 0 && <View style={S.onlineDot} />}
        </View>
        <View style={S.convText}>
          <View style={S.convTopRow}>
            <Text style={[S.convName, { color: textColor }]} numberOfLines={1}>
              {item.participant_name}
            </Text>
            <Text style={[S.convTime, { color: subTextColor }]}>{timeStr}</Text>
          </View>
          <View style={S.convBottomRow}>
            <Text style={[S.convLast, { color: subTextColor }]} numberOfLines={1}>
              {item.last_message || (isDirectChat ? 'Direct message' : 'Tap to start chatting')}
            </Text>
            {(item.unread_count ?? 0) > 0 && (
              <View style={S.badge}>
                <Text style={S.badgeText}>{(item.unread_count ?? 0) > 9 ? '9+' : item.unread_count}</Text>
              </View>
            )}
          </View>
          {item.participant_driver_id && (
            <Text style={[S.convDriverId, { color: Colors.primary + 'AA' }]}>{item.participant_driver_id}</Text>
          )}
        </View>
      </Pressable>
    </Swipeable>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function MessagesTab() {
  const insets = useSafeAreaInsets();
  const { theme }  = useSettingsStore();
  const { user }   = useAuthStore();
  const { conversations, addConversation, deleteConversation, subscribeToRealtime } = useMessagesStore();

      const ios = useIOSTheme();

  const [activeConv,      setActiveConv]      = useState<Conversation | null>(null);
  const [activeInvalidId, setActiveInvalidId] = useState(false);
  const [newChatVisible,  setNewChatVisible]  = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);

  const isDark    = theme === 'dark';
  const bg        = isDark ? Colors.background : Colors.textWhite;
  const textColor = isDark ? Colors.textWhite     : Colors.text;
  const subTextColor  = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg    = isDark ? Colors.primaryDarker : '#FFFFFF';
  const border    = isDark ? 'rgba(255,255,255,0.08)' : '#E8ECF0';
  const topPad    = Platform.OS === 'web' ? 67 : insets.top;

  const subscribeRef = useRef(subscribeToRealtime);
  useEffect(() => { subscribeRef.current = subscribeToRealtime; });

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeRef.current(user.id);
    return () => unsub?.();
  }, [user?.id]);

  // Show all conversations the current user participates in (trip + direct)
  const visible = useMemo(() => {
    if (!user) return [];
    return conversations.filter((c) => {
      if (user.role === 'driver') {
        return (
          c.participant_id === user.id ||
          (user.driver_id && c.participant_driver_id === user.driver_id) ||
          c.participant_role === 'passenger'
        );
      }
      // Passengers see everything they started
      return true;
    });
  }, [conversations, user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 700));
    setRefreshing(false);
  }, []);

  const handleStart = async (conv: Conversation, invalidId: boolean) => {
    setActiveInvalidId(invalidId);
    await addConversation(conv);
    if (user && !invalidId) {
      supabase.from('conversations').upsert([{
        id:                    conv.id,
        participant_id:        conv.participant_id,
        participant_name:      conv.participant_name,
        participant_role:      conv.participant_role,
        participant_driver_id: conv.participant_driver_id ?? null,
        participant_phone:     conv.participant_phone     ?? null,
        participant_vehicle:   conv.participant_vehicle   ?? null,
        passenger_id:          user.id,
        passenger_name:        user.full_name || 'Passenger',
        last_message:          '',
        last_message_at:       new Date().toISOString(),
        unread_count:          0,
      }]).then(({ error }) => { if (error) console.warn('[Messages] upsert conv:', error.message); });
    }
    setActiveConv(conv);
  };

  const confirmDelete = (id: string) => {
    iosAlert('Delete conversation', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteConversation(id) },
    ]);
  };

  // Inline chat view (hides bottom tabs by filling the full screen)
  if (activeConv) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ChatScreen
          conversation={activeConv}
          onBack={() => { setActiveConv(null); setActiveInvalidId(false); }}
          isDark={isDark}
          invalidId={activeInvalidId}
        />
      </GestureHandlerRootView>
    );
  }

  return (
    <>
      <GestureHandlerRootView style={[S.root, { backgroundColor: 'transparent' }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} animated />

        <View style={[S.header, { backgroundColor: 'transparent', paddingTop: topPad + 12, borderBottomColor: border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[S.headerTitle, { color: textColor }]}>Messages</Text>
          </View>
          {/* <Pressable style={S.newBtn} onPress={() => setNewChatVisible(true)}>
            <HugeiconsIcon icon={PlusSignIcon} size={23} color={'#fff'} />
          </Pressable> */}

          <View style={[S.menuList, {backgroundColor: Colors.overlay,  alignItems:'center', justifyContent:'center'}]}>

                  {/* Glass, not a coloured pill. */}
                  <Glass
                    variant="regular"
                    interactive
                    radius={30}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                    fallbackIntensity={40}
                    fallbackTint={isDark ? Colors.overlayLight : Colors.border}
                  />

                  {/* <Pressable
                    onPress={toggleSearch}
                    accessibilityRole="button"
                    accessibilityLabel="Find a driver"
                  >
                    <HugeiconsIcon
                      icon={Search02Icon}
                      size={24}
                      color={textColor}
                    />
                  </Pressable> */}

                  <HugeiconsIcon
                    icon={Search02Icon}
                    size={24}
                    color={ios.label}
                  />

                  <Pressable onPress={() => setNewChatVisible(true)}>
                    <HugeiconsIcon icon={PlusSignIcon} size={23} color={ios.label} />
                  </Pressable>
          
                  <View style={{backgroundColor: 'isDark ? Colors.borderLight : Colors.background',  padding: 8, borderRadius: 50, alignItems: 'center', justifyContent: 'center' }}>
                    <Glass
                      variant="regular"
                      interactive
                      radius={30}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                      fallbackIntensity={40}
                      fallbackTint={ios.systemGray3}
                    />

                    <SymbolView name="person.fill" size={22} tintColor={ios.label}  fallback={ios.label} />
                  </View>
                </View>
        </View>

        <FlatList
          data={visible}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          renderItem={({ item }) => (
            <ConvItem
              item={item}
              isDark={isDark}
              textColor={textColor}
              subTextColor={subTextColor}
              cardBg={cardBg}
              border={border}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                // Direct chats navigate to the dedicated route so bottom tabs stay hidden
                if (item.id.startsWith('direct_')) {
                  router.push({
                    pathname: '/direct-chat/[conversationId]',
                    params: {
                      conversationId: item.id,
                      driverName:     item.participant_name,
                      driverId:       item.participant_driver_id ?? '',
                    },
                  });
                } else {
                  setActiveConv(item);
                }
              }}
              onDelete={() => confirmDelete(item.id)}
            />
          )}
          // ListEmptyComponent={
          //   <View style={[S.empty]}>
          //     {/* <HugeiconsIcon icon={ChartBubbleIcon} size={52} color={subTextColor} /> */}
          //     <Text style={[S.emptyTitle, { color: textColor }]}>Opps!...No message yet.</Text>
          //     <Text style={[S.emptySub, { color: subTextColor }]}>
          //       {user?.role === 'driver'
          //         ? (<>
          //             <Text>
          //               Tap <Text style={[{ color: Colors.primary }]}> + </Text> to start a conversation.
          //             </Text>
          //           </>)
          //         :
          //           <>
          //             <Text>
          //               Tap <Text style={[{ color: Colors.primary }]}> + </Text> to start a conversation.
          //             </Text>
          //           </>
          //       }
          //     </Text>
          //   </View>
          // }
          ListEmptyComponent={
            <View style={S.emptyState}>
              <View style={S.emptyIconBg}>
                <HugeiconsIcon icon={Chat} size={60}  color={subTextColor}/>
              </View>
              <Text style={[S.emptyTitle,{color: subTextColor}]}>No messages yet!</Text>
              <Text style={[S.emptySubtitle, { color: subTextColor }]}>Recent {user?.role === 'driver'
                  ? (<>
                      <Text>
                        Tap <Text style={[{ color: Colors.primary }]}> + </Text> to start a conversation.
                      </Text>
                    </>)
                  :
                    <>
                      <Text>
                        Tap <Text style={[{ color: Colors.primary }]}> + </Text> to start a conversation.
                      </Text>
                    </>
                }
              </Text>
            </View>
          }
        />
      </GestureHandlerRootView>

      <NewChatModal
        visible={newChatVisible}
        onClose={() => setNewChatVisible(false)}
        isDark={isDark}
        onStart={handleStart}
      />
    </>
  );
}

// ─── Stylesheet ───────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root:    { flex: 1 },
  backdrop: { flex: 1 },
  handle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(154,154,154,0.3)', alignSelf: 'center', marginBottom: 4 },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontFamily: 'Poppins_700Bold', fontSize: 24 },
  newBtn: { width: 40, height: 40, borderRadius: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },

  menuList: {
    borderRadius: 30,
    padding: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    overflow: "hidden",
    position: 'relative',
    right: 0, top: 1,
    paddingLeft: 12
  },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "flex-start",
    justifyContent: "center",
  },



  convItem:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  convText:     { flex: 1, gap: 2 },
  convTopRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convName:     { fontFamily: 'Poppins_600SemiBold', fontSize: 15, flex: 1 },
  convTime:     { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  convBottomRow:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convLast:     { fontFamily: 'Poppins_400Regular', fontSize: 13, flex: 1 },
  convDriverId: { fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 1 },

  onlineDot: { position: 'absolute', top: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary, borderWidth: 2, borderColor: '#fff' },
  // Small badge overlaid on avatar for direct conversations
  directBadge: { position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },

  badge:     { backgroundColor: Colors.primary, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 6 },
  badgeText: { fontFamily: 'Poppins_700Bold', fontSize: 10, color: '#fff' },
  deleteSwipe: { width: 70, alignItems: 'center', justifyContent: 'center' },

  // empty:        { alignItems: 'center', paddingHorizontal: 40, gap: 12, margin: 'auto' },
  // emptyTitle:   { fontFamily: 'Poppins_500Medium', fontSize: 18, textAlign: 'center' },
  // emptySub:     { fontFamily: 'Poppins_400Regular', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  // emptyBtn:     { borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  // emptyBtnText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#fff' },



  // Empty state
  emptyState: {
    alignItems: "center",
    alignSelf: 'center',
    justifyContent: 'flex-start',
    paddingTop: 250,
    paddingHorizontal: 40,
    flex: 1,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 16,
    color: Colors.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    // lineHeight: 10,
    paddingVertical: 15
  },


  // New Chat Modal
  newSheet:      { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, paddingBottom: 344, gap: 14 },
  newTitle:      { fontFamily: 'Poppins_700Bold', fontSize: 20 },
  newSub:        { fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20 },

  // Tab row inside modal
  tabRow:        { flexDirection: 'row', borderRadius: 50, padding: 4, gap: 4 },
  tabBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 50 },
  tabBtnText:    { fontFamily: 'Poppins_600SemiBold', fontSize: 13 },

  newInputRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 50, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1 },
  newInput:      { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 15, padding: 0, letterSpacing: 1 },
  newSearchBtn:  { borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  newSearchBtnText: { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },

  driverError:   { fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 18, marginTop: -6 },

  resultCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, borderWidth: 1 },
  resultName:    { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
  resultDriverId:{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, marginTop: 1 },
  resultSub:     { fontFamily: 'Poppins_400Regular', fontSize: 12, marginTop: 2 },
  chatBtn:       { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  chatBtnText:   { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#fff' },

  warnBanner: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10 },
  warnText:   { fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 18, flex: 1 },

  chatHeader:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 10, borderBottomWidth: 1 },
  chatBack:       { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chatHeaderInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  chatHeaderName: { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
  chatHeaderSub:  { fontFamily: 'Poppins_500Medium', fontSize: 12, marginTop: 1 },
  chatCallBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: `${Colors.primary}20`, alignItems: 'center', justifyContent: 'center' },

  recBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  recDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  recText:   { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 12 },

  messageList:   { paddingVertical: 12, paddingBottom: 20, flexGrow: 1 },
  emptyChat:     { alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 100 },
  emptyChatText: { fontFamily: 'Poppins_400Regular', fontSize: 14 },

  inputBar:  { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1 },
  textInput: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontFamily: 'Poppins_400Regular', fontSize: 14, maxHeight: 120, minHeight: 42 },
  sendBtn:   { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },

  bubbleWrap:     { marginVertical: 2, paddingHorizontal: 12 },
  bubbleWrapMe:   { alignItems: 'flex-end' },
  bubbleWrapThem: { alignItems: 'flex-start' },
  bubble:         { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  bubbleMe:       { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleThem:     { borderBottomLeftRadius: 4 },
  bubbleText:     { fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 21 },
  bubbleMeta:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bubbleTime:     { fontFamily: 'Poppins_400Regular', fontSize: 10 },
  swipeActions:   { flexDirection: 'row', alignItems: 'center' },
  swipeAction:    { width: 50, height: '100%' as any, alignItems: 'center', justifyContent: 'center' },

  infoSheet:     { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 30, paddingTop: 10, paddingBottom: 50, gap: 14 },
  infoHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoTitle:     { fontFamily: 'Poppins_700Bold', fontSize: 18, marginTop: 20 },
  infoAvatarRow: { alignItems: 'center', marginVertical: 16, gap: 6 },
  infoName:      { fontFamily: 'Poppins_700Bold', fontSize: 20 },
  infoSub:       { fontFamily: 'Poppins_400Regular', fontSize: 14 },
  infoActions:   { flexDirection: 'row', gap: 12, marginTop: 8 },
  infoActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  infoActionText:{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#fff' },
});