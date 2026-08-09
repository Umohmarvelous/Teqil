// src/hooks/useRecentDriverSearches.ts
//
// Recently searched driver IDs, kept on-device.
//
// Driver badge IDs are the one thing in this app nobody memorises, and a
// passenger usually messages the same handful of drivers. Persisting the last
// few turns the search screen's empty state into something useful.
//
// Local-only by design: it's a UI convenience, not account data, so it never
// syncs and disappears with the app.

import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "teqil_recent_driver_searches";
const MAX = 8;

export function useRecentDriverSearches() {
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (!cancelled && raw) setRecents(JSON.parse(raw) as string[]);
      } catch {
        /* a corrupt list is not worth surfacing — start empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (list: string[]) => {
    setRecents(list);
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      /* best-effort */
    }
  }, []);

  /** Move a term to the front, de-duplicated and capped. */
  const remember = useCallback(
    (term: string) => {
      const t = term.trim().toUpperCase();
      if (!t) return;
      setRecents((prev) => {
        const next = [t, ...prev.filter((r) => r !== t)].slice(0, MAX);
        AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const clear = useCallback(() => persist([]), [persist]);

  return { recents, remember, clear };
}

export default useRecentDriverSearches;
