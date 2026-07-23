/**
 * src/components/AppLock.tsx
 *
 * Gates the whole app behind Face ID / Touch ID / device passcode when the user
 * has enabled "Biometric App Lock" in Settings. Locks on launch and whenever the
 * app returns to the foreground. Fails OPEN if the device has no biometric
 * hardware / the module is unavailable, so a user can never be locked out.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";

export default function AppLock({ children }: { children: React.ReactNode }) {
  const biometricLock = useSettingsStore((s) => s.biometricLock);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const shouldGuard = biometricLock && isAuthenticated;
  const [locked, setLocked] = useState(false);
  const authInFlight = useRef(false);
  const appState = useRef(AppState.currentState);
  const mountTime = useRef(Date.now());
  const didColdLock = useRef(false);
  const shouldGuardRef = useRef(shouldGuard);
  shouldGuardRef.current = shouldGuard;

  const authenticate = useCallback(async () => {
    if (authInFlight.current) return;
    authInFlight.current = true;
    try {
      const LocalAuthentication = await import("expo-local-authentication");
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        setLocked(false); // don't trap users without biometric hardware
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Teqil",
        fallbackLabel: "Use passcode",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });
      if (result.success) setLocked(false);
    } catch {
      setLocked(false); // fail open if the module/hardware is unavailable
    } finally {
      authInFlight.current = false;
    }
  }, []);

  // Cold-start lock: lock the first time the guard is satisfied shortly after
  // launch (a saved session rehydrates within the window) — but NOT when the
  // user logs in manually seconds later.
  useEffect(() => {
    if (!shouldGuard) {
      setLocked(false);
      didColdLock.current = false;
      return;
    }
    if (!didColdLock.current && Date.now() - mountTime.current < 2500) {
      didColdLock.current = true;
      setLocked(true);
    }
  }, [shouldGuard]);

  // Re-lock only on a real background → active resume. iOS's Face ID prompt
  // bounces through `inactive` (not `background`), so this never loops.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appState.current;
      appState.current = next;
      if (
        next === "active" &&
        prev === "background" &&
        shouldGuardRef.current &&
        !authInFlight.current
      ) {
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  // Auto-prompt whenever we enter the locked state.
  useEffect(() => {
    if (shouldGuard && locked) authenticate();
  }, [shouldGuard, locked, authenticate]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {shouldGuard && locked && (
        <View style={styles.overlay}>
          <View style={styles.iconBadge}>
            <Ionicons name="lock-closed" size={44} color={Colors.primary} />
          </View>
          <Text style={styles.title}>Teqil is locked</Text>
          <Text style={styles.sub}>Unlock with Face ID / Touch ID or your passcode.</Text>
          <Pressable style={styles.btn} onPress={authenticate}>
            <Ionicons name="finger-print" size={20} color="#fff" />
            <Text style={styles.btnText}>Unlock</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0B0B0B",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    zIndex: 100000,
    paddingHorizontal: 40,
  },
  iconBadge: {
    width: 84,
    height: 84,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  title: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFFFFF" },
  sub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    lineHeight: 20,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    height: 50,
    borderRadius: 14,
    marginTop: 12,
  },
  btnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#fff" },
});
