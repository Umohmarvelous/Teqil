import { useState, useCallback } from "react";
import { syncAll } from "../services/sync";
import { useAuthStore } from "../store/useStore";

/**
 * src/hooks/useRefreshSync.ts
 *
 * One shared pull-to-refresh handler for every scrollable screen. Pulling down
 * does two things: (1) runs a full offline↔cloud sync for the current user, and
 * (2) runs an optional screen-specific refresh (e.g. re-fetch a feed).
 *
 * Usage:
 *   const { refreshing, onRefresh } = useRefreshSync(reloadThisScreen);
 *   <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
 *
 * `extra` is optional — screens with nothing extra to reload just get the sync.
 */
export function useRefreshSync(extra?: () => Promise<void> | void) {
  const user = useAuthStore((s) => s.user);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (user?.id) {
        await syncAll({
          id: user.id,
          role: user.role,
          park_name: user.park_name,
        });
      }
      await extra?.();
    } catch (err) {
      console.warn("[useRefreshSync] refresh failed", err);
    } finally {
      setRefreshing(false);
    }
  }, [user?.id, user?.role, user?.park_name, extra]);

  return { refreshing, onRefresh };
}
