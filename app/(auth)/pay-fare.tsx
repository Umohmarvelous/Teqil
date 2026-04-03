/**
 * app/(auth)/pay-fare.tsx
 *
 * Pay Transport Fare screen.
 * - Input form: driver ID / trip code, amount, note
 * - Quick-amount buttons
 * - QR code scanner (expo-camera / expo-barcode-scanner) to scan driver QR
 * - On successful payment → /(passenger)
 *
 * Uses expo-camera for QR scanning.
 * Install: npx expo install expo-camera
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  Animated,
  Easing,
  Modal,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { useAuthStore } from "@/src/store/useStore";
import { formatNaira } from "@/src/utils/helpers";

// Conditionally import camera to avoid crashing on web
let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  const cam = require("expo-camera");
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
} catch {
  // expo-camera not installed — scanner will show install prompt
}

const { width: W } = Dimensions.get("window");

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

// ─── Success overlay ──────────────────────────────────────────────────────────
function SuccessOverlay({ visible, amount, onDone }: { visible: boolean; amount: string; onDone: () => void }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, damping: 14, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
      // Auto-navigate after 2.5s
      const t = setTimeout(() => onDone(), 2500);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[successStyles.overlay, { opacity }]}>
      <Animated.View style={[successStyles.card, { transform: [{ scale }] }]}>
        <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={successStyles.iconCircle}>
          <Ionicons name="checkmark" size={44} color="#fff" />
        </LinearGradient>
        <Text style={successStyles.title}>Payment Sent!</Text>
        <Text style={successStyles.amount}>{amount}</Text>
        <Text style={successStyles.sub}>Your fare has been sent to the driver</Text>
        <Pressable style={successStyles.btn} onPress={onDone}>
          <Text style={successStyles.btnText}>Continue to Dashboard</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// ─── QR Scanner modal ─────────────────────────────────────────────────────────
function QRScannerModal({
  visible,
  onClose,
  onScan,
}: {
  visible: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions
    ? useCameraPermissions()
    : [null, () => {}];
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible && permission && !permission.granted) {
      requestPermission();
    }
    if (visible) setScanned(false);
  }, [visible]);

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onScan(data);
    onClose();
  };

  if (!visible) return null;

  // No camera package
  if (!CameraView) {
    return (
      <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={scanStyles.overlay}>
          <View style={scanStyles.noCameraCard}>
            <Ionicons name="camera-outline" size={48} color="rgba(255,255,255,0.4)" />
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

  if (!permission?.granted) {
    return (
      <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={scanStyles.overlay}>
          <View style={scanStyles.noCameraCard}>
            <Ionicons name="camera-outline" size={48} color="rgba(255,255,255,0.4)" />
            <Text style={scanStyles.noCameraTitle}>Camera permission needed</Text>
            <Pressable style={scanStyles.noCameraBtn} onPress={() => requestPermission()}>
              <Text style={scanStyles.noCameraBtnText}>Grant Access</Text>
            </Pressable>
            <Pressable onPress={onClose} style={{ marginTop: 12 }}>
              <Text style={{ color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular" }}>Cancel</Text>
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
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        />

        {/* Overlay UI */}
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
            {/* Corner brackets */}
            <View style={[scanStyles.corner, scanStyles.cornerTL]} />
            <View style={[scanStyles.corner, scanStyles.cornerTR]} />
            <View style={[scanStyles.corner, scanStyles.cornerBL]} />
            <View style={[scanStyles.corner, scanStyles.cornerBR]} />

            {/* Scan line */}
            <ScanLine />
          </View>
        </View>

        <Text style={scanStyles.hint}>
          Point your camera at the driver's QR code
        </Text>
      </View>
    </Modal>
  );
}

