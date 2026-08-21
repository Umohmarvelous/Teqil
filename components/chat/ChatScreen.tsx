// components/chat/ChatScreen.tsx
//
// THE chat screen. One implementation, two entry points.
//
// ── Why this file exists ────────────────────────────────────────────────────
// There used to be two chat screens and nobody knew it. `messages.tsx` carried
// this implementation inline; meanwhile `app/direct-chat/[conversationId].tsx`,
// the route NINE screens actually navigate to, had its own standalone copy and
// imported nothing from here despite comments claiming it did. Every
// improvement went into the screen almost nobody opened.
//
// Both entry points render this. There is no second copy to drift.
//
// ── Divided how ─────────────────────────────────────────────────────────────
// Shape lives in `components/chat/` — ChatBubble owns grouping, tails, media and
// tombstones; ChatWallpaper owns the background; ContactCard owns the person
// sheet; the sheets own their own flows. This file owns the SCREEN: the list,
// the composer, recording, selection, search and realtime wiring.
//
// ── The two bugs that were structural, not cosmetic ────────────────────────
//  1. `onBack()` was followed by `router.back()` unconditionally. Rendered
//     inline inside the messages TAB that popped the tab off the stack, so
//     closing a chat navigated out of Messages entirely. The caller decides
//     what "back" means now; this screen only reports it.
//  2. Typing was written into `typingUsers[conversationId]` by the person doing
//     the typing and read back by the same screen — so the header said
//     "typing…" whenever YOU typed. It is a realtime broadcast now.

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
  type NativeSyntheticEvent,
  type NativeScrollEvent,
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
  PlusSignIcon,
  Search01Icon,
  Share01Icon,
  Delete02Icon,
  Copy01Icon,
  ArrowDown01Icon,
  NotificationOff01Icon,
  ArrowUp01Icon,
  CheckmarkCircle02Icon,
  PencilEdit02Icon,
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
import { Glass, iosAlert, iosActionSheet, IOSMenu, useIOSTheme, type IOSMenuItem } from '@/components/ios';
import ChatWallpaper from '@/components/chat/ChatWallpaper';
import ContactCard from '@/components/chat/ContactCard';
import {
  ChatBubble,
  DateSeparator,
  shouldGroup,
  sameDay,
  type ChatBubbleMessage,
} from '@/components/chat/ChatBubble';
import { MediaViewer } from '@/components/chat/ChatMedia';
import MessageActionsSheet from '@/components/chat/MessageActionsSheet';
import ForwardSheet from '@/components/chat/ForwardSheet';
import AttachmentSheet, { type PickedAttachment } from '@/components/chat/AttachmentSheet';
import { getContactPhone, formatNgPhone } from '@/src/services/contact';
import { useSignedMedia } from '@/src/hooks/useSignedMedia';
import * as chatSvc from '@/src/services/chat';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function ContactInfoModal({
  visible, onClose, conversation,
}: { visible: boolean; onClose: () => void; conversation: Conversation | null }) {
  const ios = useIOSTheme();
  if (!conversation) return null;

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
// The player is per-bubble because `useAudioPlayer` binds one native player to
// one source. Sharing a single player across the list would mean starting a
// second note silently stops the first with no way to show which is playing —
// and the progress bar would jump between bubbles.
//
// The uri is a bucket path since voice notes started uploading. It used to be
// the SENDER's `file://` path, which on the recipient's phone pointed at a file
// that does not exist — so every received voice note was silent.

function VoiceNote({ uri, isMe, textColor }: { uri: string; isMe: boolean; textColor: string }) {
  const { url, loading } = useSignedMedia(uri);
  const player = useAudioPlayer(url ? { uri: url } : null);
  const status = useAudioPlayerStatus(player);

  const tint = isMe ? '#fff' : textColor;
  const track = isMe ? 'rgba(255,255,255,0.28)' : 'rgba(120,120,128,0.28)';

  const duration = status?.duration ?? 0;
  const position = status?.currentTime ?? 0;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  const toggle = useCallback(() => {
    if (!url) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (status?.playing) {
      player.pause();
      return;
    }
    // Replay from the start once it has finished, rather than sitting at the
    // end doing nothing when tapped.
    if (duration > 0 && position >= duration - 0.05) player.seekTo(0);
    player.play();
  }, [player, status?.playing, position, duration, url]);

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
        {loading ? (
          <ActivityIndicator size="small" color={tint} />
        ) : (
          <HugeiconsIcon icon={status?.playing ? PauseIcon : PlayIcon} size={22} color={tint} />
        )}
      </Pressable>

      <View style={[S.voiceTrack, { backgroundColor: track }]}>
        <View style={[S.voiceFill, { width: `${progress * 100}%`, backgroundColor: tint }]} />
      </View>

      <Text style={[S.voiceTime, { color: tint }]}>{label}</Text>
    </View>
  );
}

