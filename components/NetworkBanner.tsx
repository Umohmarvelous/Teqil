// /**
//  * components/NetworkBanner.tsx
//  *
//  * Global network status banner that slides down from the top of the screen.
//  * - Shows a red banner when offline (7s auto-dismiss)
//  * - Shows an orange/yellow banner when sync fails / weak (3s auto-dismiss)
//  * - Shows a green success banner briefly when connection is restored (3s auto-dismiss)
//  * - Sits above all content (zIndex: 9998, below onboarding overlay at 9999)
//  * - Support swipe up gesture to manually dismiss/hide the banner.
//  *
//  * Usage: render once in app/(main)/_layout.tsx or app/_layout.tsx
//  */

// import React, { useEffect, useRef, useState, useCallback } from "react";
// import {
//   View,
//   Text,
//   StyleSheet,
//   Animated,
//   Pressable,
//   Platform,
//   PanResponder,
// } from "react-native";
// import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
// import { useSafeAreaInsets } from "react-native-safe-area-context";
// import { HugeiconsIcon } from "@hugeicons/react-native";
// import {
//   WifiDisconnected01Icon,
//   WifiConnected01Icon,
//   Alert01Icon,
//   Wifi01Icon,
//   Refresh04Icon,
// } from "@hugeicons/core-free-icons";
// import { Colors } from "@/constants/colors";

// type BannerState = "hidden" | "offline" | "weak" | "restored";

// interface NetworkBannerProps {
//   /** Optional: called when user taps the retry button */
//   onRetry?: () => void;
// }

// export default function NetworkBanner({ onRetry }: NetworkBannerProps) {
//   const insets = useSafeAreaInsets();
//   const [bannerState, setBannerState] = useState<BannerState>("hidden");
//   const [isVisible, setIsVisible] = useState(false);

//   const translateY = useRef(new Animated.Value(-120)).current;
//   const opacity = useRef(new Animated.Value(0)).current;
//   const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const isVisibleRef = useRef(false);
//   const isInitialCheckRef = useRef(true);
//   const prevConditionRef = useRef<"good" | "weak" | "offline" | null>(null);

//   const slideIn = useCallback(() => {
//     isVisibleRef.current = true;
//     setIsVisible(true);
//     Animated.parallel([
//       Animated.spring(translateY, {
//         toValue: 0,
//         damping: 20,
//         stiffness: 200,
//         useNativeDriver: true,
//       }),
//       Animated.timing(opacity, {
//         toValue: 1,
//         duration: 200,
//         useNativeDriver: true,
//       }),
//     ]).start();
//   }, [translateY, opacity]);

//   const slideOut = useCallback(
//     (onDone?: () => void) => {
//       if (autoDismissTimerRef.current) {
//         clearTimeout(autoDismissTimerRef.current);
//         autoDismissTimerRef.current = null;
//       }
//       if (!isVisibleRef.current) {
//         onDone?.();
//         return;
//       }
//       Animated.parallel([
//         Animated.timing(translateY, {
//           toValue: -120,
//           duration: 300,
//           useNativeDriver: true,
//         }),
//         Animated.timing(opacity, {
//           toValue: 0,
//           duration: 250,
//           useNativeDriver: true,
//         }),
//       ]).start(() => {
//         isVisibleRef.current = false;
//         setIsVisible(false);
//         setBannerState("hidden");
//         onDone?.();
//       });
//     },
//     [translateY, opacity]
//   );

//   const handleNetworkChange = useCallback(
//     (state: NetInfoState, force = false) => {
//       const isConnected = !!(state.isConnected && state.isInternetReachable);
//       const isWeak =
//         state.isConnected &&
//         !state.isInternetReachable &&
//         state.type !== "none";

//       let currentCondition: "good" | "weak" | "offline";
//       if (!isConnected && !isWeak) {
//         currentCondition = "offline";
//       } else if (isWeak) {
//         currentCondition = "weak";
//       } else {
//         currentCondition = "good";
//       }

//       // Clear any existing auto-dismiss timer
//       if (autoDismissTimerRef.current) {
//         clearTimeout(autoDismissTimerRef.current);
//         autoDismissTimerRef.current = null;
//       }

//       // Initial check: never show banner if network is good on app start / login
//       if (isInitialCheckRef.current) {
//         isInitialCheckRef.current = false;
//         prevConditionRef.current = currentCondition;
//         if (currentCondition === "good") {
//           return;
//         }
//       }

//       // Don't re-show if condition hasn't changed (unless forced by retry)
//       if (!force && prevConditionRef.current === currentCondition) {
//         return;
//       }

