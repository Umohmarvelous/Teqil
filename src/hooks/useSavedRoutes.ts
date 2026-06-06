// src/hooks/useSavedRoutes.ts
//
// Manages the passenger's saved routes: load from Supabase, save a new one,
// increment use_count on re-use, delete.  Falls back to an in-memory list when
// offline so the UI never shows an empty state after a trip.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/src/services/supabase";
import { useAuthStore } from "@/src/store/useStore";

export interface SavedRoute {
  id:            string;
  label?:        string;
  origin_lat:    number;
  origin_lng:    number;
  origin_label?: string;
  dest_lat:      number;
  dest_lng:      number;
  dest_label?:   string;
  distance_km?:  number;
  base_fare?:    number;
  use_count:     number;
  last_used_at:  string;
  created_at:    string;
}

interface UseSavedRoutesReturn {
  routes:      SavedRoute[];
  loading:     boolean;
  saving:      boolean;
  saveRoute:   (params: SaveRouteParams) => Promise<SavedRoute | null>;
  deleteRoute: (id: string) => Promise<void>;
  refresh:     () => Promise<void>;
}

export interface SaveRouteParams {
  origin_lat:    number;
  origin_lng:    number;
  origin_label?: string;
  dest_lat:      number;
  dest_lng:      number;
  dest_label?:   string;
  distance_km?:  number;
  base_fare?:    number;
  label?:        string;
}

// Haversine: are two coordinates within ~50 m of each other?
function nearlyEqual(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
  thresholdMeters = 50,
): boolean {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= thresholdMeters;
}

export function useSavedRoutes(): UseSavedRoutesReturn {
  const { user } = useAuthStore();
  const [routes,  setRoutes]  = useState<SavedRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("saved_routes")
        .select("*")
        .eq("passenger_id", user.id)
        .order("last_used_at", { ascending: false })
        .limit(20);

      if (!error && data) setRoutes(data as SavedRoute[]);
    } catch {
      // offline — keep stale list
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveRoute = useCallback(
    async (params: SaveRouteParams): Promise<SavedRoute | null> => {
      if (!user?.id) return null;
      setSaving(true);

      try {
        // Check for an existing near-identical route to bump use_count instead of inserting
        const duplicate = routes.find(
          (r) =>
            nearlyEqual(r.origin_lat, r.origin_lng, params.origin_lat, params.origin_lng) &&
            nearlyEqual(r.dest_lat,   r.dest_lng,   params.dest_lat,   params.dest_lng),
        );

        if (duplicate) {
          const { data, error } = await supabase
            .from("saved_routes")
            .update({
              use_count:    duplicate.use_count + 1,
              last_used_at: new Date().toISOString(),
              base_fare:    params.base_fare ?? duplicate.base_fare,
            })
            .eq("id", duplicate.id)
            .select()
            .single();

          if (!error && data) {
            setRoutes((prev) =>
              prev.map((r) => (r.id === duplicate.id ? (data as SavedRoute) : r)),
            );
            return data as SavedRoute;
          }
          return null;
        }

        // New route
        const { data, error } = await supabase
          .from("saved_routes")
          .insert({
            passenger_id: user.id,
            ...params,
          })
          .select()
          .single();

        if (!error && data) {
          setRoutes((prev) => [data as SavedRoute, ...prev]);
          return data as SavedRoute;
        }
        return null;
      } catch {
        return null;
      } finally {
        setSaving(false);
      }
    },
    [user?.id, routes],
  );

  const deleteRoute = useCallback(
    async (id: string) => {
      setRoutes((prev) => prev.filter((r) => r.id !== id));
      try {
        await supabase.from("saved_routes").delete().eq("id", id);
      } catch {
        // re-add optimistic removal on failure
        await refresh();
      }
    },
    [refresh],
  );

  return { routes, loading, saving, saveRoute, deleteRoute, refresh };
}