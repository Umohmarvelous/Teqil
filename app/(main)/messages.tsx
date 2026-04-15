// import React, { useState, useRef, useEffect } from "react";
// import {
//   View,
//   Text,
//   StyleSheet,
//   Pressable,
//   FlatList,
//   TextInput,
//   KeyboardAvoidingView,
//   Platform,
//   Alert,
//   Modal,
// } from "react-native";
// import { useSafeAreaInsets } from "react-native-safe-area-context";
// import * as Haptics from "expo-haptics";
// import { useAuthStore } from "@/src/store/useStore";
// import { useSettingsStore } from "@/src/store/useSettingsStore";
// import { useMessagesStore, type Conversation, type Message } from "@/src/store/useMessagesStore";
// import { Colors } from "@/constants/colors";
// import Avatar from "@/components/Avatar";
// import { generateId } from "@/src/utils/helpers";
// import { TripsStorage } from "@/src/services/storage";
// import { HugeiconsIcon } from "@hugeicons/react-native";

// import {
//   ArrowLeftIcon,
//   SearchIcon,
//   Message02Icon,
//   PlusSignIcon,
//   ChartBubbleIcon,
//   TelegramIcon,
// } from "@hugeicons/core-free-icons";
// import { StatusBar } from "expo-status-bar";

// // Chat Screen Component
// function ChatScreen({
//   conversation,
//   onBack,
//   isDark,
// }: {
//   conversation: Conversation;
//   onBack: () => void;
//   isDark: boolean;
// }) {
//   const { user } = useAuthStore();
//   const { addMessage, markRead, getMessages } = useMessagesStore();
//   const [text, setText] = useState("");
//   const listRef = useRef<FlatList>(null);

//   const bg = isDark ? Colors.background : Colors.border;
//   const textColor = isDark ? Colors.textWhite : Colors.text;
//   const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
//   const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
//   const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
//   const insets = useSafeAreaInsets(); // Added missing insets
//   const topPadding = Platform.OS === "web" ? 67 : insets.top; // Now insets is defined


//   const messages = getMessages(conversation.id);

//   useEffect(() => {
//     markRead(conversation.id);
//   }, [conversation.id, markRead]); // Fixed: added markRead dependency

//   useEffect(() => {
//     if (messages.length > 0) {
//       setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
//     }
//   }, [messages.length]);

//   const send = () => {
//     const t = text.trim();
//     if (!t || !user?.id) return;
//     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
//     const msg: Message = {
//       id: generateId(),
//       conversationId: conversation.id,
//       senderId: user.id,
//       senderName: user.full_name || "Me",
//       text: t,
//       createdAt: new Date().toISOString(),
//       read: true,
//     };
//     addMessage(msg);
//     setText("");
//   };

//   return (
//     <KeyboardAvoidingView
//       style={[styles.chatRoot, { backgroundColor: bg }]}
//       behavior={Platform.OS === "ios" ? "padding" : undefined}
//     >
//       <StatusBar style={isDark ? 'light' : 'dark'}  />
//       <View style={[chatStyles.header, { backgroundColor: isDark ? Colors.primaryDarker : "#fff", borderBottomColor: borderColor, paddingTop: topPadding + 12 }]}>
//         <Pressable onPress={onBack} style={chatStyles.backBtn} hitSlop={8}>
//           <HugeiconsIcon icon={ArrowLeftIcon} size={25} color={textColor} />
//         </Pressable>
//         <Avatar name={conversation.participantName} size={38} />
//         <View style={chatStyles.headerText}>
//           <Text style={[chatStyles.headerName, { color: textColor }]}>{conversation.participantName}</Text>
//           <Text style={[chatStyles.headerRole, { color: subTextColor }]}>
//             {conversation.participantRole}
//             {conversation.participantDriverId ? ` · ${conversation.participantDriverId}` : ""}
//           </Text>
//         </View>
//       </View>

