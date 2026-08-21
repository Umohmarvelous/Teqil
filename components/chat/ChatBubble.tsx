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
import {
  Tick02Icon,
  TickDouble02Icon,
  Clock01Icon,
  Alert02Icon,
  StarIcon,
  ArrowTurnForwardIcon,
  RefreshIcon,
  CheckmarkCircle02Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";

import { useIOSTheme, IOSAppFont, SwipeableRow } from "@/components/ios";
import { ChatMediaThumb, ChatFileRow, UploadVeil } from "@/components/chat/ChatMedia";

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
  /** Storage path in the private `chat-media` bucket, never a URL. */
  media_url?: string;
  media_type?: "image" | "video" | "audio" | "file";
  media_name?: string;
  media_size?: number;
  media_width?: number;
  media_height?: number;
  duration_ms?: number;
  starred?: boolean;
  forwarded?: boolean;
  edited_at?: string | null;
  /** Deleted by its sender for both sides: a tombstone, not a missing row. */
  deleted_for_everyone?: boolean;
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
  /** Long press opens the full action menu; swipe stays as the shortcut to reply. */
  onLongPress?: () => void;
  /** Voice-note renderer, injected so the audio player stays with the screen. */
  renderAudio?: (uri: string, isMe: boolean, tint: string) => React.ReactNode;
  /** Tapping the quoted block jumps to the original. */
  onPressReplyQuote?: (id: string) => void;
  /** Opens the full-screen viewer. */
  onOpenMedia?: () => void;
  /** Re-send a message whose insert failed. */
  onRetry?: () => void;
  /** Selection mode, for forwarding or bulk delete. */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Briefly tinted after "jump to message" so the target is findable. */
  highlighted?: boolean;
}

