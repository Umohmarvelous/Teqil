// components/chat/ChatScreen.tsx
//
// THE chat screen. One implementation, two entry points.
//
// ── Why this file exists ────────────────────────────────────────────────────
// There used to be two chat screens and nobody knew it. `messages.tsx` carried
// this implementation inline — the doodle wallpaper, grouped bubbles with
// tails, voice notes, reply quoting, the contact card. Meanwhile
// `app/direct-chat/[conversationId].tsx`, which is the route NINE screens
// actually navigate to, had its own standalone copy built on a MessageBubble
// last touched in May, and imported nothing from here despite comments in
// messages.tsx claiming it did.
//
// So every improvement went into the screen almost nobody opened, and the
// screen everyone opened stayed frozen. That is why the wallpaper kept
// "disappearing" and why it looked like a second chat screen had appeared.
//
// Both entry points now render this. There is no second copy to drift.
//
// ── Divided how ─────────────────────────────────────────────────────────────
// Shape lives in `components/chat/` — ChatBubble owns grouping, tails and date
// separators; ChatDoodle owns the wallpaper; ContactCard owns the person
// sheet. This file owns the SCREEN: the list, the composer, recording, realtime
// wiring and reply state. Anything that is a decision about how a message looks
// belongs one level down, not in here.

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  ArrowLeft01Icon,
  Message02Icon,
  TelegramIcon,
  MoreVerticalIcon,
  CallIcon,
  Mic01Icon,
  PlayIcon,
  PauseIcon,
  MicOff01Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons';