//       <FlatList
//         ref={listRef}
//         data={messages}
//         keyExtractor={(m) => m.id}
//         contentContainerStyle={chatStyles.messageList}
//         showsVerticalScrollIndicator={false}
//         renderItem={({ item }) => {
//           const isMe = item.senderId === user?.id;
//           return (
//             <View style={[chatStyles.bubble, isMe ? chatStyles.bubbleMe : chatStyles.bubbleThem]}>
//               <Text style={[chatStyles.bubbleText, { color: isMe ? "#fff" : textColor }]}>{item.text}</Text>
//               <Text style={[chatStyles.bubbleTime, { color: isMe ? "rgba(255,255,255,0.6)" : subTextColor }]}>
//                 {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
//               </Text>
//             </View>
//           );
//         }}
//         ListEmptyComponent={
//           <View style={chatStyles.emptyChat}>
//             <HugeiconsIcon icon={Message02Icon} size={40} color={subTextColor} />
//             <Text style={[chatStyles.emptyChatText, { color: subTextColor }]}>No messages yet. Say hello!</Text>
//           </View>
//         }
//       />

//       <View style={[chatStyles.inputRow, { backgroundColor: cardBg, borderTopColor: borderColor }]}>
//         <TextInput
//           style={[chatStyles.input, { backgroundColor: isDark ? Colors.overlay : "#F4F6FA", color: textColor }]}
//           placeholder="Type a message..."
//           placeholderTextColor={subTextColor}
//           value={text}
//           onChangeText={setText}
//           multiline
//           maxLength={500}
//           returnKeyType="send"
//           onSubmitEditing={send}
//           blurOnSubmit={false}
//         />
//         <Pressable
//           style={[chatStyles.sendBtn,
//             { backgroundColor: text.trim() ? Colors.primary : (isDark ? Colors.primary : Colors.primary) }
//            ]}
//           onPress={send}
//           disabled={!text.trim()}
//         >
//           <HugeiconsIcon icon={TelegramIcon} size={25} fill={Colors.textWhite} color={text.trim() ? "#fff" : Colors.primary} />
//         </Pressable>
//       </View>
//     </KeyboardAvoidingView>
//   );
// }

// // New Conversation Modal
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
//   const [driverRef, setDriverRef] = useState("");
//   const [searching, setSearching] = useState(false);
//   // Removed unused 'user' variable


//   const textColor = isDark ? Colors.textWhite : Colors.text;
//   const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
//   const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
//   const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";

//   const handleSearch = async () => {
//     if (!driverRef.trim()) return;
//     setSearching(true);
//     try {
//       const all = await TripsStorage.getAll();
//       const trip = all.find((t) => t.trip_code === driverRef.toUpperCase() || t.driver_id === driverRef.trim());
//       if (trip) {
//         const conv: Conversation = {
//           id: generateId(),
//           participantId: trip.driver_id,
//           participantName: "Driver",
//           participantRole: "driver",
//           lastMessage: "",
//           lastMessageAt: new Date().toISOString(),
//           unreadCount: 0,
//         };
//         onStart(conv);
//         setDriverRef("");
//         onClose();
//       } else {
//         const conv: Conversation = {
//           id: generateId(),
//           participantId: driverRef.trim(),
//           participantName: driverRef.trim(),
//           participantRole: "driver",
//           participantDriverId: driverRef.trim(),
//           lastMessage: "",
//           lastMessageAt: new Date().toISOString(),
//           unreadCount: 0,
//         };
//         onStart(conv);
//         setDriverRef("");
//         onClose();
//       }
//     } catch {
//       Alert.alert("Error", "Could not find driver.");
//     } finally {
//       setSearching(false);
//     }
//   };

