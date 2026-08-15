// src/services/proximity.ts
//
// Phase 7 — proximity. Three features, two data sources, no API key.
//
//   findNearby()          who is near me          → our own Supabase rows
//   fastest finger        discounted instant ride → our own Supabase rows
//   findFillingStations() nearest fuel            → OpenStreetMap Overpass
//
// ── Why nearby search needs no maps provider ─────────────────────────────────
// This is the point worth being clear about, because it is the assumption that
// costs people a billing account they never needed: finding a driver near you is
// not a maps question. The drivers are rows in OUR table with a lat/lng, so it is
// a radius query against our own database. That is how Bolt and Uber work too —
// they query their own fleet. A maps provider is only needed to DRAW the route,
// which is a separate, optional feature (see SETUP-KEYS.md §2.1).
//
// Filling stations are genuinely external data, and Overpass — OpenStreetMap's
// query API — serves them free, keyless and without a billing account.
//
// ── Offline-first ────────────────────────────────────────────────────────────
// Every read caches its last good result in AsyncStorage and returns it when the
// network fails, tagged `stale`, so the UI can say "showing last known" rather
// than an empty list. On Nigerian mobile data an empty list and a failed request
// look identical to a user, and only one of them is worth retrying.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NearbyUser {
  user_id: string;
  role: "driver" | "passenger" | "park_owner";
  full_name: string | null;
  username: string | null;
  profile_photo: string | null;
  driver_id: string | null;
  vehicle_details: string | null;
  avg_rating: number | null;
  lat: number;
  lng: number;
  heading: number | null;
  distance_km: number;
  updated_at: string;
}

export interface FastestFingerOffer {
  id: string;
  driver_id: string;
  driver_name: string | null;
  driver_photo: string | null;
  driver_rating: number | null;
  vehicle_details: string | null;
  origin: string;
  destination: string;
  base_fare: number;
  discounted_fare: number;
  seats_left: number;
  distance_km: number;
  expires_at: string;
  claimed_by_me: boolean;
}

export interface FillingStation {
  id: string;
  name: string;
  brand?: string;
  lat: number;
  lng: number;
  distance_km: number;
}

/** Every read reports whether it came from the network or the cache. */
export interface ProximityResult<T> {
  data: T;
  stale: boolean;
  error?: string;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const CACHE_PREFIX = "teqil.proximity.";

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeCache(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* a cache write failing must never fail the call it was serving */
  }
}

// ─── Presence ────────────────────────────────────────────────────────────────

/**
 * Publish my position so others can find me.
 *
 * Call this from the location tracker, NOT on a timer of its own — the tracker
 * already has a fresh fix and knows the user's accuracy/data-saver preferences,
 * and a second independent GPS consumer would double the battery cost of the
 * feature for no extra information.
 *
 * `isAvailable: false` keeps the row but hides it from searches, which is the
 * difference between a driver who is offline and one who is simply not taking
 * passengers right now.
 */