//       const previousCondition = prevConditionRef.current;
//       prevConditionRef.current = currentCondition;

//       if (currentCondition === "offline") {
//         // Poor / no network: show for 7 seconds
//         setBannerState("offline");
//         slideIn();
//         autoDismissTimerRef.current = setTimeout(() => {
//           slideOut();
//         }, 7000);
//       } else if (currentCondition === "weak") {
//         // Fairly good / unstable: show for 3 seconds
//         setBannerState("weak");
//         slideIn();
//         autoDismissTimerRef.current = setTimeout(() => {
//           slideOut();
//         }, 3000);
//       } else if (currentCondition === "good") {
//         // Good network restored: show green success for 3 seconds
//         if (previousCondition && previousCondition !== "good") {
//           setBannerState("restored");
//           slideIn();
//           autoDismissTimerRef.current = setTimeout(() => {
//             slideOut();
//           }, 3000);
//         }
//       }
//     },
//     [slideIn, slideOut]
//   );

//   useEffect(() => {
//     // Initial check
//     NetInfo.fetch().then((state) => handleNetworkChange(state));

//     const unsubscribe = NetInfo.addEventListener((state) =>
//       handleNetworkChange(state)
//     );

//     return () => {
//       unsubscribe();
//       if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
//     };
//   }, [handleNetworkChange]);

//   // Handle Swipe up gesture configuration — KEPT EXACTLY AS IS
//   const panResponder = useRef(
//     PanResponder.create({
//       onStartShouldSetPanResponder: () => true,
//       onMoveShouldSetPanResponder: (_, gestureState) => {
//         // Intercept gesture if user is explicitly swiping up vertically
//         return (
//           Math.abs(gestureState.dy) > Math.abs(gestureState.dx) &&
//           gestureState.dy < -5
//         );
//       },
//       onPanResponderMove: (_, gestureState) => {
//         // Only allow dragging upwards (negative dy values)
//         if (gestureState.dy < 0) {
//           translateY.setValue(gestureState.dy);
//         }
//       },
//       onPanResponderRelease: (_, gestureState) => {
//         // Dismiss if swiped up past 35 pixels OR if flicked up quickly (velocity)
//         if (gestureState.dy < -35 || gestureState.vy < -0.4) {
//           if (autoDismissTimerRef.current) {
//             clearTimeout(autoDismissTimerRef.current);
//             autoDismissTimerRef.current = null;
//           }
//           slideOut();
//         } else {
//           // Snap back to normal resting position if gesture was abandoned
//           Animated.spring(translateY, {
//             toValue: 0,
//             damping: 18,
//             stiffness: 180,
//             useNativeDriver: true,
//           }).start();
//         }
//       },
//     })
//   ).current;

//   const handleRetry = useCallback(() => {
//     // Clear any pending auto-dismiss
//     if (autoDismissTimerRef.current) {
//       clearTimeout(autoDismissTimerRef.current);
//       autoDismissTimerRef.current = null;
//     }
//     // Force a fresh network state evaluation
//     NetInfo.fetch().then((state) => {
//       handleNetworkChange(state, true);
//     });
//     // Also trigger the parent's retry action (e.g. syncAll)
//     onRetry?.();
//   }, [handleNetworkChange, onRetry]);

//   if (!isVisible) return null;

//   const topPad = Platform.OS === "ios" ? insets.top : 8;
//   const isOfflineOrWeak = bannerState === "offline" || bannerState === "weak";

//   const bannerConfig = {
//     offline: {
//       bg: "#B91C1C",
//       icon: WifiDisconnected01Icon,
//       iconColor: "#FCA5A5",
//       title: "No internet connection",
//       subtitle: "Changes will sync when you're back online",
//     },
//     weak: {
//       bg: "#92400E",
//       icon: Alert01Icon,
//       iconColor: "#FCD34D",
//       title: "Connection unstable",
//       subtitle: "Some features may not work correctly",
//     },
//     restored: {
//       bg: Colors.primary,
//       icon: Wifi01Icon,
//       iconColor: "#BBF7D0",
//       title: "Back online",
//       subtitle: "Syncing your data now...",
//     },
//     hidden: {
//       bg: "transparent",
//       icon: WifiConnected01Icon,
//       iconColor: "transparent",
//       title: "",
//       subtitle: "",
//     },
//   };

//   const config = bannerConfig[bannerState];