//   return (
//     <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
//       <Pressable style={modalStyles.backdrop} onPress={onClose} />
//       <View style={[modalStyles.sheet, { backgroundColor: cardBg }]}>
//         <View style={modalStyles.handle} />
//         <Text style={[modalStyles.title, { color: textColor }]}>New Message</Text>
//         <Text style={[modalStyles.sub, { color: subTextColor }]}>Enter a Driver ID or trip code to start a conversation</Text>
//         <View style={[modalStyles.inputRow, { backgroundColor: cardBg, borderColor }]}>
//           <HugeiconsIcon icon={SearchIcon} size={18} color={subTextColor} />
//           <TextInput
//             style={[modalStyles.input, { color: textColor }]}
//             placeholder="e.g. DRV-A3X9KL or ABC123"
//             placeholderTextColor={subTextColor}
//             value={driverRef}
//             onChangeText={setDriverRef}
//             autoCapitalize="characters"
//             autoFocus
//             onSubmitEditing={handleSearch}
//           />
//         </View>
//         <Pressable
//           style={[modalStyles.startBtn, { backgroundColor: driverRef.trim() ? Colors.primary : (isDark ? "#2A2A2A" : "#E5E7EB") }]}
//           onPress={handleSearch}
//           disabled={!driverRef.trim() || searching}
//         >
//           <Text style={[modalStyles.startBtnText, { color: driverRef.trim() ? "#fff" : subTextColor }]}>
//             {searching ? "Searching..." : "Start Chat"}
//           </Text>
//         </Pressable>
//       </View>
//     </Modal>
//   );
// }

// // Main Messages Tab
// export default function MessagesTab() {
//   const insets = useSafeAreaInsets(); // Added missing insets
//   const { theme } = useSettingsStore(); // Removed unused 'user'
//   const { conversations, addConversation } = useMessagesStore();
//   const [activeConv, setActiveConv] = useState<Conversation | null>(null);
//   const [newChatVisible, setNewChatVisible] = useState(false);

//   const isDark = theme === "dark";
//   const bg = isDark ? Colors.background : Colors.border;
//   const textColor = isDark ? Colors.textWhite : Colors.text;
//   const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
//   const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
//   const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
//   const topPadding = Platform.OS === "web" ? 67 : insets.top; // Now insets is defined

//   if (activeConv) {
//     return <ChatScreen conversation={activeConv} onBack={() => setActiveConv(null)} isDark={isDark} />;
//   }

//   return (
//     <View style={[styles.root, { backgroundColor: bg }]}>
//       <StatusBar style={isDark ? 'light' : 'dark'}  />
//       <View style={[styles.header, { backgroundColor: cardBg, paddingTop: topPadding + 12, borderBottomColor: borderColor }]}>
//         <Text style={[styles.headerTitle, { color: textColor }]}>Messages</Text>
//         <Pressable style={[styles.newChatBtn]} onPress={() => setNewChatVisible(true)}>
//           <HugeiconsIcon icon={PlusSignIcon} size={23} color={textColor} />
//         </Pressable>
//       </View>

//       <FlatList
//         data={conversations}
//         keyExtractor={(item) => item.id}
//         contentContainerStyle={styles.listContent}
//         showsVerticalScrollIndicator={false}
//         renderItem={({ item }) => (
//           <>
//           <Pressable
//             style={({ pressed }) => [styles.convItem, pressed && { opacity: 0.85 }]}
//             onPress={() => {
//               Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
//               setActiveConv(item);
//             }}
//           >
//             <Avatar name={item.participantName} size={48} />
//             <View style={styles.convText}>
//                 <View style={styles.convTopRow}>
//                   <Text style={[styles.convName, { color: textColor }]} numberOfLines={1}>{item.participantName}</Text>
//                   <Text style={[styles.convTime, { color: Colors.error }]}>
//                     {item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
//                   </Text>
//                 </View>
//                 <View style={styles.convBottomRow}>
//                   <Text style={[styles.convLastMsg, { color: subTextColor }]} numberOfLines={1}>{item.lastMessage || "No message..."}</Text>
//                   {item.unreadCount > 0 && (
//                     <View style={styles.unreadBadge}>
//                       <Text style={styles.unreadText}>{item.unreadCount}</Text>
//                     </View>
//                   )}
//               </View>
//             </View>
//           </Pressable>
//             <View style={{ borderBottomWidth: .2, borderBottomColor: Colors.textSecondary, width: 330, alignSelf: 'flex-end' }} />
//           </>
//         )}
//         ListEmptyComponent={
//           <View style={styles.empty}>
//             <HugeiconsIcon icon={ChartBubbleIcon} size={48} color={subTextColor} />
//             <Text style={[styles.emptyTitle, { color: textColor }]}>No conversations yet</Text>
//             <Text style={[styles.emptySub, { color: subTextColor }]}>Start a chat with a driver by tapping the compose button above</Text>
//             <Pressable style={[styles.emptyBtn, { backgroundColor: Colors.primary }]} onPress={() => setNewChatVisible(true)}>
//               <Text style={styles.emptyBtnText}>Start a conversation</Text>
//             </Pressable>
//           </View>
//         }
//       />

