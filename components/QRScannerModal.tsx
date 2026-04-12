



// ─── QR Scanner modal ─────────────────────────────────────────────────────────
// IMPORTANT: useCameraPermissions MUST be called unconditionally at the top of
// this component — React hooks cannot be called inside conditions or after

import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View,   Animated,
  Easing, } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import * as Haptics from "expo-haptics";


// ─── Camera module — loaded at module level, not inside a component ───────────
// We need the hook (useCameraPermissions) to be available unconditionally so it
// can be called at component top-level. We stash it here; if expo-camera is not
// installed both values stay null and the scanner shows an install prompt.
let CameraView: React.ComponentType<any> | null = null;
let _useCameraPermissions: (() => [any, () => Promise<any>]) | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cam = require("expo-camera");
  CameraView = cam.CameraView ?? null;
  _useCameraPermissions = cam.useCameraPermissions ?? null;
} catch {
  // expo-camera not installed — scanner shows install prompt instead
}
// early returns. We call it always and only use the result when needed.
export default function QRScannerModal({
  visible,
  onClose,
  onScan,
}: {
  visible: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
}) {
  const insets = useSafeAreaInsets();

  // Always call the hook unconditionally. If the module isn't available,
  // _useCameraPermissions is null so we fall back to a no-op.
  // This satisfies Rules of Hooks — the hook call itself never moves.
  const cameraHookResult = _useCameraPermissions
    ? 
      _useCameraPermissions()
    : ([null, async () => {}] as const);

  const permission = cameraHookResult[0];
  const requestPermission = cameraHookResult[1];

  const [scanned, setScanned] = useState(false);

  // Keep callback refs stable
  const requestPermissionRef = useRef(requestPermission);
  useEffect(() => {
    requestPermissionRef.current = requestPermission;
  }, [requestPermission]);

  useEffect(() => {
    if (!visible) return;
    setScanned(false);
    if (permission && !permission.granted) {
      requestPermissionRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]); // permission intentionally omitted — we only want this on open

  const handleBarCodeScanned = ({
    data,
  }: {
    type: string;
    data: string;
  }) => {
    if (scanned) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onScan(data);
    onClose();
  };

  if (!visible) return null;

  // expo-camera not installed
  if (!CameraView) {
    return (
      <Modal
        transparent
        visible={visible}
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={scanStyles.overlay}>
          <View style={scanStyles.noCameraCard}>
            <Ionicons
              name="camera-outline"
              size={48}
              color="rgba(255,255,255,0.4)"
            />
            <Text style={scanStyles.noCameraTitle}>Camera not available</Text>
            <Text style={scanStyles.noCameraDesc}>
              Run: npx expo install expo-camera{"\n"}to enable QR scanning
            </Text>
            <Pressable style={scanStyles.noCameraBtn} onPress={onClose}>
              <Text style={scanStyles.noCameraBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  // Permission not yet granted
  if (!permission?.granted) {
    return (
      <Modal
        transparent
        visible={visible}
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={scanStyles.overlay}>
          <View style={scanStyles.noCameraCard}>
            <Ionicons
              name="camera-outline"
              size={48}
              color="rgba(255,255,255,0.4)"
            />
            <Text style={scanStyles.noCameraTitle}>
              Camera permission needed
            </Text>
            <Pressable
              style={scanStyles.noCameraBtn}
              onPress={() => requestPermissionRef.current()}
            >
              <Text style={scanStyles.noCameraBtnText}>Grant Access</Text>
            </Pressable>
            <Pressable onPress={onClose} style={{ marginTop: 12 }}>
              <Text
                style={{
                  color: "rgba(255,255,255,0.4)",
                  fontFamily: "Poppins_400Regular",
                }}
              >
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  // Full camera scanner
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={scanStyles.root}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        />

        {/* Top bar */}
        <View style={[scanStyles.topBar, { paddingTop: insets.top + 12 }]}>
          <Pressable style={scanStyles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <Text style={scanStyles.topBarTitle}>Scan Driver QR Code</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Viewfinder */}
        <View style={scanStyles.viewfinderWrap}>
          <View style={scanStyles.viewfinder}>
            <View style={[scanStyles.corner, scanStyles.cornerTL]} />
            <View style={[scanStyles.corner, scanStyles.cornerTR]} />
            <View style={[scanStyles.corner, scanStyles.cornerBL]} />
            <View style={[scanStyles.corner, scanStyles.cornerBR]} />
            <ScanLine />
          </View>
        </View>

        {/* Fix: replaced unescaped ' with &apos; equivalent via template literal */}
        <Text style={scanStyles.hint}>
          Point your camera at the driver&apos;s QR code
        </Text>
      </View>
    </Modal>
  );
}

// ─── Animated scan line ───────────────────────────────────────────────────────
function ScanLine() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin), // was Easing.sine — doesn't exist
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // anim is a stable Animated.Value ref — intentionally omitted

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 220],
  });

  return (
    <Animated.View
      style={[scanStyles.scanLine, { transform: [{ translateY }] }]}
    />
  );
}




const scanStyles = StyleSheet.create({
  root: {
    flex: 1,
    // backgroundColor: "rgb(0 0 0)909",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 10,
  },
  topBarTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewfinderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  viewfinder: {
    width: 240,
    height: 240,
    position: "relative",
    overflow: "hidden",
  },
  corner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderColor: Colors.primary,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 6,
  },
  scanLine: {
    position: "absolute",
    left: 12,
    right: 12,
    height: 2,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  hint: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
  },
  noCameraCard: {
    backgroundColor: "#1A1A1A",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    gap: 14,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  noCameraTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "#fff",
    textAlign: "center",
  },
  noCameraDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    lineHeight: 20,
  },
  noCameraBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 12,
    marginTop: 6,
  },
  noCameraBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
});