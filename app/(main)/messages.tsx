// /**
//  * app/(main)/messages.tsx
//  *
//  * Messaging between passengers and drivers.
//  *
//  * Search: passenger enters a driver ID in any format (DRV-A3X9KL, drv-a3x9kl,
//  * A3X9KL, etc.) → normalised to uppercase → exact match on public.users.driver_id.
//  * No trip code fallback — driver ID only.
//  *
//  * Message routing: messages are inserted into the `messages` table keyed by
//  * conversation_id. The driver receives them via Supabase realtime subscription.
//  */

// import React, {
//   useState,
//   useRef,
//   useEffect,
//   useCallback,
//   useMemo,
// } from "react";
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
//   Linking,
//   RefreshControl,
//   ActivityIndicator,
// } from "react-native";
// import { useSafeAreaInsets } from "react-native-safe-area-context";
// import * as Haptics from "expo-haptics";
// import { useAuthStore } from "@/src/store/useStore";
// import { useSettingsStore } from "@/src/store/useSettingsStore";
// import {
//   useMessagesStore,
//   type Conversation,
//   type Message,
// } from "@/src/store/useMessagesStore";
// import { Colors } from "@/constants/colors";
// import Avatar from "@/components/Avatar";
// import { generateId } from "@/src/utils/helpers";
// import { HugeiconsIcon } from "@hugeicons/react-native";
// import {
//   ArrowLeft01Icon,
//   Message02Icon,
//   PlusSignIcon,
//   ChartBubbleIcon,
//   TelegramIcon,
//   Delete01Icon,
//   MoreVerticalIcon,
//   Copy01Icon,
//   Reply,
//   TaskDone01Icon,
//   Checkmark,
//   CallIcon,
//   Search01Icon,
//   Mic01Icon,
//   MicOff01Icon,
// } from "@hugeicons/core-free-icons";
// import { StatusBar } from "expo-status-bar";
// import Swipeable from "react-native-gesture-handler/Swipeable";
// import { GestureHandlerRootView } from "react-native-gesture-handler";
// import { supabase } from "@/src/services/supabase";
// import { Audio } from "expo-av";

// // ─── Normalise driver ID input ────────────────────────────────────────────────
// // Accepts any capitalisation and optional prefix:
// //   "DRV-A3X9KL" | "drv-a3x9kl" | "A3X9KL" | "a3x9kl" | "DRV A3X9KL"
// // Returns the canonical form stored in the DB: "DRV-A3X9KL"
// function normaliseDriverId(raw: string): string {
//   const upper = raw.trim().toUpperCase().replace(/\s+/g, "-");
//   if (upper.startsWith("DRV-")) return upper;
//   if (upper.startsWith("DRV")) return `DRV-${upper.slice(3)}`;
//   return `DRV-${upper}`;
// }

// // ─── Contact Info Modal ───────────────────────────────────────────────────────

// function ContactInfoModal({
//   visible,
//   onClose,
//   conversation,
//   isDark,
// }: {
//   visible: boolean;
//   onClose: () => void;
//   conversation: Conversation | null;
//   isDark: boolean;
// }) {
//   if (!conversation) return null;
//   const textColor = isDark ? Colors.textWhite    : Colors.text;
//   const subColor  = isDark ? Colors.textSecondary : Colors.textTertiary;
//   const cardBg    = isDark ? Colors.primaryDarker : "#FFFFFF";

//   const call = () => {
//     const phone = conversation.participant_phone;
//     if (!phone) {
//       Alert.alert("No phone number", "This driver has no phone number on record.");
//       return;
//     }
//     Linking.openURL(`tel:${phone.replace(/\s/g, "")}`);
//   };

//   return (
//     <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
//       <KeyboardAvoidingView
//         behavior={Platform.OS === "ios" ? "padding" : "height"}
//         style={{ flex: 1, justifyContent: "flex-end" }}
//       >
//         <Pressable style={S.backdrop} onPress={onClose} />
//         <View style={[S.infoSheet, { backgroundColor: cardBg }]}>
//           <View style={S.handle} />
//           <View style={S.infoHeader}>
//             <Text style={[S.infoTitle, { color: textColor }]}>Contact Info</Text>
//             <Pressable onPress={onClose} hitSlop={8}>
//               <HugeiconsIcon icon={ArrowLeft01Icon} size={24} color={textColor} />
//             </Pressable>
//           </View>
//           <View style={S.infoAvatarRow}>
//             <Avatar name={conversation.participant_name || "Driver"} size={72} />
//             <Text style={[S.infoName, { color: textColor }]}>
//               {conversation.participant_name}
//             </Text>
//             <Text style={[S.infoSub, { color: Colors.primary }]}>
//               {conversation.participant_driver_id}
//             </Text>
//             {conversation.participant_vehicle ? (
//               <Text style={[S.infoSub, { color: subColor }]}>
//                 🚗 {conversation.participant_vehicle}
//               </Text>
//             ) : null}
//           </View>
//           <View style={S.infoActions}>
//             <Pressable
//               style={[S.infoActionBtn, { backgroundColor: Colors.primary }]}
//               onPress={call}
//             >
//               <HugeiconsIcon icon={CallIcon} size={20} color="#fff" />
//               <Text style={S.infoActionText}>Call</Text>
//             </Pressable>
//             <Pressable
//               style={[S.infoActionBtn, { backgroundColor: Colors.primaryDarker }]}
//               onPress={onClose}
//             >
//               <HugeiconsIcon icon={Message02Icon} size={20} color="#fff" />
//               <Text style={S.infoActionText}>Message</Text>
//             </Pressable>
//           </View>
//         </View>
//       </KeyboardAvoidingView>
//     </Modal>
//   );
// }

// // ─── Message Bubble ───────────────────────────────────────────────────────────

// function MessageBubble({
//   message,
//   isMe,
//   onReply,
//   onDelete,
//   onCopy,
//   isDark,
//   textColor,
//   subTextColor,
// }: {
//   message: Message;
//   isMe: boolean;
//   onReply: () => void;
//   onDelete: () => void;
//   onCopy: () => void;
//   isDark: boolean;
//   textColor: string;
//   subTextColor: string;
// }) {
//   const timeStr = message.created_at
//     ? new Date(message.created_at).toLocaleTimeString([], {
//         hour: "2-digit",
//         minute: "2-digit",
//       })
//     : "";

//   return (
//     <Swipeable
//       renderRightActions={() => (
//         <View style={S.swipeActions}>
//           <Pressable onPress={onReply} style={[S.swipeAction, { backgroundColor: Colors.gold }]}>
//             <HugeiconsIcon icon={Reply} size={18} color="#fff" />
//           </Pressable>
//           <Pressable onPress={onCopy} style={[S.swipeAction, { backgroundColor: Colors.primary }]}>
//             <HugeiconsIcon icon={Copy01Icon} size={18} color="#fff" />
//           </Pressable>
//           <Pressable onPress={onDelete} style={[S.swipeAction, { backgroundColor: Colors.error }]}>
//             <HugeiconsIcon icon={Delete01Icon} size={18} color="#fff" />
//           </Pressable>
//         </View>
//       )}
//       overshootRight={false}
//     >
//       <View style={[S.bubbleWrap, isMe ? S.bubbleWrapMe : S.bubbleWrapThem]}>
//         <View
//           style={[
//             S.bubble,
//             isMe
//               ? S.bubbleMe
//               : [S.bubbleThem, { backgroundColor: isDark ? "#1E2820" : "#F0F0F0" }],
//           ]}
//         >
//           <Text style={[S.bubbleText, { color: isMe ? "#fff" : textColor }]}>
//             {message.audio_uri ? "🎤 Voice message" : message.text}
//           </Text>
//           <View style={S.bubbleMeta}>
//             <Text
//               style={[
//                 S.bubbleTime,
//                 { color: isMe ? "rgba(255,255,255,0.55)" : subTextColor },
//               ]}
//             >
//               {timeStr}
//             </Text>
//             {isMe && (
//               <HugeiconsIcon
//                 icon={message.status === "read" ? TaskDone01Icon : Checkmark}
//                 size={13}
//                 color={
//                   message.status === "read"
//                     ? "#34B7F1"
//                     : "rgba(255,255,255,0.45)"
//                 }
//               />
//             )}
//           </View>
//         </View>
//       </View>
//     </Swipeable>
//   );
// }

// // ─── Chat Screen ──────────────────────────────────────────────────────────────

// function ChatScreen({
//   conversation,
//   onBack,
//   isDark,
//   invalidId = false,
// }: {
//   conversation: Conversation;
//   onBack: () => void;
//   isDark: boolean;
//   invalidId?: boolean;
// }) {
//   const { user } = useAuthStore();
//   const {
//     addMessage,
//     markRead,
//     messages: allMessages,
//     setTyping,
//     typingUsers,
//     deleteMessage,
//     subscribeToRealtime,
//   } = useMessagesStore();

//   const [text,        setText]        = useState("");
//   const [sending,     setSending]     = useState(false);
//   const [infoVisible, setInfoVisible] = useState(false);
//   const [isRecording, setIsRecording] = useState(false);

//   const recordingRef = useRef<Audio.Recording | null>(null);
//   const listRef      = useRef<FlatList>(null);
//   const typingTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const insets       = useSafeAreaInsets();