//       <NewChatModal visible={newChatVisible} onClose={() => setNewChatVisible(false)} isDark={isDark} onStart={(conv) => {
//         addConversation(conv);
//         setActiveConv(conv);
//       }} />
//     </View>
//   );
// }

// // Styles
// const styles = StyleSheet.create({
//   root: { flex: 1 },
//   chatRoot: { flex: 1 },
//   header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
//   headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 24 },
//   newChatBtn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
//   listContent: { paddingHorizontal: 16, gap: 20, paddingVertical: 25 },
//   convItem: { flexDirection: "row", alignItems: "center", gap: 17, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
//   convText: { flex: 1, gap: 4, paddingBottom: 6 },
//   convTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
//   convName: { fontFamily: "Poppins_600SemiBold", fontSize: 15, flex: 1 },
//   convTime: { fontFamily: "Poppins_400Regular", fontSize: 11 },
//   convBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
//   convLastMsg: { fontFamily: "Poppins_400Regular", fontSize: 13, flex: 1 },
//   unreadBadge: { backgroundColor: Colors.primary, borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
//   unreadText: { fontFamily: "Poppins_700Bold", fontSize: 10, color: "#fff" },
//   empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 40, gap: 12 },
//   emptyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, textAlign: "center" },
//   emptySub: { fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", lineHeight: 22 },
//   emptyBtn: { borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
//   emptyBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },
// });

// const chatStyles = StyleSheet.create({
//   header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 0, paddingVertical: 22, gap: 12, borderBottomWidth: 1 },
//   backBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
//   headerText: { flex: 1 },
//   headerName: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
//   headerRole: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
//   messageList: { padding: 16, gap: 8, flexGrow: 1 },
//   bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
//   bubbleMe: { alignSelf: "flex-end", backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
//   bubbleThem: { alignSelf: "flex-start", backgroundColor: "#1E2820", borderBottomLeftRadius: 4 },
//   bubbleText: { fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 21 },
//   bubbleTime: { fontFamily: "Poppins_400Regular", fontSize: 10, alignSelf: "flex-end" },
//   emptyChat: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
//   emptyChatText: { fontFamily: "Poppins_400Regular", fontSize: 14 },
//   inputRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10,  justifyContent:'center' },
//   input: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 15, fontFamily: "Poppins_400Regular", fontSize: 14, maxHeight: 100 },
//   sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
// });

