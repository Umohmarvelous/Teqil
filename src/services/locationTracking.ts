// src/services/locationTracking.ts
//
// GPS tracking engine for live trips and free rides.
//
// One tracking session runs at a time. A session:
//   - filters raw GPS fixes (accuracy, jitter, teleports) before they count,
//   - accumulates distance / duration / speed and (for paid trips) fare,
//   - feeds useTripStore so the live map can render,
//   - broadcasts position on a single Supabase Realtime channel (throttled),
//   - checkpoints itself to AsyncStorage so an app kill mid-ride doesn't lose
//     the track,
//   - persists a simplified polyline to `route_history` when it stops.
//
// Free rides pass `compulsory: true`: GPS is a condition of the ride, so the
// "share location during trips" toggle is switched on for the user rather than
// blocking the ride. Everything else respects the toggle.

import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore, useTripStore } from '../store/useStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { supabase } from './supabase';
import { publishPresence } from './proximity';
import type { LiveLocation } from '../models/types';

// ─── Tunables ────────────────────────────────────────────────────────────────

/** Naira per km accrued on a paid trip. Free rides pass 0. */
const FARE_PER_KM = 30;

/** Fixes reported with worse horizontal accuracy than this are discarded. */
const MAX_ACCURACY_M = 50;
/** Movement below this is GPS jitter while stationary, not travel. */
const MIN_MOVE_M = 5;
/** A jump implying more than this between two fixes is a GPS teleport. */
const MAX_PLAUSIBLE_SPEED_KMH = 200;
/** Minimum gap between Realtime broadcasts. */
const BROADCAST_INTERVAL_MS = 3000;
/** Accepted fixes between AsyncStorage checkpoints. */
const CHECKPOINT_EVERY_N_POINTS = 10;
/** Upper bound on stored polyline vertices; the path is simplified to fit. */
const MAX_STORED_POINTS = 500;
/** Douglas–Peucker starting tolerance, in degrees (~1.1 m). */
const SIMPLIFY_TOLERANCE_DEG = 0.00001;

const PENDING_SESSION_KEY = 'teqil_pending_route_session';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TrackingContext = 'trip' | 'free_ride';
export type TrackingRole = 'driver' | 'passenger';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface TrackingSessionInit {
  /** Trip id, claim id, or an ad-hoc label — used for the Realtime channel. */
  sessionId: string;
  context?: TrackingContext;
  role?: TrackingRole;
  /** Free rides: GPS is mandatory, so enable the share-location setting rather
   *  than refusing to start. */
  compulsory?: boolean;
  /** Naira per km. Defaults to FARE_PER_KM for trips, 0 for free rides. */
  farePerKm?: number;
  tripId?: string | null;
  claimId?: string | null;
  originLabel?: string | null;
  destLabel?: string | null;
}

export interface TrackingSummary {
  sessionId: string;
  context: TrackingContext;
  role: TrackingRole;
  tripId: string | null;
  claimId: string | null;
  originLabel: string | null;
  destLabel: string | null;
  startedAt: string;
  endedAt: string;
  distanceKm: number;
  durationSeconds: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  fare: number;
  path: Coordinate[];
  pointCount: number;
  origin: Coordinate | null;
  dest: Coordinate | null;
  /** Local estimate; the authoritative flag is computed by a DB trigger. */
  gpsValidated: boolean;
  /** Row id in `route_history`, when the upload succeeded. */
  routeHistoryId: string | null;
}

export interface GpsStatus {
  granted: boolean;
  servicesEnabled: boolean;
  /** Both permission granted and device location services on. */
  ok: boolean;
}

// ─── Geo helpers ─────────────────────────────────────────────────────────────

