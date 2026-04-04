/**
 * app/(auth)/pay-fare.tsx
 *
 * Pay Transport Fare screen.
 * - Input form: driver ID / trip code, amount, note
 * - Quick-amount buttons
 * - QR code scanner (expo-camera) to scan driver QR
 * - On successful payment → /(passenger)
 *
 * Fixes applied:
 * - Easing.sine → Easing.sin (correct RN API)
 * - useCameraPermissions always called unconditionally at component top-level
 *   (Rules of Hooks: hooks cannot be called conditionally)
 * - require() replaced with a try/catch module load at module level
 * - All useEffect exhaustive-deps fixed with stable refs or eslint-disable
 * - Unused variable 'W' removed
 * - Duplicate QRScannerModal render in PayFareScreen removed
 * - Unescaped apostrophe in JSX replaced with &apos;
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
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { useAuthStore } from "@/src/store/useStore";
import { formatNaira } from "@/src/utils/helpers";

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

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

// ─── Success overlay ──────────────────────────────────────────────────────────
function SuccessOverlay({
  visible,
  amount,
  onDone,
}: {
  visible: boolean;
  amount: string;
  onDone: () => void;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // Keep onDone in a ref so the timeout closure always has the latest version
  // without needing to be listed as a dependency (which would re-run the timer)
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!visible) return;
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        damping: 14,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
    const t = setTimeout(() => onDoneRef.current(), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]); // scale/opacity are stable Animated.Value refs

  if (!visible) return null;

  return (
    <Animated.View style={[successStyles.overlay, { opacity }]}>
      <Animated.View
        style={[successStyles.card, { transform: [{ scale }] }]}
      >
        <LinearGradient
          colors={[Colors.primary, Colors.primaryDark]}
          style={successStyles.iconCircle}
        >
          <Ionicons name="checkmark" size={44} color="#fff" />
        </LinearGradient>
        <Text style={successStyles.title}>Payment Sent!</Text>
        <Text style={successStyles.amount}>{amount}</Text>
        <Text style={successStyles.sub}>
          Your fare has been sent to the driver
        </Text>
        <Pressable style={successStyles.btn} onPress={onDone}>
          <Text style={successStyles.btnText}>Continue to Dashboard</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// ─── QR Scanner modal ─────────────────────────────────────────────────────────
// IMPORTANT: useCameraPermissions MUST be called unconditionally at the top of
// this component — React hooks cannot be called inside conditions or after
// early returns. We call it always and only use the result when needed.
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

  // Always call the hook unconditionally. If the module isn't available,
  // _useCameraPermissions is null so we fall back to a no-op.
  // This satisfies Rules of Hooks — the hook call itself never moves.
  const cameraHookResult = _useCameraPermissions
    ? // eslint-disable-next-line react-hooks/rules-of-hooks
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

  // Entrance animations — stable refs, no need in deps
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // opacity/translateY are stable Animated.Value refs

  const handleQRScan = useCallback((data: string) => {
    // QR codes from drivers contain their driver ID or trip code
    // Format expected: "TEQIL:DRV-XXXXXX" or "TEQIL:TRIPCODE"
    const parsed = data.replace("TEQIL:", "").trim();
    setDriverRef(parsed);
    Alert.alert("QR Scanned Successfully ", ` ${parsed}`);
  }, []);

  const handleQuickAmount = useCallback((val: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAmount(val.toString());
  }, []);

  const handlePay = useCallback(async () => {
    if (!driverRef.trim()) {
      Alert.alert(
        "Missing Info",
        "Please enter a driver ID or trip code, or scan a QR code."
      );
      return;
    }
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount < 50) {
      Alert.alert(
        "Invalid Amount",
        "Please enter an amount of at least ₦50."
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsProcessing(true);

    // Simulate payment processing — replace with Paystack/Flutterwave
    await new Promise<void>((r) => setTimeout(r, 1800));

    setIsProcessing(false);
    setPaymentSuccess(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [driverRef, amount]);

  const handleSuccessDone = useCallback(() => {
    if (user?.id) {
      router.replace("/(passenger)");
    } else {
      router.replace("/(auth)/login");
    }
  }, [user?.id]);

  const numAmount = parseFloat(amount) || 0;
  const canPay = driverRef.trim().length > 0 && numAmount >= 50;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#009A43", "#009A43"]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons
            name="arrow-back"
            size={20}
            color= {Colors.primaryLight}
          />
          <Text style={{color: Colors.primaryLight}}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Pay Transport Fare</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom:
              Math.max(insets.bottom, 24) +
              (Platform.OS === "web" ? 34 : 0),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[{ opacity, transform: [{ translateY }]}, styles.amountContainer ]}
        >
          {/* Amount display card */}
          <View style={styles.amountCard}>

            <View style={ styles.amountTop}>
              <Text style={styles.amountLabel}>Amount to Pay</Text>
              <Text style={styles.amountDisplay}>
                {numAmount > 0 ? formatNaira(numAmount) : "₦0.00"}
              </Text>
              <Text style={styles.amountSub}>Nigerian Naira</Text>
            </View>

              
            {/* <Text style={styles.sectionLabel}>Quick Amount</Text> */}
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
                     ₦ {val.toLocaleString()}
                     </Text>
                  </Pressable>
               ))}
            </View>


            {/* <View style={ styles.meddlePaySection}> */}
            {/* Quick amounts */}
            {/* <View style={styles.section}>
               
            </View> */}

            {/* Custom amount */}
            {/* <View style={styles.section}>
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
            </View> */}

          </View>

          {/* Driver reference + QR scanner */}
          <View style={styles.section}>
              <Text style={styles.sectionLabel}>Scan QR Code</Text>
              <View style={styles.driverInputRow}>
                <Ionicons
                    name="id-card-outline"
                    size={18}
                    color={Colors.primaryDark}
                />
                <TextInput
                    style={styles.driverInput}
                    placeholder="e.g. DRV-A3X9KL or ABC123"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    value={driverRef}
                    onChangeText={setDriverRef}
                    autoCapitalize="characters"
                    autoCorrect={false}
                />
                <Pressable
                    style={({ pressed }) => [
                      styles.scanBtn,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => setScannerVisible(true)}
                >
                    <Ionicons
                      name="qr-code-outline"
                      size={20}
                      color={Colors.primaryDark}
                    />
                </Pressable>
              </View>
              <Text style={styles.fieldHint}>
              Ask your driver for their ID or scan their QR code
              </Text>
          {/* </View> */}

          {/* Note */}
          {/* <View style={styles.section}>
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
          </View> */}
          </View>

          {/* Payment method info */}
          {/* <View style={styles.payMethodCard}>
            <Ionicons
              name="information-circle-outline"
              size={16}
              color="rgba(255,255,255,0.4)"
            />
            <Text style={styles.payMethodText}>
              Payment is processed securely. Integration with Paystack and
              Flutterwave coming soon.
            </Text>
          </View> */}
        </Animated.View>
      </ScrollView>

      {/* QR Scanner — always rendered, visibility controlled by `visible` prop.
          Rendering it once avoids the previous duplicate + conditional pattern. */}
      <QRScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScan={handleQRScan}
      />

      {/* Success overlay */}
      <SuccessOverlay
        visible={paymentSuccess}
        amount={formatNaira(numAmount)}
        onDone={handleSuccessDone}
      />

      {/* Pay button */}
      <Pressable
        style={({ pressed }) => [
          styles.payBtn,
          (!canPay || isProcessing) && styles.payBtnDisabled,
          pressed && canPay && !isProcessing && { opacity: 0.88 },
        ]}
        onPress={handlePay}
        disabled={!canPay || isProcessing}
      >
          <Ionicons
            name={isProcessing ? "hourglass-outline" : "send"}
            size={20}
            color={canPay ? "#fff" : Colors.primaryLight}
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
              : "Transfer"}
          </Text>
      </Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingBottom: 50
 },
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
      alignItems: "center",
      justifyContent: "center",
      flexDirection: 'row',
      gap: 5,

   },
   headerTitle: {
      fontFamily: "Poppins_600SemiBold",
      fontSize: 16,
      color: Colors.primaryLight,
  },
    scrollContent: {
      paddingHorizontal: 35,
      flex: 1,
      justifyContent: 'center'
   },
   amountContainer: {
      flex:1,
     justifyContent: 'center',
      gap: 30
   },
  amountCard: {
    borderRadius: 45,
    overflow: "hidden",
    elevation: 10,
    padding: 28,
    justifyContent: 'space-between',
    gap: 40,
    backgroundColor: Colors.borderLight
  },
  amountTop: {
    backgroundColor: Colors.border,
    alignItems: "center",
    borderRadius: 40,
    padding: 45,
  },
  amountCardGradient: {
    padding: 28,
    alignItems: "center",
    gap: 6,
  },
  amountLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.primaryDark,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  amountDisplay: {
    fontFamily: "Poppins_700Bold",
    fontSize: 42,
    color: Colors.primaryDark,
    letterSpacing: -1,
  },
  amountSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.primaryDark,
  },
   meddlePaySection: {
      paddingTop: 30,
   },
  section: { gap: 10, },
  sectionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.primaryLight,
    textTransform: "uppercase",
     letterSpacing: 0.8,
     marginLeft: 5,

  },
  quickRow: {
    flexDirection: "row",
    gap: 10,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 13,
    backgroundColor: Colors.border,
    // borderWidth: .5,
    // borderColor: Colors.primaryLight,
    alignItems: "center",
  },
  quickBtnActive: {
    backgroundColor: Colors.primary,
   //  borderColor: Colors.primary,
  },
  quickBtnText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.primaryDark,
  },
  quickBtnTextActive: {
    color: Colors.primaryLight,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 45,
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
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 50,
    paddingLeft: 16,
    height: 56,
    gap: 10,
  },
  driverInput: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.primaryDark,
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
    fontSize: 11,
    color: Colors.primaryDark,
     marginTop: -4,
    marginLeft:10,
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
    borderRadius: 50,
    overflow: "hidden",
    elevation: 10,
     marginTop: 4,
     height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  payBtnDisabled: { shadowOpacity: 0, elevation: 0 },
  payBtnGradient: {
   
  },
  payBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  payBtnTextDisabled: {
    color: Colors.primaryLight,
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
    // shadowColor: Colors.primary,
    // shadowOffset: { width: 0, height: 12 },
    // shadowOpacity: 0.3,
    // shadowRadius: 24,
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