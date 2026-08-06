/**
 * app/checkout.tsx
 *
 * Tokenized checkout — matches the provided design: a payment-method selector on
 * top (saved cards + method tabs + "Add another option"), a Debit/Credit card
 * form below, an order summary, and Cancel / Pay Now.
 *
 * COMPLIANCE: the raw PAN/CVV live only in this component's state, are sent once
 * to tokenizeCard() (Paystack via the server), and are discarded. We persist ONLY
 * the returned token + brand/last4 (usePaymentMethodsStore). Pay Now is disabled
 * until the card passes validation; charge failures (insufficient funds, invalid
 * card, decline) are surfaced with their reason.
 *
 * Params: item (label), amount (₦ string), kind ("premium" | "fare" | "generic"),
 * plan (PremiumTier, for premium).
 */

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useTierStore } from "@/src/store/useTierStore";
import { usePaymentMethodsStore, type PaymentMethodType } from "@/src/store/usePaymentMethodsStore";
import { useFuelPoolStore } from "@/src/store/useFuelPoolStore";
import { tokenizeCard, chargeWithToken, detectCardBrand } from "@/src/services/paystack";
import { useTransactionsStore } from "@/src/store/useTransactionsStore";
import { transactionToReceipt } from "@/src/utils/activity";
import Receipt, { type ReceiptData } from "@/components/Receipt";
import CreditCardVisual from "@/components/CreditCardVisual";
import { formatNaira } from "@/src/utils/helpers";
import type { RevenueTransaction, PremiumTier } from "@/src/models/types";

const METHODS: { type: PaymentMethodType; label: string; icon: keyof typeof Ionicons.glyphMap; soon?: boolean }[] = [
  { type: "card", label: "Debit / Credit card", icon: "card-outline" },
  { type: "google_pay", label: "Google Pay", icon: "logo-google", soon: true },
  { type: "apple_pay", label: "Apple Pay", icon: "logo-apple", soon: true },
  { type: "paypal", label: "PayPal", icon: "logo-paypal", soon: true },
];