import {
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  useAudioPlayerStatus,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio';

import { useAuthStore } from '@/src/store/useStore';
import {
  useMessagesStore,
  type Conversation,
  type Message,
} from '@/src/store/useMessagesStore';
import { Colors } from '@/constants/colors';
import Avatar from '@/components/Avatar';
import { generateId } from '@/src/utils/helpers';
import { Glass, iosAlert, useIOSTheme } from '@/components/ios';
import ChatDoodle from '@/components/chat/ChatDoodle';
import ContactCard from '@/components/chat/ContactCard';
import {
  ChatBubble,
  DateSeparator,
  shouldGroup,
  sameDay,
  type ChatBubbleMessage,
} from '@/components/chat/ChatBubble';
import { getContactPhone, formatNgPhone } from '@/src/services/contact';

// ─── Helpers ───────── ──────────── ──────────── ─────────── ─────────── ───────────

/**
 * Dials a chat contact.
 *
 * The number is fetched at press time rather than carried on the conversation:
 * `get_contact_phone` re-checks that the two of you still share a conversation,
 * that they still allow sharing, and that neither has blocked the other. A
 * number cached at conversation-creation time would outlive all three.
 */
async function placeCall(userId: string | undefined, name?: string) {
  if (!userId || userId.startsWith('invalid_')) {
    iosAlert('No phone number', 'This contact has no number on record.');
    return;
  }
  const phone = await getContactPhone(userId);
  if (!phone) {
    iosAlert(
      'Number not available',
      `${name || 'This person'} has not shared a phone number. You can still message them here.`,
    );
    return;
  }
  const url = `tel:${phone}`;
  const ok = await Linking.canOpenURL(url).catch(() => false);
  // The simulator has no dialler, and a device with calling disabled will refuse
  // too. Saying so beats a button that appears to do nothing.
  if (!ok) {
    iosAlert('Cannot place calls', `This device cannot dial ${formatNgPhone(phone)}.`);
    return;
  }
  Linking.openURL(url);
}

// ─── Contact Info Modal (unchanged) ──────────────────────────────────────────

function ContactInfoModal({
  visible, onClose, conversation,
}: { visible: boolean; onClose: () => void; conversation: Conversation | null }) {
  const ios = useIOSTheme();
  if (!conversation) return null;

  // The card owns the layout AND the phone lookup; this is only the sheet that
  // presents it. The old inline version duplicated an avatar, a name and a Call
  // button that dialled a number the app was no longer allowed to cache.
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={S.backdrop} onPress={onClose} />
        <View style={[S.infoSheet, { backgroundColor: ios.systemGroupedBackground }]}>
          <View style={[S.handle, { backgroundColor: ios.tertiaryLabel }]} />
          <ContactCard
            person={{
              id: conversation.participant_id,
              full_name: conversation.participant_name,
              username: conversation.participant_username,
              profile_photo: conversation.participant_photo,
              role: conversation.participant_role,
              driver_id: conversation.participant_driver_id,
              vehicle_details: conversation.participant_vehicle,
              park_name: conversation.participant_park_name,
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

/** mm:ss from milliseconds, for the live recording counter. */
function formatRecDuration(ms: number): string {
  const total = Math.max(0, Math.floor((ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ─── Voice note ──────────────────────────────────────────────────────────────
//
// A received voice note used to render as the literal text "🎤 Voice message",
// which was honest about the recording being stubbed but useless once it isn't.
//
// The player is per-bubble because `useAudioPlayer` binds one native player to
// one source. Sharing a single player across the list would mean starting a
// second note silently stops the first with no way to show which is playing —
// and the progress bar would jump between bubbles.

function VoiceNote({ uri, isMe, textColor }: { uri: string; isMe: boolean; textColor: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);

  const tint = isMe ? '#fff' : textColor;
  const track = isMe ? 'rgba(255,255,255,0.28)' : 'rgba(120,120,128,0.28)';

  const duration = status?.duration ?? 0;
  const position = status?.currentTime ?? 0;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  const toggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (status?.playing) {
      player.pause();
      return;
    }
    // Replay from the start once it has finished, rather than sitting at the
    // end doing nothing when tapped.
    if (duration > 0 && position >= duration - 0.05) player.seekTo(0);
    player.play();
  }, [player, status?.playing, position, duration]);

  const secs = Math.max(0, Math.round((duration || 0) - (position || 0)));
  const label = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <View style={S.voiceRow}>
      <Pressable
        onPress={toggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={status?.playing ? 'Pause voice message' : 'Play voice message'}
      >
        <HugeiconsIcon
          icon={status?.playing ? PauseIcon : PlayIcon}
          size={22}
          color={tint}
        />
      </Pressable>

      <View style={[S.voiceTrack, { backgroundColor: track }]}>
        <View style={[S.voiceFill, { width: `${progress * 100}%`, backgroundColor: tint }]} />
      </View>

      <Text style={[S.voiceTime, { color: tint }]}>{label}</Text>
    </View>
  );
}

// ─── Message Bubble (named export for direct-chat route) ──────────────────────

/**
 * Kept as a named export because `direct-chat/[conversationId].tsx` imports it.
 *
 * The bubble itself now lives in `components/chat/ChatBubble.tsx` — grouping,
 * tails, date separators and inline meta are all shape decisions that belong
 * with the other chat components, not buried in a 1,500-line screen. This is
 * the adapter that keeps the old call sites working.
 */
export function MessageBubble({
  message, isMe, onReply, onDelete, onCopy,
}: {
  message: Message; isMe: boolean;
  onReply: () => void; onDelete: () => void; onCopy: () => void;
  // Accepted and ignored: the bubble reads the iOS palette itself now.
  isDark?: boolean; textColor?: string; subTextColor?: string;
}) {
  return (
    <ChatBubble
      message={message as ChatBubbleMessage}
      isMe={isMe}
      onReply={onReply}
      onDelete={onDelete}
      onCopy={onCopy}
      renderAudio={(uri, mine, tint) => <VoiceNote uri={uri} isMe={mine} textColor={tint} />}
    />
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
  // What the composer is replying to. Held as state rather than pasted into the
  // text field: the old version prefixed the draft with "↩ Name: quoted text",
  // which the recipient then received as literal characters and which the
  // sender had to delete by hand to cancel.
  const [replyTo,     setReplyTo]     = useState<Message | null>(null);

  // expo-audio is hook-based, so the recorder is created here rather than
  // inside the press handler the way the old imperative expo-av API allowed.
  const recorder      = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  const listRef      = useRef<FlatList>(null);
  const inputRef     = useRef<TextInput>(null);
  const typingTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets       = useSafeAreaInsets();

  const subscribeRef = useRef(subscribeToRealtime);
  const markReadRef  = useRef(markRead);
  useEffect(() => { subscribeRef.current = subscribeToRealtime; });
  useEffect(() => { markReadRef.current  = markRead; });


  // One palette, from the theme. This screen used to derive six colours from an
  // `isDark` boolean with hard-coded hexes, which is why it drifted away from
  // the rest of the app every time the theme changed.
  const ios       = useIOSTheme();
  const textColor = ios.label;
  const subTextColor = ios.secondaryLabel;
  const cardBg    = ios.secondarySystemBackground;
  const border    = ios.separator;
  const inputBg   = ios.tertiarySystemFill;
  const topPad    = Platform.OS === 'web' ? 67 : insets.top;
  // Height of the floating header. The list runs under it and is pushed clear
  // with a content inset, which is what lets the glass sample real content.
  const chromeTop = topPad + 62;
  // Banners float below the header rather than sitting in flow, so they do not
  // shove the list out from under the glass. Their height is measured because
  // it depends on how the warning text wraps.
  const [bannerH, setBannerH] = useState(0);

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const quoted = replyTo;
    setReplyTo(null);

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
      reply_to:        quoted
        ? {
            id:      quoted.id,
            author:  quoted.sender_id === user.id ? 'You' : quoted.sender_name || 'User',
            preview: quoted.text || 'Voice message',
          }
        : null,
    });
    setSending(false);
  };

  const startRecording = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        iosAlert('Permission required', 'Microphone access is needed for voice messages.');
        return;
      }
      // `allowsRecording` opens the input; `playsInSilentMode` is what lets the
      // note play back when the ringer switch is off, which on iOS is otherwise
      // silent and reads as a broken recording.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { iosAlert('Error', 'Could not start recording.'); }
  };

  const stopRecording = async () => {
    if (!user?.id) return;
    setIsRecording(false);
    try {
      await recorder.stop();
      const uri = recorder.uri;

      // Release the input again so other audio isn't ducked for the rest of the
      // session — iOS keeps the recording route active until told otherwise.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

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
    setIsRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {}
  };

  const handleCall = () => placeCall(conversation.participant_id, conversation.participant_name);

  const handleReply = (m: Message) => {
    // Voice notes are repliable too — the quote just reads "Voice message".
    setReplyTo(m);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    inputRef.current?.focus();
  };

  const handleCopy = async (m: Message) => {
    if (!m.text) return;
    // This used to be guarded by `Platform.OS === 'web'` and used
    // navigator.clipboard, so Copy did nothing at all on a phone — which is
    // every device this app actually ships to.
    await Clipboard.setStringAsync(m.text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style={ios.scheme === 'dark' ? 'light' : 'dark'} />

      {/* The wallpaper is the bottom layer, sized to the WINDOW rather than to
          this container, so the keyboard opening does not re-tile it. */}
      <ChatDoodle />

      {/* Header.
          Glass, like every other bar in the app — this was a flat opaque strip,
          which is why the chat screen read as belonging to a different app than
          the one around it. The material is on an absolutely-positioned layer
          behind the row so the row's own children keep their colours, and the
          list scrolls UNDER it rather than being padded away from it (padding
          the frame leaves the glass nothing to sample and it renders flat). */}
      <View style={[S.chatHeader, { borderBottomColor: border, paddingTop: topPad + 12, height: topPad + 62 }]}>
        <Glass
          variant="regular"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={60}
          fallbackTint={cardBg}
        />
        <Pressable
          onPress={() => { Haptics.selectionAsync(); onBack(); router.back(); }}
          style={S.chatBack}
          hitSlop={8}
          accessibilityLabel="Back"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={25} color={textColor} />
        </Pressable>

        {/* The whole identity block opens the contact sheet, which is how every
            messenger behaves and what a user tries first. */}
        <Pressable
          style={S.chatHeaderInfo}
          onPress={() => { Haptics.selectionAsync(); setInfoVisible(true); }}
          accessibilityLabel={`${conversation.participant_name}, open contact info`}
        >
          <Avatar
            name={conversation.participant_name || 'Driver'}
            photoUri={conversation.participant_photo}
            size={38}
          />
          <View style={{ flex: 1 }}>
            <Text style={[S.chatHeaderName, { color: textColor }]} numberOfLines={1}>
              {conversation.participant_name}
            </Text>
            {otherTyping ? (
              <Text style={[S.chatHeaderSub, { color: ios.tint, fontStyle: 'italic' }]}>
                typing…
              </Text>
            ) : (
              <Text style={[S.chatHeaderSub, { color: subTextColor }]} numberOfLines={1}>
                {conversation.participant_username
                  ? `@${conversation.participant_username}`
                  : conversation.participant_driver_id || 'Tap for contact info'}
              </Text>
            )}
          </View>
        </Pressable>

        <Pressable onPress={handleCall} style={S.chatCallBtn} hitSlop={8} accessibilityLabel="Call">
          <HugeiconsIcon icon={CallIcon} size={21} color={ios.tint} />
        </Pressable>
        <Pressable
          onPress={() => { Haptics.selectionAsync(); setInfoVisible(true); }}
          hitSlop={8}
          accessibilityLabel="More"
        >
          <HugeiconsIcon icon={MoreVerticalIcon} size={22} color={textColor} />
        </Pressable>
      </View>

      <View
        style={[S.bannerStack, { top: chromeTop }]}
        onLayout={(e) => setBannerH(e.nativeEvent.layout.height)}
        pointerEvents="box-none"
      >
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
          {/* A live counter, not just "Recording…": without it there is no way
              to tell a recording that is running from one that silently failed
              to start. */}
          <Text style={[S.recText, { color: Colors.error }]}>
            {formatRecDuration(recorderState.durationMillis)} · release to send
          </Text>
          <Pressable onPress={cancelRecording} hitSlop={8}>
            <Text style={{ color: Colors.error, fontSize: 20, lineHeight: 22 }}>×</Text>
          </Pressable>
        </View>
      )}
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={[S.messageList, { paddingTop: chromeTop + bannerH + 8 }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const prev = messages[index - 1];
          const next = messages[index + 1];
          const newDay = !prev || !sameDay(prev.created_at, item.created_at);
          return (
            <>
              {newDay ? <DateSeparator iso={item.created_at} /> : null}
              <ChatBubble
                message={item as ChatBubbleMessage}
                isMe={item.sender_id === user?.id}
                // A new day always starts a fresh block, whatever the clock gap.
                grouped={!newDay && shouldGroup(prev as ChatBubbleMessage, item as ChatBubbleMessage)}
                hasFollower={
                  !!next &&
                  sameDay(item.created_at, next.created_at) &&
                  shouldGroup(item as ChatBubbleMessage, next as ChatBubbleMessage)
                }
                onReply={() => handleReply(item)}
                onDelete={() => deleteMessage(conversation.id, item.id)}
                onCopy={() => handleCopy(item)}
                renderAudio={(uri, mine, tint) => (
                  <VoiceNote uri={uri} isMe={mine} textColor={tint} />
                )}
              />
            </>
          );
        }}
        ListEmptyComponent={
          <View style={S.emptyChat}>
            <View style={[S.emptyChatCard, { backgroundColor: ios.secondarySystemGroupedBackground }]}>
              <HugeiconsIcon icon={Message02Icon} size={30} color={ios.tint} />
              <Text style={[S.emptyChatText, { color: subTextColor }]}>
                No messages yet. Say hello to {conversation.participant_name || 'them'}.
              </Text>
            </View>
          </View>
        }
      />

      <View style={[S.inputBar, { borderTopColor: border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Glass
          variant="regular"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={60}
          fallbackTint={cardBg}
        />

        {/* What you are replying to, with an explicit way out. */}
        {replyTo ? (
          <View style={[S.replyPreview, { backgroundColor: ios.tertiarySystemFill, borderLeftColor: ios.tint }]}>
            <View style={{ flex: 1 }}>
              <Text style={[S.replyPreviewAuthor, { color: ios.tint }]} numberOfLines={1}>
                {replyTo.sender_id === user?.id ? 'You' : replyTo.sender_name || 'User'}
              </Text>
              <Text style={[S.replyPreviewText, { color: subTextColor }]} numberOfLines={1}>
                {replyTo.text || 'Voice message'}
              </Text>
            </View>
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setReplyTo(null); }}
              hitSlop={10}
              accessibilityLabel="Cancel reply"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={17} color={subTextColor} />
            </Pressable>
          </View>
        ) : null}

        <View style={S.inputRow}>
          <TextInput
            ref={inputRef}
            style={[S.textInput, { backgroundColor: inputBg, color: textColor }]}
            placeholder="Type a message…"
            placeholderTextColor={ios.tertiaryLabel}
            value={text}
            onChangeText={handleTyping}
            multiline
            maxLength={2000}
          />
          <InputRight />
        </View>
      </View>

      <ContactInfoModal
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
        conversation={conversation}
      />
    </KeyboardAvoidingView>
  );
}


const S = StyleSheet.create({
  backdrop: { flex: 1 },
  bannerStack:    { position: 'absolute', left: 0, right: 0, zIndex: 15 },
  chatBack:       { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chatCallBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: `${Colors.primary}20`, alignItems: 'center', justifyContent: 'center' },
  chatHeaderInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  chatHeaderName: { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
  chatHeaderSub:  { fontFamily: 'Poppins_500Medium', fontSize: 12, marginTop: 1 },
  emptyChat:     { alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 100 },
  emptyChatCard: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 20,
    borderRadius: 16,
    maxWidth: 300,
  },
  emptyChatText: { fontFamily: 'Poppins_400Regular', fontSize: 14 },
  handle:  { width: 38, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 6, opacity: 0.35 },
  inputBar:  { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  messageList:   { paddingVertical: 12, paddingBottom: 20, flexGrow: 1 },
  recBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  recDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  recText:   { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 12 },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
  },
  replyPreviewAuthor: { fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
  replyPreviewText:   { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  sendBtn:   { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  textInput: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontFamily: 'Poppins_400Regular', fontSize: 14, maxHeight: 120, minHeight: 42 },
  voiceFill:      { height: '100%', borderRadius: 2 },
  voiceTime:      { fontFamily: 'Poppins_500Medium', fontSize: 11, minWidth: 32, textAlign: 'right' },
  voiceTrack:     { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  warnBanner: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10 },
  warnText:   { fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 18, flex: 1 },
  chatHeader:     { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  voiceRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 168, paddingVertical: 2 },
  infoSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 10, paddingBottom: 34,
    maxHeight: '86%',
  },
});

export default ChatScreen;