/** Haversine distance in metres. */
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Perpendicular distance from p to the segment a→b, in degrees. */
function perpendicularDistance(p: Coordinate, a: Coordinate, b: Coordinate) {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  if (dx === 0 && dy === 0) {
    return Math.hypot(p.longitude - a.longitude, p.latitude - a.latitude);
  }
  const t =
    ((p.longitude - a.longitude) * dx + (p.latitude - a.latitude) * dy) /
    (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  return Math.hypot(
    p.longitude - (a.longitude + clamped * dx),
    p.latitude - (a.latitude + clamped * dy),
  );
}

/** Douglas–Peucker line simplification. */
function simplify(points: Coordinate[], tolerance: number): Coordinate[] {
  if (points.length < 3) return points;

  let maxDist = 0;
  let index = 0;
  const [first] = points;
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist <= tolerance) return [first, last];

  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

/** Simplify progressively until the path fits within MAX_STORED_POINTS. */
function fitPath(points: Coordinate[]): Coordinate[] {
  if (points.length <= MAX_STORED_POINTS) return points;
  let tolerance = SIMPLIFY_TOLERANCE_DEG;
  let out = points;
  // Each pass doubles the tolerance; bounded so this always terminates.
  for (let i = 0; i < 20 && out.length > MAX_STORED_POINTS; i++) {
    out = simplify(points, tolerance);
    tolerance *= 2;
  }
  // Last resort for pathological paths: uniform decimation.
  if (out.length > MAX_STORED_POINTS) {
    const step = Math.ceil(out.length / MAX_STORED_POINTS);
    out = out.filter((_, i) => i % step === 0 || i === out.length - 1);
  }
  return out;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuidOrNull(value?: string | null): string | null {
  return value && UUID_RE.test(value) ? value : null;
}

// ─── Session state ───────────────────────────────────────────────────────────

interface ActiveSession {
  init: Required<
    Pick<TrackingSessionInit, 'sessionId' | 'context' | 'role' | 'farePerKm'>
  > &
    TrackingSessionInit;
  startedAtMs: number;
  path: Coordinate[];
  /** Accepted fixes, including those merged into the polyline. */
  pointCount: number;
  distanceMeters: number;
  maxSpeedKmh: number;
  last: { latitude: number; longitude: number; timestamp: number } | null;
  lastBroadcastMs: number;
  channel: ReturnType<typeof supabase.channel> | null;
  subscription: Location.LocationSubscription | null;
}

let session: ActiveSession | null = null;

/** True while a tracking session is running. */
export function isTracking(): boolean {
  return session !== null;
}

// ─── Permissions ─────────────────────────────────────────────────────────────

/**
 * Check (and optionally request) foreground location permission plus device
 * location services. Never throws — callers gate on `ok`.
 */
export async function ensureGpsOn(
  opts: { request?: boolean } = {},
): Promise<GpsStatus> {
  const { request = true } = opts;
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted' && request) {
      status = (await Location.requestForegroundPermissionsAsync()).status;
    }
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    const granted = status === 'granted';
    return { granted, servicesEnabled, ok: granted && servicesEnabled };
  } catch {
    return { granted: false, servicesEnabled: false, ok: false };
  }
}

// ─── Start / stop ────────────────────────────────────────────────────────────

/**
 * Begin a tracking session.
 *
 * Accepts a bare trip id for backwards compatibility with the paid-trip
 * screens, or a full session descriptor.
 */
export async function startLocationTracking(
  input: string | TrackingSessionInit,
): Promise<void> {
  const raw: TrackingSessionInit =
    typeof input === 'string' ? { sessionId: input } : input;

  const context = raw.context ?? 'trip';
  const init = {
    ...raw,
    context,
    role: raw.role ?? 'passenger',
    farePerKm: raw.farePerKm ?? (context === 'free_ride' ? 0 : FARE_PER_KM),
  } satisfies ActiveSession['init'];

  // A free ride is GPS-tracked by agreement, so turn the setting on instead of
  // failing. Anything else honours the user's choice.
  const settings = useSettingsStore.getState();
  if (!settings.shareLocation) {
    if (init.compulsory) {
      settings.setShareLocation(true);
    } else {
      throw new Error(
        'Location sharing is turned off. Enable it in Settings to start a live trip.',
      );
    }
  }

  const gps = await ensureGpsOn();
  if (!gps.granted) throw new Error('Permission to access location was denied');
  if (!gps.servicesEnabled) {
    throw new Error('Location services are off. Turn on GPS and try again.');
  }

  // Replace any session left running by a previous screen.
  if (session) await stopLocationTracking();

  // One channel per session, subscribed once — every fix reuses it. Failures to
  // connect are non-fatal: tracking continues locally and the checkpoint on
  // disk still protects the route.
  const channel = supabase.channel(`trip_${init.sessionId}`);
  try {
    channel.subscribe();
  } catch {
    /* offline */
  }

  session = {
    init,
    startedAtMs: Date.now(),
    path: [],
    pointCount: 0,
    distanceMeters: 0,
    maxSpeedKmh: 0,
    last: null,
    lastBroadcastMs: 0,
    channel,
    subscription: null,
  };

  useTripStore.getState().setIsTracking(true);

  // Data saver trades track fidelity for battery and mobile data: coarser fixes,
  // sampled less often. The distance/validation maths is unchanged — a saver-mode
  // track is still a real track, just with fewer vertices.
  const saver = useSettingsStore.getState().dataSaver;

  session.subscription = await Location.watchPositionAsync(
    {
      accuracy: saver ? Location.Accuracy.Low : Location.Accuracy.Balanced,
      timeInterval: saver ? 15000 : 5000,
      distanceInterval: saver ? 40 : 10,
    },
    onFix,
  );
}

