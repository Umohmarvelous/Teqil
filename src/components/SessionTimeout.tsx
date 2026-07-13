import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, Modal, Pressable, PanResponder } from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

const INACTIVITY_LIMIT_MS = 3 * 60 * 1000; // 3 minutes
const WARNING_DURATION_MS = 30 * 1000; // 30 seconds

export default function SessionTimeout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, logout } = useAuthStore();
  const router = useRouter();
  const { theme } = useSettingsStore();

  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(WARNING_DURATION_MS / 1000);

  const inactivityTimer = useRef<NodeJS.Timeout | null>(null);
  const warningTimer = useRef<NodeJS.Timeout | null>(null);
  const countdownInterval = useRef<NodeJS.Timeout | null>(null);

  const handleLogout = useCallback(async () => {
    clearTimers();
    setShowWarning(false);
    await logout();
    router.replace("/(auth)/login");
  }, [logout, router]);

  const startWarning = useCallback(() => {
    setShowWarning(true);
    setCountdown(WARNING_DURATION_MS / 1000);

    countdownInterval.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    warningTimer.current = setTimeout(() => {
      handleLogout();
    }, WARNING_DURATION_MS);
  }, [handleLogout]);

  const resetInactivityTimer = useCallback(() => {
    if (showWarning) return; // Do not reset if warning is showing (must press button)
    
    clearTimers();
    inactivityTimer.current = setTimeout(startWarning, INACTIVITY_LIMIT_MS);
  }, [showWarning, startWarning]);

  const clearTimers = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (warningTimer.current) clearTimeout(warningTimer.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
  };

  useEffect(() => {
    if (isAuthenticated) {
      resetInactivityTimer();
    } else {
      clearTimers();
      setShowWarning(false);
    }
    return clearTimers;
  }, [isAuthenticated, resetInactivityTimer]);

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
    clearTimers();
    resetInactivityTimer();
  };

  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : Colors.textWhite;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const modalBg = isDark ? Colors.primaryDarker : "#FFFFFF";

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      {children}
      {showWarning && isAuthenticated && (
        <Modal transparent animationType="fade" visible={showWarning}>
          <View style={styles.overlay}>
            <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.modalContent, { backgroundColor: modalBg }]}>
              <Text style={[styles.title, { color: textColor }]}>Session Expiring</Text>
              <Text style={[styles.message, { color: subTextColor }]}>
                You have been inactive for a while. You will be logged out in{" "}
                <Text style={{ color: Colors.error, fontWeight: 'bold' }}>{countdown}</Text> seconds.
              </Text>
              <Pressable style={styles.button} onPress={handleStayLoggedIn}>
                <Text style={styles.buttonText}>Stay Logged In</Text>
              </Pressable>
            </Animated.View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    marginBottom: 12,
  },
  message: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 25,
    width: "100%",
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
});
