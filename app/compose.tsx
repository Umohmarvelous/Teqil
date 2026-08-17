// app/compose.tsx
//
// The composer: new post, reply, quote, and edit.
//
// One screen covers all four because they differ only in what they attach to,
// and splitting them would mean four copies of the media pipeline, the character
// counter and the draft handling — and four places for them to drift apart.
// Which mode it is comes from the route params:
//
//   /compose                      → new post
//   /compose?replyTo=<id>         → reply
//   /compose?quoteOf=<id>         → quote
//   /compose?edit=<id>            → edit an existing post's text
//
// ── Uploads happen before the post exists ───────────────────────────────────
// Media is uploaded to storage as soon as it is picked, not on submit. Two
// reasons: the user gets a progress bar for the slow part while they are still
// typing, and `create_post` receives finished public URLs, so a post can never
// exist referring to a file that failed to upload. The cost is orphaned files
// when someone backs out — `deletePostMedia` cleans those up on cancel.
//
// ── Drafts ──────────────────────────────────────────────────────────────────
// The body, the attachments and the poll are mirrored into the feed store,
// which persists them. A half-written post surviving a backgrounded app is the
// whole reason that store persists anything at all.

import React from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  Image01Icon,
  Camera01Icon,
  ChartBarLineIcon,
  Location01Icon,
  Cancel01Icon,
  GlobalIcon,
  UserGroupIcon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { Glass, iosAlert, useIOSTheme } from "@/components/ios";
import { IOSAppFont } from "@/components/ios/theme";
import Avatar from "@/components/Avatar";
import { useAuthStore } from "@/src/store/useStore";
import { useFeedStore } from "@/src/store/useFeedStore";
import { uploadPostMedia, deletePostMedia, fetchPost, type PostMedia } from "@/src/services/feed";

/** Matches the CHECK constraint on posts.body. Keep the two in step. */
const MAX_BODY = 500;
const MAX_MEDIA = 4;
/** Below this many characters left, the counter turns into a warning. */
const COUNTER_WARN = 40;

type Attachment = PostMedia & {
  /** Local uri while uploading; cleared once the public URL lands. */
  localUri?: string;
  uploading?: boolean;
  progress?: number;
  failed?: boolean;
};

const POLL_HOURS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
];