function luhnValid(num: string): boolean {
  const s = num.replace(/\D/g, "");
  if (s.length < 12 || s.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = parseInt(s[i], 10);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function expiryValid(mmYY: string): boolean {
  const m = mmYY.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const mm = parseInt(m[1], 10);
  const yy = 2000 + parseInt(m[2], 10);
  if (mm < 1 || mm > 12) return false;
  const now = new Date();
  const end = new Date(yy, mm, 0, 23, 59, 59);
  return end >= now;
}

const groupCard = (v: string) =>
  v.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ item?: string; amount?: string; kind?: string; plan?: string }>();
  const amount = parseInt((params.amount ?? "0").replace(/\D/g, ""), 10) || 0;
  const item = params.item ?? "Payment";
  const kind = params.kind ?? "generic";

  const user = useAuthStore((s) => s.user);
  const isDark = useSettingsStore((s) => s.theme) === "dark";
  const setTier = useTierStore((s) => s.setTier);
  const { methods, add, remove, getDefault } = usePaymentMethodsStore();

  const [selectedId, setSelectedId] = useState<string | null>(getDefault()?.id ?? null);
  const [adding, setAdding] = useState(methods.length === 0);
  const [methodType, setMethodType] = useState<PaymentMethodType>("card");
  const [cardTab, setCardTab] = useState<"debit" | "credit">("debit");

  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [name, setName] = useState(user?.full_name ?? "");
  const [saveCard, setSaveCard] = useState(true);

  const [processing, setProcessing] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const bg = isDark ? Colors.background : "#F6F7FB";
  const cardBg = isDark ? Colors.overlayLight : "#FFFFFF";
  const inputBg = isDark ? "rgba(255,255,255,0.06)" : "#F1F3F7";
  const borderColor = isDark ? "rgba(255,255,255,0.10)" : "#ECEEF3";

  // "Add a payment method" flow (from the scan-pay gate): amount 0 → save a card,
  // no charge.
  const setupMode = amount <= 0;
  const brand = detectCardBrand(number);
  const cardValid =
    luhnValid(number) && expiryValid(expiry) && cvv.replace(/\D/g, "").length >= 3 && name.trim().length >= 2;

  const canPay = useMemo(() => {
    if (processing) return false;
    if (adding && methodType === "card") return cardValid;
    if (!adding && selectedId) return !setupMode; // charging a saved card
    return false; // non-card methods are not chargeable yet
  }, [processing, adding, selectedId, methodType, cardValid, setupMode]);

  const recordSuccess = async (reference: string, methodLabel: string) => {
    if (kind === "premium") {
      setTier((params.plan as PremiumTier) ?? "pro");
      // Fund the shared free-fuel pool with the 60% station share of this premium.
      if (user?.id) void useFuelPoolStore.getState().creditPremiumShare(user.id, amount, reference);
    }
    const txn: RevenueTransaction = {
      id: reference,
      user_id: user?.id ?? "",
      kind: kind === "premium" ? "premium_subscription" : "trip_payment",
      base_fare: kind === "premium" ? undefined : amount,
      passenger_bank_paid: kind === "premium" ? undefined : amount,
      premium_amount: kind === "premium" ? amount : undefined,
      driver_total: kind === "premium" ? undefined : amount,
      status: "success",
      dedupe_key: reference,
      synced: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as RevenueTransaction;
    await useTransactionsStore.getState().record(txn);
    setReceipt(transactionToReceipt(txn));
  };

  const handlePay = async () => {
    if (!canPay) return;
    setProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      let token: string | undefined;
      let methodLabel = "Card";

      if (!adding && selectedId) {
        const m = methods.find((x) => x.id === selectedId);
        token = m?.token;
        methodLabel = m?.brand ? m.brand.toUpperCase() : "Card";
      } else if (adding && methodType === "card") {
        // Tokenize the card (raw details used once, never stored).
        const [mm, yy] = expiry.split("/");
        const res = await tokenizeCard({
          email: user?.email ?? "guest@emilgo.app",
          number,
          cvv,
          exp_month: parseInt(mm, 10),
          exp_year: 2000 + parseInt(yy, 10),
          holder_name: name.trim(),
        });
        if (!res.ok || !res.token) {
          setProcessing(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert("Card declined", res.error ?? "That card couldn't be verified. Check the details and try again.");
          return;
        }
        token = res.token;
        methodLabel = (res.brand ?? "card").toUpperCase();
        if (saveCard && user?.id) {
          await add({
            user_id: user.id,
            type: "card",
            brand: res.brand,
            last4: res.last4,
            exp_month: res.exp_month,
            exp_year: res.exp_year,
            holder_name: name.trim(),
            token: res.token,
            is_default: methods.length === 0,
          });
        }
      }

      // Setup mode: the card is now saved (tokenized) — no charge to make.
      if (setupMode) {
        setProcessing(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Payment method saved", "You're all set — you can now scan and pay for rides.", [
          { text: "Done", onPress: () => router.back() },
        ]);
        return;
      }

      if (!token) {
        setProcessing(false);
        Alert.alert("No payment method", "Add or select a card to continue.");
        return;
      }

      // Charge. The server/Paystack decides sufficiency; we surface the reason.
      const charge = await chargeWithToken({ email: user?.email ?? "guest@emilgo.app", amount, token });
      if (!charge.ok || !charge.reference) {
        setProcessing(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          "Payment unsuccessful",
          charge.reason === "insufficient_funds"
            ? "You don't have sufficient funds for this payment. Top up or use another card."
            : `The payment was declined${charge.reason ? ` (${charge.reason})` : ""}. Please try again.`
        );
        return;
      }

      await recordSuccess(charge.reference, methodLabel);
      setProcessing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.warn("[Checkout] pay failed", e);
      setProcessing(false);
      Alert.alert("Something went wrong", "We couldn't complete the payment. Please try again.");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable style={styles.back} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: textColor }]}>Checkout</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: 160 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Order summary */}
          <View style={[styles.summary, { backgroundColor: cardBg, borderColor }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.summaryLabel, { color: subColor }]}>You're paying for</Text>
              <Text style={[styles.summaryItem, { color: textColor }]} numberOfLines={2}>{item}</Text>
            </View>
            <Text style={[styles.summaryAmount, { color: Colors.primary }]}>{formatNaira(amount)}</Text>
          </View>

          {/* Saved cards */}
          {methods.length > 0 && (
            <View style={{ marginTop: 18 }}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Your cards</Text>
              {methods.map((m) => (
                <CreditCardVisual
                  key={m.id}
                  method={m}
                  selected={!adding && selectedId === m.id}
                  onPress={() => {
                    setAdding(false);
                    setSelectedId(m.id);
                  }}
                  onRemove={() =>
                    Alert.alert("Remove card", `Remove the card ending ${m.last4 ?? ""}?`, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Remove", style: "destructive", onPress: () => remove(m.id) },
                    ])
                  }
                />
              ))}
            </View>
          )}

          {/* Payment method selector */}
          <Text style={[styles.sectionTitle, { color: textColor, marginTop: 18 }]}>Choose payment option</Text>
          {METHODS.map((opt) => {
            const active = adding && methodType === opt.type;
            return (
              <Pressable
                key={opt.type}
                onPress={() => {
                  setAdding(true);
                  setSelectedId(null);
                  setMethodType(opt.type);
                }}
                style={[styles.methodRow, { backgroundColor: cardBg, borderColor: active ? Colors.primary : borderColor }]}
              >
                <View style={[styles.methodIcon, { backgroundColor: inputBg }]}>
                  <Ionicons name={opt.icon} size={20} color={textColor} />
                </View>
                <Text style={[styles.methodLabel, { color: textColor }]}>{opt.label}</Text>
                {opt.soon && <Text style={[styles.soon, { color: subColor }]}>Soon</Text>}
                <Ionicons
                  name={active ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={active ? Colors.primary : subColor}
                />
              </Pressable>
            );
          })}

          {/* Card form */}
          {adding && methodType === "card" && (
            <View style={[styles.form, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.tabs}>
                {(["debit", "credit"] as const).map((tab) => (
                  <Pressable key={tab} style={styles.tab} onPress={() => setCardTab(tab)}>
                    <Text style={[styles.tabText, { color: cardTab === tab ? Colors.primary : subColor }]}>
                      {tab === "debit" ? "Debit Card" : "Credit Card"}
                    </Text>
                    {cardTab === tab && <View style={styles.tabUnderline} />}
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: subColor }]}>Card Number</Text>
              <View style={[styles.inputRow, { backgroundColor: inputBg }]}>
                <TextInput
                  style={[styles.input, { color: textColor }]}
                  value={number}
                  onChangeText={(v) => setNumber(groupCard(v))}
                  placeholder="5534 2834 8857 5370"
                  placeholderTextColor={subColor}
                  keyboardType="number-pad"
                  maxLength={23}
                />
                {number.length > 0 && (
                  <Text style={[styles.brandTag, { color: luhnValid(number) ? Colors.primary : Colors.error }]}>
                    {brand.toUpperCase()}
                  </Text>
                )}
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: subColor }]}>Expiry date</Text>
                  <View style={[styles.inputRow, { backgroundColor: inputBg }]}>
                    <TextInput
                      style={[styles.input, { color: textColor }]}
                      value={expiry}
                      onChangeText={(v) => {
                        const d = v.replace(/\D/g, "").slice(0, 4);
                        setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                      }}
                      placeholder="MM/YY"
                      placeholderTextColor={subColor}
                      keyboardType="number-pad"
                      maxLength={5}
                    />
                  </View>
                </View>
                <View style={{ width: 110 }}>
                  <Text style={[styles.fieldLabel, { color: subColor }]}>CVV</Text>
                  <View style={[styles.inputRow, { backgroundColor: inputBg }]}>
                    <TextInput
                      style={[styles.input, { color: textColor }]}
                      value={cvv}
                      onChangeText={(v) => setCvv(v.replace(/\D/g, "").slice(0, 4))}
                      placeholder="•••"
                      placeholderTextColor={subColor}
                      keyboardType="number-pad"
                      secureTextEntry
                      maxLength={4}
                    />
                  </View>
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: subColor }]}>Name on card</Text>
              <View style={[styles.inputRow, { backgroundColor: inputBg }]}>
                <TextInput
                  style={[styles.input, { color: textColor }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="ADDISON NELSON"
                  placeholderTextColor={subColor}
                  autoCapitalize="characters"
                />
              </View>

              <Pressable style={styles.saveRow} onPress={() => setSaveCard((v) => !v)}>
                <Ionicons
                  name={saveCard ? "checkbox" : "square-outline"}
                  size={20}
                  color={saveCard ? Colors.primary : subColor}
                />
                <Text style={[styles.saveText, { color: subColor }]}>Save card for future checkouts</Text>
              </Pressable>

              <Text style={[styles.secure, { color: subColor }]}>
                🔒 Your card is encrypted and tokenized by Paystack. We never store your card number.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky pay bar */}
      <View style={[styles.payBar, { backgroundColor: bg, borderTopColor: borderColor, paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={styles.cancelBtn} onPress={() => router.back()} disabled={processing}>
          <Text style={[styles.cancelText, { color: textColor }]}>Cancel</Text>
        </Pressable>
        <Pressable style={[styles.payBtn, !canPay && styles.payDisabled]} onPress={handlePay} disabled={!canPay}>
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.payText}>{setupMode ? "Save card" : `Pay ${formatNaira(amount)}`}</Text>
          )}
        </Pressable>
      </View>

      <Receipt
        visible={!!receipt}
        data={receipt}
        onClose={() => {
          setReceipt(null);
          router.replace("/(main)");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 18 },

  summary: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 18, borderWidth: 1, padding: 16 },
  summaryLabel: { fontFamily: "Poppins_400Regular", fontSize: 11 },
  summaryItem: { fontFamily: "Poppins_600SemiBold", fontSize: 15, marginTop: 2 },
  summaryAmount: { fontFamily: "Poppins_700Bold", fontSize: 18 },

  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 14, marginBottom: 10 },
  methodRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 10 },
  methodIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  methodLabel: { flex: 1, fontFamily: "Poppins_500Medium", fontSize: 14 },
  soon: { fontFamily: "Poppins_400Regular", fontSize: 11, marginRight: 6 },

  form: { borderRadius: 20, borderWidth: 1, padding: 18, marginTop: 6, gap: 6 },
  tabs: { flexDirection: "row", gap: 24, marginBottom: 14 },
  tab: { paddingBottom: 8 },
  tabText: { fontFamily: "Poppins_600SemiBold", fontSize: 13.5 },
  tabUnderline: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2, backgroundColor: Colors.primary, borderRadius: 2 },
  fieldLabel: { fontFamily: "Poppins_400Regular", fontSize: 11.5, marginTop: 10, marginBottom: 6 },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14 },
  input: { flex: 1, fontFamily: "Poppins_500Medium", fontSize: 15, paddingVertical: 13, letterSpacing: 0.5 },
  brandTag: { fontFamily: "Poppins_700Bold", fontSize: 12 },
  saveRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  saveText: { fontFamily: "Poppins_400Regular", fontSize: 12.5 },
  secure: { fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 16, marginTop: 12 },

  payBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 12, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1 },
  cancelBtn: { flex: 1, borderRadius: 30, paddingVertical: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.06)" },
  cancelText: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  payBtn: { flex: 1.4, borderRadius: 30, paddingVertical: 16, alignItems: "center", justifyContent: "center", backgroundColor: Colors.primary },
  payDisabled: { opacity: 0.45 },
  payText: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#fff" },
});
