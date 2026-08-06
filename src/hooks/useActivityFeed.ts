// src/hooks/useActivityFeed.ts
//
// One hook that assembles the user's unified history from every source
// (transactions, achievements, watched ads, trips) into a time-sorted
// Activity[]. Dashboards render it with a limit; History screens render it all.

import { useEffect, useState } from "react";
import { useAuthStore } from "@/src/store/useStore";
import { useTransactionsStore } from "@/src/store/useTransactionsStore";
import { useAchievementsStore } from "@/src/store/useAchievementsStore";
import { useCreditsStore } from "@/src/store/useCreditsStore";
import { TripsStorage } from "@/src/services/storage";
import { buildActivity, type Activity } from "@/src/utils/activity";
import type { Trip } from "@/src/models/types";

export function useActivityFeed(): Activity[] {
  const user = useAuthStore((s) => s.user);
  const transactions = useTransactionsStore((s) => s.history);
  const achievements = useAchievementsStore((s) => s.unlocked);
  const credits = useCreditsStore((s) => s.history);
  const [trips, setTrips] = useState<Trip[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await TripsStorage.getAll();
        // Trips are keyed by driver; a passenger's own rides surface via their
        // transactions/trip payments in the feed rather than the trips list.
        const mine = user?.id ? all.filter((t) => t.driver_id === user.id) : all;
        if (!cancelled) setTrips(mine);
      } catch {
        if (!cancelled) setTrips([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, transactions.length]);

  return buildActivity({ transactions, achievements, credits, trips });
}