export default function ComposeScreen() {
  const params = useLocalSearchParams<{ replyTo?: string; quoteOf?: string; edit?: string }>();
  const t = useIOSTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  const submit = useFeedStore((s) => s.submit);
  const editPost = useFeedStore((s) => s.edit);
  const draft = useFeedStore((s) => s.draft);
  const setDraft = useFeedStore((s) => s.setDraft);
  const resetDraft = useFeedStore((s) => s.resetDraft);
  const storePosts = useFeedStore((s) => s.posts);

  const mode = params.edit ? "edit" : params.replyTo ? "reply" : params.quoteOf ? "quote" : "new";
  const target = params.edit || params.replyTo || params.quoteOf;
  const targetPost = target ? storePosts[target] : undefined;

  // An edit starts from the existing text rather than from the saved draft —
  // the draft belongs to the post you were writing, not the one you are fixing.
  const [body, setBody] = React.useState(() => (mode === "edit" ? "" : draft.body));
  const [media, setMedia] = React.useState<Attachment[]>(() =>
    mode === "edit" ? [] : (draft.media as Attachment[]),
  );
  const [place, setPlace] = React.useState<string | null>(mode === "edit" ? null : draft.place);
  const [visibility, setVisibility] = React.useState<"public" | "followers">("public");
  const [poll, setPoll] = React.useState<{ options: string[]; hours: number } | null>(
    mode === "edit" ? null : draft.poll,
  );
  const [busy, setBusy] = React.useState(false);
  const [loadedEdit, setLoadedEdit] = React.useState(mode !== "edit");

  React.useEffect(() => {
    if (mode !== "edit" || !params.edit) return;
    const known = storePosts[params.edit];
    if (known) {
      setBody(known.body);
      setLoadedEdit(true);
      return;
    }
    fetchPost(params.edit).then((p) => {
      if (p) setBody(p.body);
      setLoadedEdit(true);
    });
  }, [mode, params.edit, storePosts]);

  // Mirror into the persisted draft, but never while editing — otherwise fixing
  // a typo in an old post would overwrite the new post you had half written.
  React.useEffect(() => {
    if (mode === "edit") return;
    setDraft({ body, media, place, poll, replyTo: params.replyTo ?? null, quoteOf: params.quoteOf ?? null });
  }, [body, media, place, poll, mode, params.replyTo, params.quoteOf, setDraft]);

  const remaining = MAX_BODY - body.length;
  const uploading = media.some((m) => m.uploading);
  const canPost =
    !busy &&
    !uploading &&
    remaining >= 0 &&
    (mode === "edit"
      ? body.trim().length > 0
      : body.trim().length > 0 || media.length > 0 || !!poll);

  // ── Media ─────────────────────────────────────────────────────────────────

  const attach = React.useCallback(
    async (assets: ImagePicker.ImagePickerAsset[]) => {
      const room = MAX_MEDIA - media.length;
      const batch = assets.slice(0, room);

      for (const a of batch) {
        const kind: "image" | "video" = a.type === "video" ? "video" : "image";
        const entry: Attachment = {
          url: "",
          type: kind,
          width: a.width,
          height: a.height,
          duration: a.duration ? a.duration / 1000 : undefined,
          localUri: a.uri,
          uploading: true,
          progress: 0,
        };
        setMedia((m) => [...m, entry]);

        try {
          const url = await uploadPostMedia(a.uri, kind, (f) =>
            setMedia((m) =>
              m.map((x) => (x.localUri === a.uri ? { ...x, progress: f } : x)),
            ),
          );
          setMedia((m) =>
            m.map((x) => (x.localUri === a.uri ? { ...x, url, uploading: false, progress: 1 } : x)),
          );
        } catch (e: any) {
          setMedia((m) =>
            m.map((x) => (x.localUri === a.uri ? { ...x, uploading: false, failed: true } : x)),
          );
          iosAlert("Upload failed", e?.message ?? "Could not upload that file.");
        }
      }
    },
    [media.length],
  );

  const pickLibrary = async () => {
    if (poll) {
      iosAlert("One or the other", "A post can have media or a poll, not both.");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      iosAlert("Photos access needed", "Allow photo access in Settings to attach media.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_MEDIA - media.length,
      quality: 0.85,
      videoMaxDuration: 140,
    });
    if (!res.canceled) attach(res.assets);
  };

  const pickCamera = async () => {
    if (poll) {
      iosAlert("One or the other", "A post can have media or a poll, not both.");
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      iosAlert("Camera access needed", "Allow camera access in Settings to take a photo.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!res.canceled) attach(res.assets);
  };

  const removeMedia = (i: number) => {
    const gone = media[i];
    setMedia((m) => m.filter((_, x) => x !== i));
    // Already uploaded means there is a file in the bucket to reclaim.
    if (gone?.url) deletePostMedia(gone.url);
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const post = async () => {
    if (!canPost) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (mode === "edit" && params.edit) {
        await editPost(params.edit, body.trim());
      } else {
        await submit({
          body: body.trim(),
          media: media
            .filter((m) => m.url && !m.failed)
            .map(({ localUri, uploading, progress, failed, ...keep }) => keep),
          replyTo: params.replyTo ?? null,
          quoteOf: params.quoteOf ?? null,
          place,
          visibility,
          poll,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      iosAlert("Could not post", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    const hasContent = body.trim().length > 0 || media.length > 0 || poll;
    if (!hasContent) {
      router.back();
      return;
    }
    iosAlert("Discard this post?", "Your draft and any attachments will be removed.", [
      { text: "Keep writing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          // Reclaim anything already in the bucket; otherwise every abandoned
          // draft leaves a file nobody will ever reference.
          media.forEach((m) => m.url && deletePostMedia(m.url));
          if (mode !== "edit") resetDraft();
          router.back();
        },
      },
    ]);
  };

  const title =
    mode === "edit" ? "Edit post" : mode === "reply" ? "Reply" : mode === "quote" ? "Quote" : "New post";

  if (!loadedEdit) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: t.systemBackground }]}>
        <ActivityIndicator color={t.tint} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: t.systemBackground }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Bar */}
      <View style={[styles.bar, { paddingTop: insets.top, borderBottomColor: t.separator }]}>
        <Pressable onPress={cancel} hitSlop={10}>
          <Text style={[styles.barAction, { color: t.tint }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.barTitle, { color: t.label }]}>{title}</Text>
        <Pressable
          onPress={post}
          disabled={!canPost}
          style={[
            styles.postBtn,
            { backgroundColor: canPost ? t.tint : t.tertiarySystemFill },
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={[styles.postBtnText, { color: canPost ? "#fff" : t.tertiaryLabel }]}>
              {mode === "edit" ? "Save" : mode === "reply" ? "Reply" : "Post"}
            </Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* What this post attaches to, so the user can see it while writing. */}
        {targetPost && mode !== "edit" ? (
          <View style={[styles.context, { borderColor: t.separator }]}>
            <Text style={[styles.contextLabel, { color: t.tertiaryLabel }]}>
              {mode === "reply" ? "Replying to" : "Quoting"} @
              {targetPost.author_username ?? targetPost.author_name}
            </Text>
            <Text style={[styles.contextBody, { color: t.secondaryLabel }]} numberOfLines={3}>
              {targetPost.body}
            </Text>
          </View>
        ) : null}

        <View style={styles.editorRow}>
          <Avatar name={user?.full_name || "You"} photoUri={user?.profile_photo} size={40} />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={
              mode === "reply" ? "Post your reply" : "What's happening on the road?"
            }
            placeholderTextColor={t.tertiaryLabel}
            multiline
            autoFocus
            style={[styles.input, { color: t.label }]}
            // Not maxLength: a hard cap silently swallows a paste, which reads
            // as the app being broken. The counter goes red instead and Post
            // disables, so the user can see what to cut.
          />
        </View>

        {/* Attachments */}
        {media.length ? (
          <View style={styles.thumbs}>
            {media.map((m, i) => (
              <View key={m.localUri ?? m.url ?? i} style={styles.thumb}>
                <Image
                  source={{ uri: m.localUri || m.url }}
                  style={styles.thumbImage}
                  resizeMode="cover"
                />
                {m.uploading ? (
                  <View style={styles.thumbOverlay}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.thumbProgress}>
                      {Math.round((m.progress ?? 0) * 100)}%
                    </Text>
                  </View>
                ) : null}
                {m.failed ? (
                  <View style={[styles.thumbOverlay, { backgroundColor: "rgba(200,30,30,0.55)" }]}>
                    <Text style={styles.thumbProgress}>Failed</Text>
                  </View>
                ) : null}
                {m.type === "video" ? (
                  <View style={styles.thumbBadge}>
                    <Text style={styles.thumbBadgeText}>VIDEO</Text>
                  </View>
                ) : null}
                <Pressable onPress={() => removeMedia(i)} hitSlop={8} style={styles.thumbClose}>
                  <HugeiconsIcon icon={Cancel01Icon} size={13} color="#fff" strokeWidth={2.5} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {/* Poll */}
        {poll ? (
          <View style={[styles.pollBox, { borderColor: t.separator }]}>
            {poll.options.map((o, i) => (
              <TextInput
                key={i}
                value={o}
                onChangeText={(v) =>
                  setPoll((p) =>
                    p ? { ...p, options: p.options.map((x, j) => (j === i ? v : x)) } : p,
                  )
                }
                placeholder={`Choice ${i + 1}`}
                placeholderTextColor={t.tertiaryLabel}
                maxLength={80}
                style={[
                  styles.pollInput,
                  { borderColor: t.separator, color: t.label },
                ]}
              />
            ))}

            <View style={styles.pollFooter}>
              {poll.options.length < 4 ? (
                <Pressable
                  onPress={() => setPoll((p) => (p ? { ...p, options: [...p.options, ""] } : p))}
                >
                  <Text style={[styles.pollAction, { color: t.tint }]}>Add choice</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable
                onPress={() =>
                  iosAlert(
                    "Poll length",
                    undefined,
                    POLL_HOURS.map((h) => ({
                      text: h.label,
                      onPress: () => setPoll((p) => (p ? { ...p, hours: h.hours } : p)),
                    })).concat([{ text: "Cancel", style: "cancel" } as any]),
                  )
                }
              >
                <Text style={[styles.pollAction, { color: t.tint }]}>
                  {POLL_HOURS.find((h) => h.hours === poll.hours)?.label ?? "1 day"}
                </Text>
              </Pressable>
              <Pressable onPress={() => setPoll(null)} hitSlop={8}>
                <HugeiconsIcon icon={Delete02Icon} size={17} color={t.systemRed} strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        ) : null}

        {place ? (
          <Pressable onPress={() => setPlace(null)} style={styles.placeChip}>
            <HugeiconsIcon icon={Location01Icon} size={14} color={t.tint} strokeWidth={2} />
            <Text style={[styles.placeText, { color: t.tint }]}>{place}</Text>
            <HugeiconsIcon icon={Cancel01Icon} size={12} color={t.tint} strokeWidth={2.5} />
          </Pressable>
        ) : null}
      </ScrollView>

      {/* Toolbar. Edit mode hides it: `edit_post` changes only the body, and
          offering controls that cannot take effect is worse than not offering
          them. */}
      {mode !== "edit" ? (
        <View style={[styles.toolbar, { paddingBottom: insets.bottom + 8, borderTopColor: t.separator }]}>
          <Glass
            variant="regular"
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            fallbackIntensity={60}
            fallbackTint={t.systemBackground}
          />

          <Pressable onPress={pickLibrary} hitSlop={8} disabled={media.length >= MAX_MEDIA}>
            <HugeiconsIcon
              icon={Image01Icon}
              size={22}
              color={media.length >= MAX_MEDIA ? t.tertiaryLabel : t.tint}
              strokeWidth={2}
            />
          </Pressable>
          <Pressable onPress={pickCamera} hitSlop={8} disabled={media.length >= MAX_MEDIA}>
            <HugeiconsIcon
              icon={Camera01Icon}
              size={22}
              color={media.length >= MAX_MEDIA ? t.tertiaryLabel : t.tint}
              strokeWidth={2}
            />
          </Pressable>
          <Pressable
            onPress={() => {
              if (media.length) {
                iosAlert("One or the other", "A post can have media or a poll, not both.");
                return;
              }
              setPoll((p) => (p ? null : { options: ["", ""], hours: 24 }));
            }}
            hitSlop={8}
          >
            <HugeiconsIcon
              icon={ChartBarLineIcon}
              size={22}
              color={poll ? t.tint : media.length ? t.tertiaryLabel : t.tint}
              strokeWidth={2}
            />
          </Pressable>
          <Pressable
            onPress={() =>
              iosAlert("Add a place", "Where is this about?", [
                { text: "Cancel", style: "cancel" },
                ...["Lagos", "Abuja", "Port Harcourt", "Kano", "Ibadan"].map((c) => ({
                  text: c,
                  onPress: () => setPlace(c),
                })),
              ])
            }
            hitSlop={8}
          >
            <HugeiconsIcon icon={Location01Icon} size={22} color={t.tint} strokeWidth={2} />
          </Pressable>

          <View style={styles.spacer} />

          <Pressable
            onPress={() => setVisibility((v) => (v === "public" ? "followers" : "public"))}
            style={styles.visibility}
            hitSlop={8}
          >
            <HugeiconsIcon
              icon={visibility === "public" ? GlobalIcon : UserGroupIcon}
              size={16}
              color={t.tint}
              strokeWidth={2}
            />
            <Text style={[styles.visibilityText, { color: t.tint }]}>
              {visibility === "public" ? "Everyone" : "Followers"}
            </Text>
          </Pressable>

          <Text
            style={[
              styles.counter,
              { color: remaining < 0 ? t.systemRed : remaining <= COUNTER_WARN ? t.systemOrange : t.tertiaryLabel },
            ]}
          >
            {remaining}
          </Text>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },

  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barAction: { ...IOSAppFont.body },
  barTitle: { ...IOSAppFont.headline, flex: 1, textAlign: "center" },
  postBtn: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 7, minWidth: 68, alignItems: "center" },
  postBtnText: { ...IOSAppFont.subheadline, fontFamily: "Poppins_600SemiBold" },

  scroll: { padding: 16, paddingBottom: 40 },

  context: { borderLeftWidth: 2, paddingLeft: 10, marginBottom: 14, gap: 2 },
  contextLabel: { ...IOSAppFont.caption1 },
  contextBody: { ...IOSAppFont.footnote, lineHeight: 18 },

  editorRow: { flexDirection: "row", gap: 12 },
  input: { flex: 1, ...IOSAppFont.body, minHeight: 120, paddingTop: 6, textAlignVertical: "top" },

  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14, paddingLeft: 52 },
  thumb: { width: 104, height: 104, borderRadius: 12, overflow: "hidden", backgroundColor: "#E5E7EB" },
  thumbImage: { width: "100%", height: "100%" },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  thumbProgress: { ...IOSAppFont.caption2, color: "#fff" },
  thumbBadge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  thumbBadgeText: { ...IOSAppFont.caption2, color: "#fff", fontSize: 9 },
  thumbClose: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },

  pollBox: { marginTop: 14, marginLeft: 52, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12, gap: 8 },
  pollInput: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, ...IOSAppFont.subheadline },
  pollFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 2 },
  pollAction: { ...IOSAppFont.footnote, fontFamily: "Poppins_600SemiBold" },

  placeChip: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 14, marginLeft: 52, alignSelf: "flex-start" },
  placeText: { ...IOSAppFont.footnote },

  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  spacer: { flex: 1 },
  visibility: { flexDirection: "row", alignItems: "center", gap: 4 },
  visibilityText: { ...IOSAppFont.caption1 },
  counter: { ...IOSAppFont.footnote, fontVariant: ["tabular-nums"], minWidth: 30, textAlign: "right" },
});
