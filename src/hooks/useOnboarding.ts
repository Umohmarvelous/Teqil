// src/hooks/useOnboarding.ts
//
// Controls whether the onboarding overlay is shown.
// State is persisted in AsyncStorage so it only shows once per device.
//
// Usage:
//   const { shouldShow, complete, reset } = useOnboarding();
//
//   shouldShow – true on first launch, false once completed or skipped
//   complete()  – mark as done (persists)
//   reset()     – clear persisted state (dev/testing)

import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "teqil_onboarding_v1_complete";

interface UseOnboardingReturn {
  shouldShow: boolean;
  isLoaded:   boolean;
  complete:   () => Promise<void>;
  reset:      () => Promise<void>;
}

export function useOnboarding(): UseOnboardingReturn {
  const [shouldShow, setShouldShow] = useState(false);
  const [isLoaded,   setIsLoaded]   = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      // Show if the key is absent (null = never set = first launch)
      setShouldShow(val === null);
      setIsLoaded(true);
    }).catch(() => {
      // If AsyncStorage fails, don't block the app — just skip onboarding
      setShouldShow(false);
      setIsLoaded(true);
    });
  }, []);

  const complete = useCallback(async () => {
    setShouldShow(false);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Non-fatal — worst case it shows again next launch
    }
  }, []);

  const reset = useCallback(async () => {
    setShouldShow(true);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  return { shouldShow, isLoaded, complete, reset };
}

















// /**
//  * src/hooks/useOnboarding.ts
//  *
//  * Controls whether the onboarding overlay shows.
//  * Persists state in AsyncStorage keyed by user ID so each account
//  * gets its own first-launch flag (handles shared devices).
//  *
//  * Usage:
//  *   const { shouldShow, complete, reset } = useOnboarding(userId);
//  */

// import { useState, useEffect, useCallback } from "react";
// import AsyncStorage from "@react-native-async-storage/async-storage";

// const KEY = (userId?: string) =>
//   userId ? `teqil_onboarding_v2_${userId}` : "teqil_onboarding_v2_guest";

// interface UseOnboardingReturn {
//   shouldShow: boolean;
//   isLoaded:   boolean;
//   complete:   () => Promise<void>;
//   reset:      () => Promise<void>;
// }

// export function useOnboarding(userId?: string): UseOnboardingReturn {
//   const [shouldShow, setShouldShow] = useState(false);
//   const [isLoaded,   setIsLoaded]   = useState(false);

//   useEffect(() => {
//     const storageKey = KEY(userId);
//     AsyncStorage.getItem(storageKey)
//       .then((val) => {
//         // null = key never written = first launch → show
//         setShouldShow(val === null);
//         setIsLoaded(true);
//       })
//       .catch(() => {
//         // Storage failure — skip onboarding silently, don't block the app
//         setShouldShow(false);
//         setIsLoaded(true);
//       });
//   }, [userId]);

//   const complete = useCallback(async () => {
//     setShouldShow(false);
//     try {
//       await AsyncStorage.setItem(KEY(userId), "1");
//     } catch {
//       // Non-fatal; worst case it shows again next launch
//     }
//   }, [userId]);

//   const reset = useCallback(async () => {
//     setShouldShow(true);
//     try {
//       await AsyncStorage.removeItem(KEY(userId));
//     } catch {}
//   }, [userId]);

//   return { shouldShow, isLoaded, complete, reset };
// }