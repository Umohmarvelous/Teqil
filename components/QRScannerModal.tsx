



// // ─── QR Scanner modal ─────────────────────────────────────────────────────────
// // IMPORTANT: useCameraPermissions MUST be called unconditionally at the top of
// // this component — React hooks cannot be called inside conditions or after

// import { Ionicons } from "@expo/vector-icons";
// import { useEffect, useRef, useState } from "react";
// import { Modal, Pressable, StyleSheet, Text, View,   Animated,
//   Easing, } from "react-native";
// import { useSafeAreaInsets } from "react-native-safe-area-context";
// import * as Haptics from "expo-haptics";
// import { Colors } from "@/constants/colors";
// import { useSettingsStore } from "@/src/store/useSettingsStore";

// // ─── Camera module — loaded at module level, not inside a component ───────────
// // We need the hook (useCameraPermissions) to be available unconditionally so it
// // can be called at component top-level. We stash it here; if expo-camera is not
// // installed both values stay null and the scanner shows an install prompt.
// let CameraView: React.ComponentType<any> | null = null;
// let _useCameraPermissions: (() => [any, () => Promise<any>]) | null = null;

// try {
//   // eslint-disable-next-line @typescript-eslint/no-var-requires
//   const cam = require("expo-camera");
//   CameraView = cam.CameraView ?? null;
//   _useCameraPermissions = cam.useCameraPermissions ?? null;
// } catch {
//   // expo-camera not installed — scanner shows install prompt instead
// }
// // early returns. We call it always and only use the result when needed.
// export default function QRScannerModal({
//   visible,
//   onClose,
//   onScan,
// }: {
//   visible: boolean;
//   onClose: () => void;
//   onScan: (data: string) => void;
// }) {
//   const insets = useSafeAreaInsets();



//   const { theme } = useSettingsStore();
//   const isDark = theme === "dark";
//   // const tabBarBg = isDark ? Colors.background : Colors.textWhite;
//   // const borderColor = isDark ? "rgba(255,255,255,0.07)" : "#E5E8EC";
//   const textColor = isDark ? Colors.textWhite : Colors.text;
//   // const cardBg = isDark ? "rgba(255,255,255,0.08)" : "#FFFFFF";



//   // Always call the hook unconditionally. If the module isn't available,
//   // _useCameraPermissions is null so we fall back to a no-op.
//   // This satisfies Rules of Hooks — the hook call itself never moves.
//   const cameraHookResult = _useCameraPermissions
//     ? 
//       _useCameraPermissions()
//     : ([null, async () => {}] as const);

//   const permission = cameraHookResult[0];
//   const requestPermission = cameraHookResult[1];

//   const [scanned, setScanned] = useState(false);

//   // Keep callback refs stable
//   const requestPermissionRef = useRef(requestPermission);
//   useEffect(() => {
//     requestPermissionRef.current = requestPermission;
//   }, [requestPermission]);

//   useEffect(() => {
//     if (!visible) return;
//     setScanned(false);
//     if (permission && !permission.granted) {
//       requestPermissionRef.current();
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [visible]); // permission intentionally omitted — we only want this on open

//   const handleBarCodeScanned = ({
//     data,
//   }: {
//     type: string;
//     data: string;
//   }) => {
//     if (scanned) return;
//     setScanned(true);
//     Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
//     onScan(data);
//     onClose();
//   };

//   if (!visible) return null;

//   // expo-camera not installed
//   if (!CameraView) {
//     return (
//       <Modal
//         transparent
//         visible={visible}
//         // animationType="fade"
//         onRequestClose={onClose}
//       >
//         <View style={scanStyles.overlay}>
//           <View style={scanStyles.noCameraCard}>
//             <Ionicons
//               name="camera-outline"
//               size={48}
//               color="rgba(255,255,255,0.4)"
//             />
//             <Text style={scanStyles.noCameraTitle}>Camera not available</Text>
//             <Text style={scanStyles.noCameraDesc}>
//               Run: npx expo install expo-camera{"\n"}to enable QR scanning
//             </Text>
//             <Pressable style={scanStyles.noCameraBtn} onPress={onClose}>
//               <Text style={[scanStyles.noCameraBtnText, {color:Colors.error}]}>Close</Text>
//             </Pressable>
//           </View>
//         </View>
//       </Modal>
//     );
//   }