//   const bg        = isDark ? Colors.background    : "#F5F5F5";
//   const textColor = isDark ? Colors.textWhite      : Colors.text;
//   const subColor  = isDark ? Colors.textSecondary  : Colors.textTertiary;
//   const cardBg    = isDark ? Colors.primaryDarker  : "#FFFFFF";
//   const border    = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
//   const inputBg   = isDark ? "#1C2921"             : "#F0F0F0";
//   const topPad    = Platform.OS === "web" ? 67 : insets.top;

//   const messages    = allMessages[conversation.id] || [];
//   const otherTyping = typingUsers[conversation.id] || false;

//   useEffect(() => {
//     if (!user?.id) return;
//     const unsub = subscribeToRealtime(user.id);
//     return () => unsub?.();
//   }, [user?.id]);

//   useEffect(() => {
//     markRead(conversation.id);
//   }, [conversation.id]);

//   useEffect(() => {
//     if (messages.length > 0) {
//       setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
//     }
//   }, [messages.length]);

//   // ── Typing ────────────────────────────────────────────────────
//   const handleTyping = (v: string) => {
//     setText(v);
//     setTyping(conversation.id, true);
//     if (typingTimer.current) clearTimeout(typingTimer.current);
//     typingTimer.current = setTimeout(
//       () => setTyping(conversation.id, false),
//       1500
//     );
//   };

//   // ── Send text ─────────────────────────────────────────────────
//   const handleSend = async () => {
//     const trimmed = text.trim();
//     if (!trimmed || !user?.id || sending) return;
//     setSending(true);
//     setText("");
//     setTyping(conversation.id, false);
//     const msg: Message = {
//       id:              generateId(),
//       conversation_id: conversation.id,
//       sender_id:       user.id,
//       sender_name:     user.full_name || "Me",
//       sender_role:     user.role as any,
//       text:            trimmed,
//       created_at:      new Date().toISOString(),
//       read:            false,
//       status:          "sent",
//     };
//     await addMessage(msg);
//     setSending(false);
//   };

//   // ── Voice recording ───────────────────────────────────────────
//   const startRecording = async () => {
//     try {
//       const { status } = await Audio.requestPermissionsAsync();
//       if (status !== "granted") {
//         Alert.alert(
//           "Permission required",
//           "Microphone access is needed for voice messages."
//         );
//         return;
//       }
//       await Audio.setAudioModeAsync({
//         allowsRecordingIOS: true,
//         playsInSilentModeIOS: true,
//       });
//       const { recording } = await Audio.Recording.createAsync(
//         Audio.RecordingOptionsPresets.HIGH_QUALITY
//       );
//       recordingRef.current = recording;
//       setIsRecording(true);
//       Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
//     } catch {
//       Alert.alert("Error", "Could not start recording.");
//     }
//   };

//   const stopRecording = async () => {
//     if (!recordingRef.current || !user?.id) return;
//     setIsRecording(false);
//     try {
//       await recordingRef.current.stopAndUnloadAsync();
//       const uri = recordingRef.current.getURI();
//       recordingRef.current = null;
//       Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
//       if (uri) {
//         const msg: Message = {
//           id:              generateId(),
//           conversation_id: conversation.id,
//           sender_id:       user.id,
//           sender_name:     user.full_name || "Me",
//           sender_role:     user.role as any,
//           audio_uri:       uri,
//           created_at:      new Date().toISOString(),
//           read:            false,
//           status:          "sent",
//         };
//         await addMessage(msg);
//       }
//     } catch {
//       Alert.alert("Error", "Could not save voice message.");
//     }
//   };

//   const cancelRecording = async () => {
//     if (!recordingRef.current) return;
//     setIsRecording(false);
//     try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
//     recordingRef.current = null;
//   };

//   const handleCall = () => {
//     const phone = conversation.participant_phone;
//     if (!phone) {
//       Alert.alert("No phone", "This driver has no phone number on record.");
//       return;
//     }
//     Linking.openURL(`tel:${phone.replace(/\s/g, "")}`);
//   };

//   const handleReply = (m: Message) => {
//     if (!m.text) return;
//     setText(`↩ ${m.sender_name || "User"}: ${m.text}\n`);
//   };

//   const handleCopy = (m: Message) => {
//     if (!m.text) return;
//     if (Platform.OS === "web" && navigator?.clipboard) {
//       navigator.clipboard.writeText(m.text);
//     }
//     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
//   };

//   // Right button: send (text present) or mic (no text)
//   const InputRight = () =>
//     text.trim() ? (
//       <Pressable
//         style={[S.sendBtn, { backgroundColor: Colors.primary, opacity: sending ? 0.6 : 1 }]}
//         onPress={handleSend}
//         disabled={sending}
//       >
//         {sending ? (
//           <ActivityIndicator size="small" color="#fff" />
//         ) : (
//           <HugeiconsIcon icon={TelegramIcon} size={20} color="#fff" />
//         )}
//       </Pressable>
//     ) : (
//       <Pressable
//         style={[
//           S.sendBtn,
//           { backgroundColor: isRecording ? Colors.error : Colors.primary },
//         ]}
//         onLongPress={startRecording}
//         onPressOut={isRecording ? stopRecording : undefined}
//         delayLongPress={200}
//       >
//         <HugeiconsIcon
//           icon={isRecording ? MicOff01Icon : Mic01Icon}
//           size={20}
//           color="#fff"
//         />
//       </Pressable>
//     );

//   return (
//     <KeyboardAvoidingView
//       style={{ flex: 1, backgroundColor: bg }}
//       behavior={Platform.OS === "ios" ? "padding" : undefined}
//     >
//       <StatusBar style={isDark ? "light" : "dark"} />

//       {/* Header */}
//       <View
//         style={[
//           S.chatHeader,
//           {
//             backgroundColor: cardBg,
//             borderBottomColor: border,
//             paddingTop: topPad + 12,
//           },
//         ]}
//       >
//         <Pressable onPress={onBack} style={S.chatBack} hitSlop={8}>
//           <HugeiconsIcon icon={ArrowLeft01Icon} size={25} color={textColor} />
//         </Pressable>
//         <Pressable
//           style={S.chatHeaderInfo}
//           onPress={() => setInfoVisible(true)}
//         >
//           <Avatar name={conversation.participant_name || "Driver"} size={38} />
//           <View style={{ flex: 1 }}>
//             <Text
//               style={[S.chatHeaderName, { color: textColor }]}
//               numberOfLines={1}
//             >
//               {conversation.participant_name}
//             </Text>
//             {otherTyping ? (
//               <Text
//                 style={{
//                   fontFamily: "Poppins_400Regular",
//                   fontSize: 11,
//                   fontStyle: "italic",
//                   color: Colors.primary,
//                 }}
//               >
//                 typing...
//               </Text>
//             ) : (
//               <Text
//                 style={[S.chatHeaderSub, { color: Colors.primary }]}
//                 numberOfLines={1}
//               >
//                 {conversation.participant_driver_id}
//               </Text>
//             )}
//           </View>
//         </Pressable>
//         <Pressable onPress={handleCall} style={S.chatCallBtn} hitSlop={8}>
//           <HugeiconsIcon icon={CallIcon} size={22} color={Colors.primary} />
//         </Pressable>
//         <Pressable onPress={() => setInfoVisible(true)} hitSlop={8}>
//           <HugeiconsIcon icon={MoreVerticalIcon} size={24} color={textColor} />
//         </Pressable>
//       </View>

//       {/* Invalid driver warning */}
//       {invalidId && (
//         <View style={[S.warnBanner, { backgroundColor: Colors.gold + "22" }]}>
//           <Text style={[S.warnText, { color: Colors.gold }]}>
//             ⚠ Invalid driver_id — this driver could not be verified. Messages
//             may not be delivered.
//           </Text>
//         </View>
//       )}

//       {/* Recording banner */}
//       {isRecording && (
//         <View
//           style={[S.recBanner, { backgroundColor: Colors.error + "22" }]}
//         >
//           <View style={S.recDot} />
//           <Text style={[S.recText, { color: Colors.error }]}>
//             Recording… release to send
//           </Text>
//           <Pressable onPress={cancelRecording} hitSlop={8}>
//             <Text style={{ color: Colors.error, fontSize: 20, lineHeight: 22 }}>
//               ×
//             </Text>
//           </Pressable>
//         </View>
//       )}

//       {/* Messages */}
//       <FlatList
//         ref={listRef}
//         data={messages}
//         keyExtractor={(m) => m.id}
//         contentContainerStyle={S.messageList}
//         showsVerticalScrollIndicator={false}
//         renderItem={({ item }) => (
//           <MessageBubble
//             message={item}
//             isMe={item.sender_id === user?.id}
//             onReply={() => handleReply(item)}
//             onDelete={() => deleteMessage(conversation.id, item.id)}
//             onCopy={() => handleCopy(item)}
//             isDark={isDark}
//             textColor={textColor}
//             subTextColor={subColor}
//           />
//         )}
//         ListEmptyComponent={
//           <View style={S.emptyChat}>
//             <HugeiconsIcon icon={Message02Icon} size={44} color={subColor} />
//             <Text style={[S.emptyChatText, { color: subColor }]}>
//               No messages yet. Say hello!
//             </Text>
//           </View>
//         }
//       />

