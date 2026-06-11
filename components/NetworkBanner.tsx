/**
 * components/NetworkBanner.tsx
 *
 * Global network status banner that slides down from the top of the screen.
 * - Shows a red/orange banner when offline or sync fails
 * - Shows a green success banner briefly when connection is restored
 * - Sits above all content (zIndex: 9998, below onboarding overlay at 9999)
 * - Support swipe up gesture to manually dismiss/hide the banner.
 *
 * Usage: render once in app/(main)/_layout.tsx or app/_layout.tsx
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Platform,
  PanResponder,
} from "react-native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  WifiDisconnected01Icon,
  WifiConnected01Icon,
  Alert01Icon,
  Wifi01Icon,
  Refresh04Icon,
} from "@hugeicons/core-free-icons";
import { Colors } from "@/constants/colors";

type BannerState = "hidden" | "offline" | "weak" | "restored";

interface NetworkBannerProps {
  /** Optional: called when user taps the retry button */
  onRetry?: () => void;
}

export default function NetworkBanner({ onRetry }: NetworkBannerProps) {
  const insets = useSafeAreaInsets();
  const [bannerState, setBannerState] = useState<BannerState>("hidden");
  const [isVisible, setIsVisible] = useState(false);

  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const restoredTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOfflineRef = useRef(false);

  const slideIn = useCallback(() => {
    setIsVisible(true);
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        damping: 20,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateY, opacity]);

  const slideOut = useCallback(
    (onDone?: () => void) => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -120,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsVisible(false);
        setBannerState("hidden");
        onDone?.();
      });
    },
    [translateY, opacity]
  );

  const handleNetworkChange = useCallback(
    (state: NetInfoState) => {
      const isConnected = !!(state.isConnected && state.isInternetReachable);
      const isWeak =
        state.isConnected &&
        !state.isInternetReachable &&
        state.type !== "none";

      if (restoredTimerRef.current) {
        clearTimeout(restoredTimerRef.current);
        restoredTimerRef.current = null;
      }

      if (!isConnected && !isWeak) {
        // Fully offline
        wasOfflineRef.current = true;
        setBannerState("offline");
        slideIn();
      } else if (isWeak) {
        // Connected but no internet (weak/captive portal)
        wasOfflineRef.current = true;
        setBannerState("weak");
        slideIn();
      } else if (isConnected && wasOfflineRef.current) {
        // Back online — show success then hide
        wasOfflineRef.current = false;
        setBannerState("restored");
        slideIn();
        restoredTimerRef.current = setTimeout(() => {
          slideOut();
        }, 2800);
      }
    },
    [slideIn, slideOut]
  );

  useEffect(() => {
    // Initial check
    NetInfo.fetch().then(handleNetworkChange);

    const unsubscribe = NetInfo.addEventListener(handleNetworkChange);

    return () => {
      unsubscribe();
      if (restoredTimerRef.current) clearTimeout(restoredTimerRef.current);
    };
  }, [handleNetworkChange]);

  // Handle Swipe up gesture configuration
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Intercept gesture if user is explicitly swiping up vertically
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && gestureState.dy < -5;
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow dragging upwards (negative dy values)
        if (gestureState.dy < 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // Dismiss if swiped up past 35 pixels OR if flicked up quickly (velocity)
        if (gestureState.dy < -35 || gestureState.vy < -0.4) {
          slideOut();
        } else {
          // Snap back to normal resting position if gesture was abandoned
          Animated.spring(translateY, {
            toValue: 0,
            damping: 18,
            stiffness: 180,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  if (!isVisible) return null;

  const topPad = Platform.OS === "ios" ? insets.top : 8;
  const isOfflineOrWeak = bannerState === "offline" || bannerState === "weak";

  const bannerConfig = {
    offline: {
      bg: "#B91C1C",
      icon: WifiDisconnected01Icon,
      iconColor: "#FCA5A5",
      title: "No internet connection",
      subtitle: "Changes will sync when you're back online",
    },
    weak: {
      bg: "#92400E",
      icon: Alert01Icon,
      iconColor: "#FCD34D",
      title: "Connection unstable",
      subtitle: "Some features may not work correctly",
    },
    restored: {
      bg: Colors.primary,
      icon: Wifi01Icon,
      iconColor: "#BBF7D0",
      title: "Back online",
      subtitle: "Syncing your data now...",
    },
    hidden: {
      bg: "transparent",
      icon: WifiConnected01Icon,
      iconColor: "transparent",
      title: "",
      subtitle: "",
    },
  };

  const config = bannerConfig[bannerState];

  return (
    <Animated.View
      {...panResponder.panHandlers} // Injects touch listeners directly onto the tracking component
      style={[
        styles.container,
        {
          backgroundColor: config.bg,
          marginTop: topPad,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents={isOfflineOrWeak ? "auto" : "none"} // Set to "auto" so the swipe registration is 100% responsive across the card layout
    >
      <View style={styles.inner}>
        <View style={styles.iconWrap}>
          <HugeiconsIcon
            icon={config.icon as any}
            size={24}
            color={config.iconColor}
          />
        </View>

        <View style={styles.textBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {config.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {config.subtitle}
          </Text>
        </View>

        {isOfflineOrWeak && onRetry && (
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [
              styles.retryBtn,
              pressed && { opacity: 0.7 },
            ]}
            hitSlop={8}
          >
            <HugeiconsIcon icon={Refresh04Icon as any} size={14} color="#fff" />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 5,
    right: 5,
    zIndex: 9998,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 20,
    borderRadius: 20,
    paddingHorizontal: 5,
    paddingVertical: 20,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  inner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 80,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  retryText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#FFFFFF",
  },
});