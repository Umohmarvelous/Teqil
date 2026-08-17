// components/feed/PostCard.tsx
//
// One post in a timeline.
//
// ── Why the layout is Instagram's proportions on Twitter's information ──────
// Instagram gives media the full card width edge to edge and hangs a compact
// action row underneath; Twitter puts the avatar in a left gutter and indents
// everything else so a thread reads as a column. Emilgo's feed carries both
// kinds of post — a driver's photo of a finished route, and a two-line note
// about a fare — so the card uses the left gutter (threads read correctly) but
// lets media break out to the card's full width (photos get the room they
// deserve). That is the deliberate difference from a straight Instagram clone.
//
// ── The engagement row ──────────────────────────────────────────────────────
// Reply, repost, like, view count, then bookmark and share pushed to the right.
// Counts sit next to their icon rather than under it, because a Nigerian data
// plan means most posts have small numbers and a stacked count wastes a whole
// line for a "3".
//
// ── Performance ─────────────────────────────────────────────────────────────
// Every cell is memoised on the fields that can actually change. A timeline of
// 200 posts re-renders on every like otherwise, and the frame budget on a mid
// range Android device does not survive that.

import React from "react";
import { View, Text, Pressable, StyleSheet, Share, Platform } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  Comment01Icon,
  RepeatIcon,
  FavouriteIcon,
  BookmarkAdd01Icon,
  BookmarkCheck01Icon,
  Share08Icon,
  MoreHorizontalIcon,
  ViewIcon,
  Location01Icon,
  CheckmarkBadge01Icon,
} from "@hugeicons/core-free-icons";
import Avatar from "@/components/Avatar";
import FollowButton from "@/components/FollowButton";
import { useIOSTheme, IOSAppFont } from "@/components/ios/theme";
import { iosActionSheet, iosAlert } from "@/components/ios";
import { PostText } from "./PostText";
import { PostMediaGallery } from "./PostMedia";
import { PostPoll } from "./PostPoll";
import { useFeedStore } from "@/src/store/useFeedStore";
import { useFollowsStore } from "@/src/store/useFollowsStore";
import type { FeedPost, ReportReason } from "@/src/services/feed";

/** Public profile links are shareable, so the share sheet needs a real origin. */
const SHARE_ORIGIN = process.env.EXPO_PUBLIC_SHARE_ORIGIN || "https://emilgo.app";

const AVATAR = 42;
const GUTTER = AVATAR + 10;

function compact(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.max(1, s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 604_800) return `${Math.floor(s / 86_400)}d`;
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

const REPORT_REASONS: { label: string; value: ReportReason }[] = [
  { label: "Spam", value: "spam" },
  { label: "Harassment or bullying", value: "harassment" },
  { label: "Hate speech", value: "hate" },
  { label: "Violence or threats", value: "violence" },
  { label: "Scam or fraud", value: "scam" },
  { label: "Nudity or sexual content", value: "nudity" },
  { label: "False information", value: "misinformation" },
];

// ─── The engagement row ──────────────────────────────────────────────────────

function ActionButton({
  icon,
  count,
  active,
  activeColor,
  color,
  onPress,
  label,
}: {
  icon: any;
  count?: number;
  active?: boolean;
  activeColor: string;
  color: string;
  onPress: () => void;
  label: string;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={() => {
        scale.value = withSequence(
          withTiming(0.82, { duration: 90 }),
          withSpring(1, { damping: 12, stiffness: 340 }),
        );
        onPress();
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.action}
    >
      <Animated.View style={style}>
        <HugeiconsIcon
          icon={icon}
          size={19}
          color={active ? activeColor : color}
          strokeWidth={2}
          // Hugeicons fills only when the icon supports it; like and bookmark do.
          fill={active ? activeColor : "none"}
        />
      </Animated.View>
      {count != null && count > 0 ? (
        <Text style={[styles.actionCount, { color: active ? activeColor : color }]}>
          {compact(count)}
        </Text>
      ) : null}
    </Pressable>
  );
}

// ─── The quoted-post embed ───────────────────────────────────────────────────

function QuotedCard({ post, onPress }: { post: NonNullable<FeedPost["quoted"]>; onPress: () => void }) {
  const t = useIOSTheme();
  const hasMedia = Array.isArray(post.media) && post.media.length > 0;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.quoted, { borderColor: t.separator, backgroundColor: t.secondarySystemBackground }]}
    >
      <View style={styles.quotedHead}>
        <Avatar name={post.author_name} photoUri={post.author_photo} size={18} />
        <Text style={[styles.quotedName, { color: t.label }]} numberOfLines={1}>
          {post.author_name}
        </Text>
        {post.author_username ? (
          <Text style={[styles.quotedHandle, { color: t.tertiaryLabel }]} numberOfLines={1}>
            @{post.author_username}
          </Text>
        ) : null}
        <Text style={[styles.quotedHandle, { color: t.tertiaryLabel }]}>· {ago(post.created_at)}</Text>
      </View>
      {post.body ? (
        <Text style={[styles.quotedBody, { color: t.label }]} numberOfLines={hasMedia ? 2 : 4}>
          {post.body}
        </Text>
      ) : null}
      {hasMedia ? <PostMediaGallery media={post.media} radius={10} /> : null}
    </Pressable>
  );
}

