// components/ios/useIOSAlert.tsx
//
// An imperative, drop-in replacement for React Native's `Alert.alert` that
// renders the kit's native-looking IOSAlert instead of the platform dialog.
//
// The point is migration cost: swapping a screen over is two lines plus the
// node, and the call sites keep the same shape they already had —
//
//   const { alert, alertNode } = useIOSAlert();
//
//   alert("Delete route?", "This can't be undone.", [
//     { text: "Cancel", style: "cancel" },
//     { text: "Delete", style: "destructive", onPress: doDelete },
//   ]);
//
//   return (<View>…{alertNode}</View>);
//
// The action shape matches Alert.alert's (`text` / `style` / `onPress`) so
// existing arrays can be passed through unchanged. An action's onPress fires
// after the sheet closes, which is what iOS does and what callers expect when
// the handler pushes a new screen.
//
// Note this deliberately does NOT change a screen's own colours or typography —
// only the dialog, which is system chrome and should look native.

import React, { useCallback, useMemo, useRef, useState } from "react";
import { IOSAlert, type IOSAlertAction } from "./IOSAlert";

// Button shape lives in AlertHost — one source of truth for both entry points.
import type { IOSAlertButton } from "./AlertHost";
export type { IOSAlertButton };

interface AlertRequest {
  title?: string;
  message?: string;
  buttons: IOSAlertButton[];
  variant: "alert" | "actionSheet";
}

export interface UseIOSAlert {
  /** Same signature as Alert.alert. */
  alert: (title?: string, message?: string, buttons?: IOSAlertButton[]) => void;
  /** Same, but presented as a bottom action sheet. */
  actionSheet: (title?: string, message?: string, buttons?: IOSAlertButton[]) => void;
  /** Render this once inside the screen's tree. */
  alertNode: React.ReactNode;
  /** Dismiss whatever is showing without running a handler. */
  dismiss: () => void;
}

const DEFAULT_BUTTONS: IOSAlertButton[] = [{ text: "OK", style: "default" }];

export function useIOSAlert(): UseIOSAlert {
  const [request, setRequest] = useState<AlertRequest | null>(null);

  // Handlers run after the dialog has closed; stash the pending one here so the
  // close animation isn't interrupted by a navigation push.
  const pending = useRef<(() => void) | null>(null);

  const present = useCallback(
    (variant: "alert" | "actionSheet") =>
      (title?: string, message?: string, buttons?: IOSAlertButton[]) => {
        pending.current = null;
        setRequest({
          title,
          message,
          buttons: buttons?.length ? buttons : DEFAULT_BUTTONS,
          variant,
        });
      },
    [],
  );

  const close = useCallback(() => {
    setRequest(null);
    const run = pending.current;
    pending.current = null;
    // Let the dismiss animation start before a handler navigates away.
    if (run) requestAnimationFrame(run);
  }, []);

  const dismiss = useCallback(() => {
    pending.current = null;
    setRequest(null);
  }, []);

  const actions: IOSAlertAction[] = useMemo(
    () =>
      (request?.buttons ?? []).map((b) => ({
        label: b.text,
        style: b.style,
        disabled: b.disabled,
        onPress: () => {
          pending.current = b.onPress ?? null;
          close();
        },
      })),
    [request, close],
  );

  const alertNode = (
    <IOSAlert
      visible={!!request}
      title={request?.title}
      message={request?.message}
      variant={request?.variant}
      actions={actions}
      onClose={close}
    />
  );

  return {
    alert: present("alert"),
    actionSheet: present("actionSheet"),
    alertNode,
    dismiss,
  };
}

export default useIOSAlert;
