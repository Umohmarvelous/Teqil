




import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, Modal, Pressable, PanResponder } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

const INACTIVITY_LIMIT_MS = 3 * 60 * 1000; // 3 minutes
const WARNING_DURATION_MS = 30 * 1000; // 30 seconds

export default function SessionTimeout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, logout } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();
  const { theme } = useSettingsStore();

  // Only guard a genuinely logged-in session: authenticated, with a user, and
  // not sitting on the auth screens (login/welcome/register), where a persisted
  // `isAuthenticated` flag could otherwise trigger the timeout modal.
  const inAuthGroup = segments[0] === "(auth)";
  const sessionActive = isAuthenticated && !!user && !inAuthGroup;

  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(WARNING_DURATION_MS / 1000);

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogout = useCallback(async () => {
    setShowWarning(false);
    await logout();
    router.replace("/(auth)/login");
  }, [logout, router]);

  // Clean timer tracking bound specifically to the warning's lifecycle
  useEffect(() => {
    if (showWarning) {
      setCountdown(WARNING_DURATION_MS / 1000);
      
      const intervalId = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(intervalId);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      const timeoutId = setTimeout(() => {
        handleLogout();
      }, WARNING_DURATION_MS);

      return () => {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
      };
    }
  }, [showWarning, handleLogout]);

  const resetInactivityTimer = useCallback(() => {
    if (showWarning) return; 
    
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
    }
    
    inactivityTimer.current = setTimeout(() => {
      setShowWarning(true);
    }, INACTIVITY_LIMIT_MS);
  }, [showWarning]);

  useEffect(() => {
    if (sessionActive) {
      resetInactivityTimer();
    } else {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      setShowWarning(false);
    }
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [sessionActive, resetInactivityTimer]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => {
        resetInactivityTimer();
        return false;
      },
      onMoveShouldSetPanResponderCapture: () => {
        resetInactivityTimer();
        return false;
      },
      onPanResponderTerminationRequest: () => true,
    })
  ).current;

  const handleStayLoggedIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowWarning(false);
    resetInactivityTimer();
  };

  const isDark = theme === "dark";
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      {children}
      {showWarning && sessionActive && (
        <Modal transparent visible={showWarning}>
          <View style={styles.overlay}>
            <View style={styles.modalContainer}>
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.modalContent}>
                <Text style={[styles.title, { color: Colors.text }]}>Session Expiring</Text>
                <Text style={[styles.message, { color: subTextColor }]}>
                  You have been inactive for a while. You will be logged out in{" "}
                  <Text style={{ color: Colors.error, fontWeight: 'bold' }}>{countdown}</Text> seconds.
                </Text>
              </Animated.View>
              
              <Pressable style={[styles.button, { backgroundColor: Colors.text }]} onPress={handleStayLoggedIn}>
                <Text style={[styles.buttonText, { color: "#fff" }]}>Stay Logged In</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.46)",
    justifyContent: "center",
    alignItems: "center",
    padding: 34,
  },
  modalContainer: {
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  modalContent: {
    backgroundColor: "#1A1A1A",
    width: "100%",
    padding: 24,
    alignItems: "center",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    marginBottom: 12,
    marginTop: 8,
    textAlign: "left",
  },
  message: {
    fontFamily: "Poppins_500Regular",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
    color: Colors.text
  },
  button: {
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    width: "100%",
    alignItems: "center",
  },
  buttonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
});