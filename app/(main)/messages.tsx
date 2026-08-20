// app/(main)/messages.tsx
//
// CHANGES vs original:
//   1. ChatScreen and MessageBubble are now named exports so direct-chat/[conversationId].tsx
//      can import ChatScreen without duplicating it.
//   2. NewChatModal: replaced the single search flow with two tabs —
//      "Trip Code" (existing) and "Username" (new).  The Username tab calls
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
  Dimensions,
} from 'react-native';
import { router }               from 'expo-router';
import { useSafeAreaInsets }    from 'react-native-safe-area-context';
import * as Haptics             from 'expo-haptics';
import { useAuthStore }         from '@/src/store/useStore';
import { useSettingsStore }     from '@/src/store/useSettingsStore';
import {
  useMessagesStore,
  type ChatCandidate,
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
  PlayIcon,
  PauseIcon,
  MicOff01Icon,
  UserIcon,        // ← new: used for direct-chat list items
  Car01Icon,       // ← new: used for trip-based list items
  IdentityCardIcon, // ← new: Driver ID tab icon
  Cancel01Icon,
  Chat, // ← new: Driver ID tab icon
  BellOff, // ← new: Driver ID tab icon
} from '@hugeicons/core-free-icons';
import { StatusBar }  from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase }   from '@/src/services/supabase';
import { Glass, iosAlert, IOSBadge, IOSSearchBar, NetworkStatus, SwipeableRow, useIOSTheme } from "@/components/ios";
import * as Clipboard from "expo-clipboard";
import ChatDoodle from "@/components/chat/ChatDoodle";
import ContactCard from "@/components/chat/ContactCard";
import {
  ChatBubble,
  DateSeparator,
  shouldGroup,
  sameDay,
  type ChatBubbleMessage,
} from "@/components/chat/ChatBubble";
import { getContactPhone, formatNgPhone } from '@/src/services/contact';
import { SymbolView } from 'expo-symbols';
// Voice notes run on expo-audio.
//
// This used to be a stub whose permission request always returned "denied",
// left behind when expo-av was removed — so the whole recording UI was live and
// did nothing. expo-audio is the supported replacement and is hook-based rather
// than imperative, which is why the recorder is created at the top of
// ChatScreen instead of inside the press handler.
import {
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  useAudioPlayerStatus,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio';

  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");


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
  const { fetchConversationByDriverId, searchUsersForChat } = useMessagesStore();

  // Username is the only way in. The "Trip Code" tab is gone: a trip code
  // resolved to a person through the same lookup a username does, so it was a
  // second door to one room — and it was the door that still accepted a driver
  // badge ID after IDs were removed from search everywhere else.
  const [tab] = useState<SearchTab>('driver');
  const [query,   setQuery]   = useState('');
  const [status,  setStatus]  = useState<SearchStatus>('idle');
  const [result,  setResult]  = useState<DriverRecord | null>(null);

  // Handle tab — loading state for fetchConversationByHandle
  const [driverLoading, setDriverLoading] = useState(false);
  const [driverError,   setDriverError]   = useState('');

  // Type-ahead. Debounced because every keystroke is a network round trip, and
  // an un-debounced field fires one per character while the user is still
  // typing the handle they already know.
  const [suggestions, setSuggestions] = useState<ChatCandidate[]>([]);
  useEffect(() => {
    if (tab !== 'driver') { setSuggestions([]); return; }
    const typed = query.trim();
    if (typed.replace(/^@/, '').length < 2) { setSuggestions([]); return; }

    let cancelled = false;
    const t = setTimeout(async () => {
      const found = await searchUsersForChat(typed);
      if (!cancelled) setSuggestions(found);
    }, 280);

    return () => { cancelled = true; clearTimeout(t); };
  }, [query, tab, searchUsersForChat]);

  const textColor = isDark ? Colors.textWhite     : Colors.text;
  const subTextColor  = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg    = isDark ? Colors.primaryDarker : '#FFFFFF';
  const border    = isDark ? 'rgba(255,255,255,0.12)' : '#E8ECF0';
  const inputBg   = isDark ? Colors.background    : '#F4F6FA';
  // const tabBg     = isDark ? '#1A1A2E' : '#F0F2F5';
  const bg        = isDark ? Colors.background : Colors.textWhite;
  const tabBg     = isDark ? Colors.textSecondary : Colors.border;

  useEffect(() => {
    if (!visible) {
      setQuery(''); setResult(null); setStatus('idle');
      setDriverError(''); setDriverLoading(false);
    }
  }, [visible]);

  const reset = () => { setResult(null); setStatus('idle'); setDriverError(''); };

  // ── Driver / passenger lookup ─────────────────────────────────────────────
  //
  // This used to run three `select(...)` queries against `public.users` — by
  // driver_id, by id, then a wildcard `ilike` — each of them pulling `phone`.
  // Two things were wrong with that. It reads a column the app has no business
  // reading in bulk (see migration_contact_phone.sql), and it only worked at all
  // because `users` was not yet locked down; the same code returns nothing once
  // it is.
  //
  // `find_user_for_chat` is the RPC that already exists for exactly this. It
  // resolves a USERNAME — and, since migration_user_privacy.sql, only a
  // username — runs SECURITY DEFINER so it works under RLS, and returns only
  // the fields a chat header needs: no phone number, no email.
  const handleTripSearch = async () => {
    const raw = query.trim();
    if (!raw || !user?.id) return;
    setStatus('searching');
    setResult(null);

    let found: DriverRecord | null = null;
    try {
      // Raw input, not `normaliseDriverId(raw)`: the RPC takes a bare handle and
      // strips a leading "@" itself, so forcing a "DRV-" prefix here would turn
      // every lookup into a guaranteed miss.
      const { data, error } = await supabase.rpc('find_user_for_chat', { p_handle: raw });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.id) found = row as DriverRecord;
    } catch (err: any) {
      console.warn('[Messages] chat lookup error:', err?.message ?? err);
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
      // No phone here on purpose — the Call button resolves it on demand via
      // `get_contact_phone`, so turning sharing off takes effect immediately
      // rather than surviving in a cached conversation record.
      last_message:          '',
      last_message_at:       new Date().toISOString(),
      unread_count:          0,
    };
    onStart(conv, isInvalid);
    onClose();
  };

  // ── Driver ID direct-chat (new) ───────────────────────────────────────────
  /** Open a chat with a handle — from the field, or from a tapped suggestion. */
  const openWith = async (handle: string) => {
    const raw = handle.trim();
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
          driverName:     driverUser.full_name ?? 'Emilgo user',
          driverId:       driverUser.driver_id ?? '',
        },
      });
    } catch (err: any) {
      setDriverError(err?.message ?? 'Nobody found. Check the username or ID and try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setDriverLoading(false);
    }
  };

  /** Submit whatever is in the field. */
  const handleHandleSearch = () => openWith(query);

  const isFound   = status === 'found';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end',  }}
      >
        <Pressable style={S.backdrop} onPress={onClose} />
        <View style={[S.newSheet, { backgroundColor: tabBg }]}>
          <View style={S.handle} />
          <Text style={[S.newTitle, { color: textColor }]}>New Message</Text>

          <Text style={[S.newSub, { color: subTextColor }]}>
            Type a username like @danieloky — suggestions appear as you type
          </Text>

          {/* ── Input ── */}
          <View style={[S.newInputRow, { backgroundColor: inputBg, borderColor: border }]}>
            <HugeiconsIcon icon={Search01Icon} size={18} color={subTextColor} />
            <TextInput
              style={[S.newInput, { color: textColor }]}
              placeholder="@username"
              placeholderTextColor={subTextColor}
              value={query}
              onChangeText={(v) => { setQuery(v); reset(); }}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleHandleSearch}
            />
            {query.length > 0 && (
              <Pressable hitSlop={8} onPress={() => { setQuery(''); reset(); }}>
                <Text style={{ color: subTextColor, fontSize: 18 }}>×</Text>
              </Pressable>
            )}
          </View>

          {/* Type-ahead results. Tapping one is unambiguous — you can see who
              you are about to message before the chat opens. */}
          {tab === 'driver' && suggestions.length > 0 ? (
            <View style={S.suggestionList}>
              {suggestions.map((person) => (
                <Pressable
                  key={person.id}
                  style={({ pressed }) => [
                    S.suggestionRow,
                    { borderBottomColor: border },
                    pressed && { backgroundColor: inputBg },
                  ]}
                  onPress={() => openWith(person.username ? `@${person.username}` : person.driver_id ?? '')}
                >
                  <Avatar name={person.full_name || 'User'} photoUri={person.profile_photo ?? undefined} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={[S.suggestionName, { color: textColor }]} numberOfLines={1}>
                      {person.full_name || 'Emilgo user'}
                    </Text>
                    <Text style={[S.suggestionMeta, { color: subTextColor }]} numberOfLines={1}>
                      {person.username ? `@${person.username}` : person.driver_id}
                      {person.vehicle_details ? ` · ${person.vehicle_details}` : ''}
                    </Text>
                  </View>
                  <Text style={[S.suggestionRole, { color: Colors.primary }]}>{person.role}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Handle lookup error */}
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
              onPress={handleHandleSearch}
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
                          ? <Text style={[S.resultSub, { color: subTextColor }]}> {result.vehicle_details}</Text>
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

/**
 * People matching the search who are NOT already in the chat list.
 *
 * WhatsApp's search does exactly this: your own chats first, then everyone else
 * who could be one. Without the second section a search for a driver you have
 * never messaged returns "no results" even though they are right there in the
 * database — which is what made the old search feel broken.
 */
function NewContactResults({
  hits,
  searching,
  query,
  onPick,
}: {
  hits: ChatCandidate[];
  searching: boolean;
  query: string;
  onPick: (c: ChatCandidate) => void;
}) {
  const t = useIOSTheme();

  if (searching && !hits.length) {
    return (
      <View style={S.newSectionSpinner}>
        <ActivityIndicator color={t.tint} />
      </View>
    );
  }
  if (!hits.length) {
    return (
      <View style={S.newSectionEmpty}>
        <Text style={[S.newSectionEmptyText, { color: t.tertiaryLabel }]}>
          No username starts with “{query.replace(/^@/, '')}”. Handles are matched
          from the start, so check the spelling.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={[S.newSectionTitle, { color: t.tertiaryLabel }]}>START A NEW CHAT</Text>
      {hits.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => onPick(c)}
          style={({ pressed }) => [
            S.newContactRow,
            { borderBottomColor: t.separator },
            pressed && { backgroundColor: t.tertiarySystemFill },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Message ${c.full_name || c.username}`}
        >
          <Avatar name={c.full_name || c.username || 'User'} photoUri={c.profile_photo} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[S.newContactName, { color: t.label }]} numberOfLines={1}>
              {c.full_name || c.username}
            </Text>
            <Text style={[S.newContactMeta, { color: t.tertiaryLabel }]} numberOfLines={1}>
              {[c.username ? `@${c.username}` : null, c.driver_id, c.vehicle_details]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {c.avg_rating ? (
            <Text style={[S.newContactRating, { color: t.secondaryLabel }]}>
              ★ {c.avg_rating.toFixed(1)}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

/** Bold just the part of `text` that matched, WhatsApp-style. */
function Highlight({
  text, query, style, highlightColour, ...rest
}: {
  text: string;
  query: string;
  style?: any;
  highlightColour: string;
} & React.ComponentProps<typeof Text>) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return <Text style={style} {...rest}>{text}</Text>;
  return (
    <Text style={style} {...rest}>
      {text.slice(0, i)}
      <Text style={{ color: highlightColour, fontFamily: 'Poppins_700Bold' }}>
        {text.slice(i, i + query.length)}
      </Text>
      {text.slice(i + query.length)}
    </Text>
  );
}

function ConvItem({
  item, onPress, onDelete, query = '',
}: {
  item:     Conversation;
  onPress:  () => void;
  onDelete: () => void;
  /** Current search term, so the matched span can be highlighted. */
  query?:   string;
}) {
  const ios = useIOSTheme();

  // WhatsApp's rule: a time for today, "Yesterday", a weekday inside a week,
  // then a date. A bare clock time on a three-week-old chat is meaningless.
  const timeStr = (() => {
    if (!item.last_message_at) return '';
    const d = new Date(item.last_message_at);
    const now = new Date();
    const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
    if (days === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return 'Yesterday';
    if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
  })();

  // Direct chats get a person icon; trip-based chats keep the default
  const isDirectChat = item.id.startsWith('direct_');
  const unread = item.unread_count ?? 0;
  const textColor = ios.label;
  const subTextColor = ios.secondaryLabel;
  const border = ios.separator;

  return (
    <SwipeableRow
      actions={[
        {
          key: 'delete',
          label: 'Delete',
          symbol: 'trash.fill',
          color: ios.systemRed,
          destructive: true,
          // Deleting a conversation destroys its whole history and cannot be
          // undone, so a full swipe asks first. The old row deleted outright.
          onPress: () =>
            iosAlert(
              `Delete chat with ${item.participant_name || 'this contact'}?`,
              'The messages in this conversation will be removed from this device.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: onDelete },
              ],
            ),
        },
      ]}
    >
      <Pressable
        style={({ pressed }) => [
          S.convItem,
          { backgroundColor:  'transparent', borderBottomColor: border },
          pressed && { opacity: 0.85 },
        ]}
        onPress={onPress}
      >
        <View style={{ position: 'relative' }}>
          <Avatar
            name={item.participant_name || 'Driver'}
            photoUri={item.participant_photo}
            size={50}
          />
          {/* Direct-chat badge */}
          {isDirectChat && (
            <View style={[S.directBadge, { backgroundColor: ios.tint, borderColor: ios.systemBackground }]}>
              <HugeiconsIcon icon={UserIcon} size={9} color="#fff" />
            </View>
          )}
          {/* The green dot here was driven by `unread_count`, so it claimed the
              person was ONLINE whenever they had sent something unread. It said
              nothing true and duplicated the badge below, so it is gone. */}
        </View>
        <View style={S.convText}>
          <View style={S.convTopRow}>
            <Highlight
              text={item.participant_name || 'Driver'}
              query={query}
              highlightColour={ios.tint}
              style={[S.convName, { color: textColor }, unread > 0 && S.convNameUnread]}
              numberOfLines={1}
            />
            <Text style={[S.convTime, { color: unread > 0 ? ios.tint : subTextColor }]}>
              {timeStr}
            </Text>
          </View>
          <View style={S.convBottomRow}>
            <Text
              style={[
                S.convLast,
                { color: unread > 0 ? textColor : subTextColor },
                unread > 0 && S.convLastUnread,
              ]}
              numberOfLines={1}
            >
              {item.last_message || (isDirectChat ? 'Direct message' : 'Tap to start chatting')}
            </Text>
            {/* The kit's badge, which caps at 99+. The hand-rolled one capped at
                "9+", so a busy chat looked identical at 10 messages and at 400. */}
            <IOSBadge count={unread} />
          </View>
          {item.participant_username || item.participant_driver_id ? (
            <Highlight
              text={
                item.participant_username
                  ? `@${item.participant_username}`
                  : item.participant_driver_id!
              }
              query={query}
              highlightColour={ios.tint}
              style={[S.convDriverId, { color: ios.tertiaryLabel }]}
              numberOfLines={1}
            />
          ) : null}
        </View>
      </Pressable>
    </SwipeableRow>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export interface MessagesTabProps {
  /**
   * Fires when a chat opens or closes.
   *
   * The tab shell owns the floating tab bar, so this screen cannot hide it by
   * itself — it reports, and the layout decides.
   */
  onChatOpenChange?: (open: boolean) => void;
}

export default function MessagesTab({ onChatOpenChange }: MessagesTabProps = {}) {
  const insets = useSafeAreaInsets();
  const { theme }  = useSettingsStore() ;
  const { user }   = useAuthStore();
  const {
    conversations, addConversation, deleteConversation, subscribeToRealtime,
    searchUsersForChat, startDirectChat,
  } = useMessagesStore();
  
  
  const ios = useIOSTheme();


  // Live contact search. The bar used to be `asButton` and opened an overlay
  // that was commented out, so tapping Search did nothing at all.
  const [query, setQuery] = useState("");
  // Debounced copy of `query`, used only for the REMOTE lookup — filtering the
  // local list is instant and should not wait 300ms.
  const [remoteQuery, setRemoteQuery] = useState("");
  const [remoteHits, setRemoteHits] = useState<ChatCandidate[]>([]);
  const [remoteSearching, setRemoteSearching] = useState(false);

  useEffect(() => {
    const h = setTimeout(() => setRemoteQuery(query.trim()), 300);
    return () => clearTimeout(h);
  }, [query]);


  const [activeConv,      setActiveConv]      = useState<Conversation | null>(null);
  const [activeInvalidId, setActiveInvalidId] = useState(false);

  // Report chat open/closed to the tab shell so it can hide the floating tab
  // bar. Also fires `false` on unmount, so switching tabs while a chat is open
  // can never strand the bar hidden.
  useEffect(() => {
    onChatOpenChange?.(!!activeConv);
    return () => onChatOpenChange?.(false);
  }, [activeConv, onChatOpenChange]);

  const [newChatVisible,  setNewChatVisible]  = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);

  const isDark    = theme === 'dark';
  // const bg        = isDark ? Colors.background : Colors.textWhite;
  const textColor = isDark ? Colors.textWhite     : Colors.text;
  const subTextColor  = isDark ? Colors.textSecondary : Colors.textTertiary;
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

  // Local filter: instant, over what is already on screen.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visible;
    const needle = q.replace(/^@/, '');
    return visible.filter((c) =>
      [
        c.participant_name,
        c.participant_username,
        c.participant_driver_id,
        c.last_message,
        c.trip_code,
      ]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(needle)),
    );
  }, [visible, query]);

  // Remote lookup: people you have NOT chatted with yet. This is what makes the
  // search bar answer "who can I message?" rather than only "which of my
  // existing chats mentions this word?".
  useEffect(() => {
    const q = remoteQuery.replace(/^@/, '');
    if (q.length < 2) {
      setRemoteHits([]);
      return;
    }
    let alive = true;
    setRemoteSearching(true);
    searchUsersForChat(q)
      .then((rows) => {
        if (!alive) return;
        // Anyone already in the list above would be a duplicate row.
        const known = new Set(visible.map((c) => c.participant_id));
        setRemoteHits(rows.filter((r) => r.id !== user?.id && !known.has(r.id)));
      })
      .finally(() => alive && setRemoteSearching(false));
    return () => {
      alive = false;
    };
  }, [remoteQuery, searchUsersForChat, visible, user?.id]);

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

  /**
   * Open (or create) a chat with someone found by the search bar.
   *
   * `startDirectChat` is idempotent on the conversation id, so tapping the same
   * person twice reopens the existing thread rather than making a second one.
   */
  const openWithCandidate = useCallback(
    async (c: ChatCandidate) => {
      if (!user?.id) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        const conv = await startDirectChat(user.id, c.id);
        setQuery('');
        router.push({
          pathname: '/direct-chat/[conversationId]',
          params: {
            conversationId: conv.id,
            driverName:     conv.participant_name,
            driverId:       conv.participant_driver_id ?? '',
          },
        });
      } catch (e: any) {
        iosAlert("Couldn't open chat", e?.message ?? 'Please try again.');
      }
    },
    [user?.id, startDirectChat],
  );

  const confirmDelete = (id: string) => {
    iosAlert('Delete conversation', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteConversation(id) },
    ]);
  };

  // Inline chat view.
  //
  // Filling the screen is NOT enough to hide the bottom tabs: the tab bar is
  // absolutely positioned at zIndex 100 in app/(main)/_layout.tsx, so it floats
  // over whatever this renders. The layout has to be told, which is what
  // `onChatOpenChange` above is for.
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
      <GestureHandlerRootView style={[S.root, { backgroundColor: ios.systemBackground, paddingTop: topPad }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} animated />

        <View style={S.header}>
          <View style={S.headerInner}>
            <View style={S.menuList}>
              <Pressable style={S.newBtn} onPress={() => setNewChatVisible(true)}>
                <Glass
                  variant="regular"
                  interactive
                  radius={30}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                  fallbackIntensity={40}
                  fallbackTint={isDark ? Colors.overlayLight : Colors.border}
                />
                <HugeiconsIcon icon={PlusSignIcon} size={23} color={textColor} />
              </Pressable>

              <NetworkStatus />

              <View style={[S.menuListContent, {backgroundColor: Colors.overlay,  alignItems:'center', justifyContent:'center'}]}>

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
                    icon={BellOff}
                    size={24}
                    color={textColor}
                    fill={textColor}
                  />
                  
                  <View style={{ backgroundColor: isDark ? Colors.borderLight : Colors.background,  padding: 5, borderRadius: 50, alignItems: 'center', justifyContent: 'center' }}>
                    <Glass
                      variant="regular"
                      interactive
                      radius={30}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                      fallbackIntensity={40}
                      fallbackTint={isDark ? Colors.overlayLight : Colors.border}
                    />
                    <SymbolView name="person.fill" size={24} tintColor={ios.label}  fallback={ios.label} />
                  </View>
                </View>
            </View>

            <View style={{ alignSelf:'flex-start' }}>
              <Text style={[S.headerTitle, { color: textColor }]}>Messages</Text>              
            </View>            
          </View>


          <View style={[S.headerSearch]}>
            <IOSSearchBar
              value={query}
              onChangeText={setQuery}
              onCancel={() => setQuery('')}
              placeholder="Search chats, names or @username"
            />
          </View>
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListFooterComponent={
            query.trim().length >= 2 ? (
              <NewContactResults
                hits={remoteHits}
                searching={remoteSearching}
                query={query.trim()}
                onPick={openWithCandidate}
              />
            ) : null
          }
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          renderItem={({ item }) => (
            <ConvItem
              item={item}
              query={query.trim()}
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

          ListEmptyComponent={
            <View style={S.emptyState}>
              <View style={S.emptyIconBg}>
                <HugeiconsIcon icon={Chat} size={45}  color={subTextColor}/>
              </View>
              <Text style={[S.emptyTitle,{color: subTextColor}]}>No messages yet!</Text>
              
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
  handle:  { width: 38, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 6, opacity: 0.35 },

  header:      { flexDirection: 'column', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 },
  headerInner: { justifyContent: 'space-between', gap: 10 },
  headerTitle: { fontFamily: 'Poppins_700Bold', fontSize: 24 },
  newBtn: { width: 40, height: 40, borderRadius: 50, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

  menuList: {
    padding: 3,
    flexDirection: "row",
    alignItems: "center", 
    justifyContent: 'space-between',
    gap:15,
  },

  menuListContent: {
    borderRadius: 30,
    padding: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    paddingLeft: 12,
  },

  // menuListContent: {
  //   borderRadius: 30,
  //   padding: 3,
  //   flexDirection: "row",
  //   alignItems: "center",
  //   gap: 15,
  // },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  headerSearch: { marginTop: 16, marginHorizontal: -16 },


  convItem:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  convText:     { flex: 1, gap: 2 },
  convTopRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convName:       { fontFamily: 'Poppins_600SemiBold', fontSize: 15, flex: 1 },
  convNameUnread: { fontFamily: 'Poppins_700Bold' },

  newSectionTitle: {
    fontFamily: 'Poppins_600SemiBold', fontSize: 11, letterSpacing: 0.6,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6,
  },
  newSectionSpinner: { paddingVertical: 22, alignItems: 'center' },
  newSectionEmpty:   { paddingVertical: 22, paddingHorizontal: 32 },
  newSectionEmptyText: { fontFamily: 'Poppins_400Regular', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  newContactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  newContactName:   { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
  newContactMeta:   { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  newContactRating: { fontFamily: 'Poppins_500Medium', fontSize: 12 },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
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
  emptyChatCard: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 20,
    borderRadius: 16,
    maxWidth: 300,
  },
  convLastUnread: { fontFamily: 'Poppins_500Medium' },
  convTime:     { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  convBottomRow:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convLast:     { fontFamily: 'Poppins_400Regular', fontSize: 13, flex: 1 },
  convDriverId: { fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 1 },

  // Small badge overlaid on avatar for direct conversations
  directBadge: { position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },

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
    fontSize: 15,
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

  suggestionList: { marginTop: 10, borderRadius: 14, overflow: 'hidden' },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  suggestionName: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  suggestionMeta: { fontFamily: 'Poppins_400Regular', fontSize: 12, marginTop: 1 },
  suggestionRole: { fontFamily: 'Poppins_500Medium', fontSize: 11, textTransform: 'capitalize' },
  driverError:   { fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 18, marginTop: -6 },

  resultCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, borderWidth: 1 },
  resultName:    { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
  resultDriverId:{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, marginTop: 1 },
  resultSub:     { fontFamily: 'Poppins_400Regular', fontSize: 12, marginTop: 2 },
  chatBtn:       { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  chatBtnText:   { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#fff' },

  warnBanner: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10 },
  warnText:   { fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 18, flex: 1 },

  // Absolute, so messages scroll UNDERNEATH the glass. In flow it had nothing
  // behind it to sample and the material rendered flat — the exact trap in
  // CLAUDE.md §4 rule 3. The list is pushed clear with a content inset instead.
  chatHeader:     { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  bannerStack:    { position: 'absolute', left: 0, right: 0, zIndex: 15 },
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

  inputBar:  { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  textInput: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontFamily: 'Poppins_400Regular', fontSize: 14, maxHeight: 120, minHeight: 42 },
  sendBtn:   { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },

  bubbleWrap:     { marginVertical: 2, paddingHorizontal: 12 },
  bubbleWrapMe:   { alignItems: 'flex-end' },
  bubbleWrapThem: { alignItems: 'flex-start' },
  bubble:         { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  bubbleMe:       { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleThem:     { borderBottomLeftRadius: 4 },
  bubbleText:     { fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 21 },
  // Voice note: play control, progress track, remaining time.
  voiceRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 168, paddingVertical: 2 },
  voiceTrack:     { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  voiceFill:      { height: '100%', borderRadius: 2 },
  voiceTime:      { fontFamily: 'Poppins_500Medium', fontSize: 11, minWidth: 32, textAlign: 'right' },
  bubbleMeta:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bubbleTime:     { fontFamily: 'Poppins_400Regular', fontSize: 10 },
  swipeActions:   { flexDirection: 'row', alignItems: 'center' },
  swipeAction:    { width: 50, height: '100%' as any, alignItems: 'center', justifyContent: 'center' },

  // No horizontal padding: ContactCard owns its own gutters, and adding a
  // second 30pt here squeezed the stat row and the action buttons into a
  // narrow column. The sheet is a container, not a layout.
  infoSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 10, paddingBottom: 34,
    maxHeight: '86%',
  },
  infoHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoTitle:     { fontFamily: 'Poppins_700Bold', fontSize: 18, marginTop: 20 },
  infoAvatarRow: { alignItems: 'center', marginVertical: 16, gap: 6 },
  infoName:      { fontFamily: 'Poppins_700Bold', fontSize: 20 },
  infoSub:       { fontFamily: 'Poppins_400Regular', fontSize: 14 },
  infoActions:   { flexDirection: 'row', gap: 12, marginTop: 8 },
  infoActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  infoActionText:{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#fff' },
});