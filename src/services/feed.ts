// src/services/feed.ts
//
// The social feed's whole server surface, in one place.
//
// Everything here is a thin, typed wrapper over a SECURITY DEFINER RPC defined
// in supabase/migrations/migration_social_feed.sql. The rules that matter —
// who may see a post, who may reply, what a block means — live in the database,
// not here, because this file runs on a device the user controls and the
// database does not.
//
// ── Why this is NOT offline-first ────────────────────────────────────────────
// Trips are offline-first because a trip happens whether or not there is signal
// and losing one loses money. A feed is the opposite: it is a view of what other
// people did, and a stale view is worse than an honest empty state. So reads go
// to the server and are cached in memory only; writes are optimistic in the UI
// and roll back when the server disagrees. The one exception is the composer
// draft, which is genuinely the user's own work and is persisted by the store.

import { supabase } from "./supabase";

// ═════════════════════════════════════════════════════════════════════════════
// TYPES — these mirror public.feed_post_row exactly. Keep them in step.
// ═════════════════════════════════════════════════════════════════════════════

export type MediaKind = "image" | "video";

export interface PostMedia {
  url: string;
  type: MediaKind;
  width?: number;
  height?: number;
  /** Seconds. Video only. */
  duration?: number;
  /** Poster frame for a video, so the cell has something to show before play. */
  thumbnail?: string;
  /** Author-supplied description. Screen readers read this. */
  alt?: string;
}

export interface PostPoll {
  options: string[];
  votes: number[];
  total: number;
  ends_at: string;
  /** Index the viewer chose, or null. */
  my_choice: number | null;
  closed: boolean;
}

export interface QuotedPost {
  id: string;
  body: string;
  media: PostMedia[];
  author_name: string;
  author_username: string | null;
  author_photo: string | null;
  created_at: string;
}

export interface FeedPost {
  id: string;
  author_id: string;
  author_name: string;
  author_username: string | null;
  author_photo: string | null;
  author_role: string;
  author_rating: number | null;
  author_follower_count: number;
  viewer_follows_author: boolean;
  body: string;
  media: PostMedia[];
  place: string | null;
  hashtags: string[];
  reply_to: string | null;
  reply_to_username: string | null;
  quote_of: string | null;
  quoted: QuotedPost | null;
  poll: PostPoll | null;
  like_count: number;
  reply_count: number;
  repost_count: number;
  bookmark_count: number;
  view_count: number;
  viewer_liked: boolean;
  viewer_bookmarked: boolean;
  viewer_reposted: boolean;
  /** Set when this row appears in the feed because someone reposted it. */
  reposter_id: string | null;
  reposter_name: string | null;
  created_at: string;
  edited_at: string | null;
  is_own: boolean;
}

export interface FeedAd {
  id: string;
  advertiser_name: string;
  advertiser_handle: string | null;
  advertiser_logo: string | null;
  headline: string;
  body: string;
  media_url: string | null;
  media_type: MediaKind | null;
  cta_label: string;
  cta_url: string;
}

export type NotificationKind =
  | "like"
  | "reply"
  | "repost"
  | "quote"
  | "follow"
  | "mention";

export interface SocialNotification {
  id: string;
  kind: NotificationKind;
  created_at: string;
  read_at: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_username: string | null;
  actor_photo: string | null;
  post_id: string | null;
  post_excerpt: string | null;
  post_media: PostMedia[];
}

export interface TrendingTag {
  tag: string;
  posts: number;
  engagement: number;
}

export interface SuggestedAccount {
  id: string;
  full_name: string | null;
  username: string | null;
  profile_photo: string | null;
  role: string;
  avg_rating: number | null;
  follower_count: number;
}

export interface BookmarkCollection {
  collection: string;
  n: number;
}

export type ProfileTab = "posts" | "replies" | "media" | "likes";

export type ReportReason =
  | "spam"
  | "harassment"
  | "hate"
  | "violence"
  | "scam"
  | "nudity"
  | "misinformation"
  | "other";

