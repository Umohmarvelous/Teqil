// components/feed/ExternalPostCard.tsx
//
// An ingested article, rendered in the feed.
//
// ── Why it looks like a post and not like a news card ──────────────────────
// Twitter's link cards read as *someone shared this*: an avatar-and-name row on
// top, the headline as the body, then the image. That shape is right here for
// the same reason — it sits in a timeline between real posts and must not break
// the rhythm with a completely different silhouette.
//
// ── What is deliberately NOT here ──────────────────────────────────────────
// No like and no reply. You cannot like a Premium Times article from EMILGO,
// and a reply would have to be posted back to a newspaper. Offering buttons
// that quietly do nothing local is worse than not offering them. Bookmark and
// share are real, so those are the two that appear.
//
// The whole card opens the source in the browser. Attribution is on the card,
// not buried: the outlet's name is the first thing in the row.

import React from "react";
import { View, Text, Pressable, Image, StyleSheet, Share, Linking } from "react-native";
import * as Haptics from "expo-haptics";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  BookmarkAdd01Icon,
  BookmarkCheck01Icon,
  Share08Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";

import { useIOSTheme, IOSAppFont } from "@/components/ios";
import { toggleExternalBookmark, type ExternalPost } from "@/src/services/externalFeed";

/** "3m", "4h", "2d" — the compact form a timeline wants. */
function shortAge(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

/** The outlet's initial, in its own tinted square — a stand-in for a logo. */
function SourceMark({ name, icon }: { name: string; icon: string | null }) {
  const t = useIOSTheme();
  if (icon) {
    return <Image source={{ uri: icon }} style={styles.sourceIcon} />;
  }
  return (
    <View style={[styles.sourceIcon, styles.sourceInitial, { backgroundColor: t.tint + "1F" }]}>
      <Text style={[styles.sourceInitialText, { color: t.tint }]}>
        {(name || "?").charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export interface ExternalPostCardProps {
  post: ExternalPost;
  /** Lets the list keep its copy in step with the optimistic toggle. */
  onBookmarkChange?: (id: string, on: boolean, n: number) => void;
}

export function ExternalPostCard({ post, onBookmarkChange }: ExternalPostCardProps) {
  const t = useIOSTheme();
  const [saved, setSaved] = React.useState(post.viewer_bookmarked);
  const [count, setCount] = React.useState(post.bookmark_count);

  // The row can be recycled onto a different article while mounted.
  React.useEffect(() => {
    setSaved(post.viewer_bookmarked);
    setCount(post.bookmark_count);
  }, [post.id, post.viewer_bookmarked, post.bookmark_count]);

  const open = React.useCallback(() => {
    Haptics.selectionAsync();
    Linking.openURL(post.url).catch(() => {});
  }, [post.url]);

  const save = React.useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const before = { saved, count };
    setSaved(!saved);
    setCount((n) => Math.max(0, n + (saved ? -1 : 1)));
    try {
      const res = await toggleExternalBookmark(post.id);
      setSaved(res.on);
      setCount(res.n);
      onBookmarkChange?.(post.id, res.on, res.n);
    } catch {
      // Roll back exactly: a half-applied toggle leaves the user unable to tell
      // which state they are in.
      setSaved(before.saved);
      setCount(before.count);
    }
  }, [saved, count, post.id, onBookmarkChange]);

  const share = React.useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Share.share({ message: `${post.title}\n\n${post.url}` }).catch(() => {});
  }, [post.title, post.url]);

  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [
        styles.root,
        { borderBottomColor: t.separator },
        pressed && { backgroundColor: t.tertiarySystemFill },
      ]}
      accessibilityRole="link"
      accessibilityLabel={`${post.title}. From ${post.source_name}. Opens in your browser.`}
    >
      <SourceMark name={post.source_name} icon={post.source_icon} />

      <View style={styles.body}>
        {/* Attribution first, like a post's author line. */}
        <View style={styles.head}>
          <Text style={[styles.source, { color: t.label }]} numberOfLines={1}>
            {post.source_name}
          </Text>
          <HugeiconsIcon icon={LinkSquare02Icon} size={12} color={t.tertiaryLabel} strokeWidth={2} />
          <Text style={[styles.meta, { color: t.tertiaryLabel }]} numberOfLines={1}>
            {post.author ? `${post.author} · ` : ""}
            {shortAge(post.published_at)}
          </Text>
        </View>

        <Text style={[styles.title, { color: t.label }]} numberOfLines={3}>
          {post.title}
        </Text>

        {post.summary ? (
          <Text style={[styles.summary, { color: t.secondaryLabel }]} numberOfLines={2}>
            {post.summary}
          </Text>
        ) : null}

        {post.image_url ? (
          <Image
            source={{ uri: post.image_url }}
            style={[styles.image, { backgroundColor: t.tertiarySystemFill }]}
            resizeMode="cover"
          />
        ) : null}

        {/* Two actions, both of which genuinely work. */}
        <View style={styles.actions}>
          <Pressable onPress={save} hitSlop={10} style={styles.action} accessibilityLabel="Save">
            <HugeiconsIcon
              icon={saved ? BookmarkCheck01Icon : BookmarkAdd01Icon}
              size={17}
              color={saved ? t.tint : t.tertiaryLabel}
              strokeWidth={2}
            />
            {count > 0 ? (
              <Text style={[styles.actionCount, { color: saved ? t.tint : t.tertiaryLabel }]}>
                {count}
              </Text>
            ) : null}
          </Pressable>

          <Pressable onPress={share} hitSlop={10} style={styles.action} accessibilityLabel="Share">
            <HugeiconsIcon icon={Share08Icon} size={17} color={t.tertiaryLabel} strokeWidth={2} />
          </Pressable>

          <View style={styles.spacer} />

          <Text style={[styles.category, { color: t.tertiaryLabel }]}>
            {post.category.toUpperCase()}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sourceIcon: { width: 38, height: 38, borderRadius: 10 },
  sourceInitial: { alignItems: "center", justifyContent: "center" },
  sourceInitialText: { ...IOSAppFont.headline, fontFamily: "Poppins_700Bold" },

  body: { flex: 1, minWidth: 0, gap: 3 },
  head: { flexDirection: "row", alignItems: "center", gap: 5 },
  source: { ...IOSAppFont.subheadline, fontFamily: "Poppins_600SemiBold", flexShrink: 1 },
  meta: { ...IOSAppFont.caption1, flexShrink: 1 },

  title: { ...IOSAppFont.body, fontFamily: "Poppins_500Medium", lineHeight: 21 },
  summary: { ...IOSAppFont.footnote, lineHeight: 18 },

  image: { width: "100%", height: 172, borderRadius: 14, marginTop: 6 },

  actions: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 8 },
  action: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionCount: { ...IOSAppFont.caption1 },
  spacer: { flex: 1 },
  category: { ...IOSAppFont.caption2, letterSpacing: 0.5 },
});

export default ExternalPostCard;