//   return (
//     <Animated.View
//       {...panResponder.panHandlers} // Injects touch listeners directly onto the tracking component
//       style={[
//         styles.container,
//         {
//           backgroundColor: config.bg,
//           marginTop: topPad,
//           transform: [{ translateY }],
//           opacity,
//         },
//       ]}
//       pointerEvents={isOfflineOrWeak ? "auto" : "none"} // Set to "auto" so the swipe registration is 100% responsive across the card layout
//     >
//       <View style={styles.inner}>
//         <View style={styles.iconWrap}>
//           <HugeiconsIcon
//             icon={config.icon as any}
//             size={24}
//             color={config.iconColor}
//           />
//         </View>

//         <View style={styles.textBlock}>
//           <Text style={styles.title} numberOfLines={1}>
//             {config.title}
//           </Text>
//           <Text style={styles.subtitle} numberOfLines={1}>
//             {config.subtitle}
//           </Text>
//         </View>

//         {isOfflineOrWeak && (
//           <Pressable
//             onPress={handleRetry}
//             style={({ pressed }) => [
//               styles.retryBtn,
//               pressed && { opacity: 0.7 },
//             ]}
//             hitSlop={8}
//           >
//             <HugeiconsIcon icon={Refresh04Icon as any} size={14} color="#fff" />
//           </Pressable>
//         )}
//       </View>
//     </Animated.View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     position: "absolute",
//     top: 0,
//     left: 5,
//     right: 5,
//     zIndex: 9998,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 14 },
//     shadowOpacity: 0.35,
//     shadowRadius: 10,
//     elevation: 20,
//     borderRadius: 20,
//     paddingHorizontal: 5,
//     paddingVertical: 20,
//     flex: 1,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   inner: {
//     flex: 1,
//     flexDirection: "row",
//     alignItems: "center",
//     paddingHorizontal: 16,
//     gap: 10,
//   },
//   iconWrap: {
//     width: 40,
//     height: 40,
//     borderRadius: 15,
//     backgroundColor: "rgba(255,255,255,0.15)",
//     alignItems: "center",
//     justifyContent: "center",
//     flexShrink: 0,
//   },
//   textBlock: {
//     flex: 1,
//     gap: 1,
//   },
//   title: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 15,
//     color: "#FFFFFF",
//   },
//   subtitle: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 12,
//     color: "rgba(255,255,255,0.75)",
//   },
//   retryBtn: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: 5,
//     backgroundColor: "rgba(255,255,255,0.2)",
//     borderRadius: 80,
//     paddingHorizontal: 12,
//     paddingVertical: 12,
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.3)",
//   },
//   retryText: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 12,
//     color: "#FFFFFF",
//   },
// });


























/**
 * components/NetworkBanner.tsx
 *
 * Global network status banner that slides down from the top of the screen.
 * - On first mount (post-login / splash), waits 5s before revealing a good-network banner
 * - Good network: green banner slides in, then slides back up after 3s
 * - Offline / weak: shown immediately with realtime strength details
 * - Reads NetInfo in realtime (Wi‑Fi strength, cellular generation, carrier)
 * - Sits above all content (zIndex: 9998)
 * - Supports swipe-up to dismiss
 *
 * Usage: render once in app/_layout.tsx
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
type Condition = "good" | "weak" | "offline";

const GOOD_NETWORK_STARTUP_DELAY_MS = 5000;
const GOOD_BANNER_DURATION_MS = 3000;
const WEAK_BANNER_DURATION_MS = 3000;
const OFFLINE_BANNER_DURATION_MS = 7000;
const OFFLINE_RESHOW_MS = 20000;

interface NetworkStrength {
  condition: Condition;
  /** Short realtime strength line shown on every banner state */
  strengthLabel: string;
  /** Human-readable connection type */
  connectionLabel: string;
}

interface NetworkBannerProps {
  /** Optional: called when user taps the retry button */
  onRetry?: () => void;
}

function readDetails(state: NetInfoState): Record<string, unknown> | null {
  if (!state.details || typeof state.details !== "object") return null;
  return state.details as Record<string, unknown>;
}