//   // Permission not yet granted
//   if (!permission?.granted) {
//     return (
//       <Modal
//         transparent
//         visible={visible}
//         // animationType="fade"
//         onRequestClose={onClose}
//       >
//         <View style={scanStyles.overlay}>
//           <View style={scanStyles.noCameraCard}>
//             <Ionicons
//               name="camera-outline"
//               size={48}
//               color="rgba(255,255,255,0.4)"
//             />
//             <Text style={scanStyles.noCameraTitle}>
//               Camera permission needed
//             </Text>
//             <Pressable
//               style={scanStyles.noCameraBtn}
//               onPress={() => requestPermissionRef.current()}
//             >
//               <Text style={[scanStyles.noCameraBtnText, {color:Colors.textWhite}]}>Grant Access</Text>
//             </Pressable>
//             <Pressable onPress={onClose} style={{ marginTop: 12, flexDirection: 'row',gap:10 }}>
//               {/* <Ionicons name="close" size={20} color={Colors.error} /> */}
//               <Text
//                 style={{
//                   color: Colors.error,
//                   fontFamily: "Poppins_400Regular",
//                 }}
//               >
//                 Cancel
//               </Text>
//             </Pressable>
//           </View>
//         </View>
//       </Modal>
//     );
//   }

//   // Full camera scanner
//   return (
//     <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
//       <View style={scanStyles.root}>
//         <CameraView
//           style={StyleSheet.absoluteFillObject}
//           facing="back"
//           onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
//           barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
//         />

//         {/* Top bar */}
//         <View style={[scanStyles.topBar, { paddingTop: insets.top + 12 }]}>
//           <Pressable style={scanStyles.closeBtn} onPress={onClose}>
//             <Ionicons name="close" size={22} color="#fff" />
//           </Pressable>
//           <Text style={[scanStyles.topBarTitle, {color:textColor}]}>Scan Driver QR Code</Text>
//           <View style={{ width: 40 }} />
//         </View>

//         {/* Viewfinder */}
//         <View style={scanStyles.viewfinderWrap}>
//           <View style={scanStyles.viewfinder}>
//             <View style={[scanStyles.corner, scanStyles.cornerTL]} />
//             <View style={[scanStyles.corner, scanStyles.cornerTR]} />
//             <View style={[scanStyles.corner, scanStyles.cornerBL]} />
//             <View style={[scanStyles.corner, scanStyles.cornerBR]} />
//             <ScanLine />
//           </View>
//         </View>

//         {/* Fix: replaced unescaped ' with &apos; equivalent via template literal */}
//         <Text style={scanStyles.hint}>
//           Point your camera at the driver&apos;s QR code
//         </Text>
//       </View>
//     </Modal>
//   );
// }

// // ─── Animated scan line ───────────────────────────────────────────────────────
// function ScanLine() {
//   const anim = useRef(new Animated.Value(0)).current;

//   useEffect(() => {
//     const loop = Animated.loop(
//       Animated.sequence([
//         Animated.timing(anim, {
//           toValue: 1,
//           duration: 1800,
//           useNativeDriver: true,
//           easing: Easing.inOut(Easing.sin), // was Easing.sine — doesn't exist
//         }),
//         Animated.timing(anim, {
//           toValue: 0,
//           duration: 1800,
//           useNativeDriver: true,
//           easing: Easing.inOut(Easing.sin),
//         }),
//       ])
//     );
//     loop.start();
//     return () => loop.stop();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []); // anim is a stable Animated.Value ref — intentionally omitted

//   const translateY = anim.interpolate({
//     inputRange: [0, 1],
//     outputRange: [0, 220],
//   });

//   return (
//     <Animated.View
//       style={[scanStyles.scanLine, { transform: [{ translateY }] }]}
//     />
//   );
// }




