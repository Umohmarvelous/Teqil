import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "@/src/store/useStore";

const KEY = (userId?: string) =>
  userId ? `teqil_onboarding_v2_${userId}` : "teqil_onboarding_v2_guest";

interface UseOnboardingReturn {
  shouldShow: boolean;
  isLoaded: boolean;
  complete: () => Promise<void>;
  reset: () => Promise<void>;
}

export function useOnboarding(): UseOnboardingReturn {
  const { user } = useAuthStore();
  const userId = user?.id;

  const [shouldShow, setShouldShow] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const storageKey = KEY(userId);
    AsyncStorage.getItem(storageKey)
      .then((val) => {
        // null = key never written = first launch for this user → show
        setShouldShow(val === null);
        setIsLoaded(true);
      })
      .catch(() => {
        // Storage failure — skip onboarding silently, don't block the app
        setShouldShow(false);
        setIsLoaded(true);
      });
  }, [userId]);

  const complete = useCallback(async () => {
    setShouldShow(false);
    try {
      await AsyncStorage.setItem(KEY(userId), "1");
    } catch {
      // Non-fatal; worst case it shows again next launch
    }
  }, [userId]);

  const reset = useCallback(async () => {
    setShouldShow(true);
    try {
      await AsyncStorage.removeItem(KEY(userId));
    } catch {}
  }, [userId]);

  return { shouldShow, isLoaded, complete, reset };
}