/** Derive connection quality + a realtime strength label from NetInfo. */
function assessNetwork(state: NetInfoState): NetworkStrength {
  const details = readDetails(state);
  const type = state.type;
  const isReachable = state.isInternetReachable;
  const isConnected = !!state.isConnected;

  if (!isConnected || type === "none") {
    return {
      condition: "offline",
      connectionLabel: "Offline",
      strengthLabel: "No signal · offline",
    };
  }

  // Connected but internet not reachable → treat as weak
  if (isReachable === false) {
    const base =
      type === "wifi"
        ? "Wi‑Fi"
        : type === "cellular"
          ? "Cellular"
          : type.charAt(0).toUpperCase() + type.slice(1);
    return {
      condition: "weak",
      connectionLabel: base,
      strengthLabel: `${base} · no internet`,
    };
  }

  if (type === "wifi") {
    const strength =
      typeof details?.strength === "number" ? details.strength : null;
    const ssid =
      typeof details?.ssid === "string" && details.ssid.trim()
        ? details.ssid.trim()
        : null;

    let level: Condition = "good";
    let strengthText = "signal unknown";
    if (strength != null) {
      strengthText = `${Math.round(strength)}% signal`;
      if (strength < 40) level = "weak";
    }

    return {
      condition: level,
      connectionLabel: ssid ? `Wi‑Fi · ${ssid}` : "Wi‑Fi",
      strengthLabel: ssid
        ? `Wi‑Fi · ${ssid} · ${strengthText}`
        : `Wi‑Fi · ${strengthText}`,
    };
  }

  if (type === "cellular") {
    const generation =
      typeof details?.cellularGeneration === "string"
        ? details.cellularGeneration.toUpperCase()
        : null;
    const carrier =
      typeof details?.carrier === "string" && details.carrier.trim()
        ? details.carrier.trim()
        : null;

    let level: Condition = "good";
    if (generation === "2G" || generation === "3G") level = "weak";

    const genLabel = generation ?? "Cellular";
    const parts = [genLabel];
    if (carrier) parts.push(carrier);
    parts.push(level === "weak" ? "weak signal" : "good signal");

    return {
      condition: level,
      connectionLabel: carrier ? `${genLabel} · ${carrier}` : genLabel,
      strengthLabel: parts.join(" · "),
    };
  }

  // ethernet / vpn / other
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return {
    condition: "good",
    connectionLabel: label,
    strengthLabel: `${label} · connected`,
  };
}

