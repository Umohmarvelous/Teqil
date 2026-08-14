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
import { Glass, iosAlert, IOSButton } from "@/components/ios";
import { text } from "node:stream/consumers";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Tick01Icon, Tick02Icon } from "@hugeicons/core-free-icons";

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

  const canResolve = !!bankCode && accountNumber.trim().length === 10 && !resolving;
  const canSave = !!resolvedName && !saving;

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
        setError("Couldn't verify that account • Check the number and bank.");
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
            Add the bank account where you&apos;ll receive fare payments. We verify the
            account name before saving.
          </Text>

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
                {!resolvedName ? (
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

  saveBtn: {
    flex:1,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 15
  },
  saveBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
});
