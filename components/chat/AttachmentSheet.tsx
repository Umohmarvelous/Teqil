// components/chat/AttachmentSheet.tsx
//
// The "+" in the composer: camera, photo/video library, document.
//
// ── Permissions are asked here, not at launch ──────────────────────────────
// Each picker requests its own permission at the moment it is used, and says in
// plain words what was refused. Asking for the camera on app start — before the
// user has any idea why — is the reliable way to get a permanent denial.
//
// ── What each option returns ───────────────────────────────────────────────
// A local `file://` uri plus the metadata the bubble needs to lay out before the
// image has loaded (width/height). Without the dimensions every photo renders at
// a fallback aspect ratio first and then snaps, which makes the whole thread
// jump as a chat scrolls.

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { HugeiconsIcon } from "@hugeicons/react-native";
import type { IconSvgElement } from "@hugeicons/react-native";
import { Camera01Icon, Image01Icon, Video01Icon, File01Icon } from "@hugeicons/core-free-icons";

import { IOSSheet, useIOSTheme, IOSAppFont, iosAlert } from "@/components/ios";
import type { ChatMediaKind } from "@/src/services/chat";

export interface PickedAttachment {
  uri: string;
  kind: ChatMediaKind;
  name?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

/** 50 MB — the bucket's own limit. Refusing here beats a failed upload. */
const MAX_BYTES = 50 * 1024 * 1024;

async function fromCamera(): Promise<PickedAttachment | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    iosAlert("Camera access needed", "Allow camera access in Settings to take a photo here.");
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images", "videos"],
    quality: 0.75,
  });
  return fromPickerResult(res);
}

async function fromLibrary(kind: "images" | "videos" | "both"): Promise<PickedAttachment | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    iosAlert("Photo access needed", "Allow photo access in Settings to send a photo here.");
    return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: kind === "both" ? ["images", "videos"] : kind === "videos" ? ["videos"] : ["images"],
    quality: 0.75,
  });
  return fromPickerResult(res);
}

function fromPickerResult(res: ImagePicker.ImagePickerResult): PickedAttachment | null {
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  if (a.fileSize && a.fileSize > MAX_BYTES) {
    iosAlert("Too large", "Attachments are limited to 50 MB.");
    return null;
  }
  return {
    uri: a.uri,
    kind: a.type === "video" ? "video" : "image",
    name: a.fileName ?? undefined,
    width: a.width,
    height: a.height,
    durationMs: a.duration ?? undefined,
  };
}

async function fromDocuments(): Promise<PickedAttachment | null> {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  if (a.size && a.size > MAX_BYTES) {
    iosAlert("Too large", "Attachments are limited to 50 MB.");
    return null;
  }
  return { uri: a.uri, kind: "file", name: a.name };
}

export interface AttachmentSheetProps {
  visible: boolean;
  onClose: () => void;
  onPicked: (a: PickedAttachment) => void;
}

interface Option {
  key: string;
  label: string;
  icon: IconSvgElement;
  colour: string;
  run: () => Promise<PickedAttachment | null>;
}

export function AttachmentSheet({ visible, onClose, onPicked }: AttachmentSheetProps) {
  const t = useIOSTheme();

  const options: Option[] = [
    { key: "camera", label: "Camera",   icon: Camera01Icon, colour: t.systemRed,   run: fromCamera },
    { key: "photo",  label: "Photos",   icon: Image01Icon,  colour: t.systemGreen, run: () => fromLibrary("images") },
    { key: "video",  label: "Videos",   icon: Video01Icon,  colour: t.systemOrange, run: () => fromLibrary("videos") },
    { key: "doc",    label: "Document", icon: File01Icon,   colour: t.systemBlue,   run: fromDocuments },
  ];

  const pick = (o: Option) => async () => {
    Haptics.selectionAsync();
    onClose();
    try {
      // The picker is a native modal. Opening it while the sheet is still
      // dismissing loses the presentation on iOS and nothing appears.
      await new Promise((r) => setTimeout(r, 220));
      const picked = await o.run();
      if (picked) onPicked(picked);
    } catch (e: any) {
      iosAlert("Could not attach", e?.message ?? "Please try again.");
    }
  };

  return (
    <IOSSheet visible={visible} onClose={onClose} detent={0.34} showGrabber dismissible title="Attach">
      <View style={styles.grid}>
        {options.map((o) => (
          <Pressable key={o.key} onPress={pick(o)} style={styles.cell} accessibilityRole="button">
            <View style={[styles.tile, { backgroundColor: o.colour + "22" }]}>
              <HugeiconsIcon icon={o.icon} size={26} color={o.colour} strokeWidth={1.9} />
            </View>
            <Text style={[styles.label, { color: t.secondaryLabel }]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </IOSSheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-around", paddingTop: 8, rowGap: 18 },
  cell: { alignItems: "center", gap: 8, width: "25%" },
  tile: { width: 60, height: 60, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  label: { ...IOSAppFont.caption1 },
});

export default AttachmentSheet;