export async function publishPresence(opts: {
  lat: number;
  lng: number;
  isAvailable?: boolean;
  heading?: number | null;
  accuracy?: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("publish_presence", {
    p_lat: opts.lat,
    p_lng: opts.lng,
    p_is_available: opts.isAvailable ?? true,
    p_heading: opts.heading ?? null,
    p_accuracy: opts.accuracy ?? null,
  });

  if (error) {
    console.warn("[Proximity] publishPresence:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Stop being discoverable.
 *
 * Call on sign-out, and whenever the user turns off location sharing. Leaving a
 * row behind would keep someone on the map after they asked not to be — the row
 * expires from searches after 10 minutes, but "eventually" is not consent.
 */
export async function withdrawPresence(): Promise<void> {
  const { error } = await supabase.rpc("withdraw_presence");
  if (error) console.warn("[Proximity] withdrawPresence:", error.message);
}

// ─── Nearby people ───────────────────────────────────────────────────────────

export async function findNearby(opts: {
  lat: number;
  lng: number;
  radiusKm?: number;
  role?: "driver" | "passenger" | null;
  limit?: number;
}): Promise<ProximityResult<NearbyUser[]>> {
  const cacheKey = `nearby.${opts.role ?? "any"}`;

  const { data, error } = await supabase.rpc("find_nearby", {
    p_lat: opts.lat,
    p_lng: opts.lng,
    p_radius_km: opts.radiusKm ?? 5,
    p_role: opts.role ?? null,
    p_limit: opts.limit ?? 40,
  });

  if (error) {
    const cached = await readCache<NearbyUser[]>(cacheKey);
    return { data: cached ?? [], stale: true, error: error.message };
  }

  const rows = (data ?? []) as NearbyUser[];
  await writeCache(cacheKey, rows);
  return { data: rows, stale: false };
}

// ─── Fastest Finger ──────────────────────────────────────────────────────────

/** Offers near me, cheapest first. */
export async function findFastestFinger(opts: {
  lat: number;
  lng: number;
  radiusKm?: number;
  limit?: number;
}): Promise<ProximityResult<FastestFingerOffer[]>> {
  const { data, error } = await supabase.rpc("find_fastest_finger", {
    p_lat: opts.lat,
    p_lng: opts.lng,
    p_radius_km: opts.radiusKm ?? 5,
    p_limit: opts.limit ?? 30,
  });

  if (error) {
    const cached = await readCache<FastestFingerOffer[]>("fastestFinger");
    return { data: cached ?? [], stale: true, error: error.message };
  }

  const rows = (data ?? []) as FastestFingerOffer[];
  await writeCache("fastestFinger", rows);
  return { data: rows, stale: false };
}

/** Post an offer. Drivers only; the RLS policy enforces the driver is you. */
export async function createFastestFinger(opts: {
  origin: string;
  destination: string;
  baseFare: number;
  discountedFare: number;
  seats: number;
  lat: number;
  lng: number;
  /** How long it stays live. Short by design — this is an "leaving now" offer. */
  minutes?: number;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return { ok: false, error: "Not signed in" };

  const expiresAt = new Date(Date.now() + (opts.minutes ?? 15) * 60_000).toISOString();

  const { data, error } = await supabase
    .from("fastest_finger_offers")
    .insert({
      driver_id: me,
      origin: opts.origin,
      destination: opts.destination,
      base_fare: Math.round(opts.baseFare),
      discounted_fare: Math.round(opts.discountedFare),
      seats: opts.seats,
      lat: opts.lat,
      lng: opts.lng,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

export type ClaimOutcome =
  | { ok: true; alreadyClaimed: boolean; seatsLeft: number }
  | { ok: false; reason: string };

/**
 * Take a seat. First come, first served.
 *
 * The race is resolved in the database by a single guarded UPDATE, not here —
 * see the note in migration_proximity.sql. Two passengers tapping at the same
 * instant is the DESIGNED behaviour of this feature, so it must not depend on
 * client-side timing.
 */
export async function claimFastestFinger(offerId: string): Promise<ClaimOutcome> {
  const { data, error } = await supabase.rpc("claim_fastest_finger", { p_offer: offerId });

  if (error) return { ok: false, reason: error.message };

  // The RPC returns a single row: (ok, reason, seats_left).
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) {
    return { ok: false, reason: row?.reason ?? "unavailable" };
  }

  return {
    ok: true,
    alreadyClaimed: row.reason === "already_claimed",
    seatsLeft: row.seats_left ?? 0,
  };
}

/** Housekeeping — sweeps past-due offers so a driver's own list is honest. */
export async function expireFastestFinger(): Promise<void> {
  const { error } = await supabase.rpc("expire_fastest_finger");
  if (error) console.warn("[Proximity] expireFastestFinger:", error.message);
}

// ─── Filling stations (Overpass) ─────────────────────────────────────────────

/**
 * Overpass mirrors, tried in order.
 *
 * The main instance is volunteer-run and rate-limits under load (HTTP 429) — a
 * single hard-coded host means the feature simply stops working on a busy
 * evening. Falling through to a mirror costs nothing and removes that.
 */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/** Overpass asks for a real UA identifying the app, per its usage policy. */
const OVERPASS_UA = "Emilgo/1.0 (https://github.com/Umohmarvelous/Teqil)";

const R_EARTH_KM = 6371;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R_EARTH_KM * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Nearest filling stations from OpenStreetMap.
 *
 * `amenity=fuel` is the OSM tag for a petrol station. Both nodes and ways are
 * queried because a station mapped as a building footprint is a way, not a
 * point, and asking only for nodes silently misses many of the larger ones.
 * `out center` gives ways a single representative coordinate.
 */
export async function findFillingStations(opts: {
  lat: number;
  lng: number;
  radiusKm?: number;
  limit?: number;
}): Promise<ProximityResult<FillingStation[]>> {
  const radiusM = Math.round((opts.radiusKm ?? 5) * 1000);
  const query = `
    [out:json][timeout:20];
    (
      node["amenity"="fuel"](around:${radiusM},${opts.lat},${opts.lng});
      way["amenity"="fuel"](around:${radiusM},${opts.lat},${opts.lng});
    );
    out center tags;
  `;

  let lastError = "";

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      // Overpass can be slow when busy; without a timeout the screen would hang
      // on a spinner indefinitely rather than falling back to the cache.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": OVERPASS_UA,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        lastError = `Overpass ${response.status}`;
        continue;
      }

      const json = await response.json();
      const stations: FillingStation[] = (json.elements ?? [])
        .map((el: any) => {
          const lat = el.lat ?? el.center?.lat;
          const lng = el.lon ?? el.center?.lon;
          if (typeof lat !== "number" || typeof lng !== "number") return null;

          return {
            id: `${el.type}/${el.id}`,
            // Many Nigerian stations are mapped with a brand but no name.
            name: el.tags?.name ?? el.tags?.brand ?? el.tags?.operator ?? "Filling station",
            brand: el.tags?.brand,
            lat,
            lng,
            distance_km: haversineKm(opts.lat, opts.lng, lat, lng),
          };
        })
        .filter(Boolean)
        .sort((a: FillingStation, b: FillingStation) => a.distance_km - b.distance_km)
        .slice(0, opts.limit ?? 20);

      await writeCache("stations", stations);
      return { data: stations, stale: false };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "network error";
    }
  }

  const cached = await readCache<FillingStation[]>("stations");
  return { data: cached ?? [], stale: true, error: lastError };
}