// ─── The card ────────────────────────────────────────────────────────────────

export interface PostCardProps {
  post: FeedPost;
  /** True while on screen — gates inline video playback. */
  active?: boolean;
  /** Detail view: bigger body text, timestamp on its own line, no line clamp. */
  detail?: boolean;
  /** Draws the vertical thread line down the avatar gutter. */
  threadLine?: boolean;
  onOpen?: (post: FeedPost) => void;
}

function PostCardInner({ post, active, detail, threadLine, onOpen }: PostCardProps) {
  const t = useIOSTheme();
  const router = useRouter();

  const like = useFeedStore((s) => s.like);
  const bookmark = useFeedStore((s) => s.bookmark);
  const repost = useFeedStore((s) => s.repost);
  const vote = useFeedStore((s) => s.vote);
  const remove = useFeedStore((s) => s.remove);
  const hide = useFeedStore((s) => s.hide);
  const report = useFeedStore((s) => s.report);
  const block = useFeedStore((s) => s.block);
  const mute = useFeedStore((s) => s.mute);
  const applyFollow = useFeedStore((s) => s.applyFollow);
  const noteShared = useFeedStore((s) => s.noteShared);
  const toggleFollow = useFollowsStore((s) => s.toggleFollow);

  const burst = useSharedValue(0);
  const burstStyle = useAnimatedStyle(() => ({
    transform: [{ scale: burst.value }],
    // The heart is a plain View over an Image, never over glass, so fading it
    // is safe here — the glass rule applies to GlassView and its ancestors.
    opacity: burst.value > 0 ? 1 : 0,
  }));

  const open = () => (onOpen ? onOpen(post) : router.push(`/post/${post.id}` as any));
  const openAuthor = () => router.push(`/follows/${post.author_id}` as any);

  const doLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    like(post.id);
  };

  // Double-tap to like, Instagram's gesture. It only ever likes — a double tap
  // that un-likes would make the burst animation a lie.
  const doubleTap = React.useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDuration(280)
        .onEnd(() => {
          burst.value = withSequence(
            withSpring(1.25, { damping: 9, stiffness: 300 }),
            withTiming(0, { duration: 380 }),
          );
        })
        .runOnJS(true)
        .onFinalize(() => {
          if (!post.viewer_liked) doLike();
        }),
    [post.viewer_liked, post.id],
  );

  const share = async () => {
    const url = `${SHARE_ORIGIN}/post/${post.id}`;
    try {
      const res = await Share.share(
        Platform.OS === "ios"
          ? { url, message: post.body ? `${post.body}\n\n${url}` : url }
          : { message: post.body ? `${post.body}\n\n${url}` : url },
      );
      // Only a completed share earns the credit. Opening the sheet and backing
      // out is a dismissal, and paying for it would make the credit free.
      if (res.action === Share.sharedAction) noteShared(post.id);
    } catch {}
  };

  const askReport = () => {
    iosActionSheet("Report post", "Tell us what is wrong with this post.", [
      ...REPORT_REASONS.map((r) => ({
        text: r.label,
        onPress: () => {
          report(post.id, r.value).catch((e: any) =>
            iosAlert("Could not report", e?.message ?? "Please try again."),
          );
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const openMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const handle = post.author_username ? `@${post.author_username}` : post.author_name;

    if (post.is_own) {
      iosActionSheet(undefined, undefined, [
        {
          text: "Edit post",
          onPress: () => router.push({ pathname: "/compose" as any, params: { edit: post.id } }),
        },
        {
          text: "Copy link",
          onPress: () => Clipboard.setStringAsync(`${SHARE_ORIGIN}/post/${post.id}`),
        },
        {
          text: "Delete post",
          style: "destructive" as const,
          onPress: () =>
            iosAlert("Delete this post?", "This cannot be undone.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () =>
                  remove(post.id).catch((e: any) =>
                    iosAlert("Could not delete", e?.message ?? "Please try again."),
                  ),
              },
            ]),
        },
        { text: "Cancel", style: "cancel" as const },
      ]);
      return;
    }

    iosActionSheet(undefined, undefined, [
      {
        text: post.viewer_follows_author ? `Unfollow ${handle}` : `Follow ${handle}`,
        onPress: async () => {
          const ok = await toggleFollow(post.author_id);
          if (ok) applyFollow(post.author_id, !post.viewer_follows_author);
        },
      },
      { text: "Not interested in this post", onPress: () => hide(post.id) },
      { text: `Mute ${handle}`, onPress: () => mute(post.author_id, true) },
      {
        text: "Copy link",
        onPress: () => Clipboard.setStringAsync(`${SHARE_ORIGIN}/post/${post.id}`),
      },
      { text: "Report post", style: "destructive" as const, onPress: askReport },
      {
        text: `Block ${handle}`,
        style: "destructive" as const,
        onPress: () =>
          iosAlert(`Block ${handle}?`, "You will not see each other's posts, and any follow between you is removed.", [
            { text: "Cancel", style: "cancel" },
            { text: "Block", style: "destructive", onPress: () => block(post.author_id) },
          ]),
      },
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const verified = post.author_role === "driver" && (post.author_rating ?? 0) >= 4.5;

  // Offer Follow wherever it is useful: someone else's post by a person you do
  // not already follow. It disappears the moment you follow — "Following" on
  // every row would be noise, and the overflow menu still offers unfollow.
  const showFollow = !post.is_own && !post.viewer_follows_author;

  return (
    <View style={[styles.card, { borderBottomColor: t.separator }]}>
      {/* Repost attribution sits above everything, in the gutter, the way both
          Twitter and Bluesky place it. */}
      {post.reposter_name ? (
        <View style={styles.repostLine}>
          <View style={styles.repostIcon}>
            <HugeiconsIcon icon={RepeatIcon} size={13} color={t.tertiaryLabel} strokeWidth={2} />
          </View>
          <Text style={[styles.repostText, { color: t.tertiaryLabel }]} numberOfLines={1}>
            {post.reposter_name} reposted
          </Text>
        </View>
      ) : null}

      <View style={styles.row}>
        {/* Left gutter: avatar, and the thread line when this post has a reply
            rendered directly beneath it. */}
        <View style={styles.gutter}>
          <Pressable onPress={openAuthor} hitSlop={6}>
            <Avatar name={post.author_name} photoUri={post.author_photo} size={AVATAR} />
          </Pressable>
          {threadLine ? <View style={[styles.threadLine, { backgroundColor: t.separator }]} /> : null}
        </View>

        <View style={styles.body}>
          <View style={styles.head}>
            <Pressable onPress={openAuthor} style={styles.headNames} hitSlop={4}>
              <Text style={[styles.name, { color: t.label }]} numberOfLines={1}>
                {post.author_name}
              </Text>
              {verified ? (
                <HugeiconsIcon
                  icon={CheckmarkBadge01Icon}
                  size={14}
                  color={t.tint}
                  strokeWidth={2}
                  fill={t.tint}
                />
              ) : null}
              {post.author_username ? (
                <Text style={[styles.handle, { color: t.tertiaryLabel }]} numberOfLines={1}>
                  @{post.author_username}
                </Text>
              ) : null}
              {!detail ? (
                <Text style={[styles.handle, { color: t.tertiaryLabel }]}>
                  · {ago(post.created_at)}
                </Text>
              ) : null}
            </Pressable>

            {/* Follow lives on the card, not only in the overflow menu: a menu
                entry is not an affordance, and a feed is where you meet the
                people worth following. */}
            {showFollow ? (
              <FollowButton
                userId={post.author_id}
                initialFollowing={false}
                size="small"
                style={styles.follow}
              />
            ) : null}

            <Pressable onPress={openMenu} hitSlop={12} style={styles.more}>
              <HugeiconsIcon
                icon={MoreHorizontalIcon}
                size={18}
                color={t.tertiaryLabel}
                strokeWidth={2}
              />
            </Pressable>
          </View>

          {post.reply_to_username ? (
            <Text style={[styles.replyingTo, { color: t.secondaryLabel }]}>
              Replying to <Text style={{ color: t.tint }}>@{post.reply_to_username}</Text>
            </Text>
          ) : null}

          <GestureDetector gesture={doubleTap}>
            <Pressable onPress={open} onLongPress={openMenu} delayLongPress={420}>
              {post.body ? (
                <PostText
                  body={post.body}
                  linkColor={t.tint}
                  style={[detail ? styles.bodyTextLarge : styles.bodyText, { color: t.label }]}
                  numberOfLines={detail ? undefined : 12}
                />
              ) : null}

              {post.media.length ? (
                <PostMediaGallery media={post.media} active={!!active} />
              ) : null}

              {/* The burst is absolutely positioned over the whole tap area so
                  it lands on the media when there is media and on the text when
                  there is not. */}
              <Animated.View style={[styles.burst, burstStyle]} pointerEvents="none">
                <HugeiconsIcon
                  icon={FavouriteIcon}
                  size={78}
                  color="#fff"
                  strokeWidth={1.5}
                  fill="#fff"
                />
              </Animated.View>
            </Pressable>
          </GestureDetector>

          {post.poll ? <PostPoll poll={post.poll} onVote={(c) => vote(post.id, c)} /> : null}

          {post.quoted ? (
            <QuotedCard
              post={post.quoted}
              onPress={() => router.push(`/post/${post.quoted!.id}` as any)}
            />
          ) : null}

          {post.place ? (
            <View style={styles.place}>
              <HugeiconsIcon icon={Location01Icon} size={13} color={t.tertiaryLabel} strokeWidth={2} />
              <Text style={[styles.placeText, { color: t.tertiaryLabel }]} numberOfLines={1}>
                {post.place}
              </Text>
            </View>
          ) : null}

          {detail ? (
            <Text style={[styles.detailTime, { color: t.tertiaryLabel }]}>
              {new Date(post.created_at).toLocaleString(undefined, {
                hour: "numeric",
                minute: "2-digit",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              {post.edited_at ? " · Edited" : ""}
              {post.view_count > 0 ? ` · ${compact(post.view_count)} views` : ""}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <ActionButton
              icon={Comment01Icon}
              count={post.reply_count}
              color={t.tertiaryLabel}
              activeColor={t.tint}
              onPress={() => router.push({ pathname: "/compose" as any, params: { replyTo: post.id } })}
              label="Reply"
            />
            <ActionButton
              icon={RepeatIcon}
              count={post.repost_count}
              active={post.viewer_reposted}
              color={t.tertiaryLabel}
              activeColor={t.systemGreen}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                iosActionSheet(undefined, undefined, [
                  {
                    text: post.viewer_reposted ? "Undo repost" : "Repost",
                    onPress: () => repost(post.id),
                  },
                  {
                    text: "Quote post",
                    onPress: () =>
                      router.push({ pathname: "/compose" as any, params: { quoteOf: post.id } }),
                  },
                  { text: "Cancel", style: "cancel" as const },
                ]);
              }}
              label="Repost"
            />
            <ActionButton
              icon={FavouriteIcon}
              count={post.like_count}
              active={post.viewer_liked}
              color={t.tertiaryLabel}
              activeColor="#F91880"
              onPress={doLike}
              label="Like"
            />
            {!detail && post.view_count > 0 ? (
              <View style={styles.action}>
                <HugeiconsIcon icon={ViewIcon} size={18} color={t.tertiaryLabel} strokeWidth={2} />
                <Text style={[styles.actionCount, { color: t.tertiaryLabel }]}>
                  {compact(post.view_count)}
                </Text>
              </View>
            ) : null}

            <View style={styles.spacer} />

            <ActionButton
              icon={post.viewer_bookmarked ? BookmarkCheck01Icon : BookmarkAdd01Icon}
              active={post.viewer_bookmarked}
              color={t.tertiaryLabel}
              activeColor={t.tint}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                bookmark(post.id);
              }}
              label="Bookmark"
            />
            <ActionButton
              icon={Share08Icon}
              color={t.tertiaryLabel}
              activeColor={t.tint}
              onPress={share}
              label="Share"
            />
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * Only these fields change in place. Everything else about a post is immutable
 * once fetched, so comparing them is enough — and it keeps a 200-row timeline
 * from re-rendering every cell each time one like lands.
 */
export const PostCard = React.memo(PostCardInner, (a, b) => {
  const x = a.post;
  const y = b.post;
  return (
    x.id === y.id &&
    x.like_count === y.like_count &&
    x.reply_count === y.reply_count &&
    x.repost_count === y.repost_count &&
    x.bookmark_count === y.bookmark_count &&
    x.view_count === y.view_count &&
    x.viewer_liked === y.viewer_liked &&
    x.viewer_bookmarked === y.viewer_bookmarked &&
    x.viewer_reposted === y.viewer_reposted &&
    x.viewer_follows_author === y.viewer_follows_author &&
    x.body === y.body &&
    x.edited_at === y.edited_at &&
    x.poll === y.poll &&
    a.active === b.active &&
    a.detail === b.detail &&
    a.threadLine === b.threadLine
  );
});

const styles = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row" },
  gutter: { width: GUTTER, alignItems: "center" },
  threadLine: { width: 2, flex: 1, marginTop: 6, borderRadius: 1 },
  body: { flex: 1, minWidth: 0 },

  repostLine: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  repostIcon: { width: GUTTER, alignItems: "flex-end", paddingRight: 8 },
  repostText: { ...IOSAppFont.caption1, fontFamily: "Poppins_500Medium" },

  head: { flexDirection: "row", alignItems: "center" },
  headNames: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1, minWidth: 0 },
  name: { ...IOSAppFont.subheadline, fontFamily: "Poppins_600SemiBold", flexShrink: 1 },
  handle: { ...IOSAppFont.footnote, flexShrink: 1 },
  more: { paddingLeft: 8 },
  // Overrides FollowButton's default pill so it reads as a header control
  // rather than the primary action of the card.
  follow: { paddingHorizontal: 12, paddingVertical: 5, minWidth: 0, marginLeft: 6 },

  replyingTo: { ...IOSAppFont.footnote, marginTop: 1 },
  bodyText: { ...IOSAppFont.subheadline, lineHeight: 21, marginTop: 2 },
  bodyTextLarge: { ...IOSAppFont.body, lineHeight: 25, marginTop: 4 },

  burst: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },

  quoted: { marginTop: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 10, gap: 4 },
  quotedHead: { flexDirection: "row", alignItems: "center", gap: 5 },
  quotedName: { ...IOSAppFont.caption1, fontFamily: "Poppins_600SemiBold", flexShrink: 1 },
  quotedHandle: { ...IOSAppFont.caption1, flexShrink: 1 },
  quotedBody: { ...IOSAppFont.footnote, lineHeight: 18 },

  place: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  placeText: { ...IOSAppFont.caption1, flex: 1 },

  detailTime: { ...IOSAppFont.footnote, marginTop: 12 },

  actions: { flexDirection: "row", alignItems: "center", marginTop: 10, paddingRight: 4 },
  action: { flexDirection: "row", alignItems: "center", gap: 5, marginRight: 22, minHeight: 30 },
  actionCount: { ...IOSAppFont.caption1, fontVariant: ["tabular-nums"] },
  spacer: { flex: 1 },
});
