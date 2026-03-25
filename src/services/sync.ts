/**
 * src/services/sync.ts
 *
 * Offline-first sync layer between AsyncStorage (local) and Supabase (cloud).
 *
 * Strategy
 * ────────
 * Push  – find every local record where synced = false and upsert it to
 *          Supabase. On success mark the local copy as synced = true.
 *
 * Pull  – fetch records from Supabase that belong to the current user (or are
 *          relevant to them) and merge them into local storage using
 *          last-write-wins on updated_at.
 *
 * Conflict resolution – if a record exists both locally and remotely, the one
 * with the later updated_at wins. Remote wins on a tie. If the local copy is
 * newer it stays put and is pushed on the next cycle.
 *
 * This module is pure functions; it does NOT import from React and has no
 * side-effects except AsyncStorage writes and Supabase calls. The listener
 * setup lives in app/_layout.tsx so it is tied to the React lifecycle.
 */

import NetInfo from "@react-native-community/netinfo";
import { supabase } from "./supabase";
import {
  TripsStorage,
  PassengersStorage,
  RatingsStorage,
  BroadcastsStorage,
} from "./storage";
import type { Trip, Passenger, Rating, Broadcast } from "../models/types";

// ─── Connectivity guard ───────────────────────────────────────────────────────

/** Returns true only when the device has confirmed internet connectivity. */
async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return !!(state.isConnected && state.isInternetReachable);
}

// ─── Strip local-only fields before sending to Supabase ──────────────────────
// Supabase tables do not have `synced` or the nested `driver` / `user` joins.
// We omit any field that would cause a column-not-found error.

function stripLocalFields<T extends { synced?: boolean; updated_at?: string; driver?: unknown; user?: unknown }>(
  record: T
): Omit<T, "synced" | "driver" | "user"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { synced, driver, user, ...rest } = record as any;
  return rest;
}

// ─── Push phase ───────────────────────────────────────────────────────────────

async function pushTrips(userId: string): Promise<void> {
  const unsynced = await TripsStorage.getUnsynced();
  // Drivers only push their own trips.
  const mine = unsynced.filter((t) => t.driver_id === userId);
  if (!mine.length) return;

  for (const trip of mine) {
    try {
      const { error } = await supabase
        .from("trips")
        .upsert(stripLocalFields(trip), { onConflict: "id" });

      if (!error) {
        await TripsStorage.markAsSynced(trip.id);
      } else {
        console.warn("[Sync] pushTrips error for", trip.id, error.message);
      }
    } catch (err) {
      console.warn("[Sync] pushTrips network error", err);
    }
  }
}

async function pushPassengers(userId: string): Promise<void> {
  const unsynced = await PassengersStorage.getUnsynced();
  const mine = unsynced.filter((p) => p.user_id === userId);
  if (!mine.length) return;

  for (const passenger of mine) {
    try {
      const { error } = await supabase
        .from("passengers")
        .upsert(stripLocalFields(passenger), { onConflict: "id" });

      if (!error) {
        await PassengersStorage.markAsSynced(passenger.id);
      } else {
        console.warn("[Sync] pushPassengers error for", passenger.id, error.message);
      }
    } catch (err) {
      console.warn("[Sync] pushPassengers network error", err);
    }
  }
}

async function pushRatings(userId: string): Promise<void> {
  const unsynced = await RatingsStorage.getUnsynced();
  const mine = unsynced.filter((r) => r.rater_id === userId);
  if (!mine.length) return;

  for (const rating of mine) {
    try {
      const { error } = await supabase
        .from("ratings")
        .upsert(stripLocalFields(rating), { onConflict: "id" });

      if (!error) {
        await RatingsStorage.markAsSynced(rating.id);
      } else {
        console.warn("[Sync] pushRatings error for", rating.id, error.message);
      }
    } catch (err) {
      console.warn("[Sync] pushRatings network error", err);
    }
  }
}

async function pushBroadcasts(userId: string): Promise<void> {
  const unsynced = await BroadcastsStorage.getUnsynced();
  // Only park owners push broadcasts; filter by park_id === userId as a proxy.
  const mine = unsynced.filter((b) => b.park_id === userId);
  if (!mine.length) return;

  for (const broadcast of mine) {
    try {
      const { error } = await supabase
        .from("broadcasts")
        .upsert(stripLocalFields(broadcast), { onConflict: "id" });

      if (!error) {
        await BroadcastsStorage.markAsSynced(broadcast.id);
      } else {
        console.warn("[Sync] pushBroadcasts error for", broadcast.id, error.message);
      }
    } catch (err) {
      console.warn("[Sync] pushBroadcasts network error", err);
    }
  }
}

// ─── Pull phase ───────────────────────────────────────────────────────────────

/**
 * Pull trips that belong to this driver, or that this passenger has joined.
 * We use a "last 7 days" window to avoid pulling the entire table.
 */