function ScanLine() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true, easing: Easing.inOut(Easing.sine) }),
        Animated.timing(anim, { toValue: 0, duration: 1800, useNativeDriver: true, easing: Easing.inOut(Easing.sine) }),
      ])
    ).start();
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 220] });

  return (
    <Animated.View style={[scanStyles.scanLine, { transform: [{ translateY }] }]} />
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function PayFareScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [driverRef, setDriverRef] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Entrance animations
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const handleQRScan = (data: string) => {
    // QR codes from drivers will contain their driver ID or trip code
    // Format expected: "TEQIL:DRV-XXXXXX" or "TEQIL:TRIPCODE"
    const parsed = data.replace("TEQIL:", "").trim();
    setDriverRef(parsed);
    Alert.alert("QR Scanned", `Driver reference: ${parsed}`);
  };

  const handleQuickAmount = (val: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAmount(val.toString());
  };

  const handlePay = useCallback(async () => {
    if (!driverRef.trim()) {
      Alert.alert("Missing Info", "Please enter a driver ID or trip code, or scan a QR code.");
      return;
    }
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount < 50) {
      Alert.alert("Invalid Amount", "Please enter an amount of at least ₦50.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsProcessing(true);

    // Simulate payment processing (replace with real payment gateway)
    await new Promise((r) => setTimeout(r, 1800));

    setIsProcessing(false);
    setPaymentSuccess(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [driverRef, amount]);

  const handleSuccessDone = () => {
    // Navigate to passenger dashboard after payment
    if (user?.id) {
      router.replace("/(passenger)");
    } else {
      // Not signed in yet — go to register
      router.replace("/(auth)/register");
    }
  };

  const numAmount = parseFloat(amount) || 0;
  const canPay = driverRef.trim().length > 0 && numAmount >= 50;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#060606", "#0A0A0A"]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <Text style={styles.headerTitle}>Pay Transport Fare</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + (Platform.OS === "web" ? 34 : 0) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity, transform: [{ translateY }], gap: 20 }}>
          {/* Amount display */}
          <View style={styles.amountCard}>
            <LinearGradient
              colors={[Colors.primaryDark, "#003D1F"]}
              style={styles.amountCardGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.amountLabel}>Amount to Pay</Text>
              <Text style={styles.amountDisplay}>
                {numAmount > 0 ? formatNaira(numAmount) : "₦0.00"}
              </Text>
              <Text style={styles.amountSub}>Nigerian Naira</Text>
            </LinearGradient>
          </View>

          {/* Quick amounts */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Quick Amount</Text>
            <View style={styles.quickRow}>
              {QUICK_AMOUNTS.map((val) => (
                <Pressable
                  key={val}
                  style={({ pressed }) => [
                    styles.quickBtn,
                    amount === val.toString() && styles.quickBtnActive,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => handleQuickAmount(val)}
                >
                  <Text
                    style={[
                      styles.quickBtnText,
                      amount === val.toString() && styles.quickBtnTextActive,
                    ]}
                  >
                    ₦{val.toLocaleString()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Custom amount input */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Or enter amount</Text>
            <View style={styles.inputRow}>
              <Text style={styles.currencySymbol}>₦</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor="rgba(255,255,255,0.2)"
                value={amount}
                onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {/* Driver reference */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Driver ID / Trip Code</Text>
            <View style={styles.driverInputRow}>
              <Ionicons name="id-card-outline" size={18} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={styles.driverInput}
                placeholder="e.g. DRV-A3X9KL or ABC123"
                placeholderTextColor="rgba(255,255,255,0.2)"
                value={driverRef}
                onChangeText={setDriverRef}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              {/* QR Scanner button */}
              <Pressable
                style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setScannerVisible(true)}
              >
                <Ionicons name="qr-code-outline" size={20} color={Colors.primary} />
              </Pressable>
            </View>
            <Text style={styles.fieldHint}>
              Ask your driver for their ID or scan their QR code
            </Text>
          </View>

          {/* Note (optional) */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Note (optional)</Text>
            <View style={styles.inputRowFull}>
              <TextInput
                style={styles.noteInput}
                placeholder="e.g. Lagos to Ibadan"
                placeholderTextColor="rgba(255,255,255,0.2)"
                value={note}
                onChangeText={setNote}
                maxLength={100}
              />
            </View>
          </View>

          {/* Payment method info */}
          <View style={styles.payMethodCard}>
            <Ionicons name="information-circle-outline" size={16} color="rgba(255,255,255,0.4)" />
            <Text style={styles.payMethodText}>
              Payment is processed securely. Integration with Paystack and Flutterwave coming soon.
            </Text>
          </View>

          {/* Pay button */}
          <Pressable
            style={({ pressed }) => [
              styles.payBtn,
              !canPay && styles.payBtnDisabled,
              isProcessing && styles.payBtnDisabled,
              pressed && canPay && { opacity: 0.88 },
            ]}
            onPress={handlePay}
            disabled={!canPay || isProcessing}
          >
            <LinearGradient
              colors={canPay ? [Colors.primary, Colors.primaryDark] : ["#2A2A2A", "#222"]}
              style={styles.payBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons
                name={isProcessing ? "hourglass-outline" : "send"}
                size={20}
                color={canPay ? "#fff" : "rgba(255,255,255,0.25)"}
              />
              <Text
                style={[
                  styles.payBtnText,
                  !canPay && styles.payBtnTextDisabled,
                ]}
              >
                {isProcessing
                  ? "Processing..."
                  : canPay
                  ? `Pay ${formatNaira(numAmount)}`
                  : "Enter amount & driver ID"}
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </ScrollView>

      {/* QR Scanner */}
      {useCameraPermissions && (
        <QRScannerModal
          visible={scannerVisible}
          onClose={() => setScannerVisible(false)}
          onScan={handleQRScan}
        />
      )}
      {!useCameraPermissions && scannerVisible && (
        <QRScannerModal
          visible={scannerVisible}
          onClose={() => setScannerVisible(false)}
          onScan={handleQRScan}
        />
      )}

      {/* Success overlay */}
      <SuccessOverlay
        visible={paymentSuccess}
        amount={formatNaira(numAmount)}
        onDone={handleSuccessDone}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 20,
  },
  amountCard: {
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  amountCardGradient: {
    padding: 28,
    alignItems: "center",
    gap: 6,
  },
  amountLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  amountDisplay: {
    fontFamily: "Poppins_700Bold",
    fontSize: 42,
    color: "#fff",
    letterSpacing: -1,
  },
  amountSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
  },
  section: { gap: 10 },
  sectionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  quickRow: {
    flexDirection: "row",
    gap: 10,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  quickBtnActive: {
    backgroundColor: "rgba(0,166,81,0.18)",
    borderColor: Colors.primary,
  },
  quickBtnText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
  },
  quickBtnTextActive: {
    color: Colors.primary,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 16,
    height: 58,
    gap: 8,
  },
  currencySymbol: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: Colors.primary,
  },
  amountInput: {
    flex: 1,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 22,
    color: "#fff",
  },
  driverInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingLeft: 16,
    height: 54,
    gap: 10,
  },
  driverInput: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#fff",
  },
  scanBtn: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.08)",
  },
  fieldHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.3)",
    marginTop: -4,
  },
  inputRowFull: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 16,
    height: 54,
    justifyContent: "center",
  },
  noteInput: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#fff",
  },
  payMethodCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  payMethodText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.35)",
    lineHeight: 18,
  },
  payBtn: {
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
    marginTop: 4,
  },
  payBtnDisabled: { shadowOpacity: 0, elevation: 0 },
  payBtnGradient: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  payBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  payBtnTextDisabled: {
    color: "rgba(255,255,255,0.25)",
  },
});

const successStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    zIndex: 100,
  },
  card: {
    backgroundColor: "#141414",
    borderRadius: 28,
    padding: 36,
    alignItems: "center",
    gap: 14,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(0,166,81,0.2)",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 20,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
    color: "#fff",
  },
  amount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 32,
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  sub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
  },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    marginTop: 6,
  },
  btnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});

const scanStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
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
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
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