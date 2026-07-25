/**
 * app/program.tsx
 *
 * Program Page (Loyalty Program). Top-level route (rendered by the root Stack in
 * app/_layout.tsx) so it opens as a full screen over the tab shell.
 *
 * This is the ONE place the engagement credit amounts are shown to the user (they
 * are hidden in the feed). Here a user can:
 *   1. See how credits are earned (the requirements) and their progress.
 *   2. Once they have enough credits, apply: verify identity (NIN/BVN) + phone OTP
 *      + a payout bank account, all through the mock KYC/bank services.
 *   3. See their status (unverified → verified/eligible).
 *
 * All verification is mock-backed for now (dev OTP code 123456); the flow and UI
 * are final, so wiring real Smile Identity keys later won't change this screen.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { useAuthStore } from "@/src/store/useStore";
import { useCreditsStore } from "@/src/store/useCreditsStore";
import { useProgramStore, ProgramForm } from "@/src/store/useProgramStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { EARN_RULES, MIN_CREDITS_TO_APPLY } from "@/constants/credits";
import { DEV_OTP_CODE } from "@/src/services/kyc";

// A small set of Nigerian banks for the payout picker (code = Paystack bank code).
const BANKS = [
  { name: "Access Bank", code: "044" },
  { name: "GTBank", code: "058" },
  { name: "Zenith Bank", code: "057" },
  { name: "UBA", code: "033" },
  { name: "First Bank", code: "011" },
  { name: "OPay", code: "999992" },
];

export default function ProgramScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";

  const user = useAuthStore((s) => s.user);
  const credits = useCreditsStore((s) => s.balance);
  const { programStatus, submitting, submitApplication, sendOtp, hydrateFromUser } =
    useProgramStore();

  // Form state
  const [idType, setIdType] = useState<"nin" | "bvn">("nin");
  const [idNumber, setIdNumber] = useState("");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [bankCode, setBankCode] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    hydrateFromUser(user);
  }, [user, hydrateFromUser]);

  const enrolled = programStatus === "eligible" || programStatus === "enrolled";
  const meetsCredits = credits >= MIN_CREDITS_TO_APPLY;
  const progress = Math.min(1, credits / MIN_CREDITS_TO_APPLY);

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const cardBg = isDark ? Colors.overlayLight : Colors.textWhite;
  const bg = isDark ? Colors.background : Colors.border;

  const canSubmit = useMemo(
    () =>
      meetsCredits &&
      idNumber.trim().length >= 8 &&
      otpSent &&
      otp.trim().length > 0 &&
      !!bankCode &&
      accountNumber.trim().length === 10 &&
      !submitting,
    [meetsCredits, idNumber, otpSent, otp, bankCode, accountNumber, submitting]
  );

  const handleSendOtp = async () => {
    if (phone.trim().length < 7) {
      setErrorMsg("Enter a valid phone number first.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await sendOtp(phone);
    setOtpSent(true);
    setErrorMsg(null);
  };

  const handleSubmit = async () => {
    if (!user?.id) return;
    setErrorMsg(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const form: ProgramForm = {
      idType,
      idNumber: idNumber.trim(),
      phone: phone.trim(),
      otp: otp.trim(),
      bankCode,
      accountNumber: accountNumber.trim(),
    };
    const res = await submitApplication(user, form);
    if (res.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setErrorMsg(res.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={textColor} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: textColor }]}>Loyalty Program</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 24) + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Status card */}
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <View style={styles.statusRow}>
              <Ionicons
                name={enrolled ? "shield-checkmark" : "shield-outline"}
                size={26}
                color={enrolled ? Colors.primary : Colors.gold}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.statusTitle, { color: textColor }]}>
                  {enrolled ? "You're in the program" : "Join the rewards program"}
                </Text>
                <Text style={styles.statusSub}>
                  {enrolled
                    ? "Verified — you can earn free-fuel & free-ride rewards."
                    : "Earn credits by engaging, then verify to unlock rewards."}
                </Text>
              </View>
            </View>
          </View>

          {/* How you earn — the ONLY place credit amounts are revealed */}
          <Text style={[styles.sectionTitle, { color: textColor }]}>How you earn credits</Text>
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            {EARN_RULES.map((rule, i) => (
              <View
                key={rule.key}
                style={[
                  styles.earnRow,
                  i < EARN_RULES.length - 1 && styles.earnRowBorder,
                ]}
              >
                <Text style={[styles.earnLabel, { color: textColor }]}>{rule.label}</Text>
                <Text style={styles.earnAmount}>🪙 {rule.amount}</Text>
              </View>
            ))}
          </View>

          {/* Eligibility progress */}
          <Text style={[styles.sectionTitle, { color: textColor }]}>Your eligibility</Text>
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <View style={styles.progressHeader}>
              <Text style={[styles.earnLabel, { color: textColor }]}>
                {credits} / {MIN_CREDITS_TO_APPLY} credits
              </Text>
              <Text style={[styles.earnAmount, { color: meetsCredits ? Colors.primary : Colors.gold }]}>
                {meetsCredits ? "Eligible ✓" : "Keep earning"}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          </View>

          {/* Apply form — only when not already enrolled */}
          {!enrolled && (
            <>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Apply</Text>
              <View style={[styles.card, { backgroundColor: cardBg }]}>
                {!meetsCredits && (
                  <Text style={styles.lockNote}>
                    Reach {MIN_CREDITS_TO_APPLY} credits to unlock the application.
                  </Text>
                )}

                {/* ID type toggle */}
                <View style={styles.toggleRow}>
                  {(["nin", "bvn"] as const).map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => setIdType(t)}
                      style={[
                        styles.toggleBtn,
                        idType === t && styles.toggleBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.toggleText,
                          idType === t && styles.toggleTextActive,
                        ]}
                      >
                        {t.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <FieldInput
                  label={`${idType.toUpperCase()} number`}
                  value={idNumber}
                  onChangeText={setIdNumber}
                  placeholder={idType === "nin" ? "11-digit NIN" : "11-digit BVN"}
                  keyboardType="number-pad"
                  textColor={textColor}
                  isDark={isDark}
                />

                {/* Phone + OTP */}
                <FieldInput
                  label="Phone number"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="e.g. 0803..."
                  keyboardType="phone-pad"
                  textColor={textColor}
                  isDark={isDark}
                />
                {!otpSent ? (
                  <Pressable style={styles.secondaryBtn} onPress={handleSendOtp}>
                    <Text style={styles.secondaryBtnText}>Send code</Text>
                  </Pressable>
                ) : (
                  <>
                    <FieldInput
                      label="Verification code"
                      value={otp}
                      onChangeText={setOtp}
                      placeholder={`Enter code (dev: ${DEV_OTP_CODE})`}
                      keyboardType="number-pad"
                      textColor={textColor}
                      isDark={isDark}
                    />
                    <Text style={styles.hint}>Code sent to {phone}.</Text>
                  </>
                )}

                {/* Bank */}
                <Text style={[styles.fieldLabel, { color: textColor }]}>Payout bank</Text>
                <View style={styles.bankRow}>
                  {BANKS.map((b) => (
                    <Pressable
                      key={b.code}
                      onPress={() => setBankCode(b.code)}
                      style={[
                        styles.bankChip,
                        bankCode === b.code && styles.bankChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.bankChipText,
                          bankCode === b.code && styles.bankChipTextActive,
                        ]}
                      >
                        {b.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <FieldInput
                  label="Account number"
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  placeholder="10-digit NUBAN"
                  keyboardType="number-pad"
                  textColor={textColor}
                  isDark={isDark}
                />

                {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

                <Pressable
                  style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitBtnText}>Verify & Apply</Text>
                  )}
                </Pressable>
                <Text style={styles.privacyNote}>
                  Your ID is used only to verify you and is never shown to anyone.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Reusable labelled input ──────────────────────────────────────────────────
function FieldInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  textColor,
  isDark,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: "default" | "number-pad" | "phone-pad";
  textColor: string;
  isDark: boolean;
}) {
  return (
    <View style={{ gap: 6, marginBottom: 12 }}>
      <Text style={[styles.fieldLabel, { color: textColor }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          {
            color: textColor,
            backgroundColor: isDark ? "rgba(255,255,255,0.05)" : Colors.border,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 17 },
  content: { paddingHorizontal: 18, gap: 14 },
  card: { borderRadius: 20, padding: 16, gap: 4 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  statusSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, marginTop: 6, marginLeft: 4 },
  earnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  earnRowBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(128,128,128,0.15)" },
  earnLabel: { fontFamily: "Poppins_500Medium", fontSize: 14 },
  earnAmount: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.gold },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(128,128,128,0.2)",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: Colors.primary },
  lockNote: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.gold,
    marginBottom: 12,
  },
  toggleRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "rgba(128,128,128,0.12)",
  },
  toggleBtnActive: { backgroundColor: Colors.primary },
  toggleText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  toggleTextActive: { color: "#fff" },
  fieldLabel: { fontFamily: "Poppins_500Medium", fontSize: 12, marginLeft: 4 },
  input: {
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  secondaryBtn: {
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.primary,
    marginBottom: 12,
  },
  secondaryBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.primary },
  hint: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginBottom: 12, marginLeft: 4 },
  bankRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  bankChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(128,128,128,0.12)",
  },
  bankChipActive: { backgroundColor: Colors.primary },
  bankChipText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },
  bankChipTextActive: { color: "#fff" },
  errorText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "#EF4444",
    marginBottom: 10,
    marginTop: 2,
  },
  submitBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#fff" },
  privacyNote: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 10,
  },
});