// const scanStyles = StyleSheet.create({
//   root: {
//     flex: 1,
//     // backgroundColor: "rgb(0 0 0)909",
//   },
//   overlay: {
//     flex: 1,
//     backgroundColor: "rgba(0 0 0 / 0.46)",
//     alignItems: "center",
//     justifyContent: "center",
//     paddingHorizontal: 32,
//   },
//   topBar: {
//     position: "absolute",
//     top: 0,
//     left: 0,
//     right: 0,
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     paddingHorizontal: 20,
//     paddingBottom: 12,
//     backgroundColor: "rgba(0,0,0,0.6)",
//     zIndex: 10,
//   },
//   topBarTitle: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 16,
//   },
//   closeBtn: {
//     width: 40,
//     height: 40,
//     borderRadius: 12,
//     backgroundColor: "rgba(255,255,255,0.12)",
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   viewfinderWrap: {
//     flex: 1,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   viewfinder: {
//     width: 240,
//     height: 240,
//     position: "relative",
//     overflow: "hidden",
//   },
//   corner: {
//     position: "absolute",
//     width: 32,
//     height: 32,
//     borderColor: Colors.primary,
//   },
//   cornerTL: {
//     top: 0,
//     left: 0,
//     borderTopWidth: 5,
//     borderLeftWidth: 5,
//     borderTopLeftRadius: 16,
//   },
//   cornerTR: {
//     top: 0,
//     right: 0,
//     borderTopWidth: 5,
//     borderRightWidth: 5,
//     borderTopRightRadius: 16,
//   },
//   cornerBL: {
//     bottom: 0,
//     left: 0,
//     borderBottomWidth: 5,
//     borderLeftWidth: 5,
//     borderBottomLeftRadius: 16,
//   },
//   cornerBR: {
//     bottom: 0,
//     right: 0,
//     borderBottomWidth: 5,
//     borderRightWidth: 5,
//     borderBottomRightRadius: 16,
//   },
//   scanLine: {
//     position: "absolute",
//     left: 12,
//     right: 12,
//     height: 2,
//     backgroundColor: Colors.primary,
//     shadowColor: Colors.primary,
//     shadowOffset: { width: 0, height: 0 },
//     shadowOpacity: 0.8,
//     shadowRadius: 4,
//   },
//   hint: {
//     position: "absolute",
//     bottom: 80,
//     left: 0,
//     right: 0,
//     textAlign: "center",
//     fontFamily: "Poppins_400Regular",
//     fontSize: 14,
//     color: "rgba(255,255,255,0.6)",
//   },
//   noCameraCard: {
//     backgroundColor: "#1A1A1A",
//     borderRadius: 24,
//     padding: 32,
//     alignItems: "center",
//     gap: 14,
//     width: "100%",
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.08)",
//   },
//   noCameraTitle: {
//     fontFamily: "Poppins_700Bold",
//     fontSize: 18,
//     color: "#fff",
//     textAlign: "center",
//   },
//   noCameraDesc: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 13,
//     color: "rgba(255,255,255,0.45)",
//     textAlign: "center",
//     lineHeight: 20,
//   },
//   noCameraBtn: {
//     backgroundColor: Colors.overlayLight,
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.08)",
//     borderRadius: 32,
//     paddingHorizontal: 28,
//     paddingVertical: 12,
//     marginTop: 6,
//   },
//   noCameraBtnText: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 14,
//   },
// });






















import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import * as ImagePicker from "expo-image-picker";
import { Colors } from "@/constants/colors";

let CameraView: React.ComponentType<any> | null = null;
let _useCameraPermissions: (() => [any, () => Promise<any>]) | null = null;

