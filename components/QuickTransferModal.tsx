// components/QuickTransferModal.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { FB } from "@/constants/fbPalette";
import { iosAlert, IOSSheet } from "@/components/ios";

interface QuickTransferModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function QuickTransferModal({ visible, onClose }: QuickTransferModalProps) {
  const router = useRouter();
  const slideY = useRef(new Animated.Value(400)).current;
  const backdropOp = useRef(new Animated.Value(0)).current;
  const [driverRef, setDriverRef] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY, {
          toValue: 0,
          damping: 22,
          stiffness: 160,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOp, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: 400,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOp, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleSend = () => {
    if (!driverRef.trim() || !amount || parseFloat(amount) < 50) {
      iosAlert("Invalid", "Enter a driver ID/code and amount ≥ ₦50.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    iosAlert("Transfer Sent!", `₦${amount} sent to ${driverRef}`);
    setDriverRef("");
    setAmount("");
    onClose();
  };

  if (!visible) return null;

  return (
    <IOSSheet visible onClose={onClose} detents={[0.58, "large"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.body}>
          <Text style={styles.title}>Quick Transfer</Text>
          <Text style={styles.sub}>Send fare to a driver instantly</Text>

          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Driver ID / Trip Code</Text>
            <View style={styles.inputRow}>
              <Ionicons name="id-card-outline" size={18} color={FB.navy} />
              <TextInput
                style={styles.input}
                placeholder="e.g. DRV-A3X9KL or ABC123"
                placeholderTextColor={FB.textSec}
                value={driverRef}
                onChangeText={setDriverRef}
                autoCapitalize="characters"
              />
            </View>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Amount (₦)</Text>
            <View style={styles.inputRow}>
              <Text style={styles.nairaSymbol}>₦</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={FB.textSec}
                value={amount}
                onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <View style={styles.quickRow}>
            {[500, 1000, 2000, 5000].map((v) => (
              <Pressable
                key={v}
                style={[styles.quickChip, amount === v.toString() && styles.quickChipActive]}
                onPress={() => {
                  setAmount(v.toString());
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text style={[styles.quickChipText, amount === v.toString() && styles.quickChipTextActive]}>
                  ₦{v.toLocaleString()}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable
              style={styles.scanBtn}
              onPress={() => {
                onClose();
                router.push("/(passenger)/pay-fare");
              }}
            >
              <Ionicons name="qr-code-outline" size={18} color={FB.navy} />
              <Text style={styles.scanBtnText}>Scan QR</Text>
            </Pressable>
            <Pressable style={styles.sendBtn} onPress={handleSend}>
              <LinearGradient colors={[FB.green, "#007A3D"]} style={styles.sendBtnGradient}>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={styles.sendBtnText}>Send</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </IOSSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingTop: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: FB.textPrimary,
  },
  sub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: FB.textSec,
    marginTop: 4,
    marginBottom: 20,
  },
  fieldWrap: { marginBottom: 14 },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: FB.textSec,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: FB.offWhite,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
    borderWidth: 1,
    borderColor: FB.border,
  },
  nairaSymbol: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: FB.navy,
  },
  input: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: FB.textPrimary,
  },
  quickRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  quickChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: FB.offWhite,
    borderWidth: 1,
    borderColor: FB.border,
    alignItems: "center",
  },
  quickChipActive: { backgroundColor: FB.navy, borderColor: FB.navy },
  quickChipText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: FB.textSec },
  quickChipTextActive: { color: "#fff" },
  actions: { flexDirection: "row", gap: 12 },
  scanBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: FB.navy,
    backgroundColor: "transparent",
  },
  scanBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: FB.navy },
  sendBtn: { flex: 2, height: 52, borderRadius: 14, overflow: "hidden" },
  sendBtnGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sendBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#fff" },
});