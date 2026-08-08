// src/hooks/useRouteHistory.ts
//
// Reads the `route_history` table — the GPS tracks of rides that actually
// happened. Distinct from useSavedRoutes, which manages the passenger's
// bookmarked origin→dest pairs for re-booking.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/src/services/supabase";
import { useAuthStore } from "@/src/store/useStore";
import type { Coordinate, TrackingContext, TrackingRole } from "@/src/services/locationTracking";

export interface RouteHistoryEntry {
  id:               string;
  user_id:          string;
  role:             TrackingRole;
  context:          TrackingContext;
  trip_id?:         string | null;
  claim_id?:        string | null;
  started_at:       string;
  ended_at?:        string | null;
  distance_km:      number;
  duration_seconds: number;
  avg_speed_kmh:    number;
  max_speed_kmh:    number;
  fare:             number;
  origin_lat?:      number | null;
  origin_lng?:      number | null;
  origin_label?:    string | null;
  dest_lat?:        number | null;
  dest_lng?:        number | null;
  dest_label?:      string | null;
  path:             Coordinate[];
  point_count:      number;
  gps_validated:    boolean;
  created_at:       string;
}

interface UseRouteHistoryReturn {
  entries: RouteHistoryEntry[];
  loading: boolean;
  error:   string | null;
  refresh: () => Promise<void>;
  remove:  (id: string) => Promise<void>;
}

/** The user's recorded tracks, newest first. */
export function useRouteHistory(limit = 50): UseRouteHistoryReturn {
  const user = useAuthStore((s) => s.user);
  const [entries, setEntries] = useState<RouteHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("route_history")
        .select("*")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(limit);

      if (err) setError(err.message);
      else setEntries((data ?? []) as RouteHistoryEntry[]);
    } catch {
      setError("Couldn't load your route history. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [user?.id, limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const remove = useCallback(
    async (id: string) => {
      const previous = entries;
      setEntries((prev) => prev.filter((e) => e.id !== id));
      try {
        const { error: err } = await supabase.from("route_history").delete().eq("id", id);
        if (err) setEntries(previous); // restore — the delete didn't happen
      } catch {
        setEntries(previous);
      }
    },
    [entries],
  );

  return { entries, loading, error, refresh, remove };
}

/** A single recorded track, for the detail screen. */
export function useRouteHistoryEntry(id?: string) {
  const [entry,   setEntry]   = useState<RouteHistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await supabase
          .from("route_history")
          .select("*")
          .eq("id", id)
          .single();
        if (!cancelled) setEntry((data as RouteHistoryEntry) ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return { entry, loading };
}

// ─── Presentation helpers ────────────────────────────────────────────────────

/** Region that fits a whole path, with padding. Null for an empty path. */
export function regionForPath(path: Coordinate[], padding = 1.4) {
  if (!path?.length) return null;

  let minLat = path[0].latitude, maxLat = path[0].latitude;
  let minLng = path[0].longitude, maxLng = path[0].longitude;

  for (const p of path) {
    if (p.latitude  < minLat) minLat = p.latitude;
    if (p.latitude  > maxLat) maxLat = p.latitude;
    if (p.longitude < minLng) minLng = p.longitude;
    if (p.longitude > maxLng) maxLng = p.longitude;
  }

  return {
    latitude:       (minLat + maxLat) / 2,
    longitude:      (minLng + maxLng) / 2,
    latitudeDelta:  Math.max((maxLat - minLat) * padding, 0.005),
    longitudeDelta: Math.max((maxLng - minLng) * padding, 0.005),
  };
}