// ═════════════════════════════════════════════════════════════════════════════
// PLUMBING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * postgres-js hands JSONB back already parsed, but a column that was never set
 * arrives as null. Normalising here means no component has to write
 * `post.media?.length ?? 0`.
 */
function normalise(row: any): FeedPost {
  return {
    ...row,
    media: Array.isArray(row?.media) ? row.media : [],
    hashtags: Array.isArray(row?.hashtags) ? row.hashtags : [],
    quoted: row?.quoted ?? null,
    poll: row?.poll ?? null,
    like_count: row?.like_count ?? 0,
    reply_count: row?.reply_count ?? 0,
    repost_count: row?.repost_count ?? 0,
    bookmark_count: row?.bookmark_count ?? 0,
    view_count: row?.view_count ?? 0,
    viewer_liked: !!row?.viewer_liked,
    viewer_bookmarked: !!row?.viewer_bookmarked,
    viewer_reposted: !!row?.viewer_reposted,
    viewer_follows_author: !!row?.viewer_follows_author,
    is_own: !!row?.is_own,
  } as FeedPost;
}

/**
 * Every read goes through here so that a missing migration, an expired session
 * or a dead network all produce the same thing: an empty list and a logged
 * reason. A feed screen that throws is a feed screen that shows a red box.
 */
async function readPosts(fn: string, args: Record<string, unknown>): Promise<FeedPost[]> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    console.warn(`[feed] ${fn}:`, error.message);
    return [];
  }
  return (data ?? []).map(normalise);
}

/** Writes must not be swallowed — the UI has an optimistic change to roll back. */
async function write<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ═════════════════════════════════════════════════════════════════════════════
// READS
// ═════════════════════════════════════════════════════════════════════════════

/** The ranked "For you" timeline. Offset paging: ranking makes cursors unstable. */
export function fetchForYou(limit = 20, offset = 0) {
  return readPosts("feed_for_you", { p_limit: limit, p_offset: offset });
}

/**
 * The "Following" timeline. Keyset paging on created_at, because this one is
 * strictly reverse-chronological and a cursor cannot skip or repeat a post when
 * someone posts mid-scroll.
 */
export function fetchFollowing(limit = 20, before?: string | null) {
  return readPosts("feed_following", { p_limit: limit, p_before: before ?? null });
}

export async function fetchPost(id: string): Promise<FeedPost | null> {
  const rows = await readPosts("get_post", { p_post: id });
  return rows[0] ?? null;
}

/** Root post first, then its replies — what the detail screen renders top to bottom. */
export function fetchThread(id: string, limit = 50) {
  return readPosts("post_thread", { p_post: id, p_limit: limit });
}

export function fetchUserPosts(userId: string, tab: ProfileTab = "posts", limit = 20, offset = 0) {
  return readPosts("list_user_posts", {
    p_user: userId,
    p_tab: tab,
    p_limit: limit,
    p_offset: offset,
  });
}

export function fetchBookmarks(collection: string | null = null, limit = 20, offset = 0) {
  return readPosts("list_bookmarks", {
    p_collection: collection,
    p_limit: limit,
    p_offset: offset,
  });
}

export async function fetchBookmarkCollections(): Promise<BookmarkCollection[]> {
  const { data, error } = await supabase.rpc("list_bookmark_collections");
  if (error) {
    console.warn("[feed] list_bookmark_collections:", error.message);
    return [];
  }
  return data ?? [];
}

export function searchPosts(q: string, limit = 20, offset = 0) {
  const trimmed = q.trim();
  if (!trimmed) return Promise.resolve([] as FeedPost[]);
  return readPosts("search_posts", { p_q: trimmed, p_limit: limit, p_offset: offset });
}

