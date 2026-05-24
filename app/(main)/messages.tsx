/**
 * app/(main)/messages.tsx
 *
 * WhatsApp-style messaging between passengers and drivers.
 *
 * Flow (passenger):
 *  1. Tap "+" → NewChatModal
 *  2. Enter driver ID (e.g. DRV-A3X9KL) or trip code
 *  3. Supabase lookup → if found, open ChatScreen with that driver
 *  4. Messages are inserted into `messages` table keyed by conversation_id
 *  5. Driver sees them via Supabase realtime subscription (in _layout.tsx)
 *
 * Flow (driver):
 *  - Incoming conversations appear automatically via realtime push
 *  - Driver can reply; messages route back to the passenger
 *
 * Supabase tables expected:
 *   conversations(id, participant_id, participant_name, participant_role,
 *                 participant_driver_id, participant_phone, participant_vehicle,
 *                 passenger_id, passenger_name, last_message, last_message_at,
 *                 unread_count, trip_code)
 *   messages(id, conversation_id, sender_id, sender_name, sender_role,
 *            text, audio_uri, created_at, read, status)
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Linking,
  RefreshControl,
  ActivityIndicator,
  Clipboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import {
  useMessagesStore,
  type Conversation,
  type Message,
} from "@/src/store/useMessagesStore";
import { Colors } from "@/constants/colors";
import Avatar from "@/components/Avatar";
import { generateId } from "@/src/utils/helpers";
import { TripsStorage } from "@/src/services/storage";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  ArrowLeft01Icon,
  Message02Icon,
  PlusSignIcon,
  ChartBubbleIcon,
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
} from "@hugeicons/core-free-icons";
import { StatusBar } from "expo-status-bar";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { supabase } from "@/src/services/supabase";
import { Audio } from "expo-av";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DriverSearchResult {
  id: string;
  full_name: string | null;
  phone: string | null;
  driver_id: string | null;
  vehicle_details: string | null;
  park_name: string | null;
}

// ─── Contact Info Modal ───────────────────────────────────────────────────────

function ContactInfoModal({
  visible,
  onClose,
  conversation,
  isDark,
}: {
  visible: boolean;
  onClose: () => void;
  conversation: Conversation | null;
  isDark: boolean;
}) {
  if (!conversation) return null;

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";

  const handleCall = () => {
    const phone = conversation.participant_phone;
    if (!phone) {
      Alert.alert("No phone number", "This contact has no phone number on file.");
      return;
    }
    const url = `tel:${phone.replace(/\s/g, "")}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) Linking.openURL(url);
      else Alert.alert("Cannot make call", "Your device cannot make phone calls.");
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Pressable style={modalStyles.backdrop} onPress={onClose} />
        <View style={[modalStyles.sheet, { backgroundColor: cardBg }]}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.headerRow}>
            <Text style={[modalStyles.title, { color: textColor }]}>
              Contact Info
            </Text>
            <Pressable onPress={onClose}>
              <HugeiconsIcon icon={ArrowLeft01Icon} size={24} color={textColor} />
            </Pressable>
          </View>
          <View style={modalStyles.avatarCenter}>
            <Avatar name={conversation.participant_name || "User"} size={72} />
            <Text style={[modalStyles.contactName, { color: textColor }]}>
              {conversation.participant_name}
            </Text>
            <Text style={[modalStyles.contactRole, { color: subTextColor }]}>
              {conversation.participant_role}
              {conversation.participant_driver_id
                ? ` · ${conversation.participant_driver_id}`
                : ""}
            </Text>
            {conversation.participant_vehicle ? (
              <Text style={[modalStyles.contactRole, { color: subTextColor }]}>
                🚗 {conversation.participant_vehicle}
              </Text>
            ) : null}
          </View>
          <View style={modalStyles.actionRow}>
            <Pressable
              style={[modalStyles.actionBtn, { backgroundColor: Colors.primary }]}
              onPress={handleCall}
            >
              <HugeiconsIcon icon={CallIcon} size={20} color="#fff" />
              <Text style={modalStyles.actionBtnText}>Call</Text>
            </Pressable>
            <Pressable
              style={[
                modalStyles.actionBtn,
                { backgroundColor: Colors.primaryDarker },
              ]}
              onPress={onClose}
            >
              <HugeiconsIcon icon={Message02Icon} size={20} color="#fff" />
              <Text style={modalStyles.actionBtnText}>Message</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 30,
    paddingTop: 10,
    paddingBottom: 50,
    gap: 14,
  },
  handle: {
    width: 60,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(154,154,154,0.3)",
    alignSelf: "center",
    marginBottom: 5,
  },
  title: { fontFamily: "Poppins_700Bold", fontSize: 18, marginTop: 20 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
  },
  input: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    padding: 0,
  },
  startBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  startBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  avatarCenter: { alignItems: "center", marginVertical: 16, gap: 6 },
  contactName: { fontFamily: "Poppins_700Bold", fontSize: 20 },
  contactRole: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    textTransform: "capitalize",
  },
  actionRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
});

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isMe,
  onReply,
  onDelete,
  onCopy,
  isDark,
  textColor,
  subTextColor,
}: {
  message: Message;
  isMe: boolean;
  onReply: () => void;
  onDelete: () => void;
  onCopy: () => void;
  isDark: boolean;
  textColor: string;
  subTextColor: string;
}) {
  const renderRightActions = () => (
    <View style={bubbleStyles.swipeActions}>
      <Pressable
        onPress={onReply}
        style={[bubbleStyles.swipeAction, { backgroundColor: Colors.gold }]}
      >
        <HugeiconsIcon icon={Reply} size={18} color="#fff" />
      </Pressable>
      <Pressable
        onPress={onCopy}
        style={[bubbleStyles.swipeAction, { backgroundColor: Colors.primary }]}
      >
        <HugeiconsIcon icon={Copy01Icon} size={18} color="#fff" />
      </Pressable>
      <Pressable
        onPress={onDelete}
        style={[bubbleStyles.swipeAction, { backgroundColor: Colors.error }]}
      >
        <HugeiconsIcon icon={Delete01Icon} size={18} color="#fff" />
      </Pressable>
    </View>
  );

  const timeStr = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <View
        style={[
          bubbleStyles.container,
          isMe ? bubbleStyles.containerMe : bubbleStyles.containerThem,
        ]}
      >
        <View
          style={[
            bubbleStyles.bubble,
            isMe
              ? bubbleStyles.bubbleMe
              : [
                  bubbleStyles.bubbleThem,
                  {
                    backgroundColor: isDark ? "#1E2820" : "#F0F0F0",
                  },
                ],
          ]}
        >
          {message.audio_uri ? (
            <Text
              style={[
                bubbleStyles.text,
                { color: isMe ? "#fff" : textColor },
              ]}
            >
              🎤 Voice message
            </Text>
          ) : (
            <Text
              style={[
                bubbleStyles.text,
                { color: isMe ? "#fff" : textColor },
              ]}
            >
              {message.text}
            </Text>
          )}
          <View style={bubbleStyles.meta}>
            <Text
              style={[
                bubbleStyles.time,
                {
                  color: isMe
                    ? "rgba(255,255,255,0.6)"
                    : subTextColor,
                },
              ]}
            >
              {timeStr}
            </Text>
            {isMe && (
              <HugeiconsIcon
                icon={
                  message.status === "read" ? TaskDone01Icon : Checkmark
                }
                size={14}
                color={
                  message.status === "read"
                    ? "#34B7F1"
                    : "rgba(255,255,255,0.5)"
                }
              />
            )}
          </View>
        </View>
      </View>
    </Swipeable>
  );
}

const bubbleStyles = StyleSheet.create({
  container: { marginVertical: 2, paddingHorizontal: 12 },
  containerMe: { alignItems: "flex-end" },
  containerThem: { alignItems: "flex-start" },
  bubble: {
    maxWidth: "78%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  bubbleMe: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    borderBottomLeftRadius: 4,
  },
  text: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 21,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  time: { fontFamily: "Poppins_400Regular", fontSize: 10 },
  swipeActions: { flexDirection: "row", alignItems: "center" },
  swipeAction: {
    width: 50,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── Chat Screen ──────────────────────────────────────────────────────────────

function ChatScreen({
  conversation,
  onBack,
  isDark,
}: {
  conversation: Conversation;
  onBack: () => void;
  isDark: boolean;
}) {
  const { user } = useAuthStore();
  const {
    addMessage,
    markRead,
    messages: allMessages,
    setTyping,
    typingUsers,
    deleteMessage,
    subscribeToRealtime,
    unsubscribeRealtime,
  } = useMessagesStore();

  const [text, setText] = useState("");
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [sending, setSending] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingInstance, setRecordingInstance] =
    useState<Audio.Recording | null>(null);

  const listRef = useRef<FlatList>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const bg = isDark ? Colors.background : "#F5F5F5";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  const inputBg = isDark ? "#1C2921" : "#F0F0F0";
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const messages = allMessages[conversation.id] || [];
  const otherTyping = typingUsers[conversation.id] || false;

  // Subscribe to realtime for this conversation when chat opens
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeToRealtime(user.id);
    return () => unsub?.();
  }, [user?.id]);

  useEffect(() => {
    markRead(conversation.id);
  }, [conversation.id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(
        () => listRef.current?.scrollToEnd({ animated: true }),
        120
      );
    }
  }, [messages.length]);

  // ── Typing indicator ──────────────────────────────────────────────
  const handleTyping = (value: string) => {
    setText(value);
    setTyping(conversation.id, true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(
      () => setTyping(conversation.id, false),
      1500
    );
  };

  // ── Send text message ─────────────────────────────────────────────
  const handleSend = async () => {
    if (!text.trim() || !user?.id || sending) return;
    const trimmed = text.trim();
    setSending(true);
    setText("");
    setTyping(conversation.id, false);

    const msg: Message = {
      id: generateId(),
      conversation_id: conversation.id,
      sender_id: user.id,
      sender_name: user.full_name || "Me",
      sender_role: user.role as any,
      text: trimmed,
      created_at: new Date().toISOString(),
      read: false,
      status: "sent",
    };

    await addMessage(msg);
    setSending(false);
  };

  // ── Voice recording ───────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Microphone access is needed to record voice messages."
        );
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecordingInstance(recording);
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      Alert.alert("Error", "Could not start recording.");
    }
  };

  const stopRecording = async () => {
    if (!recordingInstance || !user?.id) return;
    setIsRecording(false);
    try {
      await recordingInstance.stopAndUnloadAsync();
      const uri = recordingInstance.getURI();
      setRecordingInstance(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (uri) {
        const msg: Message = {
          id: generateId(),
          conversation_id: conversation.id,
          sender_id: user.id,
          sender_name: user.full_name || "Me",
          sender_role: user.role as any,
          audio_uri: uri,
          created_at: new Date().toISOString(),
          read: false,
          status: "sent",
        };
        await addMessage(msg);
      }
    } catch (err) {
      Alert.alert("Error", "Could not save voice message.");
    }
  };

  const cancelRecording = async () => {
    if (!recordingInstance) return;
    setIsRecording(false);
    try {
      await recordingInstance.stopAndUnloadAsync();
    } catch {}
    setRecordingInstance(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Call ──────────────────────────────────────────────────────────
  const handleCall = () => {
    const phone = conversation.participant_phone;
    if (!phone) {
      Alert.alert(
        "No phone number",
        "This contact has no phone number available."
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Linking.openURL(`tel:${phone.replace(/\s/g, "")}`);
  };

  // ── Reply / Delete / Copy ─────────────────────────────────────────
  const handleReply = (message: Message) => {
    const replyText = message.text?.trim();
    if (!replyText) return;
    setText(`↩ ${message.sender_name || "User"}: ${replyText}\n`);
  };

  const handleDelete = async (convId: string, msgId: string) => {
    await deleteMessage(convId, msgId);
  };

  const handleCopy = (message: Message) => {
    const copyText = message.text?.trim();
    if (!copyText) return;
    if (
      Platform.OS === "web" &&
      typeof navigator !== "undefined" &&
      navigator.clipboard?.writeText
    ) {
      navigator.clipboard.writeText(copyText);
    } else {
      // React Native Clipboard
      (Clipboard as any).setString?.(copyText);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Input bar right element ───────────────────────────────────────
  // If there's typed text → show send button
  // If no text → show mic button (hold to record)
  const renderInputRight = () => {
    if (text.trim()) {
      return (
        <Pressable
          style={[
            chatStyles.sendBtn,
            {
              backgroundColor: Colors.primary,
              opacity: sending ? 0.6 : 1,
            },
          ]}
          onPress={handleSend}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <HugeiconsIcon icon={TelegramIcon} size={20} color="#fff" />
          )}
        </Pressable>
      );
    }

    return (
      <Pressable
        style={[
          chatStyles.sendBtn,
          {
            backgroundColor: isRecording ? Colors.error : Colors.primary,
          },
        ]}
        onLongPress={startRecording}
        onPressOut={isRecording ? stopRecording : undefined}
        delayLongPress={200}
      >
        <HugeiconsIcon
          icon={isRecording ? MicOff01Icon : Mic01Icon}
          size={20}
          color="#fff"
        />
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[{ flex: 1, backgroundColor: bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header */}
      <View
        style={[
          chatStyles.header,
          {
            backgroundColor: cardBg,
            borderBottomColor: borderColor,
            paddingTop: topPadding + 12,
          },
        ]}
      >
        <Pressable onPress={onBack} style={chatStyles.backBtn} hitSlop={8}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={25} color={textColor} />
        </Pressable>

        <Pressable
          style={chatStyles.headerInfo}
          onPress={() => setContactModalVisible(true)}
        >
          <Avatar
            name={conversation.participant_name || "User"}
            size={38}
          />
          <View style={chatStyles.headerText}>
            <Text
              style={[chatStyles.headerName, { color: textColor }]}
              numberOfLines={1}
            >
              {conversation.participant_name}
            </Text>
            {otherTyping ? (
              <Text
                style={{
                  fontFamily: "Poppins_400Regular",
                  fontSize: 11,
                  fontStyle: "italic",
                  color: Colors.primary,
                }}
              >
                typing...
              </Text>
            ) : (
              <Text
                style={[chatStyles.headerRole, { color: subTextColor }]}
                numberOfLines={1}
              >
                {conversation.participant_driver_id
                  ? conversation.participant_driver_id
                  : conversation.participant_role}
                {conversation.participant_vehicle
                  ? ` · ${conversation.participant_vehicle}`
                  : ""}
              </Text>
            )}
          </View>
        </Pressable>

        {/* Call button */}
        <Pressable onPress={handleCall} style={chatStyles.callBtn} hitSlop={8}>
          <HugeiconsIcon icon={CallIcon} size={22} color={Colors.primary} />
        </Pressable>

        <Pressable
          onPress={() => setContactModalVisible(true)}
          hitSlop={8}
        >
          <HugeiconsIcon
            icon={MoreVerticalIcon}
            size={24}
            color={textColor}
          />
        </Pressable>
      </View>

      {/* Recording indicator */}
      {isRecording && (
        <View
          style={[
            chatStyles.recordingBanner,
            { backgroundColor: Colors.error + "22" },
          ]}
        >
          <View style={chatStyles.recordingDot} />
          <Text
            style={[chatStyles.recordingText, { color: Colors.error }]}
          >
            Recording... Release to send, tap × to cancel
          </Text>
          <Pressable onPress={cancelRecording} hitSlop={8}>
            <Text style={{ color: Colors.error, fontSize: 18 }}>×</Text>
          </Pressable>
        </View>
      )}

      {/* Messages list */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={chatStyles.messageList}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isMe = item.sender_id === user?.id;
          return (
            <MessageBubble
              message={item}
              isMe={isMe}
              onReply={() => handleReply(item)}
              onDelete={() => handleDelete(conversation.id, item.id)}
              onCopy={() => handleCopy(item)}
              isDark={isDark}
              textColor={textColor}
              subTextColor={subTextColor}
            />
          );
        }}
        ListEmptyComponent={
          <View style={chatStyles.emptyChat}>
            <HugeiconsIcon
              icon={Message02Icon}
              size={44}
              color={subTextColor}
            />
            <Text
              style={[chatStyles.emptyChatText, { color: subTextColor }]}
            >
              No messages yet. Say hello!
            </Text>
          </View>
        }
      />

      {/* Input bar */}
      <View
        style={[
          chatStyles.inputRow,
          {
            backgroundColor: cardBg,
            borderTopColor: borderColor,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <TextInput
          style={[
            chatStyles.input,
            { backgroundColor: inputBg, color: textColor },
          ]}
          placeholder="Type a message..."
          placeholderTextColor={subTextColor}
          value={text}
          onChangeText={handleTyping}
          multiline
          maxLength={2000}
          returnKeyType="default"
        />
        {renderInputRight()}
      </View>

      <ContactInfoModal
        visible={contactModalVisible}
        onClose={() => setContactModalVisible(false)}
        conversation={conversation}
        isDark={isDark}
      />
    </KeyboardAvoidingView>
  );
}

const chatStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerText: { flex: 1 },
  headerName: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  headerRole: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    marginTop: 1,
  },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.primary}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error,
  },
  recordingText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  messageList: {
    paddingVertical: 12,
    paddingBottom: 20,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingTop: 100,
  },
  emptyChatText: { fontFamily: "Poppins_400Regular", fontSize: 14 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    maxHeight: 120,
    minHeight: 42,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
  },
});

