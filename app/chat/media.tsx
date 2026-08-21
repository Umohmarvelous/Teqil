// app/chat/media.tsx
//
// "Media, links and docs" for one conversation.
//
// ── Three tabs, three shapes ───────────────────────────────────────────────
// Photos and videos want a dense grid — you recognise a picture at thumbnail
// size. Documents want a list, because a file is identified by its name, not
// its appearance. Links want a list too, with the URL under the message it came
// from, because a bare URL out of context is unreadable.
//
// The links tab is matched in SQL (`chat_conversation_media(..., 'links')`), not
// by pulling the history down and scanning it here — three links in a thousand
// messages should not cost a thousand messages of transfer.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Linking,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { PlayIcon, File01Icon, Link01Icon, Image01Icon } from "@hugeicons/core-free-icons";

import { IOSScreen, IOSSegmentedTabs, useIOSTheme, IOSAppFont } from "@/components/ios";
import { MediaViewer } from "@/components/chat/ChatMedia";
import { useSignedMedia } from "@/src/hooks/useSignedMedia";
import {
  listConversationMedia,
  humanFileSize,
  firstUrl,
  resolveMediaUrl,
  type MediaRow,
} from "@/src/services/chat";

type Tab = "media" | "docs" | "links";

/** One grid cell. Its own component so each signs its own URL as it scrolls in. */
function Cell({ row, size, onPress }: { row: MediaRow; size: number; onPress: () => void }) {
  const t = useIOSTheme();
  const { url } = useSignedMedia(row.media_url);
  return (
    <Pressable onPress={onPress} style={{ width: size, height: size, padding: 1 }}>
      <View style={[styles.cell, { backgroundColor: t.tertiarySystemFill }]}>
        {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} /> : null}
        {row.media_type === "video" ? (
          <View style={styles.playDot}>
            <HugeiconsIcon icon={PlayIcon} size={14} color="#fff" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ChatMediaScreen() {
  const { conversationId, name } = useLocalSearchParams<{ conversationId: string; name?: string }>();
  const t = useIOSTheme();
  const { width } = useWindowDimensions();

  const [tab, setTab] = useState<Tab>("media");
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<MediaRow | null>(null);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setRows(await listConversationMedia(conversationId, tab));
    setLoading(false);
  }, [conversationId, tab]);

  useEffect(() => { load(); }, [load]);

  const cell = useMemo(() => Math.floor(width / 3), [width]);

  const empty = {
    media: { icon: Image01Icon, text: "No photos or videos in this chat yet." },
    docs: { icon: File01Icon, text: "No documents in this chat yet." },
    links: { icon: Link01Icon, text: "No links have been shared in this chat." },
  }[tab];

  return (
    <IOSScreen title="Media" subtitle={name} back scrollable={false} tabBarInset={false}>
      <View style={styles.tabs}>
        <IOSSegmentedTabs
          variant="capsule"
          segments={[
            { key: "media", label: "Media" },
            { key: "docs", label: "Docs" },
            { key: "links", label: "Links" },
          ]}
          active={tab}
          onChange={(k) => { Haptics.selectionAsync(); setTab(k as Tab); }}
        />
      </View>

      {loading ? (
        <View style={styles.centre}><ActivityIndicator color={t.tint} /></View>
      ) : rows.length === 0 ? (
        <View style={styles.centre}>
          <HugeiconsIcon icon={empty.icon} size={36} color={t.quaternaryLabel} />
          <Text style={[styles.emptyText, { color: t.tertiaryLabel }]}>{empty.text}</Text>
        </View>
      ) : tab === "media" ? (
        <FlatList
          key="grid"
          data={rows}
          numColumns={3}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <Cell row={item} size={cell} onPress={() => setViewing(item)} />
          )}
        />
      ) : (
        <FlatList
          key="list"
          data={rows}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) =>
            tab === "docs" ? <DocRow row={item} /> : <LinkRow row={item} />
          }
        />
      )}

      <MediaViewer
        visible={!!viewing}
        onClose={() => setViewing(null)}
        stored={viewing?.media_url ?? null}
        kind={viewing?.media_type === "video" ? "video" : "image"}
        caption={viewing?.text}
        subtitle={
          viewing ? `${viewing.sender_name || "Someone"} · ${new Date(viewing.created_at).toLocaleString()}` : undefined
        }
      />
    </IOSScreen>
  );
}

function DocRow({ row }: { row: MediaRow }) {
  const t = useIOSTheme();
  const open = async () => {
    const url = await resolveMediaUrl(row.media_url);
    if (url) Linking.openURL(url).catch(() => {});
  };
  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: t.separator, backgroundColor: pressed ? t.tertiarySystemFill : "transparent" },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: t.tint + "1A" }]}>
        <HugeiconsIcon icon={File01Icon} size={20} color={t.tint} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, { color: t.label }]} numberOfLines={1}>
          {row.media_name || "Document"}
        </Text>
        <Text style={[styles.rowMeta, { color: t.tertiaryLabel }]} numberOfLines={1}>
          {[humanFileSize(row.media_size), row.sender_name, new Date(row.created_at).toLocaleDateString()]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
    </Pressable>
  );
}

function LinkRow({ row }: { row: MediaRow }) {
  const t = useIOSTheme();
  const url = firstUrl(row.text);
  return (
    <Pressable
      onPress={() => url && Linking.openURL(url).catch(() => {})}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: t.separator, backgroundColor: pressed ? t.tertiarySystemFill : "transparent" },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: t.systemBlue + "1A" }]}>
        <HugeiconsIcon icon={Link01Icon} size={20} color={t.systemBlue} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, { color: t.systemBlue }]} numberOfLines={1}>
          {url}
        </Text>
        {/* The message the link arrived in. A URL with no context is unreadable
            a month later, which is the point at which anyone opens this list. */}
        <Text style={[styles.rowMeta, { color: t.secondaryLabel }]} numberOfLines={2}>
          {row.text}
        </Text>
        <Text style={[styles.rowMeta, { color: t.tertiaryLabel }]} numberOfLines={1}>
          {row.sender_name} · {new Date(row.created_at).toLocaleDateString()}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: 16, paddingBottom: 10 },
  cell: { flex: 1, borderRadius: 2, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  playDot: {
    position: "absolute", width: 30, height: 30, borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center",
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowTitle: { ...IOSAppFont.subheadline, fontFamily: "Poppins_500Medium" },
  rowMeta: { ...IOSAppFont.caption1, marginTop: 1 },
  centre: { alignItems: "center", gap: 10, paddingTop: 80, paddingHorizontal: 44 },
  emptyText: { ...IOSAppFont.subheadline, textAlign: "center", lineHeight: 20 },
});