export function postsByHashtag(tag: string, limit = 20, offset = 0) {
  return readPosts("posts_by_hashtag", {
    p_tag: tag.replace(/^#/, ""),
    p_limit: limit,
    p_offset: offset,
  });
}

export async function trendingHashtags(limit = 10): Promise<TrendingTag[]> {
  const { data, error } = await supabase.rpc("trending_hashtags", { p_limit: limit });
  if (error) {
    console.warn("[feed] trending_hashtags:", error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    tag: r.tag,
    posts: Number(r.posts ?? 0),
    engagement: Number(r.engagement ?? 0),
  }));
}

export async function suggestedAccounts(limit = 5): Promise<SuggestedAccount[]> {
  const { data, error } = await supabase.rpc("suggested_accounts", { p_limit: limit });
  if (error) {
    console.warn("[feed] suggested_accounts:", error.message);
    return [];
  }
  return data ?? [];
}

// ═════════════════════════════════════════════════════════════════════════════
// WRITES
// ═════════════════════════════════════════════════════════════════════════════

export interface CreatePostInput {
  body?: string;
  media?: PostMedia[];
  replyTo?: string | null;
  quoteOf?: string | null;
  place?: string | null;
  visibility?: "public" | "followers";
  /** Creating a poll and attaching media at once is rejected by the database. */
  poll?: { options: string[]; hours: number } | null;
}

/** Returns the new post's id. Throws with the server's message on refusal. */
export function createPost(input: CreatePostInput): Promise<string> {
  return write<string>("create_post", {
    p_body: input.body ?? "",
    p_media: input.media ?? [],
    p_reply_to: input.replyTo ?? null,
    p_quote_of: input.quoteOf ?? null,
    p_place: input.place ?? null,
    p_visibility: input.visibility ?? "public",
    p_poll: input.poll ?? null,
  });
}

/** Soft delete — replies below it survive, so a thread does not lose its middle. */
export function deletePost(id: string) {
  return write<boolean>("delete_post", { p_post: id });
}

export function editPost(id: string, body: string) {
  return write<boolean>("edit_post", { p_post: id, p_body: body });
}

/** All three toggles return the authoritative count, so no refetch is needed. */
async function toggle(
  fn: string,
  args: Record<string, unknown>,
  flagKey: string,
): Promise<{ on: boolean; n: number }> {
  const data = await write<any>(fn, args);
  const row = Array.isArray(data) ? data[0] : data;
  return { on: !!row?.[flagKey], n: row?.n ?? 0 };
}

export function toggleLike(id: string) {
  return toggle("toggle_post_like", { p_post: id }, "liked");
}

export function toggleBookmark(id: string, collection = "") {
  return toggle("toggle_bookmark", { p_post: id, p_collection: collection }, "bookmarked");
}

export function toggleRepost(id: string) {
  return toggle("toggle_repost", { p_post: id }, "reposted");
}

/** Returns the poll's new state, including the viewer's choice. */
export function votePoll(id: string, choice: number): Promise<PostPoll> {
  return write<PostPoll>("vote_poll", { p_post: id, p_choice: choice });
}

/**
 * View counts. Fire-and-forget by design: a failed view is not worth a retry,
 * and it must never block or interrupt scrolling.
 */
export function markViewed(ids: string[]) {
  if (!ids.length) return;
  supabase
    .rpc("mark_posts_viewed", { p_ids: ids })
    .then(({ error }) => error && console.warn("[feed] mark_posts_viewed:", error.message));
}

export function hidePost(id: string) {
  return write<void>("hide_post", { p_post: id });
}

export function reportPost(id: string, reason: ReportReason, note?: string) {
  return write<void>("report_post", { p_post: id, p_reason: reason, p_note: note ?? null });
}

/** Blocking is mutual invisibility and it also drops any follow in either direction. */
export function blockUser(userId: string) {
  return write<void>("block_user", { p_user: userId });
}

export function unblockUser(userId: string) {
  return write<void>("unblock_user", { p_user: userId });
}