//       {/* Input bar */}
//       <View
//         style={[
//           S.inputBar,
//           {
//             backgroundColor: cardBg,
//             borderTopColor: border,
//             paddingBottom: Math.max(insets.bottom, 12),
//           },
//         ]}
//       >
//         <TextInput
//           style={[S.textInput, { backgroundColor: inputBg, color: textColor }]}
//           placeholder="Type a message..."
//           placeholderTextColor={subColor}
//           value={text}
//           onChangeText={handleTyping}
//           multiline
//           maxLength={2000}
//         />
//         <InputRight />
//       </View>

//       <ContactInfoModal
//         visible={infoVisible}
//         onClose={() => setInfoVisible(false)}
//         conversation={conversation}
//         isDark={isDark}
//       />
//     </KeyboardAvoidingView>
//   );
// }

// // ─── New Chat Modal ────────────────────────────────────────────────────────────
// //
// // Lookup order:
// //   1. users.id = input AND role = 'driver'       (UUID entered directly)
// //   2. users.driver_id = normalised AND role = 'driver'  (DRV-XXXX entered)
// //
// // Either way we always open a chat. If neither lookup hits we open with an
// // "Invalid driver_id" warning baked into the conversation object so the chat
// // screen can surface it to the passenger.

// interface DriverRecord {
//   id: string;
//   full_name: string | null;
//   phone: string | null;
//   driver_id: string | null;
//   vehicle_details: string | null;
//   park_name: string | null;
// }

// // Status of the last search attempt
// type SearchStatus = "idle" | "searching" | "found" | "invalid";

// function NewChatModal({
//   visible,
//   onClose,
//   onStart,
//   isDark,
// }: {
//   visible: boolean;
//   onClose: () => void;
//   onStart: (conv: Conversation, invalidId: boolean) => void;
//   isDark: boolean;
// }) {
//   const { user } = useAuthStore();
//   const [query,  setQuery]  = useState("");
//   const [status, setStatus] = useState<SearchStatus>("idle");
//   const [result, setResult] = useState<DriverRecord | null>(null);

//   const textColor = isDark ? Colors.textWhite     : Colors.text;
//   const subColor  = isDark ? Colors.textSecondary : Colors.textTertiary;
//   const cardBg    = isDark ? Colors.primaryDarker : "#FFFFFF";
//   const border    = isDark ? "rgba(255,255,255,0.12)" : "#E8ECF0";
//   const inputBg   = isDark ? Colors.background    : "#F4F6FA";

//   useEffect(() => {
//     if (!visible) {
//       setQuery("");
//       setResult(null);
//       setStatus("idle");
//     }
//   }, [visible]);

//   const reset = () => { setResult(null); setStatus("idle"); };

//   const handleSearch = async () => {
//     const raw = query.trim();
//     if (!raw || !user?.id) return;

//     setStatus("searching");
//     setResult(null);

//     let found: DriverRecord | null = null;

//     try {
//       // ── Attempt 1: treat input as a UUID (users.id) ──────────────
//       const { data: byId } = await supabase
//         .from("users")
//         .select("id, full_name, phone, driver_id, vehicle_details, park_name")
//         .eq("id", raw)
//         .eq("role", "driver")
//         .maybeSingle();

//       if (byId) {
//         found = byId as DriverRecord;
//       } else {
//         // ── Attempt 2: treat input as DRV-XXXX code (users.driver_id) ──
//         const normalised = normaliseDriverId(raw);
//         const { data: byDriverId } = await supabase
//           .from("users")
//           .select("id, full_name, phone, driver_id, vehicle_details, park_name")
//           .eq("driver_id", normalised)
//           .eq("role", "driver")
//           .maybeSingle();

//         if (byDriverId) found = byDriverId as DriverRecord;
//       }
//     } catch (err: any) {
//       // Network failure — treat as invalid but still allow opening
//       console.warn("[Messages] driver lookup error:", err?.message ?? err);
//     }

//     if (found) {
//       setResult(found);
//       setStatus("found");
//     } else {
//       // Nothing matched — build a placeholder so the user can still open a chat
//       setResult({
//         id:              `invalid_${raw}`,   // sentinel — no real UUID
//         full_name:       raw,                // show the typed string as name
//         phone:           null,
//         driver_id:       raw,
//         vehicle_details: null,
//         park_name:       null,
//       });
//       setStatus("invalid");
//     }
//   };

//   // Open the chat — passes invalidId=true when the lookup failed so the
//   // ChatScreen can show the "Invalid driver_id" warning banner.
//   const handleOpen = () => {
//     if (!result || !user?.id) return;

//     const isInvalid = status === "invalid";

//     // Use a sorted pair for deterministic conv IDs.
//     // For invalid IDs we include the raw input so each invalid search
//     // gets its own thread (avoids collisions between different bad inputs).
//     const convId = isInvalid
//       ? `conv_invalid_${user.id}_${result.driver_id}`
//       : `conv_${[user.id, result.id].sort().join("_")}`;

//     const conv: Conversation = {
//       id:                    convId,
//       participant_id:        result.id,
//       participant_name:      result.full_name || "Unknown",
//       participant_role:      "driver",
//       participant_driver_id: result.driver_id ?? undefined,
//       participant_vehicle:   result.vehicle_details ?? undefined,
//       participant_park_name: result.park_name ?? undefined,
//       participant_phone:     result.phone ?? undefined,
//       last_message:          "",
//       last_message_at:       new Date().toISOString(),
//       unread_count:          0,
//     };

//     onStart(conv, isInvalid);
//     onClose();
//   };

//   const isFound   = status === "found";
//   const isInvalid = status === "invalid";

//   return (
//     <Modal
//       visible={visible}
//       transparent
//       animationType="slide"
//       onRequestClose={onClose}
//     >
//       <KeyboardAvoidingView
//         behavior={Platform.OS === "ios" ? "padding" : undefined}
//         style={{ flex: 1, justifyContent: "flex-end" }}
//       >
//         <Pressable style={S.backdrop} onPress={onClose} />
//         <View style={[S.newSheet, { backgroundColor: cardBg }]}>
//           <View style={S.handle} />

//           <Text style={[S.newTitle, { color: textColor }]}>New Message</Text>
//           <Text style={[S.newSub, { color: subColor }]}>
//             {`Enter the driver's ID or UUID`}
//           </Text>

//           {/* ── Input ── */}
//           <View style={[S.newInputRow, { backgroundColor: inputBg, borderColor: border }]}>
//             <HugeiconsIcon icon={Search01Icon} size={18} color={subColor} />
//             <TextInput
//               style={[S.newInput, { color: textColor }]}
//               placeholder="DRV-A3X9KL"
//               placeholderTextColor={subColor}
//               value={query}
//               onChangeText={(v) => { setQuery(v); reset(); }}
//               autoFocus
//               // autoCapitalize="characters"
//               autoCorrect={false}
//               returnKeyType="search"
//               onSubmitEditing={handleSearch}
//             />
//             {query.length > 0 && (
//               <Pressable hitSlop={8} onPress={() => { setQuery(""); reset(); }}>
//                 <Text style={{ color: subColor, fontSize: 18 }}>{`×`}</Text>
//               </Pressable>
//             )}
//           </View>

//           {/* ── Search button ── */}
//           <Pressable
//             style={[
//               S.newSearchBtn,
//               {
//                 backgroundColor: query.trim() ? Colors.primary : isDark ? "#2A2A2A" : "#E5E7EB",
//                 opacity: status === "searching" ? 0.7 : 1,
//               },
//             ]}
//             onPress={handleSearch}
//             disabled={!query.trim() || status === "searching"}
//           >
//             {status === "searching" ? (
//               <ActivityIndicator size="small" color="#fff" />
//             ) : (
//               <Text style={[S.newSearchBtnText, { color: query.trim() ? "#fff" : subColor }]}>
//                 Search Driver
//               </Text>
//             )}
//           </Pressable>

//           {/* ── Result card (shown for both found + invalid) ── */}
//           {result && (
//             <View
//               style={[
//                 S.resultCard,
//                 {
//                   backgroundColor: isFound
//                     ? isDark ? "#1C2921" : "#F0FDF4"
//                     : isDark ? "#221A1A" : "#FFF8F0",
//                   borderColor: isFound ? Colors.primary + "55" : Colors.gold + "99",
//                 },
//               ]}
//             >
//               <Avatar name={isFound ? result.full_name || "Driver" : "?"} size={50} />

//               <View style={{ flex: 1, gap: 2 }}>
//                 {isFound ? (
//                   <>
//                     <Text style={[S.resultName, { color: textColor }]}>
//                       {result.full_name || "Driver"}
//                     </Text>
//                     <Text style={[S.resultDriverId, { color: Colors.primary }]}>
//                       {result.driver_id}
//                     </Text>
//                     {result.vehicle_details ? (
//                       <Text style={[S.resultSub, { color: subColor }]}>
//                         🚗 {result.vehicle_details}
//                       </Text>
//                     ) : null}
//                   </>
//                 ) : (
//                   <>
//                     <Text style={[S.resultName, { color: Colors.gold }]}>
//                       Invalid driver_id
//                     </Text>
//                     <Text style={[S.resultSub, { color: subColor }]}>
//                       {`"${query.trim()}" is not a registered driver. You can still
//                       open a chat but messages wont be delivered.`}
//                     </Text>
//                   </>
//                 )}
//               </View>

