import React, { useState, useRef, useEffect } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useMessagesStore, type Conversation, type Message } from "@/src/store/useMessagesStore";
import { Colors } from "@/constants/colors";
import Avatar from "@/components/Avatar";
import { generateId } from "@/src/utils/helpers";
import { TripsStorage } from "@/src/services/storage";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  ArrowLeftIcon,

  SearchIcon,
  Message02Icon,
  PlusSignIcon,
  ChartBubbleIcon,
  Send,
} from "@hugeicons/core-free-icons";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

// Chat Screen Component
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
  const { addMessage, markRead, getMessages } = useMessagesStore();
  const [text, setText] = useState("");
  const listRef = useRef<FlatList>(null);

  const bg = isDark ? "#0D1117" : "#F4F6FA";
  const textColor = isDark ? "#F0F0F0" : "#0D1B3E";
  const subColor = isDark ? "#6B7280" : "#9CA3AF";
  const inputBg = isDark ? "#161B22" : "#FFFFFF";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";

  const messages = getMessages(conversation.id);

  useEffect(() => {
    markRead(conversation.id);
  }, [conversation.id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const send = () => {
    const t = text.trim();
    if (!t || !user?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const msg: Message = {
      id: generateId(),
      conversationId: conversation.id,
      senderId: user.id,
      senderName: user.full_name || "Me",
      text: t,
      createdAt: new Date().toISOString(),
      read: true,
    };
    addMessage(msg);
    setText("");
  };

  return (
    <KeyboardAvoidingView
      style={[styles.chatRoot, { backgroundColor: bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={[chatStyles.header, { backgroundColor: isDark ? "#161B22" : "#fff", borderBottomColor: borderColor }]}>
        <Pressable onPress={onBack} style={chatStyles.backBtn} hitSlop={8}>
          <HugeiconsIcon icon={ArrowLeftIcon} size={20} color={Colors.primary} />
        </Pressable>
        <Avatar name={conversation.participantName} size={38} />
        <View style={chatStyles.headerText}>
          <Text style={[chatStyles.headerName, { color: textColor }]}>{conversation.participantName}</Text>
          <Text style={[chatStyles.headerRole, { color: subColor }]}>
            {conversation.participantRole}
            {conversation.participantDriverId ? ` · ${conversation.participantDriverId}` : ""}
          </Text>
        </View>
      </View>

      {/* Messages List */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={chatStyles.messageList}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isMe = item.senderId === user?.id;
          return (
            <View style={[chatStyles.bubble, isMe ? chatStyles.bubbleMe : chatStyles.bubbleThem]}>
              <Text style={[chatStyles.bubbleText, { color: isMe ? "#fff" : textColor }]}>{item.text}</Text>
              <Text style={[chatStyles.bubbleTime, { color: isMe ? "rgba(255,255,255,0.6)" : subColor }]}>
                {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={chatStyles.emptyChat}>
            <HugeiconsIcon icon={Message02Icon} size={40} color={subColor} />
            <Text style={[chatStyles.emptyChatText, { color: subColor }]}>No messages yet. Say hello!</Text>
          </View>
        }
      />

      {/* Input Bar */}
      <View style={[chatStyles.inputRow, { backgroundColor: inputBg, borderTopColor: borderColor }]}>
        <TextInput
          style={[chatStyles.input, { backgroundColor: isDark ? "#0D1117" : "#F4F6FA", color: textColor }]}
          placeholder="Type a message..."
          placeholderTextColor={subColor}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={send}
          blurOnSubmit={false}
        />
        <Pressable
          style={[chatStyles.sendBtn, { backgroundColor: text.trim() ? Colors.primary : (isDark ? "#2A2A2A" : "#E5E7EB") }]}
          onPress={send}
          disabled={!text.trim()}
        >
          <HugeiconsIcon icon={Send} size={16} color={text.trim() ? "#fff" : subColor} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// New Conversation Modal (similar to original but with Hugeicons)
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
  const [driverRef, setDriverRef] = useState("");
  const [searching, setSearching] = useState(false);
  const { user } = useAuthStore();

  const textColor = isDark ? "#F0F0F0" : "#0D1B3E";
  const subColor = isDark ? "#6B7280" : "#9CA3AF";
  const bg = isDark ? "#161B22" : "#FFFFFF";
  const inputBg = isDark ? "#0D1117" : "#F4F6FA";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";

  const handleSearch = async () => {
    if (!driverRef.trim()) return;
    setSearching(true);
    try {
      const all = await TripsStorage.getAll();
      const trip = all.find((t) => t.trip_code === driverRef.toUpperCase() || t.driver_id === driverRef.trim());
      if (trip) {
        const conv: Conversation = {
          id: generateId(),
          participantId: trip.driver_id,
          participantName: "Driver",
          participantRole: "driver",
          lastMessage: "",
          lastMessageAt: new Date().toISOString(),
          unreadCount: 0,
        };
        onStart(conv);
        setDriverRef("");
        onClose();
      } else {
        const conv: Conversation = {
          id: generateId(),
          participantId: driverRef.trim(),
          participantName: driverRef.trim(),
          participantRole: "driver",
          participantDriverId: driverRef.trim(),
          lastMessage: "",
          lastMessageAt: new Date().toISOString(),
          unreadCount: 0,
        };
        onStart(conv);
        setDriverRef("");
        onClose();
      }
    } catch {
      Alert.alert("Error", "Could not find driver.");
    } finally {
      setSearching(false);
    }
  };
  
  // const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.backdrop} onPress={onClose} />
      <KeyboardAwareScrollViewCompat
        style={modalStyles.scroll}
        contentContainerStyle={[
          modalStyles.scrollContent,
          // { paddingBottom: Math.max(insets.bottom, 24) + (Platform.OS === "web" ? 34 : 0) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        
        <View style={[modalStyles.sheet, { backgroundColor: bg }]}>
          <View style={modalStyles.handle} />
          <Text style={[modalStyles.title, { color: textColor }]}>New Message</Text>
          <Text style={[modalStyles.sub, { color: subColor }]}>Enter a Driver ID or trip code to start a conversation</Text>
          <View style={[modalStyles.inputRow, { backgroundColor: inputBg, borderColor }]}>
            <HugeiconsIcon icon={SearchIcon} size={18} color={subColor} />
            <TextInput
              style={[modalStyles.input, { color: textColor }]}
              placeholder="e.g. DRV-A3X9KL or ABC123"
              placeholderTextColor={subColor}
              value={driverRef}
              onChangeText={setDriverRef}
              autoCapitalize="characters"
              autoFocus
              onSubmitEditing={handleSearch}
            />
          </View>
          <Pressable
            style={[modalStyles.startBtn, { backgroundColor: driverRef.trim() ? Colors.primary : (isDark ? "#2A2A2A" : "#E5E7EB") }]}
            onPress={handleSearch}
            disabled={!driverRef.trim() || searching}
          >
            <Text style={[modalStyles.startBtnText, { color: driverRef.trim() ? "#fff" : subColor }]}>
              {searching ? "Searching..." : "Start Chat"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollViewCompat>
    </Modal>
  );
}

// Main Messages Tab
export default function MessagesTab() {
  const insets = useSafeAreaInsets();
  
  const { user } = useAuthStore();
  const { theme } = useSettingsStore();
  const { conversations, addConversation } = useMessagesStore();
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [newChatVisible, setNewChatVisible] = useState(false);

  const isDark = theme === "dark";
  const bg = isDark ? "#0D1117" : "#F4F6FA";
  const cardBg = isDark ? "#161B22" : "#FFFFFF";
  const textColor = isDark ? "#F0F0F0" : "#0D1B3E";
  const subColor = isDark ? "#6B7280" : "#9CA3AF";
  const borderColor = isDark ? "rgba(255,255,255,0.06)" : "#E8ECF0";
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  if (activeConv) {
    return <ChatScreen conversation={activeConv} onBack={() => setActiveConv(null)} isDark={isDark} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View style={[styles.header, { backgroundColor: cardBg, paddingTop: topPadding + 12, borderBottomColor: borderColor }]}>
        <Text style={[styles.headerTitle, { color: textColor }]}>Messages</Text>
        <Pressable style={[styles.newChatBtn, { backgroundColor: Colors.primaryLight }]} onPress={() => setNewChatVisible(true)}>
          <HugeiconsIcon icon={PlusSignIcon} size={18} color={Colors.primary} />
        </Pressable>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.convItem, { backgroundColor: cardBg, borderColor }, pressed && { opacity: 0.85 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveConv(item);
            }}
          >
            <Avatar name={item.participantName} size={48} />
            <View style={styles.convText}>
              <View style={styles.convTopRow}>
                <Text style={[styles.convName, { color: textColor }]} numberOfLines={1}>{item.participantName}</Text>
                <Text style={[styles.convTime, { color: subColor }]}>
                  {item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                </Text>
              </View>
              <View style={styles.convBottomRow}>
                <Text style={[styles.convLastMsg, { color: subColor }]} numberOfLines={1}>{item.lastMessage || "No messages yet"}</Text>
                {item.unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{item.unreadCount}</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <HugeiconsIcon icon={ChartBubbleIcon} size={48} color={subColor} />
            <Text style={[styles.emptyTitle, { color: textColor }]}>No conversations yet</Text>
            <Text style={[styles.emptySub, { color: subColor }]}>Start a chat with a driver by tapping the compose button above</Text>
            <Pressable style={[styles.emptyBtn, { backgroundColor: Colors.primary }]} onPress={() => setNewChatVisible(true)}>
              <Text style={styles.emptyBtnText}>Start a conversation</Text>
            </Pressable>
          </View>
        }
      />

      <NewChatModal visible={newChatVisible} onClose={() => setNewChatVisible(false)} isDark={isDark} onStart={(conv) => {
        addConversation(conv);
        setActiveConv(conv);
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  chatRoot: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 24 },
  newChatBtn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  listContent: { padding: 16, gap: 10 },
  convItem: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 18, padding: 14, borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  convText: { flex: 1, gap: 4 },
  convTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  convName: { fontFamily: "Poppins_600SemiBold", fontSize: 15, flex: 1 },
  convTime: { fontFamily: "Poppins_400Regular", fontSize: 11 },
  convBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  convLastMsg: { fontFamily: "Poppins_400Regular", fontSize: 13, flex: 1 },
  unreadBadge: { backgroundColor: Colors.primary, borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  unreadText: { fontFamily: "Poppins_700Bold", fontSize: 10, color: "#fff" },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 40, gap: 12 },
  emptyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, textAlign: "center" },
  emptySub: { fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", lineHeight: 22 },
  emptyBtn: { borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  emptyBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },
});

const chatStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1 },
  headerName: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  headerRole: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  messageList: { padding: 16, gap: 8, flexGrow: 1 },
  bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  bubbleMe: { alignSelf: "flex-end", backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleThem: { alignSelf: "flex-start", backgroundColor: "#1E2820", borderBottomLeftRadius: 4 },
  bubbleText: { fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 21 },
  bubbleTime: { fontFamily: "Poppins_400Regular", fontSize: 10, alignSelf: "flex-end" },
  emptyChat: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
  emptyChatText: { fontFamily: "Poppins_400Regular", fontSize: 14 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontFamily: "Poppins_400Regular", fontSize: 14, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 44, paddingTop: 198, paddingBottom: 10, },
  sheet: {  position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 14 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.15)", alignSelf: "center", marginBottom: 8 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  sub: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 20, marginTop: -6 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1.5 },
  input: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 14, padding: 0 },
  startBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  startBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
});