// ─── New Chat Modal ────────────────────────────────────────────────────────────
// Passengers search by driver ID (DRV-XXXXXX) or trip code.
// Performs a Supabase lookup and opens the chat if found.

function NewChatModal({
  visible,
  onClose,
  onStart,
  isDark,
}: {
  visible: boolean;
  onClose: () => void;
  onStart: (conv: Conversation) => void;
  isDark: boolean;
}) {
  const { user } = useAuthStore();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] =
    useState<DriverSearchResult | null>(null);
  // true = DB confirmed the driver exists, false = unverified (opened anyway)
  const [verified, setVerified] = useState(false);

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const borderColor = isDark ? "rgba(255,255,255,0.12)" : "#E8ECF0";
  const inputBg = isDark ? Colors.background : "#F4F6FA";

  // Reset when modal closes
  useEffect(() => {
    if (!visible) {
      setQuery("");
      setSearchResult(null);
      setVerified(false);
    }
  }, [visible]);

  const looksLikeDriverId = (v: string) =>
    v.includes("-") || v.toUpperCase().startsWith("DRV");

  const handleSearch = async () => {
    const clean = query.trim().toUpperCase();
    if (!clean || !user?.id) return;

    setSearching(true);
    setSearchResult(null);
    setVerified(false);

    // ── Helper: build an unverified fallback result from the raw input ──
    const fallback = (): DriverSearchResult => ({
      // We don't have a real UUID, so use the input as the id placeholder.
      // Messages will still be inserted with this as participant_id;
      // the driver will match via driver_id string in their conversation list.
      id: `unverified_${clean}`,
      full_name: clean,          // show the typed ID as the name
      phone: null,
      driver_id: clean,
      vehicle_details: null,
      park_name: null,
    });

    try {
      if (looksLikeDriverId(clean)) {
        // ── Attempt Supabase lookup by driver_id ───────────────────
        let found: DriverSearchResult | null = null;
        try {
          const { data } = await supabase
            .from("users")
            .select("id, full_name, phone, driver_id, vehicle_details, park_name")
            .eq("driver_id", clean)
            .maybeSingle();
          if (data) found = data as DriverSearchResult;
        } catch {
          // Supabase unreachable or table doesn't exist — continue to fallback
        }

        if (found) {
          setVerified(true);
          setSearchResult(found);
        } else {
          // Not in DB but still let the user open a chat
          setVerified(false);
          setSearchResult(fallback());
        }
        return;
      }

      // ── Fallback: trip code lookup ────────────────────────────────
      const trip = await TripsStorage.getByCode(clean);
      if (trip) {
        let driverProfile: DriverSearchResult | null = null;
        try {
          const { data } = await supabase
            .from("users")
            .select("id, full_name, phone, driver_id, vehicle_details, park_name")
            .eq("id", trip.driver_id)
            .maybeSingle();
          if (data) driverProfile = data as DriverSearchResult;
        } catch {}

        setVerified(!!driverProfile);
        setSearchResult(
          driverProfile ?? {
            id: trip.driver_id,
            full_name: "Driver",
            phone: null,
            driver_id: null,
            vehicle_details: null,
            park_name: null,
          }
        );
      } else {
        // Unknown trip code — still open with unverified result
        setVerified(false);
        setSearchResult(fallback());
      }
    } finally {
      setSearching(false);
    }
  };

  const handleStartChat = async () => {
    if (!searchResult || !user?.id) return;

    // Deterministic conversation ID so the same two users always share one thread
    const convId = `conv_${[user.id, searchResult.id]
      .sort()
      .join("_")}`;

    const conv: Conversation = {
      id: convId,
      participant_id: searchResult.id,
      participant_name: searchResult.full_name || "Driver",
      participant_role: "driver",
      participant_driver_id: searchResult.driver_id || undefined,
      participant_vehicle: searchResult.vehicle_details || undefined,
      participant_park_name: searchResult.park_name || undefined,
      participant_phone: searchResult.phone || undefined,
      last_message: "",
      last_message_at: new Date().toISOString(),
      unread_count: 0,
    };

    onStart(conv);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Pressable style={newChatStyles.backdrop} onPress={onClose} />
        <View style={[newChatStyles.sheet, { backgroundColor: cardBg }]}>
          <View style={newChatStyles.handle} />
          <Text style={[newChatStyles.title, { color: textColor }]}>
            New Message
          </Text>
          <Text
            style={[newChatStyles.subtitle, { color: subTextColor }]}
          >
            Enter a driver ID (e.g. DRV-A3X9KL) or a 6-character trip code
          </Text>

          {/* Search field */}
          <View
            style={[
              newChatStyles.inputRow,
              { backgroundColor: inputBg, borderColor },
            ]}
          >
            <HugeiconsIcon
              icon={Search01Icon}
              size={18}
              color={subTextColor}
            />
            <TextInput
              style={[newChatStyles.input, { color: textColor }]}
              placeholder="DRV-A3X9KL or ABC123"
              placeholderTextColor={subTextColor}
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                setSearchResult(null);
                setVerified(false);
              }}
              autoCapitalize="characters"
              autoFocus
              maxLength={20}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
            {query.trim().length > 0 && (
              <Pressable
                onPress={() => {
                  setQuery("");
                  setSearchResult(null);
                  setVerified(false);
                }}
                hitSlop={8}
              >
                <Text style={{ color: subTextColor, fontSize: 18 }}>×</Text>
              </Pressable>
            )}
          </View>

          {/* Search button */}
          <Pressable
            style={[
              newChatStyles.searchBtn,
              {
                backgroundColor: query.trim()
                  ? Colors.primary
                  : isDark
                  ? "#2A2A2A"
                  : "#E5E7EB",
                opacity: searching ? 0.7 : 1,
              },
            ]}
            onPress={handleSearch}
            disabled={!query.trim() || searching}
          >
            {searching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text
                style={[
                  newChatStyles.searchBtnText,
                  {
                    color: query.trim() ? "#fff" : subTextColor,
                  },
                ]}
              >
                Search
              </Text>
            )}
          </Pressable>

          {/* Search result card — always shown after search, verified or not */}
          {searchResult && (
            <View
              style={[
                newChatStyles.resultCard,
                {
                  backgroundColor: verified
                    ? isDark ? "#1C2921" : "#F0FDF4"
                    : isDark ? "#221A1A" : "#FFF8F0",
                  borderColor: verified
                    ? Colors.primary + "44"
                    : Colors.gold + "88",
                },
              ]}
            >
              <Avatar name={searchResult.full_name || "Driver"} size={48} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[newChatStyles.resultName, { color: textColor }]}>
                    {verified ? searchResult.full_name || "Driver" : searchResult.driver_id}
                  </Text>
                  {/* Verified / unverified badge */}
                  <View
                    style={[
                      newChatStyles.badge,
                      { backgroundColor: verified ? Colors.primary + "22" : Colors.gold + "33" },
                    ]}
                  >
                    <Text
                      style={[
                        newChatStyles.badgeText,
                        { color: verified ? Colors.primary : Colors.gold },
                      ]}
                    >
                      {verified ? "✓ verified" : "⚠ unverified"}
                    </Text>
                  </View>
                </View>
                {searchResult.driver_id && verified && (
                  <Text style={[newChatStyles.resultSub, { color: Colors.primary }]}>
                    {searchResult.driver_id}
                  </Text>
                )}
                {!verified && (
                  <Text style={[newChatStyles.resultSub, { color: Colors.gold }]}>
                    ID not found in database — messages may not deliver
                  </Text>
                )}
                {searchResult.vehicle_details && (
                  <Text style={[newChatStyles.resultSub, { color: subTextColor }]}>
                    🚗 {searchResult.vehicle_details}
                  </Text>
                )}
              </View>
              <Pressable
                style={[
                  newChatStyles.startBtn,
                  { backgroundColor: verified ? Colors.primary : Colors.gold },
                ]}
                onPress={handleStartChat}
              >
                <Text style={newChatStyles.startBtnText}>
                  {verified ? "Chat" : "Open"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const newChatStyles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 344,
    gap: 14,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(154,154,154,0.3)",
    alignSelf: "center",
    marginBottom: 4,
  },
  title: { fontFamily: "Poppins_700Bold", fontSize: 20 },
  subtitle: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 20 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    padding: 0,
    letterSpacing: 1,
  },
  searchBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  searchBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  resultName: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  resultSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10,
  },
  startBtn: {
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  startBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
});