try {
  const cam = require("expo-camera");
  CameraView = cam.CameraView ?? null;
  _useCameraPermissions = cam.useCameraPermissions ?? null;
} catch {
  // expo-camera not installed
}

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
  
  const cameraHookResult = _useCameraPermissions
    ? _useCameraPermissions()
    : ([null, async () => {}] as const);

  const permission = cameraHookResult[0];
  const requestPermission = cameraHookResult[1];

  const [scanned, setScanned] = useState(false);
  const [showInstruction, setShowInstruction] = useState(true);
  const [flashOn, setFlashOn] = useState(false);

  const requestPermissionRef = useRef(requestPermission);
  
  useEffect(() => {
    requestPermissionRef.current = requestPermission;
  }, [requestPermission]);

  useEffect(() => {
    if (!visible) return;
    setScanned(false);
    setShowInstruction(true);
    setFlashOn(false);
    if (permission && !permission.granted) {
      requestPermissionRef.current();
    }
  }, [visible, permission]);

  const handleBarCodeScanned = ({ data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onScan(data);
    onClose();
  };

  const openSettings = () => {
    Linking.openSettings();
  };

  const pickImage = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        // Fallback or external logic to scan QR from static image
        // as CameraView doesn't natively expose an easy JS method for static images
        Alert.alert("QR Picked", "This feature integrates with your static QR parser.");
      }
    } catch (error) {
      console.log("Error picking image:", error);
    }
  };

  if (!visible) return null;

  if (!CameraView) {
    return (
      <Modal transparent visible={visible} onRequestClose={onClose}>
        <View style={scanStyles.overlay}>
          <View style={scanStyles.noCameraCard}>
            <Ionicons name="camera-outline" size={48} color="rgba(255,255,255,0.4)" />
            <Text style={scanStyles.noCameraTitle}>Camera not available</Text>
            <Text style={scanStyles.noCameraDesc}>
              Run: npx expo install expo-camera{"\n"}to enable QR scanning
            </Text>
            <Pressable style={scanStyles.noCameraBtn} onPress={onClose}>
              <Text style={[scanStyles.noCameraBtnText, { color: Colors.error }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  if (!permission?.granted) {
    return (
      <Modal transparent visible={visible} onRequestClose={onClose}>
        <View style={scanStyles.overlay}>
          <View style={scanStyles.noCameraCard}>
            <Ionicons name="camera-outline" size={48} color="rgba(255,255,255,0.4)" />
            <Text style={scanStyles.noCameraTitle}>Camera permission needed</Text>
            <Pressable style={scanStyles.noCameraBtn} onPress={openSettings}>
              <Text style={[scanStyles.noCameraBtnText, { color: Colors.textWhite }]}>
                Open Settings
              </Text>
            </Pressable>
            <Pressable onPress={onClose} style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
              <Text style={{ color: Colors.error, fontFamily: "Poppins_400Regular" }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={scanStyles.root}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          enableTorch={flashOn}
          onBarcodeScanned={scanned || showInstruction ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        />

        {/* Top bar */}
        <View style={[scanStyles.topBar, { paddingTop: insets.top + 12 }]}>
          <Pressable style={scanStyles.iconBtn} onPress={onClose}>
            <Ionicons name="close" size={30} color="#fff" />
          </Pressable>
          <Pressable style={scanStyles.iconBtn} onPress={() => setFlashOn(!flashOn)}>
            <Ionicons name={flashOn ? "flash" : "flash-off"} size={26} color="#fff" />
          </Pressable>
        </View>

        {/* Viewfinder exactly like WhatsApp */}
        <View style={scanStyles.viewfinderWrap}>
          <View style={scanStyles.viewfinder}>
            <View style={[scanStyles.corner, scanStyles.cornerTL]} />
            <View style={[scanStyles.corner, scanStyles.cornerTR]} />
            <View style={[scanStyles.corner, scanStyles.cornerBL]} />
            <View style={[scanStyles.corner, scanStyles.cornerBR]} />
          </View>
        </View>

        {/* Bottom bar - WhatsApp Style */}
        <View style={[scanStyles.bottomBar, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <Pressable style={scanStyles.galleryBtn} onPress={pickImage}>
            <Ionicons name="image-outline" size={32} color="#fff" />
          </Pressable>
          
          <Pressable style={scanStyles.myCodeBtn}>
            <Text style={scanStyles.myCodeText}>My code</Text>
          </Pressable>
          
          <View style={{ width: 44 }} /> {/* Balance for layout flex */}
        </View>

        {/* WhatsApp Style Instruction Modal overlaying the camera */}
        {showInstruction && (
          <Modal transparent animationType="fade" visible={showInstruction}>
            <View style={instStyles.overlay}>
              <View style={instStyles.card}>
                <Text style={instStyles.title}>Scan a QR code</Text>
                
                <View style={instStyles.graphicContainer}>
                  <View style={[instStyles.qrBox, instStyles.qrBoxBack]}>
                    <Ionicons name="qr-code" size={45} color="#666" />
                  </View>
                  <View style={[instStyles.qrBox, instStyles.qrBoxFront]}>
                    <Ionicons name="qr-code" size={45} color="#fff" />
                  </View>
                </View>

                <Pressable style={instStyles.okBtn} onPress={() => setShowInstruction(false)}>
                  <Text style={instStyles.okBtnText}>OK</Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────

const scanStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
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
    zIndex: 10,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  viewfinderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  viewfinder: {
    width: 260,
    height: 260,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: "#25D366", // WhatsApp Green
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  galleryBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  myCodeBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
  },
  myCodeText: {
    color: "#fff",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
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
    backgroundColor: Colors.overlayLight,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 32,
    paddingHorizontal: 28,
    paddingVertical: 12,
    marginTop: 6,
  },
  noCameraBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
});

const instStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    width: "90%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    color: "#000",
    marginBottom: 32,
  },
  graphicContainer: {
    width: 140,
    height: 140,
    position: "relative",
    marginBottom: 40,
  },
  qrBox: {
    position: "absolute",
    width: 90,
    height: 120,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  qrBoxBack: {
    backgroundColor: "#E5E5E5",
    top: 10,
    left: 0,
  },
  qrBoxFront: {
    backgroundColor: "#333",
    top: 20,
    right: 0,
  },
  okBtn: {
    backgroundColor: "#25D366", // WhatsApp Green
    width: "100%",
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
  },
  okBtnText: {
    color: "#fff",
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
  },
});