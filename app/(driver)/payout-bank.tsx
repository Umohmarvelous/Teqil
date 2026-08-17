/**
 * app/(driver)/payout-bank.tsx
 *
 * Where a driver sets the bank account that receives fare payouts. The account is
 * resolved (name-checked) via Paystack, then saved to the driver's user row
 * (payout_bank_code / payout_account_number / payout_account_name) and synced to
 * Supabase so the passenger-side transfer (app/(passenger)/payment.tsx) can pay out.
 */

import React, { useState } from "react";
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
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { resolveBankAccount } from "@/src/services/paystack";
import { syncUserToPublicTable } from "@/src/services/auth";
import { Glass, iosAlert } from "@/components/ios";
import { ALLOW_UNVERIFIED_PAYOUT_ACCOUNT } from "@/constants/devFlags";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Tick02Icon } from "@hugeicons/core-free-icons";

const BANKS = [
  { name: "Access Bank", code: "044" },
  { name: "GTBank", code: "058" },
  { name: "Zenith Bank", code: "057" },
  { name: "UBA", code: "033" },
  { name: "First Bank", code: "011" },
  { name: "OPay", code: "999992" },
];

export default function PayoutBankScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const { user, updateUser } = useAuthStore();

  const [bankCode, setBankCode] = useState(user?.payout_bank_code ?? "");
  const [accountNumber, setAccountNumber] = useState(user?.payout_account_number ?? "");
  const [resolvedName, setResolvedName] = useState(user?.payout_account_name ?? "");
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const cardBg = isDark ? Colors.overlayLight : Colors.textWhite;
  const bg = isDark ? Colors.background : Colors.textWhite;
  const subColor = isDark ? Colors.text : Colors.textWhite;

  // With the flag on, the driver types the account name themselves, so the save
  // button waits on a typed name rather than a verified one.
  const canResolve = !!bankCode && accountNumber.trim().length === 10 && !resolving;
  const canSave =
    !!resolvedName.trim() &&
    !saving &&
    (!ALLOW_UNVERIFIED_PAYOUT_ACCOUNT || accountNumber.trim().length === 10);

  const handleResolve = async () => {
    setError(null);
    setResolving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await resolveBankAccount(bankCode, accountNumber.trim());
      if (res.resolved && res.account_name) {
        setResolvedName(res.account_name);
      } else {
        setResolvedName("");
        // Two different failures deserve two different messages: a rejected
        // account is the driver's to fix, an unconfigured server is ours.
        setError(
          res.reason === "unconfigured"
            ? "Account verification is not available yet • Ask support to finish Paystack setup."
            : "Couldn't verify that account • Check the number and bank.",
        );
      }
    } catch {
      setError("Verification failed • Please try again.");
    } finally {
      setResolving(false);
    }
  };

  const handleSave = async () => {
    if (!canSave || !user) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const updates = {
        payout_bank_code: bankCode,
        payout_account_number: accountNumber.trim(),
        payout_account_name: resolvedName,
      };
      updateUser(updates);
      await syncUserToPublicTable({ ...user, ...updates });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      iosAlert("Payout account saved", "Fare payments will now go to this account.", [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch {
      iosAlert("Couldn't save", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Re-resolve if the driver edits the number after a previous resolve.
  const onChangeAccount = (v: string) => {
    setAccountNumber(v.replace(/\D/g, ""));
    if (resolvedName) setResolvedName("");
  };

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={textColor} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: textColor }]}>Payout Account</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.lede, { color: subColor }]}>
            {ALLOW_UNVERIFIED_PAYOUT_ACCOUNT
              ? "Add the bank account where you'll receive fare payments."
              : "Add the bank account where you'll receive fare payments. We verify the account name before saving."}
          </Text>

          {/* Loud on purpose. An unverified payout account looks identical to a
              verified one once saved, and the difference is where the money
              goes — so the screen says so while it is true. */}
          {ALLOW_UNVERIFIED_PAYOUT_ACCOUNT && (
            <View style={styles.testBanner}>
              <Ionicons name="warning" size={16} color="#7A4B00" />
              <Text style={styles.testBannerText}>
                TEST MODE — account name is not being verified. Payouts to a wrong number will
                fail. Set ALLOW_UNVERIFIED_PAYOUT_ACCOUNT to false in constants/devFlags.ts before
                release.
              </Text>
            </View>
          )}

          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <Text style={[styles.label, { color: textColor }]}>Bank</Text>
            <View style={styles.bankRow}>
              {BANKS.map((b) => (
                <Pressable
                  key={b.code}
                  onPress={() => {
                    setBankCode(b.code);
                    if (resolvedName) setResolvedName("");
                  }}
                  style={[styles.bankChip, bankCode === b.code && styles.bankChipActive]}
                >
                  <Text style={[styles.bankChipText, bankCode === b.code && styles.bankChipTextActive]}>
                    {b.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: textColor }]}>Account number</Text>
            <TextInput
              style={[
                styles.input,
                { color: textColor, backgroundColor: isDark ? "rgba(255,255,255,0.05)" : Colors.border },
              ]}
              value={accountNumber}
              onChangeText={onChangeAccount}
              placeholder="10-digit NUBAN"
              placeholderTextColor={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"}
              keyboardType="number-pad"
              maxLength={10}
            />

            {error && <Text style={styles.errorText}>{error}</Text>}

            {/* Test mode: the name is typed, not verified. */}
            {ALLOW_UNVERIFIED_PAYOUT_ACCOUNT && (
              <>
                <Text style={[styles.label, { color: textColor }]}>Account name</Text>
                <TextInput
                  style={[
                    styles.input,
                    { color: textColor, backgroundColor: isDark ? "rgba(255,255,255,0.05)" : Colors.border },
                  ]}
                  value={resolvedName}
                  onChangeText={setResolvedName}
                  placeholder="Name exactly as it appears at the bank"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"}
                  autoCapitalize="words"
                />
              </>
            )}

            <View style={{ height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <View style={{ flex: 1 }}>
                <Glass
                  variant="regular"
                  interactive
                  radius={50}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                  fallbackIntensity={40}
                  fallbackTint={textColor}
                />
                {/* The Verify button is the whole point of the flag, so it goes
                    away entirely rather than sitting there doing nothing. */}
                {ALLOW_UNVERIFIED_PAYOUT_ACCOUNT ? null : !resolvedName ? (
                  <Pressable
                    style={[styles.secondaryBtn, {backgroundColor: textColor}, !canResolve && styles.btnDisabled]}
                  onPress={handleResolve}
                  disabled={!canResolve}
                  >
              
                    {resolving ? (
                      <ActivityIndicator color={subColor} />
                    ) : (
                        <Text style={[styles.secondaryBtnText, {color:subColor}]}>Verify account</Text>
                    )}
                  </Pressable>
                ) : (
                  <View style={styles.resolvedRow}>
                    <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                    <Text style={[styles.resolvedName, { color: Colors.primary }]}>{resolvedName}</Text>
                  </View>
                )}
              </View>

              {/* save details */}
              <View style={[
                // { paddingBottom: Math.max(insets.bottom, 12) }
              ]}>
                <Glass
                  variant="regular"
                  interactive
                  radius={50}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                  fallbackIntensity={40}
                  fallbackTint={textColor}
                />
                <Pressable
                  style={[styles.saveBtn, {backgroundColor: textColor}, !canSave && styles.btnDisabled]}
                  onPress={handleSave}
                  disabled={!canSave}
                >
                  {saving ? (
                    <ActivityIndicator color={subColor} />
                  ) : (
                      <View style={{flexDirection:'row',gap:5}}>
                        <Text style={[styles.saveBtnText, { color: subColor }]}>Save Account</Text>
                        
                        <HugeiconsIcon icon={Tick02Icon} size={14} color={subColor}/>
                    </View>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>

      </KeyboardAvoidingView>
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
  content: { paddingHorizontal: 18, gap: 14, paddingTop: 4 },
  lede: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 19 },
  card: { borderRadius: 20, padding: 16, gap: 10 },
  label: { fontFamily: "Poppins_500Medium", fontSize: 12, marginLeft: 4, marginTop: 44 },
  bankRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bankChip: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 0,
    backgroundColor: "rgba(128,128,128,0.12)",
  },
  bankChipActive: { backgroundColor: Colors.primary },
  bankChipText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },
  bankChipTextActive: { color: "#fff" },
  input: {
    height: 50,
    borderRadius: 30,
    paddingHorizontal: 14,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    marginVertical: 10, marginBottom: 0
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    // borderWidth: 1,
    // borderColor: Colors.primary,
  },
  secondaryBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14,  },
  resolvedRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, marginLeft: 4 },
  resolvedName: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  errorText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "#EF4444",  marginBottom: 15, marginLeft: 4 },
  btnDisabled: { opacity: .3, backgroundColor: Colors.overlayLight },

  // Fixed amber in both themes: a warning that restyles itself to blend in is
  // not a warning.
  testBanner: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: "#FFF4D6",
    borderColor: "#E5A100",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  testBannerText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    lineHeight: 16,
    color: "#7A4B00",
  },

  saveBtn: {
    flex:1,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 15
  },
  saveBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
});