/** Muting hides their posts from your feed but leaves the follow intact. */
export function muteUser(userId: string, on = true) {
  return write<void>("mute_user", { p_user: userId, p_on: on });
}

// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═════════════════════════════════════════════════════════════════════════════

export async function listNotifications(limit = 30, offset = 0): Promise<SocialNotification[]> {
  const { data, error } = await supabase.rpc("list_notifications", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    console.warn("[feed] list_notifications:", error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    ...r,
    post_media: Array.isArray(r?.post_media) ? r.post_media : [],
  }));
}

export async function unreadNotificationCount(): Promise<number> {
  const { data, error } = await supabase.rpc("unread_notification_count");
  if (error) {
    console.warn("[feed] unread_notification_count:", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

/** Omit `ids` to mark the whole inbox read. Returns how many rows changed. */
export async function markNotificationsRead(ids?: string[]): Promise<number> {
  const { data, error } = await supabase.rpc("mark_notifications_read", {
    p_ids: ids ?? null,
  });
  if (error) {
    console.warn("[feed] mark_notifications_read:", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

// ═════════════════════════════════════════════════════════════════════════════
// ADS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ads are drawn per feed page, not per app session, so a long scroll does not
 * repeat one creative forever. The auction — targeting, weighting, daily caps —
 * runs in the database; the client only asks for `limit` of them.
 */
export async function serveFeedAds(limit = 3): Promise<FeedAd[]> {
  const { data, error } = await supabase.rpc("serve_feed_ads", { p_limit: limit });
  if (error) {
    console.warn("[feed] serve_feed_ads:", error.message);
    return [];
  }
  return data ?? [];
}

/** Fire-and-forget: billing runs off these rows, but a dropped one is not fatal. */
export function recordAdEvent(adId: string, kind: "impression" | "click" | "dismiss") {
  supabase
    .rpc("record_ad_event", { p_ad: adId, p_kind: kind })
    .then(({ error }) => error && console.warn("[feed] record_ad_event:", error.message));
}

// ═════════════════════════════════════════════════════════════════════════════
// MEDIA UPLOAD
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Uploads one local file to the `post-media` bucket and returns its public URL.
 *
 * The path must start with the uploader's own id: the storage policy checks
 * `(storage.foldername(name))[1] = auth.uid()`, so a client cannot write into
 * someone else's folder even with a valid session.
 *
 * `File(...).bytes()` is expo-file-system's SDK 54 API and returns a Uint8Array.
 * The older `fetch(uri).blob()` route is unreliable for `file://` on iOS, which
 * is why it is not used here.
 */
export async function uploadPostMedia(
  localUri: string,
  kind: MediaKind,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error("Sign in to post media");

  const { File } = await import("expo-file-system");

  onProgress?.(0.05);
  const bytes = await new File(localUri).bytes();
  onProgress?.(0.4);

  const ext = (localUri.split("?")[0].split(".").pop() || (kind === "video" ? "mp4" : "jpg"))
    .toLowerCase()
    .slice(0, 5);
  const contentType =
    kind === "video"
      ? ext === "mov"
        ? "video/quicktime"
        : "video/mp4"
      : ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";

  // Collisions across two devices on one account are possible without the
  // random suffix, and the second upload would silently overwrite the first.
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from("post-media")
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(error.message);
  onProgress?.(0.9);

  const { data } = supabase.storage.from("post-media").getPublicUrl(path);
  onProgress?.(1);
  return data.publicUrl;
}

/**
 * Best-effort cleanup for media whose post never got created — the user backed
 * out of the composer after the upload finished. Failing here is not worth
 * surfacing; the file is orphaned, not harmful.
 */
export async function deletePostMedia(publicUrl: string) {
  const marker = "/post-media/";
  const i = publicUrl.indexOf(marker);
  if (i < 0) return;
  const path = publicUrl.slice(i + marker.length);
  const { error } = await supabase.storage.from("post-media").remove([path]);
  if (error) console.warn("[feed] deletePostMedia:", error.message);
}