// const modalStyles = StyleSheet.create({
//   backdrop: { flex: 1, backgroundColor: "rgba(0 0 0 / 0)" },
//   sheet: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 14 },
//   handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.15)", alignSelf: "center", marginBottom: 8 },
//   title: { fontFamily: "Poppins_700Bold", fontSize: 18 },
//   sub: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 20, marginTop: -6 },
//   inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1.5 },
//   input: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 14, padding: 0 },
//   startBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
//   startBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
// });








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
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
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
  Search02Icon,
  Message02Icon,
  PlusSignIcon,
  ChartBubbleIcon,
  TelegramIcon,
  PlayIcon,
  PauseIcon,
  CallIcon,
  Mail01Icon,
  Car01Icon,
  Location01Icon,
  Delete01Icon,
  MoreVerticalIcon,
  Copy01Icon,
} from "@hugeicons/core-free-icons";
import { StatusBar } from "expo-status-bar";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// -------------------- Contact Info Modal --------------------
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
          <Avatar name={conversation.participantName} size={80} />
          <Text style={[modalStyles.contactName, { color: textColor }]}>
            {conversation.participantName}
          </Text>
          <Text style={[modalStyles.contactRole, { color: subTextColor }]}>
            {conversation.participantRole}
            {conversation.participantDriverId && ` · ${conversation.participantDriverId}`}
          </Text>
        </View>

        <View style={modalStyles.infoSection}>
          {conversation.participantRole === "driver" && (
            <>
              <InfoRow icon={Car01Icon} label="Vehicle" value={conversation.participantVehicle || "Not specified"} />
              <InfoRow icon={Location01Icon} label="Park" value={conversation.participantParkName || "Not specified"} />
            </>
          )}
          <InfoRow icon={CallIcon} label="Phone" value="+234 123 456 7890" />
          <InfoRow icon={Mail01Icon} label="Email" value="driver@teqil.com" />
        </View>

        <View style={modalStyles.actionRow}>
          <Pressable style={[modalStyles.actionBtn, { backgroundColor: Colors.primary }]}>
            <HugeiconsIcon icon={Message02Icon} size={20} color="#fff" />
            <Text style={modalStyles.actionBtnText}>Message</Text>
          </Pressable>
          <Pressable style={[modalStyles.actionBtn, { backgroundColor: Colors.gold }]}>
            <HugeiconsIcon icon={CallIcon} size={20} color="#fff" />
            <Text style={modalStyles.actionBtnText}>Call</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={modalStyles.infoRow}>
      <HugeiconsIcon icon={Icon} size={18} color={Colors.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={modalStyles.infoLabel}>{label}</Text>
        <Text style={modalStyles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

// -------------------- Voice Recorder --------------------
function VoiceRecorder({ onSend, isDark }: { onSend: (uri: string, duration: number) => void; isDark: boolean }) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [duration, setDuration] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout>();

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
      intervalRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      Alert.alert("Error", "Could not start recording");
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    clearInterval(intervalRef.current);
    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecordedUri(uri);
    setRecording(null);
    setDuration(0);
  };

  const playSound = async () => {
    if (!recordedUri) return;
    const { sound } = await Audio.Sound.createAsync({ uri: recordedUri });
    setSound(sound);
    setIsPlaying(true);
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        setIsPlaying(false);
        sound.unloadAsync();
      }
    });
  };

  const stopSound = async () => {
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
      setIsPlaying(false);
    }
  };

  const handleSend = () => {
    if (recordedUri) {
      onSend(recordedUri, duration);
      setRecordedUri(null);
    }
  };

  const handleCancel = () => {
    setRecordedUri(null);
    setDuration(0);
  };

  const textColor = isDark ? Colors.textWhite : Colors.text;

  if (recordedUri) {
    return (
      <View style={voiceStyles.previewContainer}>
        <Pressable onPress={isPlaying ? stopSound : playSound} style={voiceStyles.playBtn}>
          <HugeiconsIcon icon={isPlaying ? PauseIcon : PlayIcon} size={20} color={Colors.primary} />
        </Pressable>
        <Text style={[voiceStyles.durationText, { color: textColor }]}>Voice message ({duration}s)</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={handleCancel} style={voiceStyles.cancelBtn}>
          <HugeiconsIcon icon={Delete01Icon} size={20} color={Colors.error} />
        </Pressable>
        <Pressable onPress={handleSend} style={voiceStyles.sendBtn}>
          <HugeiconsIcon icon={TelegramIcon} size={20} color="#fff" />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPressIn={startRecording}
      onPressOut={stopRecording}
      style={[voiceStyles.recordButton, isRecording && voiceStyles.recordingActive]}
    >
      <HugeiconsIcon icon={Microphone01Icon} size={24} color={isRecording ? Colors.error : textColor} />
      {isRecording && <Text style={voiceStyles.recordingText}>Recording... {duration}s</Text>}
    </Pressable>
  );
}

const voiceStyles = StyleSheet.create({
  recordButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingActive: {
    backgroundColor: "rgba(239,68,68,0.1)",
  },
  recordingText: {
    position: "absolute",
    bottom: -20,
    fontSize: 10,
    color: Colors.error,
  },
  previewContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 8,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  durationText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
  },
  cancelBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});