export function ChatBubble({
  message,
  isMe,
  grouped = false,
  hasFollower = false,
  onReply,
  onCopy,
  onDelete,
  onLongPress,
  renderAudio,
  onPressReplyQuote,
  onOpenMedia,
  onRetry,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  highlighted = false,
}: ChatBubbleProps) {
  const t = useIOSTheme();

  const deleted = !!message.deleted_for_everyone;

  // Outgoing takes the app tint; incoming takes the elevated surface, so both
  // sit correctly on the doodle in either colour scheme. A tombstone takes
  // neither — it is not a message, and colouring it like one invites a reply.
  const bubbleBg = deleted
    ? t.tertiarySystemFill
    : isMe
      ? t.tint
      : t.secondarySystemGroupedBackground;
  const textColour = deleted ? t.secondaryLabel : isMe ? "#FFFFFF" : t.label;
  const metaColour = deleted
    ? t.tertiaryLabel
    : isMe
      ? "rgba(255,255,255,0.72)"
      : t.tertiaryLabel;

  const time = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  // Only the last bubble of a block gets a tail; a tail on every one is what
  // makes a burst of messages look like a ransom note.
  const showTail = !hasFollower;

  const isImage = !deleted && (message.media_type === "image" || message.media_type === "video");
  const isFile = !deleted && message.media_type === "file";
  const audioUri = deleted ? undefined : message.audio_uri ?? (message.media_type === "audio" ? message.media_url : undefined);
  // A photo with a caption keeps the meta on its own row underneath; a photo
  // without one puts it on the image, where WhatsApp puts it.
  const captioned = isImage && !!message.text;

  const meta = (
    <View style={styles.metaRow}>
      {message.edited_at && !deleted ? (
        <Text style={[styles.time, { color: metaColour }]}>edited</Text>
      ) : null}
      {message.starred && !deleted ? (
        <HugeiconsIcon icon={StarIcon} size={11} color={metaColour} strokeWidth={2.4} />
      ) : null}
      <Text style={[styles.time, { color: metaColour }]}>{time}</Text>
      {isMe && !deleted ? <StatusTick message={message} colour={metaColour} /> : null}
    </View>
  );

  const body = (
    <View
      style={[
        styles.bubble,
        { backgroundColor: bubbleBg },
        isMe ? styles.bubbleMe : styles.bubbleThem,
        // The tailed corner squares off; the others stay round.
        showTail && (isMe ? styles.bubbleMeTailed : styles.bubbleThemTailed),
        isImage && styles.bubbleMedia,
        highlighted && { borderWidth: 2, borderColor: t.tint },
      ]}
    >
      {showTail ? <Tail side={isMe ? "right" : "left"} colour={bubbleBg} /> : null}

      {/* "Forwarded" has to be visible before the content is read. It is the
          difference between someone's own words and someone else's. */}
      {message.forwarded && !deleted ? (
        <View style={styles.forwardRow}>
          <HugeiconsIcon icon={ArrowTurnForwardIcon} size={12} color={metaColour} strokeWidth={2.2} />
          <Text style={[styles.forwardText, { color: metaColour }]}>Forwarded</Text>
        </View>
      ) : null}

      {/* Quoted reply. Tinted bar on the leading edge — the fastest way to
          signal "this is not new text". */}
      {message.reply_to && !deleted ? (
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

      {deleted ? (
        <View style={styles.deletedRow}>
          <HugeiconsIcon icon={Delete02Icon} size={14} color={t.tertiaryLabel} strokeWidth={2} />
          <Text style={[styles.deletedText, { color: textColour }]}>
            {isMe ? "You deleted this message" : "This message was deleted"}
          </Text>
          <Text style={[styles.time, { color: metaColour, marginLeft: 6 }]}>{time}</Text>
        </View>
      ) : isImage ? (
        <View style={{ gap: captioned ? 6 : 0 }}>
          <View>
            <ChatMediaThumb
              stored={message.media_url}
              kind={message.media_type === "video" ? "video" : "image"}
              width={message.media_width}
              height={message.media_height}
              onOpen={selectionMode ? onToggleSelect : onOpenMedia}
              onLongPress={onLongPress}
              overlay={captioned ? undefined : meta}
            />
            <UploadVeil visible={!!message.pending} />
          </View>
          {captioned ? (
            <Text style={[styles.text, styles.caption, { color: textColour }]}>{message.text}</Text>
          ) : null}
          {captioned ? meta : null}
        </View>
      ) : isFile ? (
        <View style={{ gap: 4 }}>
          <ChatFileRow
            stored={message.media_url}
            name={message.media_name}
            size={message.media_size}
            isMe={isMe}
            tint={textColour}
            onLongPress={onLongPress}
          />
          {message.text ? (
            <Text style={[styles.text, { color: textColour }]}>{message.text}</Text>
          ) : null}
          {meta}
        </View>
      ) : audioUri ? (
        <View style={styles.audioWrap}>
          {renderAudio?.(audioUri, isMe, textColour)}
          <View style={styles.metaInlineAudio}>{meta}</View>
        </View>
      ) : (
        // The meta floats at the end of the text run. The spacer reserves
        // exactly its width on the last line so the two never overlap — this is
        // how WhatsApp keeps "Ok" from being a bubble twice as wide as it needs
        // to be.
        <>
          <Text style={[styles.text, { color: textColour }]}>
            {message.text}
            <Text style={styles.metaSpacer}>{isMe ? "       " : "     "}</Text>
          </Text>
          <View style={styles.metaFloat}>{meta}</View>
        </>
      )}

      {/* A failed send is only useful if it can be sent again. Without this the
          message sat there greyed out with no way forward but retyping it. */}
      {message.failed ? (
        <Pressable onPress={onRetry} style={styles.retryRow} hitSlop={6}>
          <HugeiconsIcon icon={RefreshIcon} size={12} color="#FF3B30" strokeWidth={2.4} />
          <Text style={styles.retryText}>Not delivered · tap to retry</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const row = (
    <Pressable
      onPress={selectionMode ? onToggleSelect : undefined}
      onLongPress={selectionMode ? undefined : onLongPress}
      delayLongPress={280}
      style={[
        styles.row,
        isMe ? styles.rowMe : styles.rowThem,
        { marginTop: grouped ? 2 : 8 },
        selectionMode && styles.rowSelectable,
        selected && { backgroundColor: t.tint + "1F" },
      ]}
    >
      {selectionMode ? (
        <View style={styles.selectDot}>
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={22}
            color={selected ? t.tint : t.tertiaryLabel}
            strokeWidth={2}
          />
        </View>
      ) : null}
      {body}
    </Pressable>
  );

  // Swipe is the shortcut, long press is the menu. In selection mode neither
  // applies — a swipe there would fight the checkbox.
  if (selectionMode || deleted) return row;

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
      {row}
    </SwipeableRow>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 10, flexDirection: "row" },
  rowSelectable: { alignItems: "center", paddingVertical: 2 },
  selectDot: { width: 30, alignItems: "center" },
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

  bubbleMedia: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 4, minWidth: 0 },
  caption: { paddingHorizontal: 6 },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaFloat: {
    position: "absolute",
    right: 10,
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },

  forwardRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 },
  forwardText: { ...IOSAppFont.caption2, fontStyle: "italic" },

  deletedRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 4 },
  deletedText: { ...IOSAppFont.subheadline, fontStyle: "italic" },

  retryRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  retryText: { ...IOSAppFont.caption2, color: "#FF3B30" },
  metaInlineAudio: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
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
