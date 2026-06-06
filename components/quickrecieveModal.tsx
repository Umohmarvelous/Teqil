
// ─── Quick Receive Modal (driver's equivalent of quick transfer) ───────────────
// components/QuickTransferModal.tsx
import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
  Animated,
} from "react-native";
import { FB } from "@/constants/fbPalette";
import { Colors } from "@/constants/colors";
import QRReceiveScreen from "@/app/(driver)/qr-receive";
import { useSettingsStore } from "@/src/store/useSettingsStore";




interface QuickReceiveModalProps { 
  visible: boolean;
  onClose: () => void;
  driverId?: string;
}


export default function QuickReceiveModal({ visible, onClose, driverId }: QuickReceiveModalProps) {

  const { theme } = useSettingsStore();

  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : Colors.border;

   const slideY = useRef(new Animated.Value(400)).current;
   const backdropOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, damping: 22, stiffness: 160, useNativeDriver: true }),
        Animated.timing(backdropOp, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: 400, duration: 240, useNativeDriver: true }),
        Animated.timing(backdropOp, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
     }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Animated.View style={[qr.backdrop, { opacity: backdropOp }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[qr.sheet, { transform: [{ translateY: slideY }] }, {backgroundColor: bg}]}>
        <View style={qr.handle} />

        <QRReceiveScreen/>
      </Animated.View>
    </Modal>
  );
}


const qr = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    zIndex: 1,
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    // paddingBottom: 44,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 24,
  
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 20,
  },
  title: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.text },
  sub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    marginBottom: 20,
  },
  idBox: {
    backgroundColor: Colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,

  },
  idLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: FB.textSec,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  idValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: Colors.text,
    letterSpacing: 3,
  },
  qrPlaceholder: {
    alignItems: "center",
    paddingVertical: 24,
    // gap: 10,
  },
  qrHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.overlay,
  },
  closeBtn: {
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 19, color: Colors.text },
});
