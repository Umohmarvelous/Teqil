/**
 * app/tiers.tsx
 *
 * Emilgo Premium — the Free / Pro / Elite tier chooser. Top-level route (registered
 * in app/_layout.tsx) so it opens full-screen over the tab shell.
 *
 * Pricing is DERIVED from the current fuel price via useTierStore (Pro = 4× a litre,
 * Elite = 8×), so it stays consistent with the rest of the app. Upgrading runs the
 * mock Paystack premium charge (60/40 station/company split) and then sets the tier.
 *
 * NOTE: there is no revenue-persistence store yet, so the purchase is not recorded
 * to a ledger here — that lands with the revenue/premium work later. This screen
 * only performs the (mock) charge and updates the active tier.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useTierStore } from "@/src/store/useTierStore";
import { PaystackService, computePremiumSplit } from "@/src/services/paystack";
import { useTransactionsStore } from "@/src/store/useTransactionsStore";
import { formatNaira } from "@/src/utils/helpers";
import type { PremiumTier } from "@/src/models/types";

const txnId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// Placeholder partner-station subaccount for the mock 60/40 split. Real code comes
// from the station onboarding flow later.
const MOCK_STATION_SUBACCOUNT = "ACCT_mock_station";

interface PlanMeta {
  tier: PremiumTier;
  name: string;
  tagline: string;
  features: string[];
  recommended?: boolean;
}

const PLANS: PlanMeta[] = [
  {
    tier: "free",
    name: "Free",
    tagline: "The essentials to ride & earn",
    features: [
      "Standard fares & live trip tracking",
      "Earn fuel coins on trips",
      "Basic in-app support",
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    tagline: "Priority rides & bigger rewards",
    recommended: true,
    features: [
      "Everything in Free",
      "Priority driver matching",
      "Higher reward multiplier",
      "Ad-free feed",
      "Priority support",
    ],
  },
  {
    tier: "elite",
    name: "Elite",
    tagline: "Maximum perks & rewards",
    features: [
      "Everything in Pro",
      "Maximum reward multiplier",
      "Free-ride & free-fuel boosts",
      "Exclusive routes & offers",
      "Dedicated support line",
    ],
  },
];

export default function TiersScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";

  const user = useAuthStore((s) => s.user);
  const currentTier = useTierStore((s) => s.tier);
  const setTier = useTierStore((s) => s.setTier);
  const priceForTier = useTierStore((s) => s.priceForTier);

  const [processing, setProcessing] = useState<PremiumTier | null>(null);

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const cardBg = isDark ? Colors.overlayLight : Colors.textWhite;
  const bg = isDark ? Colors.background : Colors.border;
  const subColor = Colors.textSecondary;

  const planName = (t: PremiumTier) => PLANS.find((p) => p.tier === t)?.name ?? t;

  // Runs the (mock) charge and switches the tier, with visible confirmation.
  const runUpgrade = async (tier: PremiumTier) => {
    const amount = priceForTier(tier);
    setProcessing(tier);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await PaystackService.processPremiumPayment({
        email: user?.email ?? "guest@emilgo.app",
        amount,
        station_subaccount: MOCK_STATION_SUBACCOUNT,
      });
      if (res.success) {
        setTier(tier);
        // Persist the purchase to the revenue ledger (idempotent by reference).
        if (user?.id) {
          const split = computePremiumSplit(amount);
          await useTransactionsStore.getState().record({
            id: txnId(),
            user_id: user.id,
            kind: "premium_subscription",
            premium_amount: amount,
            station_share: split.station_share,
            company_share: split.company_share,
            station_subaccount: MOCK_STATION_SUBACCOUNT,
            status: "success",
            dedupe_key: res.reference,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "You're on " + planName(tier) + " 🎉",
          `Payment of ${formatNaira(amount)} succeeded (ref ${res.reference}). Your plan is now active.`
        );
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Payment failed", "We couldn't complete the payment. Please try again.");
      }
    } finally {
      setProcessing(null);
    }
  };

  const handleSelect = (tier: PremiumTier) => {
    if (tier === currentTier || processing) return;

    // Downgrade / switch to Free — no charge, just confirm.
    if (tier === "free") {
      Alert.alert("Switch to Free?", "You'll lose your premium perks at the end of the cycle.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch to Free",
          style: "destructive",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setTier("free");
          },
        },
      ]);
      return;
    }

    // Paid tier — confirm the charge first (this is where Paystack checkout will open
    // once real keys are wired; today it runs the mock charge).
    const amount = priceForTier(tier);
    Alert.alert(
      `Upgrade to ${planName(tier)}`,
      `You'll be charged ${formatNaira(amount)} / month. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: `Pay ${formatNaira(amount)}`, onPress: () => runUpgrade(tier) },
      ]
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={textColor} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: textColor }]}>Emilgo Premium</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.lede, { color: subColor }]}>
          Choose a plan. Pricing tracks the fuel price so it stays fair —
          Pro is 4× a litre, Elite is 8×.
        </Text>

        {PLANS.map((plan) => {
          const isCurrent = plan.tier === currentTier;
          const price = priceForTier(plan.tier);
          const isBusy = processing === plan.tier;

          return (
            <View
              key={plan.tier}
              style={[
                styles.card,
                { backgroundColor: cardBg },
                plan.recommended && styles.cardRecommended,
                isCurrent && styles.cardCurrent,
              ]}
            >
              {plan.recommended && (
                <View style={styles.ribbon}>
                  <Text style={styles.ribbonText}>RECOMMENDED</Text>
                </View>
              )}

              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.planName, { color: textColor }]}>{plan.name}</Text>
                  <Text style={[styles.planTagline, { color: subColor }]}>{plan.tagline}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.planPrice, { color: textColor }]}>
                    {price === 0 ? "Free" : formatNaira(price)}
                  </Text>
                  {price > 0 && <Text style={[styles.planPer, { color: subColor }]}>/ month</Text>}
                </View>
              </View>

              <View style={styles.features}>
                {plan.features.map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={17} color={Colors.primary} />
                    <Text style={[styles.featureText, { color: textColor }]}>{f}</Text>
                  </View>
                ))}
              </View>

              {isCurrent ? (
                <View style={[styles.cta, styles.ctaCurrent]}>
                  <Ionicons name="checkmark" size={16} color={Colors.primary} />
                  <Text style={styles.ctaCurrentText}>Current plan</Text>
                </View>
              ) : (
                <Pressable
                  style={[styles.cta, styles.ctaActive, isBusy && styles.ctaDisabled]}
                  onPress={() => handleSelect(plan.tier)}
                  disabled={isBusy}
                >
                  {isBusy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.ctaActiveText}>
                      {plan.tier === "free" ? "Switch to Free" : `Upgrade to ${plan.name}`}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          );
        })}

        <Text style={[styles.footnote, { color: subColor }]}>
          Premium payments are split 60% to the partner fuel station and 40% to Emilgo.
          You can change or cancel your plan anytime.
        </Text>
      </ScrollView>
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
  lede: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 19, marginBottom: 2 },

  card: {
    borderRadius: 22,
    padding: 18,
    gap: 16,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  cardRecommended: { borderColor: Colors.gold },
  cardCurrent: { borderColor: Colors.primary },
  ribbon: {
    position: "absolute",
    top: -1,
    right: 18,
    backgroundColor: Colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  ribbonText: { fontFamily: "Poppins_700Bold", fontSize: 9, color: "#fff", letterSpacing: 0.5 },

  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 4 },
  planName: { fontFamily: "Poppins_700Bold", fontSize: 20 },
  planTagline: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  planPrice: { fontFamily: "Poppins_700Bold", fontSize: 20 },
  planPer: { fontFamily: "Poppins_400Regular", fontSize: 11 },

  features: { gap: 10 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureText: { fontFamily: "Poppins_500Medium", fontSize: 13, flex: 1 },

  cta: {
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaActive: { backgroundColor: Colors.primary },
  ctaActiveText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },
  ctaDisabled: { opacity: 0.6 },
  ctaCurrent: { backgroundColor: "rgba(0,154,67,0.12)" },
  ctaCurrentText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.primary },

  footnote: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 6,
  },
});
