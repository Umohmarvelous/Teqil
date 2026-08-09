// components/ios/AlertHost.tsx
//
// A single, app-wide host for native-looking dialogs, so replacing React
// Native's `Alert.alert` across the app is a one-line change per call site
// rather than adding modal state and a mounted node to every screen.
//
// Mount <AlertHost /> once, at the root:
//
//   // app/_layout.tsx
//   <AlertHost />
//
// Then anywhere — including services and store actions, which have no React
// tree of their own:
//
//   import { iosAlert } from "@/components/ios";
//
//   iosAlert("Delete route?", "This can't be undone.", [
//     { text: "Cancel", style: "cancel" },
//     { text: "Delete", style: "destructive", onPress: doDelete },
//   ]);
//
// The signature matches Alert.alert exactly (`text` / `style` / `onPress`), so
// existing button arrays port over untouched.
//
// This changes only the dialog, which is system chrome and should look native.
// A screen's own colours, typography and layout are untouched.

import React, { useEffect, useRef, useState } from "react";
import { IOSAlert, type IOSAlertAction } from "./IOSAlert";

/** Mirrors React Native's AlertButton so call sites port over verbatim. */
export interface IOSAlertButton {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
  disabled?: boolean;
}

interface AlertRequest {
  id: number;
  title?: string;
  message?: string;
  buttons: IOSAlertButton[];
  variant: "alert" | "actionSheet";
}

const DEFAULT_BUTTONS: IOSAlertButton[] = [{ text: "OK", style: "default" }];

// ─── Imperative surface ──────────────────────────────────────────────────────

type Listener = (r: AlertRequest) => void;

let listener: Listener | null = null;
let nextId = 1;
/** Requests raised before the host mounted (e.g. during early startup). */
const queue: AlertRequest[] = [];

function raise(
  variant: "alert" | "actionSheet",
  title?: string,
  message?: string,
  buttons?: IOSAlertButton[],
) {
  const request: AlertRequest = {
    id: nextId++,
    title,
    message,
    buttons: buttons?.length ? buttons : DEFAULT_BUTTONS,
    variant,
  };
  if (listener) listener(request);
  else queue.push(request);
}

/** Drop-in for `Alert.alert`. */
export function iosAlert(title?: string, message?: string, buttons?: IOSAlertButton[]) {
  raise("alert", title, message, buttons);
}

/** Same, presented as a bottom action sheet. */
export function iosActionSheet(
  title?: string,
  message?: string,
  buttons?: IOSAlertButton[],
) {
  raise("actionSheet", title, message, buttons);
}

// ─── Host ────────────────────────────────────────────────────────────────────

export function AlertHost() {
  const [request, setRequest] = useState<AlertRequest | null>(null);

  // Handlers run after the dialog closes, so a handler that navigates doesn't
  // interrupt the dismiss animation — the same order iOS uses.
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    listener = (r) => setRequest(r);
    // Flush anything raised before mount.
    const queued = queue.splice(0, queue.length);
    if (queued.length) setRequest(queued[queued.length - 1]);
    return () => {
      listener = null;
    };
  }, []);

  const close = () => {
    setRequest(null);
    const run = pending.current;
    pending.current = null;
    if (run) requestAnimationFrame(run);
  };

  const actions: IOSAlertAction[] = (request?.buttons ?? []).map((b) => ({
    label: b.text,
    style: b.style,
    disabled: b.disabled,
    onPress: () => {
      pending.current = b.onPress ?? null;
      close();
    },
  }));

  return (
    <IOSAlert
      // Remount per request so a second dialog can't inherit the first's state.
      key={request?.id ?? "idle"}
      visible={!!request}
      title={request?.title}
      message={request?.message}
      variant={request?.variant}
      actions={actions}
      onClose={close}
    />
  );
}

export default AlertHost;