// ─── Conversation List Item ───────────────────────────────────────────────────

function ConvItem({
  item,
  onPress,
  onDelete,
  isDark,
  textColor,
  subTextColor,
  cardBg,
  borderColor,
}: {
  item: Conversation;
  onPress: () => void;
  onDelete: () => void;
  isDark: boolean;
  textColor: string;
  subTextColor: string;
  cardBg: string;
  borderColor: string;
}) {
  const timeStr = item.last_message_at
    ? new Date(item.last_message_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <Swipeable
      renderRightActions={() => (
        <Pressable
          onPress={onDelete}
          style={[
            convItemStyles.deleteSwipe,
            { backgroundColor: Colors.error },
          ]}
        >
          <HugeiconsIcon icon={Delete01Icon} size={22} color="#fff" />
        </Pressable>
      )}
    >
      <Pressable
        style={({ pressed }) => [
          convItemStyles.item,
          { backgroundColor: cardBg, borderBottomColor: borderColor },
          pressed && { opacity: 0.85 },
        ]}
        onPress={onPress}
      >
        <View style={{ position: "relative" }}>
          <Avatar name={item.participant_name || "User"} size={50} />
          {(item.unread_count ?? 0) > 0 && (
            <View style={convItemStyles.unreadDot} />
          )}
        </View>

        <View style={convItemStyles.textBlock}>
          <View style={convItemStyles.topRow}>
            <Text
              style={[convItemStyles.name, { color: textColor }]}
              numberOfLines={1}
            >
              {item.participant_name}
            </Text>
            <Text style={[convItemStyles.time, { color: subTextColor }]}>
              {timeStr}
            </Text>
          </View>
          <View style={convItemStyles.bottomRow}>
            <Text
              style={[convItemStyles.lastMsg, { color: subTextColor }]}
              numberOfLines={1}
            >
              {item.trip_code ? `[${item.trip_code}] ` : ""}
              {item.last_message || "Start a conversation"}
            </Text>
            {(item.unread_count ?? 0) > 0 && (
              <View style={convItemStyles.badge}>
                <Text style={convItemStyles.badgeText}>
                  {(item.unread_count ?? 0) > 9
                    ? "9+"
                    : item.unread_count}
                </Text>
              </View>
            )}
          </View>
          {item.participant_driver_id && (
            <Text
              style={[
                convItemStyles.driverId,
                { color: Colors.primary + "BB" },
              ]}
            >
              {item.participant_driver_id}
            </Text>
          )}
        </View>
      </Pressable>
    </Swipeable>
  );
}