//               <Pressable
//                 style={[
//                   S.chatBtn,
//                   { backgroundColor: isFound ? Colors.primary : Colors.gold },
//                 ]}
//                 onPress={handleOpen}
//               >
//                 <Text style={S.chatBtnText}>
//                   {isFound ? "Chat" : "Open anyway"}
//                 </Text>
//               </Pressable>
//             </View>
//           )}
//         </View>
//       </KeyboardAvoidingView>
//     </Modal>
//   );
// }

// // ─── Conversation List Item ───────────────────────────────────────────────────

// function ConvItem({
//   item,
//   onPress,
//   onDelete,
//   isDark,
//   textColor,
//   subColor,
//   cardBg,
//   border,
// }: {
//   item: Conversation;
//   onPress: () => void;
//   onDelete: () => void;
//   isDark: boolean;
//   textColor: string;
//   subColor: string;
//   cardBg: string;
//   border: string;
// }) {
//   const timeStr = item.last_message_at
//     ? new Date(item.last_message_at).toLocaleTimeString([], {
//         hour: "2-digit",
//         minute: "2-digit",
//       })
//     : "";

//   return (
//     <Swipeable
//       renderRightActions={() => (
//         <Pressable
//           style={[S.deleteSwipe, { backgroundColor: Colors.error }]}
//           onPress={onDelete}
//         >
//           <HugeiconsIcon icon={Delete01Icon} size={22} color="#fff" />
//         </Pressable>
//       )}
//     >
//       <Pressable
//         style={({ pressed }) => [
//           S.convItem,
//           { backgroundColor: cardBg, borderBottomColor: border },
//           pressed && { opacity: 0.85 },
//         ]}
//         onPress={onPress}
//       >
//         <View style={{ position: "relative" }}>
//           <Avatar name={item.participant_name || "Driver"} size={50} />
//           {(item.unread_count ?? 0) > 0 && <View style={S.onlineDot} />}
//         </View>
//         <View style={S.convText}>
//           <View style={S.convTopRow}>
//             <Text
//               style={[S.convName, { color: textColor }]}
//               numberOfLines={1}
//             >
//               {item.participant_name}
//             </Text>
//             <Text style={[S.convTime, { color: subColor }]}>{timeStr}</Text>
//           </View>
//           <View style={S.convBottomRow}>
//             <Text
//               style={[S.convLast, { color: subColor }]}
//               numberOfLines={1}
//             >
//               {item.last_message || "Tap to start chatting"}
//             </Text>
//             {(item.unread_count ?? 0) > 0 && (
//               <View style={S.badge}>
//                 <Text style={S.badgeText}>
//                   {(item.unread_count ?? 0) > 9 ? "9+" : item.unread_count}
//                 </Text>
//               </View>
//             )}
//           </View>
//           {item.participant_driver_id && (
//             <Text style={[S.convDriverId, { color: Colors.primary + "AA" }]}>
//               {item.participant_driver_id}
//             </Text>
//           )}
//         </View>
//       </Pressable>
//     </Swipeable>
//   );
// }

// // ─── Main Tab ─────────────────────────────────────────────────────────────────

// export default function MessagesTab() {
//   const insets = useSafeAreaInsets();
//   const { theme } = useSettingsStore();
//   const { user }  = useAuthStore();
//   const {
//     conversations,
//     addConversation,
//     deleteConversation,
//     subscribeToRealtime,
//   } = useMessagesStore();

//   const [activeConv,      setActiveConv]      = useState<Conversation | null>(null);
//   const [activeInvalidId, setActiveInvalidId] = useState(false);
//   const [newChatVisible,  setNewChatVisible]  = useState(false);
//   const [refreshing,      setRefreshing]      = useState(false);

//   const isDark    = theme === "dark";
//   const bg        = isDark ? Colors.background    : "#F0F0F0";
//   const textColor = isDark ? Colors.textWhite      : Colors.text;
//   const subColor  = isDark ? Colors.textSecondary  : Colors.textTertiary;
//   const cardBg    = isDark ? Colors.primaryDarker  : "#FFFFFF";
//   const border    = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
//   const topPad    = Platform.OS === "web" ? 67 : insets.top;

//   useEffect(() => {
//     if (!user?.id) return;
//     const unsub = subscribeToRealtime(user.id);
//     return () => unsub?.();
//   }, [user?.id]);

//   const visible = useMemo(() => {
//     if (!user) return [];
//     if (user.role === "driver") {
//       return conversations.filter(
//         (c) =>
//           c.participant_id === user.id ||
//           (user.driver_id && c.participant_driver_id === user.driver_id)
//       );
//     }
//     return conversations.filter((c) => c.participant_role === "driver");
//   }, [conversations, user]);

//   const onRefresh = useCallback(async () => {
//     setRefreshing(true);
//     await new Promise((r) => setTimeout(r, 700));
//     setRefreshing(false);
//   }, []);

//   const handleStart = async (conv: Conversation, invalidId: boolean) => {
//     setActiveInvalidId(invalidId);
//     await addConversation(conv);
//     // Mirror to Supabase so the driver sees it in their list (skip for invalid IDs)
//     if (user && !invalidId) {
//       supabase
//         .from("conversations")
//         .upsert([
//           {
//             id:                    conv.id,
//             participant_id:        conv.participant_id,
//             participant_name:      conv.participant_name,
//             participant_role:      conv.participant_role,
//             participant_driver_id: conv.participant_driver_id ?? null,
//             participant_phone:     conv.participant_phone ?? null,
//             participant_vehicle:   conv.participant_vehicle ?? null,
//             passenger_id:          user.id,
//             passenger_name:        user.full_name || "Passenger",
//             passenger_phone:       user.phone || null,
//             last_message:          "",
//             last_message_at:       new Date().toISOString(),
//             unread_count:          0,
//           },
//         ])
//         .then(({ error }) => {
//           if (error) console.warn("[Messages] upsert conv:", error.message);
//         });
//     }
//     setActiveConv(conv);
//   };

//   const confirmDelete = (id: string) => {
//     Alert.alert("Delete conversation", "This cannot be undone.", [
//       { text: "Cancel", style: "cancel" },
//       {
//         text: "Delete",
//         style: "destructive",
//         onPress: () => deleteConversation(id),
//       },
//     ]);
//   };

//   if (activeConv) {
//     return (
//       <GestureHandlerRootView style={{ flex: 1 }}>
//         <ChatScreen
//           conversation={activeConv}
//           onBack={() => { setActiveConv(null); setActiveInvalidId(false); }}
//           isDark={isDark}
//           invalidId={activeInvalidId}
//         />
//       </GestureHandlerRootView>
//     );
//   }

//   return (
//     <>
//       <GestureHandlerRootView style={[S.root, { backgroundColor: bg }]}>
//         <StatusBar style={isDark ? "light" : "dark"} />

//         <View
//           style={[
//             S.header,
//             {
//               backgroundColor: cardBg,
//               paddingTop: topPad + 12,
//               borderBottomColor: border,
//             },
//           ]}
//         >
//           <View style={{ flex: 1 }}>
//             <Text style={[S.headerTitle, { color: textColor }]}>Messages</Text>
//             {user?.role === "driver" && (
//               <Text
//                 style={{
//                   fontFamily: "Poppins_400Regular",
//                   fontSize: 12,
//                   color: subColor,
//                   marginTop: 1,
//                 }}
//               >
//                 Passenger messages appear here
//               </Text>
//             )}
//           </View>
//           {user?.role !== "driver" && (
//             <Pressable
//               style={S.newBtn}
//               onPress={() => setNewChatVisible(true)}
//             >
//               <HugeiconsIcon icon={PlusSignIcon} size={23} color={textColor} />
//             </Pressable>
//           )}
//         </View>

//         <FlatList
//           data={visible}
//           keyExtractor={(c) => c.id}
//           contentContainerStyle={{ flexGrow: 1 }}
//           showsVerticalScrollIndicator={false}
//           refreshControl={
//             <RefreshControl
//               refreshing={refreshing}
//               onRefresh={onRefresh}
//               tintColor={Colors.primary}
//             />
//           }
//           renderItem={({ item }) => (
//             <ConvItem
//               item={item}
//               isDark={isDark}
//               textColor={textColor}
//               subColor={subColor}
//               cardBg={cardBg}
//               border={border}
//               onPress={() => {
//                 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
//                 setActiveConv(item);
//               }}
//               onDelete={() => confirmDelete(item.id)}
//             />
//           )}
//           ListEmptyComponent={
//             <View style={S.empty}>
//               <HugeiconsIcon icon={ChartBubbleIcon} size={52} color={subColor} />
//               <Text style={[S.emptyTitle, { color: textColor }]}>
//                 {user?.role === "driver"
//                   ? "No messages yet"
//                   : "No conversations yet"}
//               </Text>
//               <Text style={[S.emptySub, { color: subColor }]}>
//                 {user?.role === "driver"
//                   ? "When passengers message you, they'll appear here."
//                   : "Tap + and enter a driver's ID to start chatting."}
//               </Text>
//               {user?.role !== "driver" && (
//                 <Pressable
//                   style={[S.emptyBtn, { backgroundColor: Colors.primary }]}
//                   onPress={() => setNewChatVisible(true)}
//                 >
//                   <Text style={S.emptyBtnText}>Start a conversation</Text>
//                 </Pressable>
//               )}
//             </View>
//           }
//         />
//       </GestureHandlerRootView>

