// src/utils/haptics.ts
//
// Haptics that respect the Settings toggle.
//
// `expo-haptics` has no global mute, so every buzz has to check the setting.
// Import from here instead of calling expo-haptics directly and the toggle
// works everywhere for free:
//
//   import { haptics } from "@/src/utils/haptics";
//   haptics.success();
//   haptics.tap();
//
// Reads the store imperatively (getState) rather than via a hook, so it can be
// called from event handlers, services and store actions alike.

import * as Haptics from "expo-haptics";
import { useSettingsStore } from "../store/useSettingsStore";

function enabled(): boolean {
  return useSettingsStore.getState().hapticFeedback;
}

/** Fire-and-forget: a failed haptic must never break a user action. */
function safe(run: () => Promise<void>) {
  if (!enabled()) return;
  run().catch(() => {
    /* device without a taptic engine, or the OS refused — ignore */
  });
}

export const haptics = {
  /** Light tap — selection changes, chips, list rows. */
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Medium — confirming an action, opening a sheet. */
  press: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Heavy — significant, irreversible actions. */
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** Discrete selection tick, e.g. moving through a picker. */
  select: () => safe(() => Haptics.selectionAsync()),

  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

export default haptics;
