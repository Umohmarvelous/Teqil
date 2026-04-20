import React, { useState, useRef, useEffect, useCallback } from "react";
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

} from "@hugeicons/core-free-icons";
import { StatusBar } from "expo-status-bar";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { supabase } from "@/src/services/supabase";

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
    const url = `tel:${phone.replace(/\s/g, '')}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Alert.alert("Cannot make call", "Your device cannot make phone calls.");
      }
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable style={modalStyles.backdrop} onPress={onClose} />
        <View style={[modalStyles.sheet, { backgroundColor: cardBg }]}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.headerRow}>
            <Text style={[modalStyles.title, { color: textColor }]}>Contact Info</Text>
            <Pressable onPress={onClose}>
              <HugeiconsIcon icon={ArrowLeft01Icon} size={24} color={textColor} />
            </Pressable>
          </View>
          <View style={modalStyles.avatarCenter}>
            <Avatar name={conversation.participant_name || "User"} size={64} />
            <Text style={[modalStyles.contactName, { color: textColor }]}>{conversation.participant_name}</Text>
            <Text style={[modalStyles.contactRole, { color: subTextColor }]}>
              {conversation.participant_role}
              {conversation.participant_driver_id ? ` · ${conversation.participant_driver_id}` : ''}
            </Text>
          </View>
          <View style={modalStyles.actionRow}>
            <Pressable style={[modalStyles.actionBtn, { backgroundColor: Colors.primary }]} onPress={handleCall}>
              <HugeiconsIcon icon={CallIcon} size={20} color="#fff" />
              <Text style={modalStyles.actionBtnText}>Call</Text>
            </Pressable>
            <Pressable style={[modalStyles.actionBtn, { backgroundColor: Colors.primaryDarker }]} onPress={onClose}>
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
  backdrop: { flex: 1,  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 30,
    paddingTop: 10,
    paddingBottom: 400,
    gap: 14,
  },
  handle: { width: 60, height: 4, borderRadius: 2, backgroundColor: "rgba(154 154 154 / 0.15)", alignSelf: "center", marginBottom: 5 },
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
  input: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 14, padding: 0 },
  startBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  startBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  avatarCenter: { alignItems: "center", marginVertical: 16, gap: 6 },
  contactName: { fontFamily: "Poppins_700Bold", fontSize: 20 },
  contactRole: { fontFamily: "Poppins_400Regular", fontSize: 14 },
  actionRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  actionBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },
});

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({
  message,
  isMe,
  onReply,
  onDelete,
  onCopy,
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
      <Pressable onPress={onReply} style={[bubbleStyles.swipeAction, { backgroundColor: Colors.gold }]}>
        <HugeiconsIcon icon={Reply} size={18} color="#fff" />
      </Pressable>
      <Pressable onPress={onCopy} style={[bubbleStyles.swipeAction, { backgroundColor: Colors.primary }]}>
        <HugeiconsIcon icon={Copy01Icon} size={18} color="#fff" />
      </Pressable>
      <Pressable onPress={onDelete} style={[bubbleStyles.swipeAction, { backgroundColor: Colors.error }]}>
        <HugeiconsIcon icon={Delete01Icon} size={18} color="#fff" />
      </Pressable>
    </View>
  );

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <View style={[bubbleStyles.container, isMe ? bubbleStyles.containerMe : bubbleStyles.containerThem]}>
        <View style={[bubbleStyles.bubble, isMe ? bubbleStyles.bubbleMe : bubbleStyles.bubbleThem]}>
          <Text style={[bubbleStyles.text, { color: isMe ? "#fff" : textColor }]}>
            {message.text}
          </Text>
          <View style={bubbleStyles.meta}>
            <Text style={[bubbleStyles.time, { color: isMe ? "rgba(255,255,255,0.6)" : subTextColor }]}>
              {message.created_at ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
            </Text>
            {isMe && (
              <HugeiconsIcon
                icon={message.status === "read" ? TaskDone01Icon : Checkmark}
                size={14}
                color={message.status === "read" ? "#34B7F1" : "rgba(255,255,255,0.5)"}
              />
            )}
          </View>
        </View>
      </View>
    </Swipeable>
  );
}

const bubbleStyles = StyleSheet.create({
  container: { marginVertical: 4 },
  containerMe: { alignItems: "flex-end" },
  containerThem: { alignItems: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  bubbleMe: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: "#1E2820", borderBottomLeftRadius: 4 },
  text: { fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 21 },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  time: { fontFamily: "Poppins_400Regular", fontSize: 10 },
  swipeActions: { flexDirection: "row", alignItems: "center" },
  swipeAction: { width: 50, height: "100%", alignItems: "center", justifyContent: "center" },
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
  const { addMessage, markRead, messages: allMessages, setTyping, typingUsers, deleteMessage } = useMessagesStore();
  const [text, setText] = useState("");
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bg = isDark ? Colors.background : "#F5F5F5";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const messages = allMessages[conversation.id] || [];
  const otherTyping = typingUsers[conversation.id] || false;

  useEffect(() => {
    markRead(conversation.id);
  }, [conversation.id, markRead]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleTyping = (value: string) => {
    setText(value);
    setTyping(conversation.id, true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => setTyping(conversation.id, false), 1500);
  };

  const handleSend = async () => {
    if (!text.trim() || !user?.id || sending) return;
    setSending(true);
    const msg: Message = {
      id: generateId(),
      conversation_id: conversation.id,
      sender_id: user.id,
      sender_name: user.full_name || "Me",
      sender_role: user.role as any,
      text: text.trim(),
      created_at: new Date().toISOString(),
      read: false,
      status: "sent",
    };
    setText("");
    setTyping(conversation.id, false);
    await addMessage(msg);
    setSending(false);
  };

  const handleCall = () => {
    const phone = conversation.participant_phone;
    if (!phone) {
      Alert.alert("No phone number", "This contact has no phone number available.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
  };

  const handleReply = (message: Message) => {
    const replyText = message.text?.trim();
    if (!replyText) return;
    setText(`@${message.sender_name || "User"} ${replyText} `);
  };

  const handleDelete = async (conversationId: string, messageId: string) => {
    try {
      await deleteMessage(conversationId, messageId);
    } catch (error) {
      console.warn("[Messages] Failed to delete message", error);
      Alert.alert("Delete failed", "Couldn't remove that message. Please try again.");
    }
  };

  const handleCopy = async (message: Message) => {
    const copyText = message.text?.trim();
    if (!copyText) return;

    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(copyText);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }

    Alert.alert("Copy message", copyText);
  };

  return (
    <KeyboardAvoidingView
      style={[{ backgroundColor: bg }, {flex: 1}]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={[chatStyles.header, { backgroundColor: cardBg, borderBottomColor: borderColor, paddingTop: topPadding + 12 }]}>
        <Pressable onPress={onBack} style={chatStyles.backBtn} hitSlop={8}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={25} color={textColor} />
        </Pressable>
        <Pressable onPress={() => setContactModalVisible(true)} style={chatStyles.headerInfo}>
          <Avatar name={conversation.participant_name || "User"} size={38} />
          <View style={chatStyles.headerText}>
            <Text style={[chatStyles.headerName, { color: textColor }]}>{conversation.participant_name}</Text>
            {otherTyping ? (
              <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, fontStyle: "italic", color: Colors.primary }}>typing...</Text>
            ) : (
              <Text style={[chatStyles.headerRole, { color: subTextColor }]}>
                {conversation.participant_role}
                {conversation.participant_driver_id ? ` · ${conversation.participant_driver_id}` : ''}
              </Text>
            )}
          </View>
        </Pressable>
        {/* Call button */}
        <Pressable onPress={handleCall} style={chatStyles.callBtn} hitSlop={8}>
          <HugeiconsIcon icon={CallIcon} size={22} color={Colors.primary} />
        </Pressable>
        <Pressable onPress={() => setContactModalVisible(true)} hitSlop={8}>
          <HugeiconsIcon icon={MoreVerticalIcon} size={24} color={textColor} />
        </Pressable>
      </View>

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
            <HugeiconsIcon icon={Message02Icon} size={40} color={subTextColor} />
            <Text style={[chatStyles.emptyChatText, { color: subTextColor }]}>No messages yet. Say hello!</Text>
          </View>
        }
      />

      <View style={[chatStyles.inputRow, { backgroundColor: cardBg, borderTopColor: borderColor }]}>
        <TextInput
          style={[chatStyles.input, { backgroundColor: isDark ? Colors.overlay : "#F4F6FA", color: textColor }]}
          placeholder="Type a message..."
          placeholderTextColor={subTextColor}
          value={text}
          onChangeText={handleTyping}
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <Pressable
          style={[chatStyles.sendBtn, { backgroundColor: Colors.primary, opacity: sending ? 0.6 : 1 }]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <HugeiconsIcon icon={TelegramIcon} size={22} color="#fff" />
          )}
        </Pressable>
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
  backBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  headerInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  headerText: { flex: 1 },
  headerName: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  headerRole: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  callBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: `${Colors.primary}20`, alignItems: "center", justifyContent: "center" },
  messageList: { padding: 16, paddingBottom: 20, flexGrow: 1 },
  emptyChat: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
  emptyChatText: { fontFamily: "Poppins_400Regular", fontSize: 14 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});

// ─── New Chat Modal — passenger finds driver by trip code ─────────────────────
// function NewChatModal({
//   visible,
//   onClose,
//   onStart,
//   isDark,
// }: {
//   visible: boolean;
//   onClose: () => void;
//   onStart: (conv: Conversation) => void;
//   isDark: boolean;
// }) {
//   const { user } = useAuthStore();
//   const [tripCode, setTripCode] = useState("");
//   const [searching, setSearching] = useState(false);

//   const textColor = isDark ? Colors.textWhite : Colors.text;
//   const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
//   const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
//   const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";

//   const handleSearch = async () => {
//     const code = tripCode.trim().toUpperCase();
//     if (!code || !user?.id) return;
//     setSearching(true);
//     try {
//       const trip = await TripsStorage.getByCode(code);
//       if (trip) {
//         // Try to get driver's phone from Supabase
//         let driverPhone: string | undefined;
//         let driverName = "Driver";
//         let driverId = trip.driver_id;
//         let driverVehicle: string | undefined;

//         try {
//           const { data } = await supabase
//             .from('users')
//             .select('full_name, phone, driver_id, vehicle_details')
//             .eq('id', trip.driver_id)
//             .single();
//           if (data) {
//             driverPhone = data.phone;
//             driverName = data.full_name || "Driver";
//             driverId = data.driver_id || trip.driver_id;
//             driverVehicle = data.vehicle_details;
//           }
//         } catch (_) {}

//         // Conversation ID: deterministic from passenger + driver + trip
//         const convId = `conv_${user.id}_${trip.driver_id}_${trip.trip_code}`;
//         const conv: Conversation = {
//           id: convId,
//           participant_id: trip.driver_id,
//           participant_name: driverName,
//           participant_role: "driver",
//           participant_driver_id: driverId,
//           participant_vehicle: driverVehicle,
//           participant_phone: driverPhone,
//           last_message: "",
//           last_message_at: new Date().toISOString(),
//           unread_count: 0,
//           trip_code: trip.trip_code,
//         };
//         onStart(conv);
//         setTripCode("");
//         onClose();
//       } else {
//         Alert.alert("Not found", "No active trip found with that code.");
//       }
//     } catch (e) {
//       Alert.alert("Error", "Could not search for trip.");
//     } finally {
//       setSearching(false);
//     }
//   };

//   return (
//     <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
//       <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined } style={{ flex: 1, justifyContent: "flex-end"  }}>
//         <Pressable style={modalStyles.backdrop} onPress={onClose} />
//         <View style={[modalStyles.sheet, { backgroundColor: cardBg }]}>
//           <View style={modalStyles.handle} />
//           {/* <Text style={[modalStyles.title, { color: textColor }]}>Message a Driver</Text> */}
//           <Text style={[{ fontFamily: "Poppins_400Regular", fontSize: 13, color: subTextColor }]}>
//             Enter the trip code to contact the driver
//           </Text>
//           <View style={[modalStyles.inputRow, { backgroundColor: isDark ? Colors.background : "#F4F6FA", borderColor }]}>
//             <HugeiconsIcon icon={Search02Icon} size={18} color={subTextColor} />
//             <TextInput
//               style={[modalStyles.input, { color: textColor }]}
//               placeholder="e.g. ABC123"
//               placeholderTextColor={subTextColor}
//               value={tripCode}
//               onChangeText={(v) => setTripCode(v.toLowerCase())}
//               autoCapitalize="characters"
//               autoFocus
//               maxLength={6}
//               onSubmitEditing={handleSearch}
//             />
//           </View>
//           <Pressable
//             style={[modalStyles.startBtn, { backgroundColor: tripCode.length === 6 ? Colors.primary : (isDark ? "#2A2A2A" : "#E5E7EB") }]}
//             onPress={handleSearch}
//             disabled={tripCode.length < 6 || searching}
//           >
//             <Text style={[modalStyles.startBtnText, { color: tripCode.length === 6 ? "#fff" : subTextColor }]}>
//               {searching ? "Searching..." : "Start Chat"}
//             </Text>
//           </Pressable>
//         </View>
//       </KeyboardAvoidingView>
//     </Modal>
//   );
// }

// ─── New Chat Modal ────────────────────────────────────────────────────────────
// Passengers enter the driver's ID (e.g. "DRV-A3X9KL") to start a chat.
// Driver IDs are shown on the driver's profile and QR code.
// Trip code lookup is also supported as a fallback.
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

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";

  // Returns true if input looks like a driver ID (contains a dash or "DRV")
  const looksLikeDriverId = (v: string) =>
    v.includes("-") || v.toUpperCase().startsWith("DRV");

  const handleSearch = async () => {
    const clean = query.trim().toUpperCase();
    if (!clean || !user?.id) return;
    setSearching(true);

    try {
      if (looksLikeDriverId(clean)) {
        // ── Path A: look up by driver ID ──────────────────────────────────
        const { data: driverData, error } = await supabase
          .from("users")
          .select("id, full_name, phone, driver_id, vehicle_details, park_name")
          .eq("driver_id", clean)
          .maybeSingle();

        if (error && error.code !== "PGRST116") throw error;

        if (driverData) {
          const convId = `conv_${user.id}_${driverData.id}`;
          const conv: Conversation = {
            id: convId,
            participant_id: driverData.id,
            participant_name: driverData.full_name || "Driver",
            participant_role: "driver",
            participant_driver_id: driverData.driver_id,
            participant_vehicle: driverData.vehicle_details,
            participant_phone: driverData.phone,
            last_message: "",
            last_message_at: new Date().toISOString(),
            unread_count: 0,
          };
          onStart(conv);
          setQuery("");
          onClose();
          return;
        }

        Alert.alert(
          "Driver not found",
          `No driver with ID "${clean}" was found. Check the ID and try again.`
        );
        return;
      }

      // ── Path B: fallback — look up by trip code ────────────────────────
      const trip = await TripsStorage.getByCode(clean);
      if (trip) {
        let driverPhone: string | undefined;
        let driverName = "Driver";
        let driverId = trip.driver_id;
        let driverVehicle: string | undefined;

        try {
          const { data } = await supabase
            .from("users")
            .select("full_name, phone, driver_id, vehicle_details")
            .eq("id", trip.driver_id)
            .single();
          if (data) {
            driverPhone = data.phone;
            driverName = data.full_name || "Driver";
            driverId = data.driver_id || trip.driver_id;
            driverVehicle = data.vehicle_details;
          }
        } catch {}

        const convId = `conv_${user.id}_${trip.driver_id}_${trip.trip_code}`;
        const conv: Conversation = {
          id: convId,
          participant_id: trip.driver_id,
          participant_name: driverName,
          participant_role: "driver",
          participant_driver_id: driverId,
          participant_vehicle: driverVehicle,
          participant_phone: driverPhone,
          last_message: "",
          last_message_at: new Date().toISOString(),
          unread_count: 0,
          trip_code: trip.trip_code,
        };
        onStart(conv);
        setQuery("");
        onClose();
      } else {
        Alert.alert(
          "Not found",
          "No driver or trip matched that input. Enter a Driver ID (e.g. DRV-A3X9KL) or a 6-character trip code."
        );
      }
    } catch {
      Alert.alert("Error", "Could not complete the search. Please try again.");
    } finally {
      setSearching(false);
    }
  };
 
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Pressable style={modalStyles.backdrop} onPress={onClose} />
        <View style={[modalStyles.sheet, { backgroundColor: cardBg }]}>
          <View style={modalStyles.handle} />
          <Text style={[modalStyles.title, { color: textColor }]}>Start a conversation</Text>
          <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 13, color: subTextColor }}>
            Enter a driver ID or trip code to find the right driver.
          </Text>
          <View
            style={[
              modalStyles.inputRow,
              {
                backgroundColor: isDark ? Colors.background : "#F4F6FA",
                borderColor,
              },
            ]}
          >
            <TextInput
              style={[modalStyles.input, { color: textColor }]}
              placeholder="DRV-A3X9KL or ABC123"
              placeholderTextColor={subTextColor}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="characters"
              autoFocus
              maxLength={20}
              onSubmitEditing={handleSearch}
            />
          </View>
          <Pressable
            style={[
              modalStyles.startBtn,
              {
                backgroundColor: query.trim()
                  ? Colors.primary
                  : isDark
                  ? "#2A2A2A"
                  : "#E5E7EB",
              },
            ]}
            onPress={handleSearch}
            disabled={!query.trim() || searching}
          >
            <Text
              style={[
                modalStyles.startBtnText,
                { color: query.trim() ? "#fff" : subTextColor },
              ]}
            >
              {searching ? "Searching..." : "Start Chat"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Messages Tab ────────────────────────────────────────────────────────
export default function MessagesTab() {
  const insets = useSafeAreaInsets();
  const { theme } = useSettingsStore();
  const { user } = useAuthStore();
  const { conversations, addConversation, deleteConversation } = useMessagesStore();
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

  // Filter conversations relevant to current user's role
  const visibleConversations = conversations.filter((c) => {
    if (!user) return false;
    if (user.role === "driver") {
      // Drivers see convs where they are the participant (i.e., passengers messaging them)
      return c.participant_id === user.id || c.participant_driver_id === user.driver_id;
    }
    // Passengers see convs they started (driver as participant)
    return c.participant_role === "driver";
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setRefreshing(false);
  }, []);

  // When a passenger starts a new chat, also create the mirror conversation for the driver
  const handleStartConversation = async (conv: Conversation) => {
    await addConversation(conv);

    // Also upsert the driver's side of the conversation in Supabase
    // so the driver can see it in their messages tab
    if (user) {
      try {
        const mirrorConvId = conv.id; // same ID — both sides share the same row
        await supabase.from('conversations').upsert([{
          id: mirrorConvId,
          participant_id: conv.participant_id,
          participant_name: conv.participant_name,
          participant_role: conv.participant_role,
          passenger_id: user.id,
          passenger_name: user.full_name || "Passenger",
          passenger_phone: user.phone || null,
          last_message: "",
          last_message_at: new Date().toISOString(),
          unread_count: 0,
          trip_code: conv.trip_code,
        }]);
      } catch (e) {
        console.warn('[Messages] Failed to mirror conversation:', e);
      }
    }
    setActiveConv(conv);
  };

  if (activeConv) {
    return <ChatScreen conversation={activeConv} onBack={() => setActiveConv(null)} isDark={isDark} />;
  }

  return (
    <>
      <GestureHandlerRootView style={[styles.root, { backgroundColor: bg }]}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={[styles.header, { backgroundColor: cardBg, paddingTop: topPadding + 12, borderBottomColor: borderColor }]}>
          <View>
            <Text style={[styles.headerTitle, { color: textColor }]}>Messages</Text>
            {user?.role === "driver" && (
              <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: subTextColor, marginTop: 1 }}>
                Passenger messages appear here
              </Text>
            )}
          </View>
          {/* Passengers can start new chats; drivers only receive */}
          {user?.role !== "driver" && (
            <Pressable style={styles.newChatBtn} onPress={() => setNewChatVisible(true)}>
              <HugeiconsIcon icon={PlusSignIcon} size={23} color={textColor} />
            </Pressable>
          )}
        </View>

        <FlatList
          data={visibleConversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          renderItem={({ item }) => (
            <Swipeable
              renderRightActions={() => (
                <Pressable
                  onPress={() => Alert.alert("Delete", "Delete this conversation?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => deleteConversation(item.id) },
                  ])}
                  style={[styles.deleteSwipe, { backgroundColor: Colors.error }]}
                >
                  <HugeiconsIcon icon={Delete01Icon} size={22} color="#fff" />
                </Pressable>
              )}
            >
              <Pressable
                style={({ pressed }) => [styles.convItem, { backgroundColor: cardBg, borderColor }, pressed && { opacity: 0.85 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveConv(item);
                }}
              >
                <Avatar name={item.participant_name || "User"} size={48} />
                <View style={styles.convTextBlock}>
                  <View style={styles.convTopRow}>
                    <Text style={[styles.convName, { color: textColor }]} numberOfLines={1}>
                      {item.participant_name}
                    </Text>
                    <Text style={[styles.convTime, { color: subTextColor }]}>
                      {item.last_message_at ? new Date(item.last_message_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                    </Text>
                  </View>
                  <View style={styles.convBottomRow}>
                    <Text style={[styles.convLastMsg, { color: subTextColor }]} numberOfLines={1}>
                      {item.trip_code ? `[Trip ${item.trip_code}] ` : ""}{item.last_message || "Start a conversation"}
                    </Text>
                    {item.unread_count > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{item.unread_count > 9 ? "9+" : item.unread_count}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            </Swipeable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <HugeiconsIcon icon={ChartBubbleIcon} size={48} color={subTextColor} />
              <Text style={[styles.emptyTitle, { color: textColor }]}>
                {user?.role === "driver" ? "No passenger messages yet" : "No conversations yet"}
              </Text>
              <Text style={[styles.emptySub, { color: subTextColor }]}>
                {user?.role === "driver"
                  ? "When passengers message you about a trip, it'll appear here."
                  : "Enter a trip code to start chatting with your driver."}
              </Text>
              {user?.role !== "driver" && (
                <Pressable style={[styles.emptyBtn, { backgroundColor: Colors.primary }]} onPress={() => setNewChatVisible(true)}>
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  chatRoot: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 24 },
  newChatBtn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  listContent: { gap: 4, paddingVertical: 10 },
  convItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  convTextBlock: { flex: 1, gap: 3 },
  convTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  convName: { fontFamily: "Poppins_600SemiBold", fontSize: 15, flex: 1 },
  convTime: { fontFamily: "Poppins_400Regular", fontSize: 11 },
  convBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  convLastMsg: { fontFamily: "Poppins_400Regular", fontSize: 13, flex: 1 },
  unreadBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  unreadText: { fontFamily: "Poppins_700Bold", fontSize: 10, color: "#fff" },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 40, gap: 12 },
  emptyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, textAlign: "center" },
  emptySub: { fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", lineHeight: 22 },
  emptyBtn: { borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  emptyBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },
  deleteSwipe: {
    width: 70,
    alignItems: "center",
    justifyContent: "center",
  },
});