//       <NewChatModal
//         visible={newChatVisible}
//         onClose={() => setNewChatVisible(false)}
//         isDark={isDark}
//         onStart={handleStart}
//       />
//     </>
//   );
// }

// // ─── Stylesheet ───────────────────────────────────────────────────────────────

// const S = StyleSheet.create({
//   root: { flex: 1 },
//   backdrop: { flex: 1 },
//   handle: {
//     width: 40, height: 4, borderRadius: 2,
//     backgroundColor: "rgba(154,154,154,0.3)",
//     alignSelf: "center", marginBottom: 4,
//   },

//   // List header
//   header: {
//     flexDirection: "row", alignItems: "center", justifyContent: "space-between",
//     paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
//   },
//   headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 24 },
//   newBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },

//   // Conversation item
//   convItem: {
//     flexDirection: "row", alignItems: "center", gap: 14,
//     paddingHorizontal: 16, paddingVertical: 13,
//     borderBottomWidth: StyleSheet.hairlineWidth,
//   },
//   convText:      { flex: 1, gap: 2 },
//   convTopRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
//   convName:      { fontFamily: "Poppins_600SemiBold", fontSize: 15, flex: 1 },
//   convTime:      { fontFamily: "Poppins_400Regular", fontSize: 11 },
//   convBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
//   convLast:      { fontFamily: "Poppins_400Regular", fontSize: 13, flex: 1 },
//   convDriverId:  { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 1 },
//   onlineDot: {
//     position: "absolute", top: 0, right: 0,
//     width: 12, height: 12, borderRadius: 6,
//     backgroundColor: Colors.primary, borderWidth: 2, borderColor: "#fff",
//   },
//   badge: {
//     backgroundColor: Colors.primary, borderRadius: 10,
//     minWidth: 20, height: 20, alignItems: "center", justifyContent: "center",
//     paddingHorizontal: 5, marginLeft: 6,
//   },
//   badgeText:   { fontFamily: "Poppins_700Bold", fontSize: 10, color: "#fff" },
//   deleteSwipe: { width: 70, alignItems: "center", justifyContent: "center" },

//   // Empty state
//   empty:        { alignItems: "center", paddingTop: 100, paddingHorizontal: 40, gap: 12 },
//   emptyTitle:   { fontFamily: "Poppins_600SemiBold", fontSize: 18, textAlign: "center" },
//   emptySub:     { fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", lineHeight: 22 },
//   emptyBtn:     { borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
//   emptyBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },

//   // New chat modal
//   newSheet: {
//     position: "absolute", bottom: 0, left: 0, right: 0,
//     borderTopLeftRadius: 28, borderTopRightRadius: 28,
//     padding: 24, paddingBottom: 344, gap: 14,
//   },
//   newTitle:      { fontFamily: "Poppins_700Bold", fontSize: 20 },
//   newSub:        { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 20 },
//   newInputRow: {
//     flexDirection: "row", alignItems: "center", gap: 10,
//     borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1,
//   },
//   newInput:          { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 15, padding: 0, letterSpacing: 1 },
//   newSearchBtn:      { borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center", minHeight: 50 },
//   newSearchBtnText:  { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
//   resultCard: {
//     flexDirection: "row", alignItems: "center", gap: 12,
//     borderRadius: 16, padding: 14, borderWidth: 1,
//   },
//   resultName:     { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
//   resultDriverId: { fontFamily: "Poppins_600SemiBold", fontSize: 13, marginTop: 1 },
//   resultSub:      { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
//   chatBtn:        { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
//   chatBtnText:    { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },

//   // Warning banner (invalid driver_id)
//   warnBanner: {
//     flexDirection: "row", alignItems: "flex-start",
//     paddingHorizontal: 16, paddingVertical: 10,
//   },
//   warnText: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 18, flex: 1 },

//   // Chat screen
//   chatHeader: {
//     flexDirection: "row", alignItems: "center",
//     paddingHorizontal: 16, paddingBottom: 12, gap: 10, borderBottomWidth: 1,
//   },
//   chatBack:       { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
//   chatHeaderInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
//   chatHeaderName: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
//   chatHeaderSub:  { fontFamily: "Poppins_500Medium", fontSize: 12, marginTop: 1 },
//   chatCallBtn: {
//     width: 36, height: 36, borderRadius: 18,
//     backgroundColor: `${Colors.primary}20`, alignItems: "center", justifyContent: "center",
//   },
//   recBanner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
//   recDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
//   recText:   { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 12 },
//   messageList:   { paddingVertical: 12, paddingBottom: 20, flexGrow: 1 },
//   emptyChat:     { alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 100 },
//   emptyChatText: { fontFamily: "Poppins_400Regular", fontSize: 14 },
//   inputBar: {
//     flexDirection: "row", alignItems: "flex-end",
//     gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1,
//   },
//   textInput: {
//     flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
//     fontFamily: "Poppins_400Regular", fontSize: 14, maxHeight: 120, minHeight: 42,
//   },
//   sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },

//   // Message bubble
//   bubbleWrap:     { marginVertical: 2, paddingHorizontal: 12 },
//   bubbleWrapMe:   { alignItems: "flex-end" },
//   bubbleWrapThem: { alignItems: "flex-start" },
//   bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
//   bubbleMe:   { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
//   bubbleThem: { borderBottomLeftRadius: 4 },
//   bubbleText: { fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 21 },
//   bubbleMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
//   bubbleTime: { fontFamily: "Poppins_400Regular", fontSize: 10 },
//   swipeActions: { flexDirection: "row", alignItems: "center" },
//   swipeAction:  { width: 50, height: "100%", alignItems: "center", justifyContent: "center" },

//   // Contact info modal
//   infoSheet: {
//     position: "absolute", bottom: 0, left: 0, right: 0,
//     borderTopLeftRadius: 28, borderTopRightRadius: 28,
//     padding: 30, paddingTop: 10, paddingBottom: 50, gap: 14,
//   },
//   infoHeader:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
//   infoTitle:     { fontFamily: "Poppins_700Bold", fontSize: 18, marginTop: 20 },
//   infoAvatarRow: { alignItems: "center", marginVertical: 16, gap: 6 },
//   infoName:      { fontFamily: "Poppins_700Bold", fontSize: 20 },
//   infoSub:       { fontFamily: "Poppins_400Regular", fontSize: 14 },
//   infoActions:   { flexDirection: "row", gap: 12, marginTop: 8 },
//   infoActionBtn: {
//     flex: 1, flexDirection: "row", alignItems: "center",
//     justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14,
//   },
//   infoActionText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },
// });






































