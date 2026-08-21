// components/chat/MessageActionsSheet.tsx
//
// The long-press menu on a message: reply, copy, star, forward, edit, delete,
// info.
//
// ── Why a sheet and not a popover ──────────────────────────────────────────
// iOS shows a contextual popover anchored to the bubble, which needs the bubble
// measured in window coordinates and re-measured on every keyboard open. A
// bottom sheet reaches the thumb from anywhere in a long thread and cannot land
// off-screen for a message at the very top or the very bottom. The kit already
// has one that drags and flicks away.
//
// ── The rules the menu encodes ─────────────────────────────────────────────
//   • "Delete for everyone" only exists on your own message inside 2 days.
//   • "Edit" only exists on your own TEXT message inside 15 minutes — there is
//     nothing to edit on a photo, and a swapped caption rewrites what an old
//     image meant.
// Both limits are enforced server-side too (migration_chat_features.sql); this
// is so the option is not offered and then refused.

import React from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { HugeiconsIcon } from "@hugeicons/react-native";
import type { IconSvgElement } from "@hugeicons/react-native";
import {
  ArrowTurnForwardIcon,
  Copy01Icon,
  StarIcon,
  Share01Icon,
  Delete02Icon,
  PencilEdit02Icon,
  InformationCircleIcon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";

import { IOSSheet, useIOSTheme, IOSAppFont } from "@/components/ios";
import { canDeleteForEveryone, canEdit } from "@/src/services/chat";
import type { Message } from "@/src/store/useMessagesStore";

export interface MessageActionsSheetProps {
  message: Message | null;
  isMe: boolean;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onStar: () => void;
  onForward: () => void;
  onEdit: () => void;
  onSelect: () => void;
  onInfo: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
}

interface Row {
  key: string;
  label: string;
  icon: IconSvgElement;
  onPress: () => void;
  destructive?: boolean;
  hidden?: boolean;
}

export function MessageActionsSheet(props: MessageActionsSheetProps) {
  const { message, isMe, onClose } = props;
  const t = useIOSTheme();
  if (!message) return null;

  const hasMedia = !!message.media_url || !!message.audio_uri;
  const hasText = !!message.text;

  const run = (fn: () => void) => () => {
    Haptics.selectionAsync();
    onClose();
    // The sheet's dismiss animation and a navigation on the same frame fight
    // each other; one tick is enough to let it close first.
    setTimeout(fn, 60);
  };

  const rows: Row[] = [
    { key: "reply",   label: "Reply",            icon: ArrowTurnForwardIcon, onPress: run(props.onReply) },
    { key: "copy",    label: "Copy",             icon: Copy01Icon,           onPress: run(props.onCopy), hidden: !hasText },
    { key: "star",    label: message.starred ? "Unstar" : "Star", icon: StarIcon, onPress: run(props.onStar) },
    { key: "forward", label: "Forward",          icon: Share01Icon,          onPress: run(props.onForward) },
    { key: "edit",    label: "Edit",             icon: PencilEdit02Icon,     onPress: run(props.onEdit),
      hidden: !canEdit(message.created_at, isMe, hasMedia) },
    { key: "select",  label: "Select messages",  icon: CheckmarkCircle02Icon, onPress: run(props.onSelect) },
    { key: "info",    label: "Message info",     icon: InformationCircleIcon, onPress: run(props.onInfo) },
    { key: "delme",   label: "Delete for me",    icon: Delete02Icon,          onPress: run(props.onDeleteForMe), destructive: true },
    { key: "delall",  label: "Delete for everyone", icon: Delete02Icon,       onPress: run(props.onDeleteForEveryone),
      destructive: true, hidden: !canDeleteForEveryone(message.created_at, isMe) },
  ];

  const preview = message.text
    || (message.media_type === "image" ? "Photo"
      : message.media_type === "video" ? "Video"
      : message.media_type === "file" ? (message.media_name || "Document")
      : message.audio_uri ? "Voice message" : "Message");

  return (
    <IOSSheet visible={!!message} onClose={onClose} detents={[0.58, "large"]} showGrabber dismissible>
      <View style={[styles.preview, { borderBottomColor: t.separator }]}>
        <Text style={[styles.previewText, { color: t.secondaryLabel }]} numberOfLines={2}>
          {preview}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {rows.filter((r) => !r.hidden).map((r) => (
          <Pressable
            key={r.key}
            onPress={r.onPress}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: t.separator },
              pressed && { backgroundColor: t.tertiarySystemFill },
            ]}
            accessibilityRole="button"
          >
            <HugeiconsIcon
              icon={r.icon}
              size={20}
              color={r.destructive ? t.systemRed : t.label}
              strokeWidth={1.9}
            />
            <Text style={[styles.rowLabel, { color: r.destructive ? t.systemRed : t.label }]}>
              {r.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </IOSSheet>
  );
}

const styles = StyleSheet.create({
  preview: { paddingHorizontal: 6, paddingBottom: 12, marginBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  previewText: { ...IOSAppFont.subheadline, fontStyle: "italic" },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 14, paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { ...IOSAppFont.body },
});

export default MessageActionsSheet;
