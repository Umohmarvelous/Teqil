// components/chat/ChatBubble.tsx
//
// A WhatsApp-shaped message bubble, on the app's iOS palette.
//
// ── What "WhatsApp-shaped" actually means ──────────────────────────────────
// Four things, and the previous bubble had none of them:
//
//   1. GROUPING. Consecutive messages from one person inside a few minutes are
//      one visual block: only the last gets a tail, only the last shows a time,
//      and the gaps between them are tight. Without this a burst of five short
//      messages looks like five separate conversations.
//   2. A TAIL on the outer corner of the last bubble in a block, which is what
//      makes it read as speech rather than as a list row.
//   3. The META INSIDE the bubble, trailing the last line of text, so a short
//      message is a short bubble instead of a wide one padded out by a
//      timestamp sitting on its own row.
//   4. DATE SEPARATORS between days.
//
// ── Why the tail is a Path and not a rotated square ────────────────────────
// The rotated-square trick needs `overflow: visible` on a container that also
// wants `overflow: hidden` for its corner radius, and the two fight on Android.
// A small SVG is unambiguous, scales cleanly and costs nothing.

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Tick02Icon, TickDouble02Icon, Clock01Icon, Alert02Icon } from "@hugeicons/core-free-icons";

import { useIOSTheme, IOSAppFont } from "@/components/ios";
import { SwipeableRow } from "@/components/ios";

export interface ChatBubbleMessage {
  id: string;
  sender_id: string;
  sender_name?: string;
  text?: string;
  audio_uri?: string;
  created_at: string;
  read?: boolean;
  status?: "sent" | "delivered" | "read";
  /** Set while an optimistic send is still in flight. */
  pending?: boolean;
  failed?: boolean;
  /** What this message is replying to, if anything. */
  reply_to?: { id: string; author: string; preview: string } | null;
}

/** Two messages group when they are from one sender and close in time. */
const GROUP_WINDOW_MS = 4 * 60_000;

export function shouldGroup(prev: ChatBubbleMessage | undefined, m: ChatBubbleMessage): boolean {
  if (!prev) return false;
  if (prev.sender_id !== m.sender_id) return false;
  const dt = new Date(m.created_at).getTime() - new Date(prev.created_at).getTime();
  return dt >= 0 && dt < GROUP_WINDOW_MS;
}

export function sameDay(a: string, b: string): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

/** "Today" / "Yesterday" / a date — never a bare date for the last two days. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export function DateSeparator({ iso }: { iso: string }) {
  const t = useIOSTheme();
  return (
    <View style={styles.dayWrap}>
      <View style={[styles.dayPill, { backgroundColor: t.secondarySystemGroupedBackground }]}>
        <Text style={[styles.dayText, { color: t.secondaryLabel }]}>{dayLabel(iso)}</Text>
      </View>
    </View>
  );
}

/** The little speech tail. `side` is which edge of the bubble it hangs off. */
function Tail({ side, colour }: { side: "left" | "right"; colour: string }) {
  return (
    <Svg
      width={9}
      height={13}
      viewBox="0 0 9 13"
      style={[styles.tail, side === "right" ? styles.tailRight : styles.tailLeft]}
    >
      <Path
        d={side === "right" ? "M0 0 C0 7 3 11 9 13 L0 13 Z" : "M9 0 C9 7 6 11 0 13 L9 13 Z"}
        fill={colour}
      />
    </Svg>
  );
}

function StatusTick({ message, colour }: { message: ChatBubbleMessage; colour: string }) {
  if (message.failed) {
    return <HugeiconsIcon icon={Alert02Icon} size={13} color="#FF3B30" strokeWidth={2.2} />;
  }
  if (message.pending) {
    return <HugeiconsIcon icon={Clock01Icon} size={12} color={colour} strokeWidth={2.2} />;
  }
  if (message.status === "read") {
    // The one place a fixed colour is right: "read" is blue in every messenger
    // people have used, and re-tinting it to the app green would lose the
    // meaning to gain nothing.
    return <HugeiconsIcon icon={TickDouble02Icon} size={14} color="#34B7F1" strokeWidth={2.2} />;
  }
  if (message.status === "delivered") {
    return <HugeiconsIcon icon={TickDouble02Icon} size={14} color={colour} strokeWidth={2.2} />;
  }
  return <HugeiconsIcon icon={Tick02Icon} size={13} color={colour} strokeWidth={2.2} />;
}

export interface ChatBubbleProps {
  message: ChatBubbleMessage;
  isMe: boolean;
  /** True when the previous message groups with this one. */
  grouped?: boolean;
  /** True when the NEXT message groups with this one — suppresses tail + time. */
  hasFollower?: boolean;
  onReply: () => void;
  onCopy: () => void;
  onDelete: () => void;
  /** Voice-note renderer, injected so the audio player stays with the screen. */
  renderAudio?: (uri: string, isMe: boolean, tint: string) => React.ReactNode;
  /** Tapping the quoted block jumps to the original. */
  onPressReplyQuote?: (id: string) => void;
}