/**
 * app/(main)/messages.tsx
 *
 * Messaging between passengers and drivers.
 *
 * Search: passenger enters a driver ID in any format (DRV-A3X9KL, drv-a3x9kl,
 * A3X9KL, etc.) → normalised to uppercase → exact match on public.users.driver_id.
 * No trip code fallback — driver ID only.
 *
 * Message routing: messages are inserted into the `messages` table keyed by
 * conversation_id. The driver receives them via Supabase realtime subscription.
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

// ─── Normalise driver ID input ────────────────────────────────────────────────
// Accepts any capitalisation and optional prefix:
//   "DRV-A3X9KL" | "drv-a3x9kl" | "A3X9KL" | "a3x9kl" | "DRV A3X9KL"
// Returns the canonical form stored in the DB: "DRV-A3X9KL"
function normaliseDriverId(raw: string): string {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, "-");
  if (upper.startsWith("DRV-")) return upper;
  if (upper.startsWith("DRV")) return `DRV-${upper.slice(3)}`;
  return `DRV-${upper}`;
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
  const textColor = isDark ? Colors.textWhite    : Colors.text;
  const subColor  = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg    = isDark ? Colors.primaryDarker : "#FFFFFF";

  const call = () => {
    const phone = conversation.participant_phone;
    if (!phone) {
      Alert.alert("No phone number", "This driver has no phone number on record.");
      return;
    }
    Linking.openURL(`tel:${phone.replace(/\s/g, "")}`);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
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
            <Avatar name={conversation.participant_name || "Driver"} size={72} />
            <Text style={[S.infoName, { color: textColor }]}>
              {conversation.participant_name}
            </Text>
            <Text style={[S.infoSub, { color: Colors.primary }]}>
              {conversation.participant_driver_id}
            </Text>
            {conversation.participant_vehicle ? (
              <Text style={[S.infoSub, { color: subColor }]}>
                🚗 {conversation.participant_vehicle}
              </Text>
            ) : null}
          </View>
          <View style={S.infoActions}>
            <Pressable
              style={[S.infoActionBtn, { backgroundColor: Colors.primary }]}
              onPress={call}
            >
              <HugeiconsIcon icon={CallIcon} size={20} color="#fff" />
              <Text style={S.infoActionText}>Call</Text>
            </Pressable>
            <Pressable
              style={[S.infoActionBtn, { backgroundColor: Colors.primaryDarker }]}
              onPress={onClose}
            >
              <HugeiconsIcon icon={Message02Icon} size={20} color="#fff" />
              <Text style={S.infoActionText}>Message</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

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
  const timeStr = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <Swipeable
      renderRightActions={() => (
        <View style={S.swipeActions}>
          <Pressable onPress={onReply} style={[S.swipeAction, { backgroundColor: Colors.gold }]}>
            <HugeiconsIcon icon={Reply} size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={onCopy} style={[S.swipeAction, { backgroundColor: Colors.primary }]}>
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
        <View
          style={[
            S.bubble,
            isMe
              ? S.bubbleMe
              : [S.bubbleThem, { backgroundColor: isDark ? "#1E2820" : "#F0F0F0" }],
          ]}
        >
          <Text style={[S.bubbleText, { color: isMe ? "#fff" : textColor }]}>
            {message.audio_uri ? "🎤 Voice message" : message.text}
          </Text>
          <View style={S.bubbleMeta}>
            <Text
              style={[
                S.bubbleTime,
                { color: isMe ? "rgba(255,255,255,0.55)" : subTextColor },
              ]}
            >
              {timeStr}
            </Text>
            {isMe && (
              <HugeiconsIcon
                icon={message.status === "read" ? TaskDone01Icon : Checkmark}
                size={13}
                color={
                  message.status === "read"
                    ? "#34B7F1"
                    : "rgba(255,255,255,0.45)"
                }
              />
            )}
          </View>
        </View>
      </View>
    </Swipeable>
  );
}

// ─── Chat Screen ──────────────────────────────────────────────────────────────

function ChatScreen({
  conversation,
  onBack,
  isDark,
  invalidId = false,
}: {
  conversation: Conversation;
  onBack: () => void;
  isDark: boolean;
  invalidId?: boolean;
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
  } = useMessagesStore();

  const [text,        setText]        = useState("");
  const [sending,     setSending]     = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const listRef      = useRef<FlatList>(null);
  const typingTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets       = useSafeAreaInsets();

  // Stable refs so useEffect deps don't fire on every render
  const subscribeRef = useRef(subscribeToRealtime);
  const markReadRef  = useRef(markRead);
  useEffect(() => { subscribeRef.current = subscribeToRealtime; });
  useEffect(() => { markReadRef.current  = markRead; });

  const bg        = isDark ? Colors.background    : "#F5F5F5";
  const textColor = isDark ? Colors.textWhite      : Colors.text;
  const subColor  = isDark ? Colors.textSecondary  : Colors.textTertiary;
  const cardBg    = isDark ? Colors.primaryDarker  : "#FFFFFF";
  const border    = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  const inputBg   = isDark ? "#1C2921"             : "#F0F0F0";
  const topPad    = Platform.OS === "web" ? 67 : insets.top;

  const messages    = allMessages[conversation.id] || [];
  const otherTyping = typingUsers[conversation.id] || false;

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeRef.current(user.id);
    return () => unsub?.();
  }, [user?.id]);

  useEffect(() => {
    markReadRef.current(conversation.id);
  }, [conversation.id]); 

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // ── Typing ────────────────────────────────────────────────────
  const handleTyping = (v: string) => {
    setText(v);
    setTyping(conversation.id, true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(
      () => setTyping(conversation.id, false),
      1500
    );
  };

  // ── Send text ─────────────────────────────────────────────────
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user?.id || sending) return;
    setSending(true);
    setText("");
    setTyping(conversation.id, false);
    const msg: Message = {
      id:              generateId(),
      conversation_id: conversation.id,
      sender_id:       user.id,
      sender_name:     user.full_name || "Me",
      sender_role:     user.role as any,
      text:            trimmed,
      created_at:      new Date().toISOString(),
      read:            false,
      status:          "sent",
    };
    await addMessage(msg);
    setSending(false);
  };

  // ── Voice recording ───────────────────────────────────────────
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Microphone access is needed for voice messages."
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
      recordingRef.current = recording;
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      Alert.alert("Error", "Could not start recording.");
    }
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
        const msg: Message = {
          id:              generateId(),
          conversation_id: conversation.id,
          sender_id:       user.id,
          sender_name:     user.full_name || "Me",
          sender_role:     user.role as any,
          audio_uri:       uri,
          created_at:      new Date().toISOString(),
          read:            false,
          status:          "sent",
        };
        await addMessage(msg);
      }
    } catch {
      Alert.alert("Error", "Could not save voice message.");
    }
  };

  const cancelRecording = async () => {
    if (!recordingRef.current) return;
    setIsRecording(false);
    try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
    recordingRef.current = null;
  };

  const handleCall = () => {
    const phone = conversation.participant_phone;
    if (!phone) {
      Alert.alert("No phone", "This driver has no phone number on record.");
      return;
    }
    Linking.openURL(`tel:${phone.replace(/\s/g, "")}`);
  };

  const handleReply = (m: Message) => {
    if (!m.text) return;
    setText(`↩ ${m.sender_name || "User"}: ${m.text}\n`);
  };

  const handleCopy = (m: Message) => {
    if (!m.text) return;
    if (Platform.OS === "web" && navigator?.clipboard) {
      navigator.clipboard.writeText(m.text);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Right button: send (text present) or mic (no text)
  const InputRight = () =>
    text.trim() ? (
      <Pressable
        style={[S.sendBtn, { backgroundColor: Colors.primary, opacity: sending ? 0.6 : 1 }]}
        onPress={handleSend}
        disabled={sending}
      >
        {sending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <HugeiconsIcon icon={TelegramIcon} size={20} color="#fff" />
        )}
      </Pressable>
    ) : (
      <Pressable
        style={[
          S.sendBtn,
          { backgroundColor: isRecording ? Colors.error : Colors.primary },
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header */}
      <View
        style={[
          S.chatHeader,
          {
            backgroundColor: cardBg,
            borderBottomColor: border,
            paddingTop: topPad + 12,
          },
        ]}
      >
        <Pressable onPress={onBack} style={S.chatBack} hitSlop={8}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={25} color={textColor} />
        </Pressable>
        <Pressable
          style={S.chatHeaderInfo}
          onPress={() => setInfoVisible(true)}
        >
          <Avatar name={conversation.participant_name || "Driver"} size={38} />
          <View style={{ flex: 1 }}>
            <Text
              style={[S.chatHeaderName, { color: textColor }]}
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
                style={[S.chatHeaderSub, { color: Colors.primary }]}
                numberOfLines={1}
              >
                {conversation.participant_driver_id}
              </Text>
            )}
          </View>
        </Pressable>
        <Pressable onPress={handleCall} style={S.chatCallBtn} hitSlop={8}>
          <HugeiconsIcon icon={CallIcon} size={22} color={Colors.primary} />
        </Pressable>
        <Pressable onPress={() => setInfoVisible(true)} hitSlop={8}>
          <HugeiconsIcon icon={MoreVerticalIcon} size={24} color={textColor} />
        </Pressable>
      </View>

      {/* Invalid driver warning */}
      {invalidId && (
        <View style={[S.warnBanner, { backgroundColor: Colors.gold + "22" }]}>
          <Text style={[S.warnText, { color: Colors.gold }]}>
            ⚠ Invalid driver_id — this driver could not be verified. Messages
            may not be delivered.
          </Text>
        </View>
      )}

      {/* Recording banner */}
      {isRecording && (
        <View
          style={[S.recBanner, { backgroundColor: Colors.error + "22" }]}
        >
          <View style={S.recDot} />
          <Text style={[S.recText, { color: Colors.error }]}>
            Recording… release to send
          </Text>
          <Pressable onPress={cancelRecording} hitSlop={8}>
            <Text style={{ color: Colors.error, fontSize: 20, lineHeight: 22 }}>
              ×
            </Text>
          </Pressable>
        </View>
      )}

      {/* Messages */}
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
            subTextColor={subColor}
          />
        )}
        ListEmptyComponent={
          <View style={S.emptyChat}>
            <HugeiconsIcon icon={Message02Icon} size={44} color={subColor} />
            <Text style={[S.emptyChatText, { color: subColor }]}>
              No messages yet. Say hello!
            </Text>
          </View>
        }
      />

      {/* Input bar */}
      <View
        style={[
          S.inputBar,
          {
            backgroundColor: cardBg,
            borderTopColor: border,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <TextInput
          style={[S.textInput, { backgroundColor: inputBg, color: textColor }]}
          placeholder="Type a message..."
          placeholderTextColor={subColor}
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

// ─── New Chat Modal ────────────────────────────────────────────────────────────
//
// Lookup order:
//   1. users.id = input AND role = 'driver'       (UUID entered directly)
//   2. users.driver_id = normalised AND role = 'driver'  (DRV-XXXX entered)
//
// Either way we always open a chat. If neither lookup hits we open with an
// "Invalid driver_id" warning baked into the conversation object so the chat
// screen can surface it to the passenger.

interface DriverRecord {
  id: string;
  full_name: string | null;
  phone: string | null;
  driver_id: string | null;
  vehicle_details: string | null;
  park_name: string | null;
  role?: string | null;
}

// Status of the last search attempt
type SearchStatus = "idle" | "searching" | "found" | "invalid";

function NewChatModal({
  visible,
  onClose,
  onStart,
  isDark,
}: {
  visible: boolean;
  onClose: () => void;
  onStart: (conv: Conversation, invalidId: boolean) => void;
  isDark: boolean;
}) {
  const { user } = useAuthStore();
  const [query,  setQuery]  = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [result, setResult] = useState<DriverRecord | null>(null);

  const textColor = isDark ? Colors.textWhite     : Colors.text;
  const subColor  = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg    = isDark ? Colors.primaryDarker : "#FFFFFF";
  const border    = isDark ? "rgba(255,255,255,0.12)" : "#E8ECF0";
  const inputBg   = isDark ? Colors.background    : "#F4F6FA";

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResult(null);
      setStatus("idle");
    }
  }, [visible]);

  const reset = () => { setResult(null); setStatus("idle"); };

  const handleSearch = async () => {
    const raw = query.trim();
    if (!raw || !user?.id) return;

    setStatus("searching");
    setResult(null);

    let found: DriverRecord | null = null;

    try {
      // ── Strategy 1: match users.driver_id (DRV-XXXX format) with role=driver ─
      const normalised = normaliseDriverId(raw);
      const { data: s1 } = await supabase
        .from("users")
        .select("id, full_name, phone, driver_id, vehicle_details, park_name, role")
        .eq("driver_id", normalised)
        .maybeSingle();

      // Accept if found AND role is driver (or role field missing — trust the lookup)
      if (s1 && (!s1.role || s1.role === "driver")) {
        found = s1 as DriverRecord;
      }

      // ── Strategy 2: match users.id = raw UUID ────────────────────────────────
      if (!found) {
        const { data: s2 } = await supabase
          .from("users")
          .select("id, full_name, phone, driver_id, vehicle_details, park_name, role")
          .eq("id", raw)
          .maybeSingle();

        // Drivers search for drivers; passengers can search anyone with a driver role
        if (s2) {
          if (user.role === "driver") {
            // Driver searching: accept any valid user (passenger or driver)
            found = s2 as DriverRecord;
          } else if (!s2.role || s2.role === "driver") {
            found = s2 as DriverRecord;
          }
        }
      }

      // ── Strategy 3: partial match on driver_id without DRV- prefix ───────────
      // Handles cases where user typed "A3X9KL" instead of "DRV-A3X9KL"
      if (!found) {
        const { data: s3 } = await supabase
          .from("users")
          .select("id, full_name, phone, driver_id, vehicle_details, park_name, role")
          .ilike("driver_id", `%${raw.replace(/^DRV-?/i, "")}%`)
          .maybeSingle();

        if (s3 && (!s3.role || s3.role === "driver")) {
          found = s3 as DriverRecord;
        }
      }
    } catch (err: any) {
      // Supabase unreachable or table doesn't exist yet — fall through to invalid
      console.warn("[Messages] driver lookup error:", err?.message ?? err);
    }

    if (found) {
      setResult(found);
      setStatus("found");
    } else {
      setResult({
        id:              `invalid_${raw}`,
        full_name:       raw,
        phone:           null,
        driver_id:       raw,
        vehicle_details: null,
        park_name:       null,
      });
      setStatus("invalid");
    }
  };

  // Open the chat — passes invalidId=true when the lookup failed so the
  // ChatScreen can show the "Invalid driver_id" warning banner.
  const handleOpen = () => {
    if (!result || !user?.id) return;

    const convId = status === "invalid"
      ? `conv_invalid_${user.id}_${result.driver_id}`
      : `conv_${[user.id, result.id].sort().join("_")}`;

    const conv: Conversation = {
      id:                    convId,
      participant_id:        result.id,
      participant_name:      result.full_name || "Unknown",
      participant_role:      (result.role as any) || "driver",
      participant_driver_id: result.driver_id ?? undefined,
      participant_vehicle:   result.vehicle_details ?? undefined,
      participant_park_name: result.park_name ?? undefined,
      participant_phone:     result.phone ?? undefined,
      last_message:          "",
      last_message_at:       new Date().toISOString(),
      unread_count:          0,
    };

    onStart(conv, status === "invalid");
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
        <Pressable style={S.backdrop} onPress={onClose} />
        <View style={[S.newSheet, { backgroundColor: cardBg }]}>
          <View style={S.handle} />

          <Text style={[S.newTitle, { color: textColor }]}>New Message</Text>
          <Text style={[S.newSub, { color: subColor }]}>
            {user?.role === "driver"
              ? "Enter a passenger's user ID to start chatting"
              : "Enter the driver's ID (e.g. DRV-A3X9KL) or their user ID"}
          </Text>

          {/* ── Input ── */}
          <View style={[S.newInputRow, { backgroundColor: inputBg, borderColor: border }]}>
            <HugeiconsIcon icon={Search01Icon} size={18} color={subColor} />
            <TextInput
              style={[S.newInput, { color: textColor }]}
              placeholder="DRV-A3X9KL"
              placeholderTextColor={subColor}
              value={query}
              onChangeText={(v) => { setQuery(v); reset(); }}
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
            {query.length > 0 && (
              <Pressable hitSlop={8} onPress={() => { setQuery(""); reset(); }}>
                <Text style={{ color: subColor, fontSize: 18 }}>×</Text>
              </Pressable>
            )}
          </View>

          {/* ── Search button ── */}
          <Pressable
            style={[
              S.newSearchBtn,
              {
                backgroundColor: query.trim() ? Colors.primary : isDark ? "#2A2A2A" : "#E5E7EB",
                opacity: status === "searching" ? 0.7 : 1,
              },
            ]}
            onPress={handleSearch}
            disabled={!query.trim() || status === "searching"}
          >
            {status === "searching" ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[S.newSearchBtnText, { color: query.trim() ? "#fff" : subColor }]}>
                Search Driver
              </Text>
            )}
          </Pressable>

          {/* ── Result card (shown for both found + invalid) ── */}
          {result && (
            <View
              style={[
                S.resultCard,
                {
                  backgroundColor: status === "found"
                    ? isDark ? "#1C2921" : "#F0FDF4"
                    : isDark ? "#221A1A" : "#FFF8F0",
                  borderColor: status === "found"
                    ? Colors.primary + "55"
                    : Colors.gold + "99",
                },
              ]}
            >
              <Avatar name={status === "found" ? result.full_name || "Driver" : "?"} size={50} />

              <View style={{ flex: 1, gap: 2 }}>
                {status === "found" ? (
                  <>
                    <Text style={[S.resultName, { color: textColor }]}>
                      {result.full_name || "Driver"}
                    </Text>
                    <Text style={[S.resultDriverId, { color: Colors.primary }]}>
                      {result.driver_id}
                    </Text>
                    {result.vehicle_details ? (
                      <Text style={[S.resultSub, { color: subColor }]}>
                        🚗 {result.vehicle_details}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Text style={[S.resultName, { color: Colors.gold }]}>
                      Invalid driver_id
                    </Text>
                    <Text style={[S.resultSub, { color: subColor }]}>
                      {`"{query.trim()}" is not a registered driver. You can still
                      open a chat but messages won't be delivered.`}
                    </Text>
                  </>
                )}
              </View>

              <Pressable
                style={[
                  S.chatBtn,
                  { backgroundColor: status === "found" ? Colors.primary : Colors.gold },
                ]}
                onPress={handleOpen}
              >
                <Text style={S.chatBtnText}>
                  {status === "found" ? "Chat" : "Open anyway"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Conversation List Item ───────────────────────────────────────────────────

function ConvItem({
  item,
  onPress,
  onDelete,
  isDark,
  textColor,
  subColor,
  cardBg,
  border,
}: {
  item: Conversation;
  onPress: () => void;
  onDelete: () => void;
  isDark: boolean;
  textColor: string;
  subColor: string;
  cardBg: string;
  border: string;
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
          style={[S.deleteSwipe, { backgroundColor: Colors.error }]}
          onPress={onDelete}
        >
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
        <View style={{ position: "relative" }}>
          <Avatar name={item.participant_name || "Driver"} size={50} />
          {(item.unread_count ?? 0) > 0 && <View style={S.onlineDot} />}
        </View>
        <View style={S.convText}>
          <View style={S.convTopRow}>
            <Text
              style={[S.convName, { color: textColor }]}
              numberOfLines={1}
            >
              {item.participant_name}
            </Text>
            <Text style={[S.convTime, { color: subColor }]}>{timeStr}</Text>
          </View>
          <View style={S.convBottomRow}>
            <Text
              style={[S.convLast, { color: subColor }]}
              numberOfLines={1}
            >
              {item.last_message || "Tap to start chatting"}
            </Text>
            {(item.unread_count ?? 0) > 0 && (
              <View style={S.badge}>
                <Text style={S.badgeText}>
                  {(item.unread_count ?? 0) > 9 ? "9+" : item.unread_count}
                </Text>
              </View>
            )}
          </View>
          {item.participant_driver_id && (
            <Text style={[S.convDriverId, { color: Colors.primary + "AA" }]}>
              {item.participant_driver_id}
            </Text>
          )}
        </View>
      </Pressable>
    </Swipeable>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function MessagesTab() {
  const insets = useSafeAreaInsets();
  const { theme } = useSettingsStore();
  const { user }  = useAuthStore();
  const {
    conversations,
    addConversation,
    deleteConversation,
    subscribeToRealtime,
  } = useMessagesStore();

  const [activeConv,      setActiveConv]      = useState<Conversation | null>(null);
  const [activeInvalidId, setActiveInvalidId] = useState(false);
  const [newChatVisible,  setNewChatVisible]  = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);

  const isDark    = theme === "dark";
  const bg        = isDark ? Colors.background    : "#F0F0F0";
  const textColor = isDark ? Colors.textWhite      : Colors.text;
  const subColor  = isDark ? Colors.textSecondary  : Colors.textTertiary;
  const cardBg    = isDark ? Colors.primaryDarker  : "#FFFFFF";
  const border    = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  const topPad    = Platform.OS === "web" ? 67 : insets.top;

  const subscribeRef = useRef(subscribeToRealtime);
  useEffect(() => { subscribeRef.current = subscribeToRealtime; });

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeRef.current(user.id);
    return () => unsub?.();
  }, [user?.id]);


  const visible = useMemo(() => {
    if (!user) return [];
    // Show every conversation the current user is a direct participant in.
    // For drivers: convs where their user.id is the participant_id OR the
    //   passenger initiated the chat (stored in Supabase with passenger_id = user.id).
    // For passengers: convs they created (participant_role = driver means
    //   the OTHER person is the driver, so this user is the passenger).
    // Simplest cross-role approach: show all conversations (local store already
    // scopes them per user via addConversation). If the store grows large we can
    // add a participant_id filter later.
    return conversations.filter((c) => {
      if (user.role === "driver") {
        // Driver sees convs where they are the searched participant OR
        // where they appear as passenger_id in the other direction
        return (
          c.participant_id === user.id ||
          (user.driver_id && c.participant_driver_id === user.driver_id) ||
          c.participant_role === "passenger"
        );
      }
      // Passenger sees all convs they started (participant_role = "driver" or "passenger")
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
    // Mirror to Supabase so the driver sees it in their list (skip for invalid IDs)
    if (user && !invalidId) {
      supabase
        .from("conversations")
        .upsert([
          {
            id:                    conv.id,
            participant_id:        conv.participant_id,
            participant_name:      conv.participant_name,
            participant_role:      conv.participant_role,
            participant_driver_id: conv.participant_driver_id ?? null,
            participant_phone:     conv.participant_phone ?? null,
            participant_vehicle:   conv.participant_vehicle ?? null,
            passenger_id:          user.id,
            passenger_name:        user.full_name || "Passenger",
            passenger_phone:       user.phone || null,
            last_message:          "",
            last_message_at:       new Date().toISOString(),
            unread_count:          0,
          },
        ])
        .then(({ error }) => {
          if (error) console.warn("[Messages] upsert conv:", error.message);
        });
    }
    setActiveConv(conv);
  };

  const confirmDelete = (id: string) => {
    Alert.alert("Delete conversation", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteConversation(id),
      },
    ]);
  };

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
      <GestureHandlerRootView style={[S.root, { backgroundColor: bg }]}>
        <StatusBar style={isDark ? "light" : "dark"} />

        <View
          style={[
            S.header,
            {
              backgroundColor: cardBg,
              paddingTop: topPad + 12,
              borderBottomColor: border,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[S.headerTitle, { color: textColor }]}>Messages</Text>
            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: subColor, marginTop: 1 }}>
              {user?.role === "driver"
                ? "Tap + to message a passenger"
                : "Tap + to message a driver"}
            </Text>
          </View>
          {/* Both roles can initiate a chat */}
          <Pressable style={S.newBtn} onPress={() => setNewChatVisible(true)}>
            <HugeiconsIcon icon={PlusSignIcon} size={23} color={textColor} />
          </Pressable>
        </View>

        <FlatList
          data={visible}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ flexGrow: 1 }}
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
              subColor={subColor}
              cardBg={cardBg}
              border={border}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveConv(item);
              }}
              onDelete={() => confirmDelete(item.id)}
            />
          )}
          ListEmptyComponent={
            <View style={S.empty}>
              <HugeiconsIcon icon={ChartBubbleIcon} size={52} color={subColor} />
              <Text style={[S.emptyTitle, { color: textColor }]}>
                No conversations yet
              </Text>
              <Text style={[S.emptySub, { color: subColor }]}>
                {user?.role === "driver"
                  ? "Tap + to start a conversation with a passenger."
                  : "Tap + to start a conversation with a driver."}
              </Text>
              <Pressable
                style={[S.emptyBtn, { backgroundColor: Colors.primary }]}
                onPress={() => setNewChatVisible(true)}
              >
                <Text style={S.emptyBtnText}>New conversation</Text>
              </Pressable>
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
  root: { flex: 1 },
  backdrop: { flex: 1 },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "rgba(154,154,154,0.3)",
    alignSelf: "center", marginBottom: 4,
  },

  // List header
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 24 },
  newBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  // Conversation item
  convItem: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  convText:      { flex: 1, gap: 2 },
  convTopRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  convName:      { fontFamily: "Poppins_600SemiBold", fontSize: 15, flex: 1 },
  convTime:      { fontFamily: "Poppins_400Regular", fontSize: 11 },
  convBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  convLast:      { fontFamily: "Poppins_400Regular", fontSize: 13, flex: 1 },
  convDriverId:  { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 1 },
  onlineDot: {
    position: "absolute", top: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.primary, borderWidth: 2, borderColor: "#fff",
  },
  badge: {
    backgroundColor: Colors.primary, borderRadius: 10,
    minWidth: 20, height: 20, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 5, marginLeft: 6,
  },
  badgeText:   { fontFamily: "Poppins_700Bold", fontSize: 10, color: "#fff" },
  deleteSwipe: { width: 70, alignItems: "center", justifyContent: "center" },

  // Empty state
  empty:        { alignItems: "center", paddingTop: 100, paddingHorizontal: 40, gap: 12 },
  emptyTitle:   { fontFamily: "Poppins_600SemiBold", fontSize: 18, textAlign: "center" },
  emptySub:     { fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", lineHeight: 22 },
  emptyBtn:     { borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  emptyBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },

  // New chat modal
  newSheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 344, gap: 14,
  },
  newTitle:      { fontFamily: "Poppins_700Bold", fontSize: 20 },
  newSub:        { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 20 },
  newInputRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1,
  },
  newInput:          { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 15, padding: 0, letterSpacing: 1 },
  newSearchBtn:      { borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center", minHeight: 50 },
  newSearchBtnText:  { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  resultCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 16, padding: 14, borderWidth: 1,
  },
  resultName:     { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  resultDriverId: { fontFamily: "Poppins_600SemiBold", fontSize: 13, marginTop: 1 },
  resultSub:      { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  chatBtn:        { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  chatBtnText:    { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },

  // Warning banner (invalid driver_id)
  warnBanner: {
    flexDirection: "row", alignItems: "flex-start",
    paddingHorizontal: 16, paddingVertical: 10,
  },
  warnText: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 18, flex: 1 },

  // Chat screen
  chatHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12, gap: 10, borderBottomWidth: 1,
  },
  chatBack:       { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  chatHeaderInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  chatHeaderName: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  chatHeaderSub:  { fontFamily: "Poppins_500Medium", fontSize: 12, marginTop: 1 },
  chatCallBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: `${Colors.primary}20`, alignItems: "center", justifyContent: "center",
  },
  recBanner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  recDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  recText:   { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 12 },
  messageList:   { paddingVertical: 12, paddingBottom: 20, flexGrow: 1 },
  emptyChat:     { alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 100 },
  emptyChatText: { fontFamily: "Poppins_400Regular", fontSize: 14 },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end",
    gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1,
  },
  textInput: {
    flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    fontFamily: "Poppins_400Regular", fontSize: 14, maxHeight: 120, minHeight: 42,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },

  // Message bubble
  bubbleWrap:     { marginVertical: 2, paddingHorizontal: 12 },
  bubbleWrapMe:   { alignItems: "flex-end" },
  bubbleWrapThem: { alignItems: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  bubbleMe:   { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleThem: { borderBottomLeftRadius: 4 },
  bubbleText: { fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 21 },
  bubbleMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  bubbleTime: { fontFamily: "Poppins_400Regular", fontSize: 10 },
  swipeActions: { flexDirection: "row", alignItems: "center" },
  swipeAction:  { width: 50, height: "100%", alignItems: "center", justifyContent: "center" },

  // Contact info modal
  infoSheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 30, paddingTop: 10, paddingBottom: 50, gap: 14,
  },
  infoHeader:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  infoTitle:     { fontFamily: "Poppins_700Bold", fontSize: 18, marginTop: 20 },
  infoAvatarRow: { alignItems: "center", marginVertical: 16, gap: 6 },
  infoName:      { fontFamily: "Poppins_700Bold", fontSize: 20 },
  infoSub:       { fontFamily: "Poppins_400Regular", fontSize: 14 },
  infoActions:   { flexDirection: "row", gap: 12, marginTop: 8 },
  infoActionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14,
  },
  infoActionText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },
});