// -------------------- Message Bubble with Swipe Actions --------------------
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
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = () => (
    <View style={bubbleStyles.swipeActions}>
      <Pressable onPress={onReply} style={[bubbleStyles.swipeAction, { backgroundColor: Colors.gold }]}>
        <HugeiconsIcon icon={ReplyIcon} size={18} color="#fff" />
      </Pressable>
      <Pressable onPress={onCopy} style={[bubbleStyles.swipeAction, { backgroundColor: Colors.primary }]}>
        <HugeiconsIcon icon={Copy01Icon} size={18} color="#fff" />
      </Pressable>
      <Pressable onPress={onDelete} style={[bubbleStyles.swipeAction, { backgroundColor: Colors.error }]}>
        <HugeiconsIcon icon={Delete01Icon} size={18} color="#fff" />
      </Pressable>
    </View>
  );

  const renderLeftActions = () => (
    <View style={bubbleStyles.swipeActions}>
      <Pressable onPress={onReply} style={[bubbleStyles.swipeAction, { backgroundColor: Colors.gold }]}>
        <HugeiconsIcon icon={ReplyIcon} size={18} color="#fff" />
      </Pressable>
      <Pressable onPress={onDelete} style={[bubbleStyles.swipeAction, { backgroundColor: Colors.error }]}>
        <HugeiconsIcon icon={Delete01Icon} size={18} color="#fff" />
      </Pressable>
    </View>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      overshootRight={false}
      overshootLeft={false}
    >
      <View style={[bubbleStyles.container, isMe ? bubbleStyles.containerMe : bubbleStyles.containerThem]}>
        <View style={[bubbleStyles.bubble, isMe ? bubbleStyles.bubbleMe : bubbleStyles.bubbleThem]}>
          {message.audioUri ? (
            <View style={bubbleStyles.audioBubble}>
              <Pressable onPress={() => {}} style={bubbleStyles.audioPlayBtn}>
                <HugeiconsIcon icon={PlayIcon} size={20} color={isMe ? "#fff" : Colors.primary} />
              </Pressable>
              <Text style={[bubbleStyles.audioText, { color: isMe ? "#fff" : textColor }]}>
                Voice message
              </Text>
            </View>
          ) : (
            <Text style={[bubbleStyles.text, { color: isMe ? "#fff" : textColor }]}>
              {message.text}
            </Text>
          )}
          <View style={bubbleStyles.meta}>
            <Text style={[bubbleStyles.time, { color: isMe ? "rgba(255,255,255,0.6)" : subTextColor }]}>
              {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
            {isMe && (
              <HugeiconsIcon
                icon={message.status === "read" ? CheckmarkDone01Icon : CheckmarkIcon}
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
  audioBubble: { flexDirection: "row", alignItems: "center", gap: 8 },
  audioPlayBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  audioText: { fontFamily: "Poppins_400Regular", fontSize: 14 },
});

// -------------------- Chat Screen --------------------
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
  } = useMessagesStore();
  const [text, setText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const listRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const bg = isDark ? Colors.background : Colors.border;
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
  }, [conversation.id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleTyping = (value: string) => {
    setText(value);
    if (!isTyping) {
      setIsTyping(true);
      setTyping(conversation.id, true);
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      setTyping(conversation.id, false);
    }, 1500);
  };

  const sendMessage = (content?: { uri: string; duration: number }) => {
    if (!user?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const msg: Message = {
      id: generateId(),
      conversationId: conversation.id,
      senderId: user.id,
      senderName: user.full_name || "Me",
      text: content ? undefined : text.trim(),
      audioUri: content?.uri,
      createdAt: new Date().toISOString(),
      read: false,
      status: "sent",
    };
    addMessage(msg);
    setText("");
    setTyping(conversation.id, false);
    setIsTyping(false);
    clearTimeout(typingTimeoutRef.current);
  };

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage();
  };

  const handleVoiceSend = (uri: string, duration: number) => {
    sendMessage({ uri, duration });
  };

  const handleReply = (msg: Message) => {
    setText(`> ${msg.text?.substring(0, 30)}...\n`);
  };

  const handleCopy = (msg: Message) => {
    if (msg.text) {
      // Clipboard.setString(msg.text);
      Alert.alert("Copied", "Message copied to clipboard");
    }
  };

  const handleDelete = (convId: string, msgId: string) => {
    Alert.alert("Delete Message", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMessage(convId, msgId) },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.chatRoot, { backgroundColor: bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      <View
        style={[
          chatStyles.header,
          {
            backgroundColor: isDark ? Colors.primaryDarker : "#fff",
            borderBottomColor: borderColor,
            paddingTop: topPadding + 12,
          },
        ]}
      >
        <Pressable onPress={onBack} style={chatStyles.backBtn} hitSlop={8}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={25} color={textColor} />
        </Pressable>
        <Pressable onPress={() => setContactModalVisible(true)} style={chatStyles.headerInfo}>
          <Avatar name={conversation.participantName} size={38} />
          <View style={chatStyles.headerText}>
            <Text style={[chatStyles.headerName, { color: textColor }]}>
              {conversation.participantName}
            </Text>
            {otherTyping ? (
              <Text style={[chatStyles.typingIndicator, { color: Colors.primary }]}>typing...</Text>
            ) : (
              <Text style={[chatStyles.headerRole, { color: subTextColor }]}>
                {conversation.participantRole}
                {conversation.participantDriverId ? ` · ${conversation.participantDriverId}` : ""}
              </Text>
            )}
          </View>
        </Pressable>
        <Pressable onPress={() => setContactModalVisible(true)}>
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
          const isMe = item.senderId === user?.id;
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
            <Text style={[chatStyles.emptyChatText, { color: subTextColor }]}>
              No messages yet. Say hello!
            </Text>
          </View>
        }
      />

      <View style={[chatStyles.inputRow, { backgroundColor: cardBg, borderTopColor: borderColor }]}>
        <VoiceRecorder onSend={handleVoiceSend} isDark={isDark} />
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
          style={[chatStyles.sendBtn, { backgroundColor: text.trim() ? Colors.primary : Colors.primary }]}
          onPress={handleSend}
          disabled={!text.trim()}
        >
          <HugeiconsIcon icon={TelegramIcon} size={25} color={text.trim() ? "#fff" : Colors.primary} />
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

// -------------------- New Conversation Modal --------------------
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

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";

  const handleSearch = async () => {
    if (!driverRef.trim()) return;
    setSearching(true);
    try {
      const all = await TripsStorage.getAll();
      const trip = all.find(
        (t) => t.trip_code === driverRef.toUpperCase() || t.driver_id === driverRef.trim()
      );
      if (trip) {
        const conv: Conversation = {
          id: generateId(),
          participantId: trip.driver_id,
          participantName: "Driver",
          participantRole: "driver",
          participantDriverId: trip.driver_id,
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Pressable style={modalStyles.backdrop} onPress={onClose} />
        <View style={[modalStyles.sheet, { backgroundColor: cardBg }]}>
          <View style={modalStyles.handle} />
          <Text style={[modalStyles.title, { color: textColor }]}>New Message</Text>
          <Text style={[modalStyles.sub, { color: subTextColor }]}>
            Enter a Driver ID or trip code to start a conversation
          </Text>
          <View style={[modalStyles.inputRow, { backgroundColor: cardBg, borderColor }]}>
            <HugeiconsIcon icon={Search02Icon} size={18} color={subTextColor} />
            <TextInput
              style={[modalStyles.input, { color: textColor }]}
              placeholder="e.g. DRV-A3X9KL or ABC123"
              placeholderTextColor={subTextColor}
              value={driverRef}
              onChangeText={setDriverRef}
              autoCapitalize="characters"
              autoFocus
              onSubmitEditing={handleSearch}
            />
          </View>
          <Pressable
            style={[
              modalStyles.startBtn,
              { backgroundColor: driverRef.trim() ? Colors.primary : isDark ? "#2A2A2A" : "#E5E7EB" },
            ]}
            onPress={handleSearch}
            disabled={!driverRef.trim() || searching}
          >
            <Text style={[modalStyles.startBtnText, { color: driverRef.trim() ? "#fff" : subTextColor }]}>
              {searching ? "Searching..." : "Start Chat"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// -------------------- Main Messages Tab --------------------
export default function MessagesTab() {
  const insets = useSafeAreaInsets();
  const { theme } = useSettingsStore();
  const { user } = useAuthStore();
  const { conversations: allConversations, addConversation, deleteConversation } = useMessagesStore();
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [newChatVisible, setNewChatVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : Colors.border;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  // Filter conversations based on user role
  const conversations = allConversations.filter((c) => {
    if (!user) return false;
    if (user.role === "driver") {
      return c.participantRole !== "driver" || c.participantId === user.id;
    }
    if (user.role === "passenger") {
      return c.participantRole === "driver" || c.participantId === user.id;
    }
    return true;
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Here you could sync with Supabase or just simulate
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshing(false);
  }, []);

  const handleDeleteConversation = (conv: Conversation) => {
    Alert.alert("Delete Conversation", "This will permanently delete the chat history.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteConversation(conv.id) },
    ]);
  };

  if (activeConv) {
    return <ChatScreen conversation={activeConv} onBack={() => setActiveConv(null)} isDark={isDark} />;
  }

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View
        style={[
          styles.header,
          { backgroundColor: cardBg, paddingTop: topPadding + 12, borderBottomColor: borderColor },
        ]}
      >
        <Text style={[styles.headerTitle, { color: textColor }]}>Messages</Text>
        <Pressable style={styles.newChatBtn} onPress={() => setNewChatVisible(true)}>
          <HugeiconsIcon icon={PlusSignIcon} size={23} color={textColor} />
        </Pressable>
      </View>

      <FlatList
        data={conversations}
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
                onPress={() => handleDeleteConversation(item)}
                style={[styles.deleteSwipe, { backgroundColor: Colors.error }]}
              >
                <HugeiconsIcon icon={Delete01Icon} size={22} color="#fff" />
              </Pressable>
            )}
          >
            <Pressable
              style={({ pressed }) => [styles.convItem, pressed && { opacity: 0.85 }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveConv(item);
              }}
            >
              <Avatar name={item.participantName} size={48} />
              <View style={styles.convText}>
                <View style={styles.convTopRow}>
                  <Text style={[styles.convName, { color: textColor }]} numberOfLines={1}>
                    {item.participantName}
                  </Text>
                  <Text style={[styles.convTime, { color: Colors.error }]}>
                    {item.lastMessageAt
                      ? new Date(item.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : ""}
                  </Text>
                </View>
                <View style={styles.convBottomRow}>
                  <Text style={[styles.convLastMsg, { color: subTextColor }]} numberOfLines={1}>
                    {item.lastMessage || "No message..."}
                  </Text>
                  {item.unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{item.unreadCount}</Text>
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
            <Text style={[styles.emptyTitle, { color: textColor }]}>No conversations yet</Text>
            <Text style={[styles.emptySub, { color: subTextColor }]}>
              Start a chat with a driver by tapping the compose button above
            </Text>
            <Pressable
              style={[styles.emptyBtn, { backgroundColor: Colors.primary }]}
              onPress={() => setNewChatVisible(true)}
            >
              <Text style={styles.emptyBtnText}>Start a conversation</Text>
            </Pressable>
          </View>
        }
      />

      <NewChatModal
        visible={newChatVisible}
        onClose={() => setNewChatVisible(false)}
        isDark={isDark}
        onStart={(conv) => {
          addConversation(conv);
          setActiveConv(conv);
        }}
      />
    </GestureHandlerRootView>
  );
}

// Styles
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
  listContent: { paddingHorizontal: 16, gap: 20, paddingVertical: 25 },
  convItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 17,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  convText: { flex: 1, gap: 4, paddingBottom: 6 },
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
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
  },
});

const chatStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  headerInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  headerText: { flex: 1 },
  headerName: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  headerRole: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  typingIndicator: { fontFamily: "Poppins_400Regular", fontSize: 11, fontStyle: "italic" },
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

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 14,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.15)", alignSelf: "center", marginBottom: 8 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  sub: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 20, marginTop: -6 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
  },
  input: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 14, padding: 0 },
  startBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  startBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },

  // Contact info modal
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  avatarCenter: { alignItems: "center", marginVertical: 16 },
  contactName: { fontFamily: "Poppins_700Bold", fontSize: 20, marginTop: 8 },
  contactRole: { fontFamily: "Poppins_400Regular", fontSize: 14 },
  infoSection: { gap: 12, marginTop: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  infoLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  infoValue: { fontFamily: "Poppins_500Medium", fontSize: 14 },
  actionRow: { flexDirection: "row", gap: 12, marginTop: 20 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 14 },
  actionBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },
});