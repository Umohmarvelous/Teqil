// src/services/avatar.ts
//
// Getting a profile photo off the device and somewhere passengers can see it.
//
// ── The bug this exists to fix ─────────────────────────────────────────────
// Every screen that let someone pick a photo wrote the picker's `file://` URI
// straight into `users.profile_photo`. That path is inside the picking app's
// sandbox: it renders on the phone that chose it and nowhere else. A passenger
// checking a driver's face — the single thing a profile photo is FOR — saw a
// broken image, and so did the driver after a reinstall.
//
// ── Why `avatars` is public ────────────────────────────────────────────────
// An avatar is shown to strangers by design. Signing a URL for every face in a
// list of thirty drivers would be a round trip per row for content that is
// published anyway. `chat-media` is private because a chat is not published; an
// avatar is. See COMPLIANCE.md for where that line sits generally.

import * as ImagePicker from "expo-image-picker";

import { supabase } from "@/src/services/supabase";

export const AVATAR_BUCKET = "avatars";
/** The bucket's own ceiling. Refusing here beats a rejected upload. */
const MAX_BYTES = 5 * 1024 * 1024;

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", webp: "image/webp", heic: "image/heic",
};

export interface PickedPhoto {
  uri: string;
  width?: number;
  height?: number;
}

/** True when this value would render for anybody other than its owner. */
export function isRemotePhoto(uri: string | null | undefined): boolean {
  if (!uri) return false;
  // A data: URI is the generated initials avatar — self-contained, so it counts.
  return /^(https?:|data:)/.test(uri);
}

async function ensure(
  request: () => Promise<ImagePicker.PermissionResponse>,
  deniedMessage: string,
): Promise<boolean> {
  const res = await request();
  if (res.granted) return true;
  throw new Error(deniedMessage);
}

/** Square, because every avatar in the app is rendered in a circle. */
const SQUARE: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.85,
};

export async function pickFromLibrary(): Promise<PickedPhoto | null> {
  await ensure(
    () => ImagePicker.requestMediaLibraryPermissionsAsync(),
    "Allow photo access in Settings to choose a picture.",
  );
  const res = await ImagePicker.launchImageLibraryAsync(SQUARE);
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  return { uri: a.uri, width: a.width, height: a.height };
}

export async function takePhoto(): Promise<PickedPhoto | null> {
  await ensure(
    () => ImagePicker.requestCameraPermissionsAsync(),
    "Allow camera access in Settings to take a picture.",
  );
  const res = await ImagePicker.launchCameraAsync({ ...SQUARE, cameraType: ImagePicker.CameraType.front });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  return { uri: a.uri, width: a.width, height: a.height };
}

/**
 * Upload and return a PUBLIC URL.
 *
 * The path's first segment is the uploader's id, because that is exactly what
 * the storage policy checks — which is what stops one user replacing another's
 * face. `new File(uri).bytes()` is expo-file-system's SDK 54 API;
 * `fetch(uri).blob()` is unreliable for `file://` on iOS.
 */
export async function uploadAvatar(localUri: string): Promise<string> {
  // Already remote (or a generated data-URI avatar) — nothing to upload, and
  // re-uploading would orphan a copy on every save.
  if (isRemotePhoto(localUri)) return localUri;

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error("Sign in to change your photo.");

  const { File } = await import("expo-file-system");
  const bytes = await new File(localUri).bytes();

  if (bytes.byteLength > MAX_BYTES) {
    throw new Error("That picture is too large. Pick one under 5 MB.");
  }

  const ext = (localUri.split("?")[0].split(".").pop() || "jpg").toLowerCase().slice(0, 4);
  const contentType = MIME[ext] ?? "image/jpeg";
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Best-effort cleanup of the previous avatar.
 *
 * Failing is not worth surfacing — the old file is orphaned, not harmful — and
 * it must never block a save the user already saw succeed.
 */
export async function deleteAvatar(publicUrl: string | null | undefined): Promise<void> {
  if (!publicUrl) return;
  const marker = `/${AVATAR_BUCKET}/`;
  const i = publicUrl.indexOf(marker);
  if (i < 0) return;
  const path = publicUrl.slice(i + marker.length);
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) console.warn("[avatar] delete:", error.message);
}
