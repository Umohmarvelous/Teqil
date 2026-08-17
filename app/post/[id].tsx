// app/post/[id].tsx
//
// A post and its replies — the screen that opens when you tap a post or its
// comment button.
//
// ── Why a screen and not a bottom sheet ─────────────────────────────────────
// A sheet works when replies are an afterthought. Here a reply is itself a post:
// it can carry media, a poll, its own replies, and it can be shared with its own
// link. A sheet cannot own a URL, cannot be deep-linked into, and stacks badly
// when you tap a reply inside it. Twitter, Threads and Bluesky all landed on a
// pushed screen for exactly these reasons, and the sheet this replaced could not
// do any of them.
//
// ── Layout ──────────────────────────────────────────────────────────────────
// Root post first, rendered in `detail` mode (larger body, timestamp and view
// count on their own line), then its replies in the same cells the timeline
// uses. The thread line runs down the avatar gutter from the root into the
// first reply.
//
// ── The reply bar ───────────────────────────────────────────────────────────
// Pinned to the bottom, above the keyboard. It is a button, not a live text
// field: two focusable fields on one screen (this one and the composer's) fight
// over the keyboard and flicker it, which is the same reason IOSSearchBar grew
// an `asButton` mode.

import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { Glass, useIOSTheme } from "@/components/ios";
import { IOSAppFont } from "@/components/ios/theme";
import { FeedList } from "@/components/feed";
import HeaderActions from "@/components/HeaderActions";
import Avatar from "@/components/Avatar";
import { useFeedStore } from "@/src/store/useFeedStore";
import { useAuthStore } from "@/src/store/useStore";
import { fetchPost } from "@/src/services/feed";

export default function PostThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useIOSTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  const post = useFeedStore((s) => (id ? s.posts[id] : undefined));
  const setPosts = useFeedStore.setState;
  const [resolving, setResolving] = React.useState(!post);

  // A deep link lands here with nothing in the store, so the root post has to be
  // fetched on its own before the thread can render a header for it.
  React.useEffect(() => {
    if (!id || post) {
      setResolving(false);
      return;
    }
    let alive = true;
    fetchPost(id).then((p) => {
      if (!alive) return;
      if (p) setPosts((s: any) => ({ posts: { ...s.posts, [p.id]: p } }));
      setResolving(false);
    });
    return () => {
      alive = false;
    };
  }, [id, post, setPosts]);

  if (!id) return null;

  const barHeight = 54;
  const topInset = insets.top + barHeight;
  const replyBarHeight = 56 + insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: t.systemBackground }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {resolving ? (
        <View style={[styles.center, { paddingTop: topInset }]}>
          <ActivityIndicator color={t.tint} size="large" />
        </View>
      ) : (
        <FeedList
          timelineKey={`thread:${id}`}
          detailFirstRow
          topInset={topInset}
          bottomInset={replyBarHeight}
          emptyTitle="This post is gone"
          emptyBody="It may have been deleted, or you may not have permission to see it."
          // Tapping a reply opens that reply's own thread, which is how a
          // conversation is walked. Without this the cell would push the screen
          // it is already on.
          onOpenPost={(p) => {
            if (p.id !== id) router.push(`/post/${p.id}` as any);
          }}
        />
      )}

      {/* Top bar. Glass over the scrolling thread; content passes under it. */}
      <View style={[styles.bar, { paddingTop: insets.top, height: topInset }]}>
        <Glass
          variant="regular"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={60}
          fallbackTint={t.systemBackground}
        />
        <View style={styles.barRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={24} color={t.label} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.barTitle, { color: t.label }]}>
            {post?.reply_to ? "Reply" : "Post"}
          </Text>
          <View style={styles.spacer} />
          <HeaderActions tint={t.label} onSearchPress={() => router.push("/search" as any)} />
        </View>
      </View>

      {/* Reply bar. */}
      <View style={[styles.replyBar, { paddingBottom: insets.bottom, borderTopColor: t.separator }]}>
        <Glass
          variant="regular"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={60}
          fallbackTint={t.systemBackground}
        />
        <Pressable
          style={styles.replyRow}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({ pathname: "/compose" as any, params: { replyTo: id } });
          }}
          accessibilityRole="button"
          accessibilityLabel="Write a reply"
        >
          <Avatar name={user?.full_name || "You"} photoUri={user?.profile_photo} size={32} />
          <View style={[styles.replyField, { backgroundColor: t.tertiarySystemFill }]}>
            <Text style={[styles.replyHint, { color: t.tertiaryLabel }]} numberOfLines={1}>
              {post?.author_username
                ? `Reply to @${post.author_username}`
                : "Post your reply"}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  bar: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, overflow: "hidden" },
  barRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
  },
  barTitle: { ...IOSAppFont.headline },
  spacer: { flex: 1 },

  replyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  replyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  replyField: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  replyHint: { ...IOSAppFont.footnote, ...(Platform.OS === "android" ? { includeFontPadding: false } : null) },
});