// ─── Message Bubble (named export kept for old call sites) ───────────────────

export function MessageBubble({
  message, isMe, onReply, onDelete, onCopy,
}: {
  message: Message; isMe: boolean;
  onReply: () => void; onDelete: () => void; onCopy: () => void;
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

// ─── Chat Screen ─────────────────────────────────────────────────────────────

export function ChatScreen({
  conversation, onBack, isDark, invalidId = false,
}: {
  conversation: Conversation; onBack: () => void; isDark: boolean; invalidId?: boolean;
}) {
  const { user } = useAuthStore();
  const {
    markRead, messages: allMessages, setTyping, typingUsers, onlineUsers,
    subscribeToRealtime, joinConversation, loadMessages,
    sendMessage2, retryMessage, deleteForMe, deleteForEveryone,
    toggleStar, editMessage, setPrefs, clearHistory, markUnread,
  } = useMessagesStore();

  const [text,        setText]        = useState('');
  const [sending,     setSending]     = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  // What the composer is replying to. Held as state rather than pasted into the
  // text field: the old version prefixed the draft with "↩ Name: quoted text",
  // which the recipient then received as literal characters.
  const [replyTo,     setReplyTo]     = useState<Message | null>(null);
  const [editing,     setEditing]     = useState<Message | null>(null);

  const [actionsFor,  setActionsFor]  = useState<Message | null>(null);
  const [attachOpen,  setAttachOpen]  = useState(false);
  const [forwardIds,  setForwardIds]  = useState<string[] | null>(null);
  const [viewer,      setViewer]      = useState<
    { stored: string; kind: 'image' | 'video'; caption?: string | null; subtitle?: string } | null
  >(null);

  const [selecting,   setSelecting]   = useState(false);
  const [selected,    setSelected]    = useState<string[]>([]);

  const [searchOpen,  setSearchOpen]  = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hits,        setHits]        = useState<string[]>([]);
  const [hitIndex,    setHitIndex]    = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [atBottom,    setAtBottom]    = useState(true);

  // expo-audio is hook-based, so the recorder is created here rather than
  // inside the press handler the way the old imperative expo-av API allowed.
  const recorder      = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  const listRef      = useRef<FlatList<Message>>(null);
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

  const messages    = useMemo(() => allMessages[conversation.id] || [], [allMessages, conversation.id]);
  const otherTyping = typingUsers[conversation.id] || false;
  const otherOnline = !!conversation.participant_id && !!onlineUsers[conversation.participant_id];
  const muted       = chatSvc.isMuted(conversation.muted_until);

  /**
   * Where the unread run starts.
   *
   * Fixed ONCE, the first time the thread has any messages in it. Recomputing
   * would move the divider while it is being looked at — `markRead` fires on
   * open, so a live calculation collapses to "nothing is unread" within a frame
   * and the marker the user was about to scroll to disappears.
   *
   * It is also captured from the count as it was on ENTRY, which is why the
   * count is read from a ref: the store zeroes `unread_count` immediately.
   */
  const entryUnread = useRef(conversation.unread_count ?? 0);
  const [unreadAnchor, setUnreadAnchor] = useState<string | null>(null);
  useEffect(() => {
    if (unreadAnchor !== null || messages.length === 0) return;
    const n = entryUnread.current;
    const incoming = messages.filter((m) => m.sender_id !== user?.id);
    setUnreadAnchor(n > 0 && incoming.length >= n ? incoming[incoming.length - n].id : '');
  }, [messages, unreadAnchor, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeRef.current(user.id);
    return () => unsub?.();
  }, [user?.id]);

  // Typing and presence for THIS chat only. The global subscription carries
  // messages; this one carries the ephemeral state that must not hit the table.
  useEffect(() => {
    if (!user?.id) return;
    const leave = joinConversation(conversation.id, user.id);
    return leave;
  }, [conversation.id, user?.id, joinConversation]);

  // The server is the authority on what is in a thread: hides, clears and
  // delete-for-everyone all live there, and the cache cannot know about a
  // message deleted from another device.
  useEffect(() => { loadMessages(conversation.id); }, [conversation.id, loadMessages]);

  useEffect(() => { markReadRef.current(conversation.id); }, [conversation.id]);

  // Anything arriving while the chat is open is read on arrival.
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (!lastId) return;
    if (messages[messages.length - 1]?.sender_id !== user?.id) markReadRef.current(conversation.id);
  }, [lastId, conversation.id, user?.id, messages]);

  useEffect(() => {
    // Only follow the conversation down when already at the bottom. Auto
    // scrolling someone who has deliberately scrolled up to read history is the
    // single most irritating thing a chat can do.
    if (messages.length > 0 && atBottom) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length, atBottom]);

  const handleTyping = (v: string) => {
    setText(v);
    setTyping(conversation.id, true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(conversation.id, false), 1500);
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user?.id || sending) return;

    // Editing reuses the composer, so Send has two meanings and must pick the
    // right one before anything is inserted.
    if (editing) {
      setSending(true);
      const err = await editMessage(conversation.id, editing.id, trimmed);
      setSending(false);
      if (err) { iosAlert('Could not edit', err); return; }
      setEditing(null);
      setText('');
      return;
    }

    setSending(true);
    setText('');
    setTyping(conversation.id, false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const quoted = replyTo;
    setReplyTo(null);
    setAtBottom(true);

    await sendMessage2(conversation.id, { text: trimmed, replyTo: quoted });
    setSending(false);
  };

  const handleAttachment = async (a: PickedAttachment) => {
    setAtBottom(true);
    await sendMessage2(conversation.id, {
      localMediaUri: a.uri,
      mediaKind: a.kind,
      mediaName: a.name,
      mediaWidth: a.width,
      mediaHeight: a.height,
      durationMs: a.durationMs,
      replyTo,
    });
    setReplyTo(null);
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
    const ms = recorderState.durationMillis;
    try {
      await recorder.stop();
      const uri = recorder.uri;

      // Release the input again so other audio isn't ducked for the rest of the
      // session — iOS keeps the recording route active until told otherwise.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

      // Under a second is a mis-tap on the mic, not a message.
      if (!uri || ms < 800) return;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAtBottom(true);
      await sendMessage2(conversation.id, {
        localMediaUri: uri,
        mediaKind: 'audio',
        durationMs: ms,
        replyTo,
      });
      setReplyTo(null);
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
    setEditing(null);
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

  /** Scroll to a message and flash it, so "jump to quoted" lands somewhere visible. */
  const jumpTo = useCallback((id: string) => {
    const idx = messages.findIndex((m) => m.id === id);
    if (idx < 0) return;
    listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.5, animated: true });
    setHighlightId(id);
    setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 1400);
  }, [messages]);

  // ── Selection ───────────────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const exitSelection = () => { setSelecting(false); setSelected([]); };

  const deleteSelected = () => {
    const ids = [...selected];
    const mine = ids.filter((id) => messages.find((m) => m.id === id)?.sender_id === user?.id);
    const everyoneEligible = mine.filter((id) => {
      const m = messages.find((x) => x.id === id)!;
      return chatSvc.canDeleteForEveryone(m.created_at, true);
    });

    const buttons = [
      { text: 'Cancel', style: 'cancel' as const },
      {
        text: 'Delete for me',
        style: 'destructive' as const,
        onPress: () => { deleteForMe(conversation.id, ids); exitSelection(); },
      },
    ];
    if (everyoneEligible.length === ids.length && ids.length > 0) {
      buttons.push({
        text: 'Delete for everyone',
        style: 'destructive' as const,
        onPress: () => { deleteForEveryone(conversation.id, ids); exitSelection(); },
      });
    }
    iosAlert(
      ids.length === 1 ? 'Delete message?' : `Delete ${ids.length} messages?`,
      everyoneEligible.length === ids.length
        ? undefined
        : 'Some of these can only be deleted for you — they are not yours, or they are older than two days.',
      buttons,
    );
  };

  const copySelected = async () => {
    const body = messages
      .filter((m) => selected.includes(m.id) && m.text)
      .map((m) => `[${new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}] ${m.sender_id === user?.id ? 'You' : m.sender_name}: ${m.text}`)
      .join('\n');
    if (!body) return;
    await Clipboard.setStringAsync(body);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    exitSelection();
  };

  // ── In-chat search ──────────────────────────────────────────────────────
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) { setHits([]); setHitIndex(0); return; }
    // Local, not a round trip: the whole thread is already loaded, and a server
    // search here would lag a keystroke behind for no benefit.
    const found = messages.filter((m) => m.text?.toLowerCase().includes(q)).map((m) => m.id);
    setHits(found);
    setHitIndex(found.length - 1);
  }, [searchQuery, messages]);

  useEffect(() => {
    if (hits.length) jumpTo(hits[hitIndex]);
    // jumpTo changes with `messages`; re-running on every message would yank
    // the list mid-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitIndex, hits]);

  // ── Header menu ─────────────────────────────────────────────────────────
  const menuItems: IOSMenuItem[] = [
    { label: 'View contact', symbol: 'person.crop.circle', onPress: () => setInfoVisible(true) },
    {
      label: 'Media, links and docs',
      symbol: 'photo.on.rectangle',
      onPress: () => router.push({ pathname: '/chat/media', params: { conversationId: conversation.id, name: conversation.participant_name } }),
    },
    { label: 'Search', symbol: 'magnifyingglass', onPress: () => { setSearchOpen(true); setSelecting(false); } },
    { label: 'Starred messages', symbol: 'star', onPress: () => router.push('/chat/starred') },
    {
      label: muted ? 'Unmute notifications' : 'Mute notifications',
      symbol: muted ? 'bell' : 'bell.slash',
      startsNewSection: true,
      onPress: () => {
        if (muted) { setPrefs(conversation.id, { clearMute: true }); return; }
        iosActionSheetMute();
      },
    },
    {
      label: 'Wallpaper',
      symbol: 'paintpalette',
      onPress: () => router.push({ pathname: '/chat/wallpaper', params: { conversationId: conversation.id } }),
    },
    {
      label: conversation.pinned ? 'Unpin chat' : 'Pin chat',
      symbol: conversation.pinned ? 'pin.slash' : 'pin',
      onPress: () => setPrefs(conversation.id, { pinned: !conversation.pinned }),
    },
    {
      label: 'Mark as unread',
      symbol: 'envelope.badge',
      onPress: () => { markUnread(conversation.id); onBack(); },
    },
    { label: 'Select messages', symbol: 'checkmark.circle', startsNewSection: true, onPress: () => setSelecting(true) },
    {
      label: 'Clear chat',
      symbol: 'trash',
      destructive: true,
      onPress: () =>
        iosAlert(
          'Clear this chat?',
          'Every message is removed from your copy of the conversation. The other person keeps theirs.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: () => clearHistory(conversation.id) },
          ],
        ),
    },
  ];

  const iosActionSheetMute = () => {
    iosActionSheet(
      'Mute notifications',
      `You will stop getting alerts from ${conversation.participant_name || 'this chat'}. It stays in your list and still counts as unread.`,
      [
        ...chatSvc.MUTE_OPTIONS.map((o) => ({
          text: o.label,
          onPress: () => setPrefs(conversation.id, { mutedUntil: chatSvc.muteUntilISO(o.hours) }),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distance = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setAtBottom(distance < 90);
  };

  const InputRight = () =>
    text.trim() ? (
      <Pressable
        style={[S.sendBtn, { backgroundColor: Colors.primary, opacity: sending ? 0.6 : 1 }]}
        onPress={handleSend}
        disabled={sending}
        accessibilityLabel={editing ? 'Save edit' : 'Send'}
      >
        {sending
          ? <ActivityIndicator size="small" color="#fff" />
          : <HugeiconsIcon icon={editing ? CheckmarkCircle02Icon : TelegramIcon} size={20} color="#fff" />}
      </Pressable>
    ) : (
      <Pressable
        style={[S.sendBtn, { backgroundColor: isRecording ? Colors.error : Colors.primary }]}
        onLongPress={startRecording}
        onPressOut={isRecording ? stopRecording : undefined}
        delayLongPress={200}
        accessibilityLabel="Hold to record a voice message"
      >
        <HugeiconsIcon icon={isRecording ? MicOff01Icon : Mic01Icon} size={20} color="#fff" />
      </Pressable>
    );

  const headerSub = otherTyping
    ? 'typing…'
    : otherOnline
      ? 'online'
      : conversation.participant_username
        ? `@${conversation.participant_username}`
        : conversation.participant_driver_id || 'Tap for contact info';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style={ios.scheme === 'dark' ? 'light' : 'dark'} />

      {/* The wallpaper is the bottom layer, sized to the WINDOW rather than to
          this container, so the keyboard opening does not re-tile it. */}
      <ChatWallpaper value={conversation.wallpaper} />

      {/* Header.
          Glass, like every other bar in the app. The material is on an
          absolutely-positioned layer behind the row so the row's own children
          keep their colours, and the list scrolls UNDER it rather than being
          padded away from it (padding the frame leaves the glass nothing to
          sample and it renders flat — CLAUDE.md §4 rule 3). */}
      <View style={[S.chatHeader, { borderBottomColor: border, paddingTop: topPad + 12, height: topPad + 62 }]}>
        <Glass
          variant="regular"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={60}
          fallbackTint={cardBg}
        />

        {selecting ? (
          // Selection replaces the header rather than adding a second bar. Two
          // stacked bars is how a chat ends up with 140pt of chrome.
          <>
            <Pressable onPress={exitSelection} style={S.chatBack} hitSlop={8} accessibilityLabel="Cancel selection">
              <HugeiconsIcon icon={Cancel01Icon} size={22} color={textColor} />
            </Pressable>
            <Text style={[S.chatHeaderName, { color: textColor, flex: 1 }]}>
              {selected.length} selected
            </Text>
            <Pressable onPress={copySelected} hitSlop={8} disabled={!selected.length} style={S.headerAction}>
              <HugeiconsIcon icon={Copy01Icon} size={20} color={selected.length ? textColor : ios.quaternaryLabel} />
            </Pressable>
            <Pressable
              onPress={() => selected.length && setForwardIds([...selected])}
              hitSlop={8}
              disabled={!selected.length}
              style={S.headerAction}
            >
              <HugeiconsIcon icon={Share01Icon} size={20} color={selected.length ? textColor : ios.quaternaryLabel} />
            </Pressable>
            <Pressable onPress={deleteSelected} hitSlop={8} disabled={!selected.length} style={S.headerAction}>
              <HugeiconsIcon icon={Delete02Icon} size={20} color={selected.length ? ios.systemRed : ios.quaternaryLabel} />
            </Pressable>
          </>
        ) : searchOpen ? (
          <>
            <Pressable
              onPress={() => { setSearchOpen(false); setSearchQuery(''); }}
              style={S.chatBack}
              hitSlop={8}
              accessibilityLabel="Close search"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={22} color={textColor} />
            </Pressable>
            <View style={[S.searchField, { backgroundColor: inputBg }]}>
              <HugeiconsIcon icon={Search01Icon} size={16} color={subTextColor} />
              <TextInput
                style={[S.searchInput, { color: textColor }]}
                placeholder="Search this chat"
                placeholderTextColor={ios.tertiaryLabel}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
                autoCorrect={false}
              />
            </View>
            {/* The counter reads "3 of 12" like every find bar, so it is obvious
                whether there is anything further up to look at. */}
            <Text style={[S.searchCount, { color: subTextColor }]}>
              {hits.length ? `${hitIndex + 1}/${hits.length}` : searchQuery.trim().length >= 2 ? '0' : ''}
            </Text>
            <Pressable
              onPress={() => setHitIndex((i) => Math.max(0, i - 1))}
              hitSlop={8}
              disabled={hitIndex <= 0}
            >
              <HugeiconsIcon icon={ArrowUp01Icon} size={20} color={hitIndex > 0 ? textColor : ios.quaternaryLabel} />
            </Pressable>
            <Pressable
              onPress={() => setHitIndex((i) => Math.min(hits.length - 1, i + 1))}
              hitSlop={8}
              disabled={hitIndex >= hits.length - 1}
            >
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={20}
                color={hitIndex < hits.length - 1 ? textColor : ios.quaternaryLabel}
              />
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={() => { Haptics.selectionAsync(); onBack(); }}
              style={S.chatBack}
              hitSlop={8}
              accessibilityLabel="Back"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={25} color={textColor} />
            </Pressable>

            {/* The whole identity block opens the contact sheet, which is how
                every messenger behaves and what a user tries first. */}
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
                <View style={S.nameRow}>
                  <Text style={[S.chatHeaderName, { color: textColor }]} numberOfLines={1}>
                    {conversation.participant_name}
                  </Text>
                  {muted ? (
                    <HugeiconsIcon icon={NotificationOff01Icon} size={13} color={subTextColor} />
                  ) : null}
                </View>
                <Text
                  style={[
                    S.chatHeaderSub,
                    { color: otherTyping || otherOnline ? ios.tint : subTextColor },
                    otherTyping && { fontStyle: 'italic' },
                  ]}
                  numberOfLines={1}
                >
                  {headerSub}
                </Text>
              </View>
            </Pressable>

            <Pressable onPress={handleCall} style={S.chatCallBtn} hitSlop={8} accessibilityLabel="Call">
              <HugeiconsIcon icon={CallIcon} size={21} color={ios.tint} />
            </Pressable>

            <IOSMenu
              items={menuItems}
              anchor={
                <Pressable hitSlop={8} accessibilityLabel="More">
                  <HugeiconsIcon icon={MoreVerticalIcon} size={22} color={textColor} />
                </Pressable>
              }
            />
          </>
        )}
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
        onScroll={onScroll}
        scrollEventThrottle={64}
        keyboardDismissMode="interactive"
        // A jump into history can land on a row that has never been measured;
        // without this the scroll silently fails and the search looks broken.
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }), 260);
        }}
        renderItem={({ item, index }) => {
          const prev = messages[index - 1];
          const next = messages[index + 1];
          const newDay = !prev || !sameDay(prev.created_at, item.created_at);
          const isMine = item.sender_id === user?.id;
          return (
            <>
              {newDay ? <DateSeparator iso={item.created_at} /> : null}
              {unreadAnchor && unreadAnchor === item.id ? (
                <View style={S.unreadWrap}>
                  <View style={[S.unreadPill, { backgroundColor: ios.tint + '22' }]}>
                    <Text style={[S.unreadText, { color: ios.tint }]}>Unread messages</Text>
                  </View>
                </View>
              ) : null}
              <ChatBubble
                message={item as ChatBubbleMessage}
                isMe={isMine}
                // A new day always starts a fresh block, whatever the clock gap.
                grouped={!newDay && shouldGroup(prev as ChatBubbleMessage, item as ChatBubbleMessage)}
                hasFollower={
                  !!next &&
                  sameDay(item.created_at, next.created_at) &&
                  shouldGroup(item as ChatBubbleMessage, next as ChatBubbleMessage)
                }
                highlighted={highlightId === item.id}
                selectionMode={selecting}
                selected={selected.includes(item.id)}
                onToggleSelect={() => toggleSelect(item.id)}
                onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setActionsFor(item); }}
                onReply={() => handleReply(item)}
                onDelete={() => deleteForMe(conversation.id, [item.id])}
                onCopy={() => handleCopy(item)}
                onRetry={() => retryMessage(conversation.id, item.id)}
                onPressReplyQuote={jumpTo}
                onOpenMedia={() =>
                  item.media_url &&
                  setViewer({
                    stored: item.media_url,
                    kind: item.media_type === 'video' ? 'video' : 'image',
                    caption: item.text,
                    subtitle: `${isMine ? 'You' : item.sender_name || 'Them'} · ${new Date(item.created_at).toLocaleString()}`,
                  })
                }
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

      {/* Only when there is somewhere to jump to. A permanent button covers a
          bubble for no reason nine times out of ten. */}
      {!atBottom && messages.length > 0 ? (
        <Pressable
          style={[S.jumpBtn, { backgroundColor: ios.secondarySystemGroupedBackground, bottom: 92 + insets.bottom }]}
          onPress={() => { setAtBottom(true); listRef.current?.scrollToEnd({ animated: true }); }}
          accessibilityLabel="Scroll to latest"
        >
          <HugeiconsIcon icon={ArrowDown01Icon} size={20} color={ios.label} />
          {conversation.unread_count > 0 ? (
            <View style={[S.jumpBadge, { backgroundColor: ios.tint }]}>
              <Text style={S.jumpBadgeText}>{conversation.unread_count}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}

      <View style={[S.inputBar, { borderTopColor: border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Glass
          variant="regular"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={60}
          fallbackTint={cardBg}
        />

        {/* What you are replying to — or editing — with an explicit way out. */}
        {replyTo || editing ? (
          <View style={[S.replyPreview, { backgroundColor: ios.tertiarySystemFill, borderLeftColor: ios.tint }]}>
            <View style={{ flex: 1 }}>
              <View style={S.nameRow}>
                {editing ? (
                  <HugeiconsIcon icon={PencilEdit02Icon} size={12} color={ios.tint} />
                ) : null}
                <Text style={[S.replyPreviewAuthor, { color: ios.tint }]} numberOfLines={1}>
                  {editing
                    ? 'Editing message'
                    : replyTo!.sender_id === user?.id ? 'You' : replyTo!.sender_name || 'User'}
                </Text>
              </View>
              <Text style={[S.replyPreviewText, { color: subTextColor }]} numberOfLines={1}>
                {(editing ?? replyTo)!.text || 'Voice message'}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                if (editing) { setEditing(null); setText(''); } else setReplyTo(null);
              }}
              hitSlop={10}
              accessibilityLabel={editing ? 'Cancel edit' : 'Cancel reply'}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={17} color={subTextColor} />
            </Pressable>
          </View>
        ) : null}

        <View style={S.inputRow}>
          {!editing ? (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setAttachOpen(true); }}
              style={[S.attachBtn, { backgroundColor: inputBg }]}
              accessibilityLabel="Attach"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={20} color={textColor} />
            </Pressable>
          ) : null}
          <TextInput
            ref={inputRef}
            style={[S.textInput, { backgroundColor: inputBg, color: textColor }]}
            placeholder={editing ? 'Edit message…' : 'Type a message…'}
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

      <MessageActionsSheet
        message={actionsFor}
        isMe={actionsFor?.sender_id === user?.id}
        onClose={() => setActionsFor(null)}
        onReply={() => actionsFor && handleReply(actionsFor)}
        onCopy={() => actionsFor && handleCopy(actionsFor)}
        onStar={() => actionsFor && toggleStar(conversation.id, actionsFor.id)}
        onForward={() => actionsFor && setForwardIds([actionsFor.id])}
        onEdit={() => {
          if (!actionsFor) return;
          setEditing(actionsFor);
          setReplyTo(null);
          setText(actionsFor.text ?? '');
          inputRef.current?.focus();
        }}
        onSelect={() => {
          if (!actionsFor) return;
          setSelecting(true);
          setSelected([actionsFor.id]);
        }}
        onInfo={() => {
          if (!actionsFor) return;
          const m = actionsFor;
          iosAlert(
            'Message info',
            [
              `Sent ${new Date(m.created_at).toLocaleString()}`,
              m.status === 'read' ? 'Read' : m.status === 'delivered' ? 'Delivered' : 'Sent',
              m.edited_at ? `Edited ${new Date(m.edited_at).toLocaleString()}` : null,
              m.forwarded ? 'Forwarded' : null,
            ].filter(Boolean).join('\n'),
          );
        }}
        onDeleteForMe={() => actionsFor && deleteForMe(conversation.id, [actionsFor.id])}
        onDeleteForEveryone={() => actionsFor && deleteForEveryone(conversation.id, [actionsFor.id])}
      />

      <ForwardSheet
        visible={!!forwardIds}
        onClose={() => setForwardIds(null)}
        messageIds={forwardIds ?? []}
        excludeConversationId={conversation.id}
        onDone={() => exitSelection()}
      />

      <AttachmentSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        onPicked={handleAttachment}
      />

      <MediaViewer
        visible={!!viewer}
        onClose={() => setViewer(null)}
        stored={viewer?.stored ?? null}
        kind={viewer?.kind ?? 'image'}
        caption={viewer?.caption}
        subtitle={viewer?.subtitle}
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
  nameRow:        { flexDirection: 'row', alignItems: 'center', gap: 5 },
  headerAction:   { width: 34, alignItems: 'center' },

  searchField:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, borderRadius: 10, paddingHorizontal: 10 },
  searchInput:  { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 14, padding: 0 },
  searchCount:  { fontFamily: 'Poppins_500Medium', fontSize: 12, minWidth: 34, textAlign: 'right' },

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
  attachBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  messageList:   { paddingVertical: 12, paddingBottom: 20, flexGrow: 1 },

  unreadWrap: { alignItems: 'center', paddingVertical: 10 },
  unreadPill: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12 },
  unreadText: { fontFamily: 'Poppins_500Medium', fontSize: 11, letterSpacing: 0.3 },

  jumpBtn: {
    position: 'absolute', right: 14,
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  jumpBadge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  jumpBadgeText: { color: '#fff', fontFamily: 'Poppins_600SemiBold', fontSize: 10 },

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
