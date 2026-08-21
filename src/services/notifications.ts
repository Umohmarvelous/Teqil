/**
 * src/services/notifications.ts
 *
 * Handles expo-notifications setup and trip-end push notifications.
 * - Registers for push tokens
 * - Sends local notification to the current device on trip end
 * - Fans trip and SOS alerts out to emergency contacts (src/services/emergencyContacts.ts)
 */

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import type { Trip } from "../models/types";
import { formatDate, formatTime } from "../utils/helpers";

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Permission + token ───────────────────────────────────────────────────────

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log("[Notifications] Push only works on physical devices");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("[Notifications] Permission not granted");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("trip-alerts", {
      name: "Trip Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00A651",
      sound: "default",
    });
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch (err) {
    console.warn("[Notifications] Could not get push token:", err);
    return null;
  }
}

// ─── Trip end notification (device-local) ─────────────────────────────────────

export interface TripEndNotifPayload {
  trip: Trip;
  role: "driver" | "passenger";
  /** Whether to fan this out to the user's emergency contacts. */
  notifyEmergencyContacts?: boolean;
  /** Whose trip it is, for the wording the contact reads. */
  userName?: string;
  /**
   * The contacts the server could not reach — no EMILGO account, so no way to
   * deliver without an SMS provider. Handed back so the caller can offer the
   * device's own composer instead of silently not telling them.
   */
  onUnreachable?: (
    unreachable: import("./emergencyContacts").UnreachableContact[],
    message: string,
  ) => void;
}

export async function scheduleTripEndNotification(
  payload: TripEndNotifPayload
): Promise<void> {
  const { trip, role } = payload;
  const date = formatDate(trip.start_time);
  const time = formatTime(trip.start_time);
  const route = `${trip.origin} → ${trip.destination}`;

  // ── Notify the current user (driver or passenger) ─────────────────────────
  await Notifications.scheduleNotificationAsync({
    content: {
      title:
        role === "driver"
          ? "✅ Trip Completed!"
          : "🎉 You've Arrived Safely!",
      body:
        role === "driver"
          ? `Your trip ${route} has ended. Check your earnings in History.`
          : `Your trip from ${trip.origin} to ${trip.destination} has ended. Stay safe!`,
      data: { tripId: trip.id, tripCode: trip.trip_code, screen: "history" },
      sound: "default",
      ...(Platform.OS === "android" ? { channelId: "trip-alerts" } : {}),
    },
    trigger: null, // fire immediately
  });

  // ── Notify emergency contacts ────────────────────────────────────────────
  //
  // This used to be a `console.log` per contact with a TODO pointing at Twilio.
  // The alert had never left the handset. It now goes through `ec_dispatch`,
  // which decides who is due to hear, delivers to the ones with an EMILGO
  // account, and logs every decision including the deliberate silences.
  //
  // The contacts it CANNOT reach come back rather than being dropped, because
  // there is still no SMS provider (SETUP-KEYS §4.8) and the honest fallback is
  // the user's own composer. Returning them lets the caller offer that.
  if (payload.notifyEmergencyContacts) {
    try {
      const EC = await import("./emergencyContacts");
      const { title, body } = EC.messageFor("trip_end", {
        name: payload.userName || "Your contact",
        tripCode: trip.trip_code,
      });
      const unreachable = await EC.dispatch({
        kind: "trip_end",
        title,
        body,
        tripId: trip.id,
        tripCode: trip.trip_code,
      });
      payload.onUnreachable?.(unreachable, body);
    } catch (e) {
      console.warn("[Notifications] emergency dispatch failed:", e);
    }
  }
}

// ─── SOS notification ─────────────────────────────────────────────────────────

/**
 * Fire an SOS.
 *
 * An SOS overrides mute, quiet hours and the pending-consent hold — the only
 * thing that stops it reaching a contact is that contact's own `notify_sos`
 * being off. Everything else about this function is arranged so that a failure
 * to reach someone is visible rather than swallowed.
 */
export async function scheduleSOSNotification(
  trip: Trip,
  userName: string,
  coords?: { lat: number; lng: number },
): Promise<import("./emergencyContacts").UnreachableContact[]> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🚨 SOS Alert Sent",
      body: `Emergency alert triggered on trip ${trip.trip_code}.`,
      data: { tripId: trip.id, type: "sos" },
      sound: "default",
      ...(Platform.OS === "android" ? { channelId: "trip-alerts" } : {}),
    },
    trigger: null,
  });

  try {
    const EC = await import("./emergencyContacts");
    const { title, body } = EC.messageFor("sos", {
      name: userName,
      tripCode: trip.trip_code,
      mapUrl: EC.mapLink(coords?.lat, coords?.lng),
    });
    return await EC.dispatch({
      kind: "sos",
      title,
      body,
      tripId: trip.id,
      tripCode: trip.trip_code,
      lat: coords?.lat,
      lng: coords?.lng,
    });
  } catch (e) {
    console.warn("[Notifications] SOS dispatch failed:", e);
    return [];
  }
}

/**
 * Tell the contacts a trip has begun.
 *
 * Separate from the trip-end path because the two carry different information
 * and are governed by different per-contact switches.
 */
export async function notifyTripStarted(
  trip: Trip,
  userName: string,
  coords?: { lat: number; lng: number },
): Promise<import("./emergencyContacts").UnreachableContact[]> {
  try {
    const EC = await import("./emergencyContacts");
    const { title, body } = EC.messageFor("trip_start", {
      name: userName,
      tripCode: trip.trip_code,
      place: trip.origin,
      mapUrl: EC.mapLink(coords?.lat, coords?.lng),
    });
    return await EC.dispatch({
      kind: "trip_start",
      title,
      body,
      tripId: trip.id,
      tripCode: trip.trip_code,
      lat: coords?.lat,
      lng: coords?.lng,
    });
  } catch (e) {
    console.warn("[Notifications] trip-start dispatch failed:", e);
    return [];
  }
}