const convItemStyles = StyleSheet.create({
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  textBlock: { flex: 1, gap: 2 },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: { fontFamily: "Poppins_600SemiBold", fontSize: 15, flex: 1 },
  time: { fontFamily: "Poppins_400Regular", fontSize: 11 },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lastMsg: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    flex: 1,
  },
  driverId: { fontFamily: "Poppins_400Regular", fontSize: 11 },
  badge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    marginLeft: 6,
  },
  badgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10,
    color: "#fff",
  },
  unreadDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: "#fff",
  },
  deleteSwipe: {
    width: 70,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── Main Messages Tab ────────────────────────────────────────────────────────

export default function MessagesTab() {
  const insets = useSafeAreaInsets();
  const { theme } = useSettingsStore();
  const { user } = useAuthStore();
  const {
    conversations,
    addConversation,
    deleteConversation,
    subscribeToRealtime,
  } = useMessagesStore();

  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [newChatVisible, setNewChatVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : "#F0F0F0";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  // Subscribe to realtime so drivers receive incoming messages
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeToRealtime(user.id);
    return () => unsub?.();
  }, [user?.id]);

  // Filter conversations relevant to the current user's role
  const visibleConversations = useMemo(() => {
    if (!user) return [];
    if (user.role === "driver") {
      // Drivers see conversations where they are the participant
      return conversations.filter(
        (c) =>
          c.participant_id === user.id ||
          (user.driver_id &&
            c.participant_driver_id === user.driver_id)
      );
    }
    // Passengers see conversations they started with drivers
    return conversations.filter(
      (c) => c.participant_role === "driver"
    );
  }, [conversations, user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 700));
    setRefreshing(false);
  }, []);

  // When a passenger starts a new chat, persist the conversation and
  // also write a mirror record to Supabase so the driver can see it.
  const handleStartConversation = async (conv: Conversation) => {
    await addConversation(conv);

    // Mirror to Supabase so driver's realtime subscription picks it up
    if (user) {
      try {
        await supabase.from("conversations").upsert([
          {
            id: conv.id,
            participant_id: conv.participant_id,
            participant_name: conv.participant_name,
            participant_role: conv.participant_role,
            participant_driver_id: conv.participant_driver_id ?? null,
            participant_phone: conv.participant_phone ?? null,
            participant_vehicle: conv.participant_vehicle ?? null,
            passenger_id: user.id,
            passenger_name: user.full_name || "Passenger",
            passenger_phone: user.phone || null,
            last_message: "",
            last_message_at: new Date().toISOString(),
            unread_count: 0,
            trip_code: conv.trip_code ?? null,
          },
        ]);
      } catch (e) {
        console.warn("[Messages] Failed to mirror conversation:", e);
      }
    }

    setActiveConv(conv);
  };

  const handleDeleteConversation = (id: string) => {
    Alert.alert("Delete conversation", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteConversation(id),
      },
    ]);
  };

  // If a chat is active, render it full-screen
  if (activeConv) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ChatScreen
          conversation={activeConv}
          onBack={() => setActiveConv(null)}
          isDark={isDark}
        />
      </GestureHandlerRootView>
    );
  }

  return (
    <>
      <GestureHandlerRootView style={[styles.root, { backgroundColor: bg }]}>
        <StatusBar style={isDark ? "light" : "dark"} />

        {/* Header */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: cardBg,
              paddingTop: topPadding + 12,
              borderBottomColor: borderColor,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: textColor }]}>
              Messages
            </Text>
            {user?.role === "driver" && (
              <Text
                style={{
                  fontFamily: "Poppins_400Regular",
                  fontSize: 12,
                  color: subTextColor,
                  marginTop: 1,
                }}
              >
                Passenger messages appear here
              </Text>
            )}
          </View>

          {/* Only passengers initiate; drivers only respond */}
          {user?.role !== "driver" && (
            <Pressable
              style={styles.newChatBtn}
              onPress={() => setNewChatVisible(true)}
            >
              <HugeiconsIcon
                icon={PlusSignIcon}
                size={23}
                color={textColor}
              />
            </Pressable>
          )}
        </View>

        <FlatList
          data={visibleConversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          renderItem={({ item }) => (
            <ConvItem
              item={item}
              isDark={isDark}
              textColor={textColor}
              subTextColor={subTextColor}
              cardBg={cardBg}
              borderColor={borderColor}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveConv(item);
              }}
              onDelete={() => handleDeleteConversation(item.id)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <HugeiconsIcon
                icon={ChartBubbleIcon}
                size={52}
                color={subTextColor}
              />
              <Text style={[styles.emptyTitle, { color: textColor }]}>
                {user?.role === "driver"
                  ? "No passenger messages yet"
                  : "No conversations yet"}
              </Text>
              <Text style={[styles.emptySub, { color: subTextColor }]}>
                {user?.role === "driver"
                  ? "When passengers message you, they'll appear here."
                  : "Enter a driver ID to start chatting."}
              </Text>
              {user?.role !== "driver" && (
                <Pressable
                  style={[
                    styles.emptyBtn,
                    { backgroundColor: Colors.primary },
                  ]}
                  onPress={() => setNewChatVisible(true)}
                >
                  <Text style={styles.emptyBtnText}>Start a conversation</Text>
                </Pressable>
              )}
            </View>
          }
        />
      </GestureHandlerRootView>

      <NewChatModal
        visible={newChatVisible}
        onClose={() => setNewChatVisible(false)}
        isDark={isDark}
        onStart={handleStartConversation}
      />
    </>
  );
}

// ─── Root styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 24 },
  newChatBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: { flexGrow: 1 },
  empty: {
    alignItems: "center",
    paddingTop: 100,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    textAlign: "center",
  },
  emptySub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyBtn: {
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
  },
  emptyBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
});