export default function NetworkBanner({ onRetry }: NetworkBannerProps) {
  const insets = useSafeAreaInsets();
  const [bannerState, setBannerState] = useState<BannerState>("hidden");
  const [isVisible, setIsVisible] = useState(false);
  const [strengthLabel, setStrengthLabel] = useState("Checking network…");

  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startupDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isVisibleRef = useRef(false);
  const prevConditionRef = useRef<Condition | null>(null);
  const lastToggleTimeRef = useRef<number>(0);
  const toggleCountRef = useRef<number>(0);
  const lastNetInfoStateRef = useRef<NetInfoState | null>(null);
  /** Blocks good-network reveal until 5s after first mount (post-login). */
  const goodRevealAllowedRef = useRef(false);
  /** Pending good banner to show once the 5s delay elapses. */
  const pendingGoodRevealRef = useRef(false);

  const slideIn = useCallback(() => {
    isVisibleRef.current = true;
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
      if (autoDismissTimerRef.current) {
        clearTimeout(autoDismissTimerRef.current);
        autoDismissTimerRef.current = null;
      }
      if (!isVisibleRef.current) {
        onDone?.();
        return;
      }
      isVisibleRef.current = false;
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

  const showRestoredBanner = useCallback(() => {
    setBannerState("restored");
    slideIn();
    autoDismissTimerRef.current = setTimeout(
      () => slideOut(),
      GOOD_BANNER_DURATION_MS
    );
  }, [slideIn, slideOut]);

  const handleNetworkChange = useCallback(
    (state: NetInfoState, force = false) => {
      const assessment = assessNetwork(state);
      lastNetInfoStateRef.current = state;
      setStrengthLabel(assessment.strengthLabel);

      const currentCondition = assessment.condition;
      const now = Date.now();
      const previousCondition = prevConditionRef.current;

      // Track rapid toggling (good ↔ offline/weak within 3 seconds)
      if (previousCondition !== null && previousCondition !== currentCondition) {
        toggleCountRef.current++;
        lastToggleTimeRef.current = now;
      }

      if (now - lastToggleTimeRef.current > 3000) {
        toggleCountRef.current = 0;
      }

      const isRapidToggle =
        toggleCountRef.current >= 2 &&
        now - lastToggleTimeRef.current <= 3000;

      // Offline interval: re-show red banner every 20s if user dismissed it
      if (currentCondition === "offline") {
        if (!offlineIntervalRef.current) {
          offlineIntervalRef.current = setInterval(() => {
            if (
              !isVisibleRef.current &&
              prevConditionRef.current === "offline"
            ) {
              setBannerState("offline");
              slideIn();
              autoDismissTimerRef.current = setTimeout(
                () => slideOut(),
                OFFLINE_BANNER_DURATION_MS
              );
            }
          }, OFFLINE_RESHOW_MS);
        }
      } else if (offlineIntervalRef.current) {
        clearInterval(offlineIntervalRef.current);
        offlineIntervalRef.current = null;
      }

      // Strength-only update while same condition (keep banner text live)
      if (!force && previousCondition === currentCondition && !isRapidToggle) {
        return;
      }

      if (autoDismissTimerRef.current) {
        clearTimeout(autoDismissTimerRef.current);
        autoDismissTimerRef.current = null;
      }

      prevConditionRef.current = currentCondition;

      if (currentCondition === "offline") {
        pendingGoodRevealRef.current = false;
        setBannerState("offline");
        slideIn();
        autoDismissTimerRef.current = setTimeout(
          () => slideOut(),
          OFFLINE_BANNER_DURATION_MS
        );
        return;
      }

      if (isRapidToggle || currentCondition === "weak") {
        pendingGoodRevealRef.current = false;
        setBannerState("weak");
        slideIn();
        autoDismissTimerRef.current = setTimeout(() => {
          if (!isVisibleRef.current) return;
          slideOut(() => {
            const lastState = lastNetInfoStateRef.current;
            if (!lastState) return;
            const last = assessNetwork(lastState);
            if (last.condition === "good" && goodRevealAllowedRef.current) {
              setStrengthLabel(last.strengthLabel);
              showRestoredBanner();
            }
          });
        }, WEAK_BANNER_DURATION_MS);
        return;
      }

      // Good network
      if (!goodRevealAllowedRef.current) {
        // Wait for the 5s post-login delay before first good-network reveal
        pendingGoodRevealRef.current = true;
        return;
      }

      pendingGoodRevealRef.current = false;
      showRestoredBanner();
    },
    [slideIn, slideOut, showRestoredBanner]
  );

  useEffect(() => {
    // After mount (splash done → banner mounts): wait 5s before good-network reveal
    startupDelayTimerRef.current = setTimeout(() => {
      goodRevealAllowedRef.current = true;
      if (pendingGoodRevealRef.current) {
        const lastState = lastNetInfoStateRef.current;
        if (lastState) {
          const last = assessNetwork(lastState);
          setStrengthLabel(last.strengthLabel);
          if (last.condition === "good") {
            prevConditionRef.current = "good";
            showRestoredBanner();
          }
        }
        pendingGoodRevealRef.current = false;
      }
    }, GOOD_NETWORK_STARTUP_DELAY_MS);

    NetInfo.fetch().then((state) => handleNetworkChange(state));

    const unsubscribe = NetInfo.addEventListener((state) =>
      handleNetworkChange(state)
    );

    return () => {
      unsubscribe();
      if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
      if (offlineIntervalRef.current) clearInterval(offlineIntervalRef.current);
      if (startupDelayTimerRef.current) clearTimeout(startupDelayTimerRef.current);
    };
  }, [handleNetworkChange, showRestoredBanner]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return (
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) &&
          gestureState.dy < -5
        );
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy < 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -35 || gestureState.vy < -0.4) {
          slideOut();
        } else {
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

  const handleRetry = useCallback(() => {
    NetInfo.fetch().then((state) => {
      handleNetworkChange(state, true);
    });
    onRetry?.();
  }, [handleNetworkChange, onRetry]);

  if (!isVisible) return null;

  const topPad = Platform.OS === "ios" ? insets.top : 8;
  const isOfflineOrWeak = bannerState === "offline" || bannerState === "weak";

  const bannerConfig = {
    offline: {
      bg: "#B91C1C",
      icon: WifiDisconnected01Icon,
      iconColor: "#FCA5A5",
      title: "No internet connection",
      subtitleFallback: "Changes will sync when you're back online",
    },
    weak: {
      bg: "#92400E",
      icon: Alert01Icon,
      iconColor: "#FCD34D",
      title: "Connection unstable",
      subtitleFallback: "Some features may not work correctly",
    },
    restored: {
      bg: Colors.primary,
      icon: Wifi01Icon,
      iconColor: "#BBF7D0",
      title: "Connected",
      subtitleFallback: "Network looks good",
    },
    hidden: {
      bg: "transparent",
      icon: WifiConnected01Icon,
      iconColor: "transparent",
      title: "",
      subtitleFallback: "",
    },
  };

  const config = bannerConfig[bannerState];

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.container,
        {
          backgroundColor: config.bg,
          marginTop: topPad,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents={isOfflineOrWeak ? "auto" : "box-none"}
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
            {strengthLabel || config.subtitleFallback}
          </Text>
        </View>

        {isOfflineOrWeak && (
          <Pressable
            onPress={handleRetry}
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