function onFix(location: Location.LocationObject) {
  if (!session) return;

  const { latitude, longitude, speed, accuracy } = location.coords;
  const timestamp = location.timestamp;

  // Reject low-confidence fixes outright.
  if (accuracy != null && accuracy > MAX_ACCURACY_M) return;

  const { last } = session;
  if (last) {
    const meters = distanceMeters(last.latitude, last.longitude, latitude, longitude);
    const elapsedSec = Math.max((timestamp - last.timestamp) / 1000, 0.001);
    const impliedKmh = (meters / 1000) / (elapsedSec / 3600);

    // GPS teleport — drop it rather than let it inflate distance and fare.
    if (impliedKmh > MAX_PLAUSIBLE_SPEED_KMH) return;

    if (meters >= MIN_MOVE_M) {
      session.distanceMeters += meters;
    } else {
      // Below the jitter threshold. Refresh the live speed/heading readout, but
      // keep the previous fix as the anchor — deliberately, so that crawling in
      // traffic still accumulates once the *cumulative* displacement crosses
      // the threshold, instead of being discarded fix by fix.
      publish(location, false);
      return;
    }
  }

  session.last = { latitude, longitude, timestamp };
  session.path.push({ latitude, longitude });
  session.pointCount += 1;

  const speedKmh = Math.max(speed ?? 0, 0) * 3.6;
  if (speedKmh <= MAX_PLAUSIBLE_SPEED_KMH && speedKmh > session.maxSpeedKmh) {
    session.maxSpeedKmh = speedKmh;
  }

  publish(location, true);

  if (session.pointCount % CHECKPOINT_EVERY_N_POINTS === 0) {
    void checkpoint();
  }
}

/** Push the fix into the store and (throttled) onto the Realtime channel. */
function publish(location: Location.LocationObject, moved: boolean) {
  if (!session) return;

  const { latitude, longitude, speed, heading, accuracy } = location.coords;
  const point: LiveLocation = {
    latitude,
    longitude,
    speed: speed ?? 0,
    heading: heading ?? 0,
    timestamp: location.timestamp,
  };

  const store = useTripStore.getState();
  const distanceKm = session.distanceMeters / 1000;

  store.setCurrentLocation(point);
  store.setSpeed(speed ?? 0);
  if (moved) {
    store.addRouteCoordinate({ latitude, longitude });
    store.setTripDistanceKm(distanceKm);
    store.setFare(distanceKm * session.init.farePerKm);
  }

  const now = Date.now();
  const interval = useSettingsStore.getState().dataSaver
    ? BROADCAST_INTERVAL_MS * 4
    : BROADCAST_INTERVAL_MS;
  if (now - session.lastBroadcastMs < interval) return;
  session.lastBroadcastMs = now;

  session.channel
    ?.send({
      type: 'broadcast',
      event: 'location_update',
      payload: {
        location: point,
        distance: distanceKm,
        fare: distanceKm * session.init.farePerKm,
        context: session.init.context,
      },
    })
    .catch(() => {
      // Offline — the checkpoint below is what protects the track.
      void checkpoint();
    });

  // Phase 7: make this position discoverable to people searching nearby.
  //
  // Deliberately piggybacking on the broadcast throttle rather than running its
  // own timer: this tracker already holds a fresh fix and already honours
  // `shareLocation` (checked before the session starts) and `dataSaver` (the
  // interval above). A second GPS consumer would double the battery cost of the
  // feature and could publish a position the user had just opted out of.
  void publishPresence({
    lat: latitude,
    lng: longitude,
    heading: heading ?? null,
    accuracy: accuracy ?? null,
  });
}

/**
 * Stop tracking, persist the route, and return what was recorded.
 * Returns null if no session was running.
 */
export async function stopLocationTracking(): Promise<TrackingSummary | null> {
  const current = session;
  if (!current) {
    useTripStore.getState().setIsTracking(false);
    return null;
  }
  session = null;

  current.subscription?.remove();
  try {
    await current.channel?.unsubscribe();
  } catch {
    /* best-effort */
  }

  useTripStore.getState().setIsTracking(false);

  const summary = summarize(current);
  const id = await uploadRoute(summary);
  await AsyncStorage.removeItem(PENDING_SESSION_KEY);

  return { ...summary, routeHistoryId: id };
}

