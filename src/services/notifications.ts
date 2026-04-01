/**
 * src/services/notifications.ts
 *
 * Handles expo-notifications setup and trip-end push notifications.
 * - Registers for push tokens
 * - Sends local notification to the current device on trip end
 * - Simulates SMS/notification to emergency contacts (logs for now)
 */

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import type { Trip, EmergencyContact } from "../models/types";
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
  emergencyContacts?: EmergencyContact[];
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

  // ── Notify emergency contacts (simulated — replace with Twilio/SMS API) ───
  if (role === "passenger" && payload.emergencyContacts?.length) {
    for (const contact of payload.emergencyContacts) {
      console.log(
        `[Notifications] [SMS → ${contact.name} (${contact.phone})] ` +
          `"${payload.trip.driver_id ? "Your contact" : "A passenger"} has arrived safely. ` +
          `Trip: ${route} on ${date} at ${time}. Trip code: ${trip.trip_code}."`
      );
      // TODO: Replace with real SMS via Twilio cloud function:
      // await fetch("https://your-n8n-or-cloud-fn.io/sms", {
      //   method: "POST",
      //   body: JSON.stringify({ to: contact.phone, message: `...` }),
      // });
    }
  }
}

// ─── SOS notification ─────────────────────────────────────────────────────────

export async function scheduleSOSNotification(
  trip: Trip,
  contacts: EmergencyContact[],
  locationStr: string
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🚨 SOS Alert Sent",
      body: `Emergency alert triggered on trip ${trip.trip_code}. Help is being notified.`,
      data: { tripId: trip.id, type: "sos" },
      sound: "default",
      ...(Platform.OS === "android" ? { channelId: "trip-alerts" } : {}),
    },
    trigger: null,
  });

  for (const contact of contacts) {
    console.log(
      `[Notifications] [SOS SMS → ${contact.name} (${contact.phone})] ` +
        `"EMERGENCY: Your contact needs help on trip ${trip.trip_code}. ` +
        `Location: ${locationStr}. Please call them immediately."`
    );
  }
}