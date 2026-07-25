/**
 * app/program.tsx
 *
 * Program Page (Loyalty Program). Top-level route (rendered by the root Stack in
 * app/_layout.tsx) so it opens as a full screen over the tab shell.
 *
 * MULTI-STEP KYC WIZARD (OPay/bank-KYC style): one screen per step with a progress
 * bar up top; finishing a step unlocks the next. Steps:
 *   1. Get started — how credits are earned (the ONLY place amounts are shown) +
 *      eligibility progress. Gated: you must have enough credits to continue.
 *   2. Verify identity — NIN/BVN + number.
 *   3. Face capture — selfie/liveness (front camera), like a bank KYC.
 *   4. Verify phone — phone + OTP (dev code 123456).
 *   5. Payout bank — bank + account number → Verify & Apply.
 * On success the same screen shows the "you're in" status card.
 *
 * All verification is mock-backed for now; wiring real Smile Identity keys later
 * won't change this screen (only src/services/kyc.ts).
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
  Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
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

// The interactive wizard steps, in order.
const STEPS = [
  { key: "intro", title: "Get started" },
  { key: "identity", title: "Verify identity" },
  { key: "selfie", title: "Face capture" },
  { key: "phone", title: "Verify phone" },
  { key: "payout", title: "Payout bank" },
] as const;
const LAST_STEP = STEPS.length - 1;

export default function ProgramScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";

  const user = useAuthStore((s) => s.user);
  const credits = useCreditsStore((s) => s.balance);
  const { programStatus, submitting, submitApplication, sendOtp, hydrateFromUser } =
    useProgramStore();

  // Wizard position
  const [step, setStep] = useState(0);

  // Form state
  const [idType, setIdType] = useState<"nin" | "bvn">("nin");
  const [idNumber, setIdNumber] = useState("");
  const [selfie, setSelfie] = useState<string | null>(null);
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

  // Whether the current step is complete enough to advance.
  const canAdvance = useMemo(() => {
    switch (STEPS[step].key) {
      case "intro":
        return meetsCredits;
      case "identity":
        return idNumber.trim().length === 11;
      case "selfie":
        return !!selfie;
      case "phone":
        return otpSent && otp.trim().length > 0;
      case "payout":
        return !!bankCode && accountNumber.trim().length === 10 && !submitting;
      default:
        return false;
    }
  }, [step, meetsCredits, idNumber, selfie, otpSent, otp, bankCode, accountNumber, submitting]);

  const goBack = () => {
    setErrorMsg(null);
    if (step === 0) {
      router.back();
    } else {
      setStep((s) => s - 1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const goNext = () => {
    if (!canAdvance) return;
    setErrorMsg(null);
    if (step === LAST_STEP) {
      handleSubmit();
    } else {
      setStep((s) => s + 1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const captureSelfie = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setErrorMsg("Camera access is needed for the face check.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: false,
      quality: 0.6,
    });
    if (!res.canceled && res.assets?.[0]) {
      setSelfie(res.assets[0].uri);
      setErrorMsg(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

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
      selfie: selfie ?? undefined,
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

  // ── Already enrolled → status screen (no wizard) ──────────────────────────
  if (enrolled) {
    return (
      <View style={[styles.root, { backgroundColor: bg }]}>
        <Header title="Loyalty Program" textColor={textColor} onBack={() => router.back()} insetTop={insets.top} />
        <View style={styles.doneWrap}>
          <View style={styles.doneBadge}>
            <Ionicons name="shield-checkmark" size={44} color={Colors.primary} />
          </View>
          <Text style={[styles.doneTitle, { color: textColor }]}>You&apos;re in the program</Text>
          <Text style={styles.doneSub}>
            Verified — you can now earn free-fuel & free-ride rewards. Payouts go only
            to your verified bank account.
          </Text>
          <Pressable style={styles.submitBtn} onPress={() => router.back()}>
            <Text style={styles.submitBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const stepMeta = STEPS[step];

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <Header title="Loyalty Program" textColor={textColor} onBack={goBack} insetTop={insets.top} />

      {/* Progress */}
      <View style={styles.progressWrap}>
        <View style={styles.stepBarRow}>
          {STEPS.map((s, i) => (
            <View
              key={s.key}
              style={[
                styles.stepSegment,
                { backgroundColor: i <= step ? Colors.primary : "rgba(128,128,128,0.25)" },
              ]}
            />
          ))}
        </View>
        <Text style={styles.stepCount}>
          Step {step + 1} of {STEPS.length} · {stepMeta.title}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Step 1: intro + how you earn + eligibility ── */}
          {stepMeta.key === "intro" && (
            <>
              <Text style={[styles.stepHeading, { color: textColor }]}>Join the rewards program</Text>
              <Text style={styles.stepLede}>
                Earn credits by engaging in the app, then complete a quick verification
                to unlock free-fuel & free-ride rewards.
              </Text>

              <Text style={[styles.sectionTitle, { color: textColor }]}>How you earn credits</Text>
              <View style={[styles.card, { backgroundColor: cardBg }]}>
                {EARN_RULES.map((rule, i) => (
                  <View
                    key={rule.key}
                    style={[styles.earnRow, i < EARN_RULES.length - 1 && styles.earnRowBorder]}
                  >
                    <Text style={[styles.earnLabel, { color: textColor }]}>{rule.label}</Text>
                    <Text style={styles.earnAmount}>🪙 {rule.amount}</Text>
                  </View>
                ))}
              </View>

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
                {!meetsCredits && (
                  <Text style={styles.lockNote}>
                    Reach {MIN_CREDITS_TO_APPLY} credits to start your application.
                  </Text>
                )}
              </View>
            </>
          )}

          {/* ── Step 2: identity ── */}
          {stepMeta.key === "identity" && (
            <>
              <Text style={[styles.stepHeading, { color: textColor }]}>Verify your identity</Text>
              <Text style={styles.stepLede}>
                Enter a valid government ID. We store only a secure hash — never the
                raw number, and it&apos;s never shown to anyone.
              </Text>
              <View style={[styles.card, { backgroundColor: cardBg }]}>
                <View style={styles.toggleRow}>
                  {(["nin", "bvn"] as const).map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => setIdType(t)}
                      style={[styles.toggleBtn, idType === t && styles.toggleBtnActive]}
                    >
                      <Text style={[styles.toggleText, idType === t && styles.toggleTextActive]}>
                        {t.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <FieldInput
                  label={`${idType.toUpperCase()} number`}
                  value={idNumber}
                  onChangeText={setIdNumber}
                  placeholder="11-digit number"
                  keyboardType="number-pad"
                  maxLength={11}
                  textColor={textColor}
                  isDark={isDark}
                />
              </View>
            </>
          )}

          {/* ── Step 3: face capture ── */}
          {stepMeta.key === "selfie" && (
            <>
              <Text style={[styles.stepHeading, { color: textColor }]}>Face capture</Text>
              <Text style={styles.stepLede}>
                Take a quick selfie so we can match your face to your ID — just like
                your bank&apos;s KYC. Look straight at the camera in good light.
              </Text>
              <View style={[styles.card, { backgroundColor: cardBg, alignItems: "center", gap: 16 }]}>
                <View style={styles.selfieRing}>
                  {selfie ? (
                    <Image source={{ uri: selfie }} style={styles.selfieImg} />
                  ) : (
                    <Ionicons name="person-outline" size={64} color={Colors.textSecondary} />
                  )}
                </View>
                <Pressable style={styles.secondaryBtn} onPress={captureSelfie}>
                  <Ionicons name="camera-outline" size={18} color={Colors.primary} />
                  <Text style={styles.secondaryBtnText}>
                    {selfie ? "Retake photo" : "Take photo"}
                  </Text>
                </Pressable>
                {selfie && <Text style={styles.hint}>Looks good ✓ Tap Continue.</Text>}
              </View>
            </>
          )}

          {/* ── Step 4: phone + OTP ── */}
          {stepMeta.key === "phone" && (
            <>
              <Text style={[styles.stepHeading, { color: textColor }]}>Verify your phone</Text>
              <Text style={styles.stepLede}>
                We&apos;ll send a code to confirm this number is yours.
              </Text>
              <View style={[styles.card, { backgroundColor: cardBg }]}>
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
                      maxLength={6}
                      textColor={textColor}
                      isDark={isDark}
                    />
                    <Text style={styles.hint}>Code sent to {phone}.</Text>
                    <Pressable onPress={handleSendOtp} hitSlop={8}>
                      <Text style={styles.resendText}>Resend code</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </>
          )}

          {/* ── Step 5: payout bank ── */}
          {stepMeta.key === "payout" && (
            <>
              <Text style={[styles.stepHeading, { color: textColor }]}>Payout account</Text>
              <Text style={styles.stepLede}>
                Rewards are paid only to a bank account in your own verified name.
              </Text>
              <View style={[styles.card, { backgroundColor: cardBg }]}>
                <Text style={[styles.fieldLabel, { color: textColor }]}>Bank</Text>
                <View style={styles.bankRow}>
                  {BANKS.map((b) => (
                    <Pressable
                      key={b.code}
                      onPress={() => setBankCode(b.code)}
                      style={[styles.bankChip, bankCode === b.code && styles.bankChipActive]}
                    >
                      <Text style={[styles.bankChipText, bankCode === b.code && styles.bankChipTextActive]}>
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
                  maxLength={10}
                  textColor={textColor}
                  isDark={isDark}
                />
                <Text style={styles.privacyNote}>
                  We verify the account name matches your ID before enrolling you.
                </Text>
              </View>
            </>
          )}

          {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
        </ScrollView>

        {/* Sticky footer nav */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            style={[styles.primaryBtn, !canAdvance && styles.submitBtnDisabled]}
            onPress={goNext}
            disabled={!canAdvance}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>
                {step === LAST_STEP ? "Verify & Apply" : "Continue"}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header({
  title,
  textColor,
  onBack,
  insetTop,
}: {
  title: string;
  textColor: string;
  onBack: () => void;
  insetTop: number;
}) {
  return (
    <View style={[styles.header, { paddingTop: insetTop + 12 }]}>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Ionicons name="arrow-back" size={22} color={textColor} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: textColor }]}>{title}</Text>
      <View style={{ width: 40 }} />
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
  maxLength,
  textColor,
  isDark,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: "default" | "number-pad" | "phone-pad";
  maxLength?: number;
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
        maxLength={maxLength}
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

  // Progress
  progressWrap: { paddingHorizontal: 18, paddingBottom: 8, gap: 8 },
  stepBarRow: { flexDirection: "row", gap: 6 },
  stepSegment: { flex: 1, height: 6, borderRadius: 3 },
  stepCount: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },

  content: { paddingHorizontal: 18, gap: 14, paddingTop: 6 },
  stepHeading: { fontFamily: "Poppins_600SemiBold", fontSize: 20, marginTop: 4 },
  stepLede: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 4 },

  card: { borderRadius: 20, padding: 16, gap: 4 },
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
    marginTop: 12,
  },

  // Selfie
  selfieRing: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(128,128,128,0.08)",
  },
  selfieImg: { width: "100%", height: "100%" },

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
    flexDirection: "row",
    gap: 8,
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  secondaryBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.primary },
  hint: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginLeft: 4 },
  resendText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary, marginLeft: 4, marginTop: 4 },
  bankRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14, marginTop: 6 },
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
    marginTop: 2,
    marginLeft: 4,
  },

  // Footer
  footer: {
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
  primaryBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    alignSelf: "stretch",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#fff" },
  privacyNote: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 6,
    marginLeft: 4,
  },

  // Done screen
  doneWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 14 },
  doneBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,154,67,0.12)",
  },
  doneTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 20 },
  doneSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