async function pullTrips(userId: string, role: string, parkName?: string): Promise<void> {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from("trips")
      .select("*")
      .gte("created_at", since);

    if (role === "driver") {
      query = query.eq("driver_id", userId);
    } else if (role === "passenger") {
      // Pull trips this passenger has joined via the passengers table
      const { data: psgrs } = await supabase
        .from("passengers")
        .select("trip_id")
        .eq("user_id", userId);

      const tripIds = (psgrs ?? []).map((p: { trip_id: string }) => p.trip_id);
      if (!tripIds.length) return;
      query = query.in("id", tripIds);
    } else if (role === "park_owner" && parkName) {
      // Park owners see all active trips from drivers in their park
      // (requires a join or a view; we approximate with a separate query)
      const { data: driverRows } = await supabase
        .from("users")
        .select("id")
        .eq("park_name", parkName)
        .eq("role", "driver");

      const driverIds = (driverRows ?? []).map((d: { id: string }) => d.id);
      if (!driverIds.length) return;
      query = query.in("driver_id", driverIds);
    } else {
      return; // unknown role – skip
    }

    const { data, error } = await query;
    if (error) { console.warn("[Sync] pullTrips error", error.message); return; }

    for (const row of data ?? []) {
      await TripsStorage.mergeRemote(row as Trip);
    }
  } catch (err) {
    console.warn("[Sync] pullTrips network error", err);
  }
}

async function pullPassengers(userId: string, role: string): Promise<void> {
  try {
    if (role === "passenger") {
      const { data, error } = await supabase
        .from("passengers")
        .select("*")
        .eq("user_id", userId);

      if (error) { console.warn("[Sync] pullPassengers error", error.message); return; }
      for (const row of data ?? []) {
        await PassengersStorage.mergeRemote(row as Passenger);
      }
    } else if (role === "driver") {
      // Pull passengers from the driver's own trips
      const trips = await TripsStorage.getByDriverId(userId);
      if (!trips.length) return;
      const tripIds = trips.map((t) => t.id);

      const { data, error } = await supabase
        .from("passengers")
        .select("*")
        .in("trip_id", tripIds);

      if (error) { console.warn("[Sync] pullPassengers(driver) error", error.message); return; }
      for (const row of data ?? []) {
        await PassengersStorage.mergeRemote(row as Passenger);
      }
    }
  } catch (err) {
    console.warn("[Sync] pullPassengers network error", err);
  }
}

async function pullRatings(userId: string): Promise<void> {
  try {
    // Pull ratings where this user is either the rater or the rated party.
    const { data, error } = await supabase
      .from("ratings")
      .select("*")
      .or(`rater_id.eq.${userId},rated_id.eq.${userId}`);

    if (error) { console.warn("[Sync] pullRatings error", error.message); return; }
    for (const row of data ?? []) {
      await RatingsStorage.mergeRemote(row as Rating);
    }
  } catch (err) {
    console.warn("[Sync] pullRatings network error", err);
  }
}

async function pullBroadcasts(parkName?: string): Promise<void> {
  if (!parkName) return;
  try {
    // Broadcasts are keyed by park. We pull by matching park_id to users with
    // that park name (approximation until a parks table is populated).
    const { data: ownerRows } = await supabase
      .from("users")
      .select("id")
      .eq("park_name", parkName)
      .eq("role", "park_owner")
      .limit(1);

    const parkOwnerId = ownerRows?.[0]?.id;
    if (!parkOwnerId) return;

    const { data, error } = await supabase
      .from("broadcasts")
      .select("*")
      .eq("park_id", parkOwnerId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) { console.warn("[Sync] pullBroadcasts error", error.message); return; }
    for (const row of data ?? []) {
      await BroadcastsStorage.mergeRemote(row as Broadcast);
    }
  } catch (err) {
    console.warn("[Sync] pullBroadcasts network error", err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SyncUser {
  id: string;
  role: string;
  park_name?: string;
}

let _isSyncing = false; // simple mutex to prevent overlapping sync runs

/**
 * Push all local unsynced records to Supabase.
 * Safe to call at any time; bails out if already running or device is offline.
 */
export async function pushLocalChanges(user: SyncUser): Promise<void> {
  if (_isSyncing) return;
  if (!(await isOnline())) return;

  _isSyncing = true;
  try {
    await Promise.all([
      pushTrips(user.id),
      pushPassengers(user.id),
      pushRatings(user.id),
      pushBroadcasts(user.id),
    ]);
  } finally {
    _isSyncing = false;
  }
}

/**
 * Pull remote changes from Supabase and merge into local storage.
 * Safe to call at any time.
 */
export async function pullRemoteChanges(user: SyncUser): Promise<void> {
  if (!(await isOnline())) return;

  try {
    await pullTrips(user.id, user.role, user.park_name);
    await pullPassengers(user.id, user.role);
    await pullRatings(user.id);
    await pullBroadcasts(user.park_name);
  } catch (err) {
    console.warn("[Sync] pullRemoteChanges error", err);
  }
}

/**
 * Full bidirectional sync. Push first so local changes are not clobbered by
 * a pull that might bring down an older remote copy of the same record.
 */
export async function syncAll(user: SyncUser): Promise<void> {
  if (!(await isOnline())) {
    console.log("[Sync] Offline – skipping sync");
    return;
  }
  console.log("[Sync] Starting sync for user", user.id);
  await pushLocalChanges(user);
  await pullRemoteChanges(user);
  console.log("[Sync] Sync complete");
}

/**
 * Subscribe to connectivity changes and run syncAll whenever the device comes
 * back online. Returns the unsubscribe function – call it on unmount.
 */
export function startConnectivityListener(getUser: () => SyncUser | null): () => void {
  const unsubscribe = NetInfo.addEventListener((state) => {
    const online = !!(state.isConnected && state.isInternetReachable);
    if (online) {
      const user = getUser();
      if (user) {
        syncAll(user).catch((err) =>
          console.warn("[Sync] connectivity-triggered sync error", err)
        );
      }
    }
  });
  return unsubscribe;
}