export function ChatBubble({
  message,
  isMe,
  grouped = false,
  hasFollower = false,
  onReply,
  onCopy,
  onDelete,
  renderAudio,
  onPressReplyQuote,
}: ChatBubbleProps) {
  const t = useIOSTheme();

  // Outgoing takes the app tint; incoming takes the elevated surface, so both
  // sit correctly on the doodle in either colour scheme.
  const bubbleBg = isMe ? t.tint : t.secondarySystemGroupedBackground;
  const textColour = isMe ? "#FFFFFF" : t.label;
  const metaColour = isMe ? "rgba(255,255,255,0.72)" : t.tertiaryLabel;

  const time = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  // Only the last bubble of a block gets a tail; a tail on every one is what
  // makes a burst of messages look like a ransom note.
  const showTail = !hasFollower;

  return (
    <SwipeableRow
      actions={[
        {
          key: "reply",
          label: "Reply",
          symbol: "arrowshape.turn.up.left.fill",
          color: t.tint,
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onReply();
          },
        },
        {
          key: "copy",
          label: "Copy",
          symbol: "doc.on.doc.fill",
          color: t.systemOrange,
          onPress: onCopy,
        },
        {
          key: "delete",
          label: "Delete",
          symbol: "trash.fill",
          color: t.systemRed,
          destructive: true,
          onPress: onDelete,
        },
      ]}
    >
      <View
        style={[
          styles.row,
          isMe ? styles.rowMe : styles.rowThem,
          { marginTop: grouped ? 2 : 8 },
        ]}
      >
        <View
          style={[
            styles.bubble,
            { backgroundColor: bubbleBg },
            isMe ? styles.bubbleMe : styles.bubbleThem,
            // The tailed corner squares off; the others stay round.
            showTail && (isMe ? styles.bubbleMeTailed : styles.bubbleThemTailed),
          ]}
        >
          {showTail ? <Tail side={isMe ? "right" : "left"} colour={bubbleBg} /> : null}

          {/* Quoted reply. Tinted bar on the leading edge, exactly like the
              original — it is the fastest way to signal "this is not new text". */}
          {message.reply_to ? (
            <Pressable
              onPress={() => onPressReplyQuote?.(message.reply_to!.id)}
              style={[
                styles.quote,
                {
                  backgroundColor: isMe ? "rgba(255,255,255,0.16)" : t.tertiarySystemFill,
                  borderLeftColor: isMe ? "#FFFFFF" : t.tint,
                },
              ]}
            >
              <Text
                style={[styles.quoteAuthor, { color: isMe ? "#FFFFFF" : t.tint }]}
                numberOfLines={1}
              >
                {message.reply_to.author}
              </Text>
              <Text style={[styles.quoteText, { color: metaColour }]} numberOfLines={2}>
                {message.reply_to.preview}
              </Text>
            </Pressable>
          ) : null}

          {message.audio_uri ? (
            <View style={styles.audioWrap}>
              {renderAudio?.(message.audio_uri, isMe, textColour)}
              <View style={styles.metaInlineAudio}>
                <Text style={[styles.time, { color: metaColour }]}>{time}</Text>
                {isMe ? <StatusTick message={message} colour={metaColour} /> : null}
              </View>
            </View>
          ) : (
            // The meta floats at the end of the text run. The spacer reserves
            // exactly its width on the last line so the two never overlap —
            // this is how WhatsApp keeps "Ok" from being a bubble twice as wide
            // as it needs to be.
            <Text style={[styles.text, { color: textColour }]}>
              {message.text}
              <Text style={styles.metaSpacer}>{isMe ? "     " : "   "}</Text>
            </Text>
          )}

          {message.audio_uri ? null : (
            <View style={styles.metaFloat}>
              <Text style={[styles.time, { color: metaColour }]}>{time}</Text>
              {isMe ? <StatusTick message={message} colour={metaColour} /> : null}
            </View>
          )}
        </View>
      </View>
    </SwipeableRow>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 10, flexDirection: "row" },
  rowMe: { justifyContent: "flex-end" },
  rowThem: { justifyContent: "flex-start" },

  bubble: {
    maxWidth: "82%",
    minWidth: 68,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 6,
  },
  bubbleMe: { marginLeft: 44 },
  bubbleThem: { marginRight: 44 },
  bubbleMeTailed: { borderBottomRightRadius: 4 },
  bubbleThemTailed: { borderBottomLeftRadius: 4 },

  tail: { position: "absolute", bottom: 0 },
  tailRight: { right: -7 },
  tailLeft: { left: -7 },

  text: { ...IOSAppFont.body, lineHeight: 21 },
  metaSpacer: { opacity: 0 },

  metaFloat: {
    position: "absolute",
    right: 10,
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaInlineAudio: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
    marginTop: 2,
  },
  time: { ...IOSAppFont.caption2, fontSize: 10.5 },

  audioWrap: { minWidth: 190 },

  quote: {
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 4,
    gap: 1,
  },
  quoteAuthor: { ...IOSAppFont.caption1, fontFamily: "Poppins_600SemiBold" },
  quoteText: { ...IOSAppFont.caption1 },

  dayWrap: { alignItems: "center", paddingVertical: 12 },
  dayPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  dayText: { ...IOSAppFont.caption1, fontFamily: "Poppins_500Medium" },
});

export default ChatBubble;