function summarize(s: ActiveSession): TrackingSummary {
  const endedAtMs = Date.now();
  const durationSeconds = Math.round((endedAtMs - s.startedAtMs) / 1000);
  const distanceKm = s.distanceMeters / 1000;
  const avgSpeedKmh =
    durationSeconds > 0 ? distanceKm / (durationSeconds / 3600) : 0;
  const path = fitPath(s.path);

  // A bare trip id may arrive as the session id (legacy call sites), and a free
  // ride's session id is its claim id — route each to the right column.
  const tripId =
    asUuidOrNull(s.init.tripId) ??
    (s.init.context === 'trip' ? asUuidOrNull(s.init.sessionId) : null);
  const claimId =
    asUuidOrNull(s.init.claimId) ??
    (s.init.context === 'free_ride' ? asUuidOrNull(s.init.sessionId) : null);

  return {
    sessionId: s.init.sessionId,
    context: s.init.context,
    role: s.init.role,
    tripId,
    claimId,
    originLabel: s.init.originLabel ?? null,
    destLabel: s.init.destLabel ?? null,
    startedAt: new Date(s.startedAtMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    distanceKm,
    durationSeconds,
    avgSpeedKmh,
    maxSpeedKmh: s.maxSpeedKmh,
    fare: distanceKm * s.init.farePerKm,
    path,
    pointCount: s.pointCount,
    origin: s.path[0] ?? null,
    dest: s.path.length > 1 ? s.path[s.path.length - 1] : null,
    gpsValidated: estimateGpsValid({
      pointCount: s.pointCount,
      distanceKm,
      durationSeconds,
      avgSpeedKmh,
    }),
    routeHistoryId: null,
  };
}

/**
 * Mirror of the `route_is_gps_valid` SQL function, for optimistic UI only.
 * The stored value always comes from the database trigger.
 */
export function estimateGpsValid(m: {
  pointCount: number;
  distanceKm: number;
  durationSeconds: number;
  avgSpeedKmh: number;
}): boolean {
  return (
    m.pointCount >= 10 &&
    m.distanceKm >= 0.3 &&
    m.durationSeconds >= 60 &&
    m.avgSpeedKmh >= 1 &&
    m.avgSpeedKmh <= 120
  );
}

// ─── Persistence ─────────────────────────────────────────────────────────────

/** Write the in-progress session to disk so an app kill doesn't lose it. */
async function checkpoint() {
  if (!session) return;
  try {
    await AsyncStorage.setItem(
      PENDING_SESSION_KEY,
      JSON.stringify(summarize(session)),
    );
  } catch (e) {
    console.warn('[tracking] checkpoint failed', e);
  }
}

async function uploadRoute(summary: TrackingSummary): Promise<string | null> {
  const user = useAuthStore.getState().user;
  if (!user?.id || summary.path.length < 2) return null;

  try {
    const { data, error } = await supabase
      .from('route_history')
      .insert({
        user_id: user.id,
        role: summary.role,
        context: summary.context,
        trip_id: summary.tripId,
        claim_id: summary.claimId,
        started_at: summary.startedAt,
        ended_at: summary.endedAt,
        distance_km: summary.distanceKm,
        duration_seconds: summary.durationSeconds,
        avg_speed_kmh: summary.avgSpeedKmh,
        max_speed_kmh: summary.maxSpeedKmh,
        fare: summary.fare,
        origin_lat: summary.origin?.latitude ?? null,
        origin_lng: summary.origin?.longitude ?? null,
        origin_label: summary.originLabel,
        dest_lat: summary.dest?.latitude ?? null,
        dest_lng: summary.dest?.longitude ?? null,
        dest_label: summary.destLabel,
        path: summary.path,
        point_count: summary.pointCount,
      })
      .select('id')
      .single();

    if (error || !data) return null;
    return (data as { id: string }).id;
  } catch (e) {
    console.warn('[tracking] route upload failed', e);
    return null;
  }
}

/**
 * Upload a route left behind by an app kill or an offline stop. Safe to call on
 * every app start; a no-op when there's nothing pending.
 */
export async function flushPendingRoute(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SESSION_KEY);
    if (!raw) return null;

    // Don't race the live session that owns this checkpoint.
    if (session) return null;

    const summary = JSON.parse(raw) as TrackingSummary;
    const id = await uploadRoute(summary);
    if (id) await AsyncStorage.removeItem(PENDING_SESSION_KEY);
    return id;
  } catch (e) {
    console.warn('[tracking] flushPendingRoute failed', e);
    return null;
  }
}

/** @deprecated Kept for older call sites; use {@link flushPendingRoute}. */
export const syncOfflinePoints = flushPendingRoute;
