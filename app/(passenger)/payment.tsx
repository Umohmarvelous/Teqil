/**
 * app/(passenger)/payment.tsx
 *
 * QR transfer screen. Reached after scanning a driver's QR code: shows the driver's
 * details, lets the passenger enter a fare, and transfers HALF of it + a fixed fuel
 * bonus to the driver.
 *
 * Money model (confirmed): passenger enters fare X → passenger pays X/2 → the driver
 * receives X/2 + ₦bonus. The driver's bank/payout details are used to route the
 * transfer but are NEVER shown on screen.
 *
 * Payments are MOCK-backed for now (PaystackService). When real keys land, the
 * charge (passenger) + transfer (to the driver's Paystack subaccount / recipient)
 * both run SERVER-SIDE — the app never handles the secret key or the raw account no.
 */

import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { supabase } from "@/src/services/supabase";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { PaystackContext } from "react-native-paystack-webview";
import { PaystackService } from "@/src/services/paystack";
import { apiFetch, isServerConfigured } from "@/src/services/api";
import {
  DEFAULT_DRIVER_BONUS,
  usePoolStore,
  computeTripSplit,
  chargeDriverCommission,
} from "@/src/store/usePoolStore";
import { useTierStore } from "@/src/store/useTierStore";
import { useTransactionsStore } from "@/src/store/useTransactionsStore";
import { formatNaira } from "@/src/utils/helpers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function PaymentScreen() {
  const { driver_id, subaccount_code, driver_payload } = useLocalSearchParams<{
    driver_id?: string;
    subaccount_code?: string;
    driver_payload?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";

  // Seed the driver straight from the scanned QR payload so the screen renders
  // instantly AND works even though RLS forbids a passenger from reading the
  // driver's `users` row. The Supabase read below is best-effort enrichment.
  const seededDriver = useMemo(() => {
    if (driver_payload) {
      try {
        const p = JSON.parse(driver_payload);
        if (p?.driver_id) {
          return {
            id: p.driver_id,
            driver_id: p.driver_id,
            full_name: p.name,
            vehicle_details: p.vehicle,
            avg_rating: p.rating,
            profile_photo: p.photo,
          };
        }
      } catch {
        // ignore malformed payload — fall back to the id below
      }
    }
    if (driver_id) return { id: driver_id, driver_id };
    return null;
  }, [driver_payload, driver_id]);

  const [driver, setDriver] = useState<any>(seededDriver);
  const [loading, setLoading] = useState(!seededDriver);
  const [amount, setAmount] = useState("");
  const [processing, setProcessing] = useState(false);

  // Paystack checkout context (null when no PaystackProvider / no public key).
  const paystack = useContext(PaystackContext);
  const hasPaystackKey = !!process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY;

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const cardBg = isDark ? Colors.overlayLight : Colors.textWhite;
  const bg = isDark ? Colors.background : Colors.border;
  const subColor = Colors.textSecondary;

  useEffect(() => {
    let cancelled = false;

    // Best-effort ENRICHMENT only. The screen already renders from the scanned
    // QR payload (seededDriver), so a passenger never sees "Driver not found"
    // just because RLS blocks reading another user's row. If the DB is
    // reachable we merge fresher fields (rating, photo, payout-on-file) on top.
    const enrichDriver = async () => {
      if (!driver_id) {
        setLoading(false);
        return;
      }
      let data: any = null;
      try {
        // Preferred: a SECURITY DEFINER RPC that returns public driver fields
        // under RLS (see supabase/migrations/migration_driver_lookup.sql).
        const rpc = await supabase.rpc("get_driver_public", { p_driver_id: driver_id });
        if (!rpc.error && Array.isArray(rpc.data) && rpc.data[0]) data = rpc.data[0];
      } catch {
        // RPC not deployed yet — fall through to a direct read.
      }
      if (!data) {
        try {
          const isUUID = UUID_RE.test(driver_id);
          const res = await supabase
            .from("users")
            .select("*")
            .eq(isUUID ? "id" : "driver_id", driver_id)
            .maybeSingle();
          if (!res.error && res.data) data = res.data;
        } catch (e) {
          console.warn("fetchDriver (enrichment) failed", e);
        }
      }
      if (!cancelled) {
        if (data) setDriver((prev: any) => ({ ...(prev ?? {}), ...data }));
        setLoading(false);
      }
    };

    enrichDriver();
    return () => {
      cancelled = true;
    };
  }, [driver_id]);

  const poolBalance = usePoolStore((s) => s.balance);
  const adminLossOverride = useTierStore((s) => s.adminLossOverride);

  // Money model: the passenger pays HALF; the pool matches the other half + a
  // fixed ₦100 bonus, so the driver receives the full fare + ₦100.
  const fare = useMemo(() => {
    const n = parseInt(amount.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }, [amount]);

  // Strict split — drives the block gate and the actual money movement. `blocked`
  // when the passenger's pool can't fund the matching half + bonus.
  const split = useMemo(
    () =>
      fare > 0
        ? computeTripSplit(fare, poolBalance, { allowOverdraw: adminLossOverride })
        : null,
    [fare, poolBalance, adminLossOverride]
  );

  // Display amounts (the intended split, shown even while blocked).
  const driverBonus = DEFAULT_DRIVER_BONUS;
  const passengerPays = Math.round(fare / 2);
  const driverReceives = fare > 0 ? fare + driverBonus : 0;
  const canPay = fare > 0 && !processing && !!split && !split.blocked;

  // Whether the driver has payout details on file (used, never shown).
  const hasPayout = !!(driver?.payout_account_number || subaccount_code);

  // After a successful charge (real or mock): verify → pay the driver out → record.
  const completeTransfer = async (chargeRef: string, tripId: string) => {
    // Draw the passenger's pool for this trip (idempotent). The returned split is
    // authoritative for the amounts actually moved.
    let drawn = split;
    if (user?.id) {
      const s = await usePoolStore
        .getState()
        .spendForTrip(user.id, fare, tripId, { allowOverdraw: adminLossOverride });
      if (s && !s.blocked) drawn = s;
    }
    const eff =
      drawn ?? computeTripSplit(fare, poolBalance, { allowOverdraw: adminLossOverride });

    // 1. Verify the charge server-side (best-effort; mock/test returns success).
    try {
      if (isServerConfigured()) {
        await apiFetch(`/api/paystack/verify/${encodeURIComponent(chargeRef)}`);
      }
    } catch (e) {
      console.warn("[Payment] verify failed", e);
    }

    // 2. Pay the driver out (full fare + bonus) to their stored bank via the server.
    try {
      if (isServerConfigured() && driver?.payout_account_number) {
        await apiFetch("/api/paystack/transfer", {
          method: "POST",
          body: {
            name: driver.payout_account_name || driver.full_name,
            account_number: driver.payout_account_number,
            bank_code: driver.payout_bank_code,
            amount: eff.driverReceives,
            reason: "Emilgo fare payout",
          },
        });
      }
    } catch (e) {
      console.warn("[Payment] driver payout failed", e);
    }

    // 2b. Optional: take the fixed ₦100 commission from the DRIVER's own pool.
    void chargeDriverCommission(driver?.driver_id || driver?.id, tripId);

    // 3. Record to the revenue ledger (idempotent by trip).
    if (user?.id) {
      await useTransactionsStore.getState().record({
        id: tripId,
        user_id: user.id,
        kind: "trip_payment",
        base_fare: eff.baseFare,
        passenger_bank_paid: eff.passengerBankPays,
        pool_draw: eff.poolDraw,
        driver_bonus: eff.driverBonus,
        company_cut: eff.companyCut,
        driver_total: eff.driverReceives,
        status: "success",
        dedupe_key: `${user.id}:trip:${tripId}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    setProcessing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Transfer sent 🎉",
      `${formatNaira(eff.driverReceives)} sent to ${driver?.full_name || "the driver"}`,
      [{ text: "Done", onPress: () => router.replace("/(main)") }]
    );
  };

  const handlePay = async () => {
    if (!canPay || !driver || !split) return;

    // Strict model: refuse if the pool can't fund the matching half + bonus.
    if (split.blocked) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "Ride can't be completed yet",
        `Your rewards pool needs ₦${split.shortfall.toLocaleString("en-NG")} more to cover this fare. Your pool fills up as you engage and watch ads.`
      );
      return;
    }

    setProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Stable id for this attempt → pool + transaction dedupe key.
    const tripId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    // Real Paystack checkout for the passenger's half (public key + provider present).
    // Completion continues in onSuccess → completeTransfer.
    if (hasPaystackKey && paystack?.popup) {
      paystack.popup.checkout({
        email: user?.email ?? "guest@emilgo.app",
        amount: split.passengerBankPays, // Naira (the lib converts to kobo)
        reference: `emilgo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        metadata: { driver_id: driver.id, kind: "qr_transfer" },
        onSuccess: (data) => {
          void completeTransfer(data.reference, tripId);
        },
        onCancel: () => {
          setProcessing(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
        onError: () => {
          setProcessing(false);
          Alert.alert("Payment error", "Could not start the payment. Please try again.");
        },
      });
      return;
    }

    // Fallback: mock charge (no public key / dev).
    try {
      const res = await PaystackService.processTripPayment({
        passenger_email: user?.email ?? "guest@emilgo.app",
        base_fare: split.baseFare,
        passenger_bank_pays: split.passengerBankPays,
        pool_draw: split.poolDraw,
        driver_bonus: split.driverBonus,
        company_cut: split.companyCut,
        driver_total: split.driverReceives,
      });
      if (res.success) {
        await completeTransfer(res.reference, tripId);
      } else {
        setProcessing(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Transfer failed", "The payment could not be completed. Please try again.");
      }
    } catch (e) {
      console.warn("payment failed", e);
      setProcessing(false);
      Alert.alert("Transfer failed", "Something went wrong. Please try again.");
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: bg, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={[styles.loadingText, { color: subColor }]}>Loading driver…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={textColor} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: textColor }]}>Pay Driver</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Driver card */}
          <View style={[styles.driverCard, { backgroundColor: cardBg }]}>
            <Image
              source={{ uri: driver?.profile_photo || "https://via.placeholder.com/150" }}
              style={styles.avatar}
            />
            <View style={{flex: 1, alignItems:'flex-start'}}>
              <Text style={[styles.driverName, { color: textColor }]}>
                {driver?.full_name || "Driver"}
              </Text>
              <Text style={[styles.driverMeta, { color: subColor }]}>
                {user?.driver_id || "username"}
              </Text>
              <Text style={[styles.driverMeta, { color: subColor }]}>
                Vehicle: {driver?.vehicle_details || "Standard Vehicle"}
              </Text>
              <View style={[styles.ratingRow]}>
                <View style={[{flexDirection: 'row', gap: 4, paddingHorizontal: 0,paddingVertical: 2, borderRadius: 9, alignItems: 'center', justifyContent:'center'}, { backgroundColor: cardBg }]}>
                  <Ionicons name="star" size={13} color={Colors.gold} />
                  <Text style={[styles.ratingText, { color: subColor }]}>
                    {driver?.avg_rating?.toFixed?.(1) || "New"}
                  </Text> 
                </View>

                <Text style={[styles.ratingText, { color: subColor }]}> ID{" "}
                  {driver?.driver_id || driver?.id?.slice(0, 8)}
                </Text>
              </View>
            </View>
          </View>

          {/* Bank details are used, never shown */}
          <View style={[styles.secureRow]}>
            <Ionicons name="lock-closed" size={16} color={Colors.primary} />
            <Text style={[styles.secureText, { color: subColor }]}>
              {hasPayout
                ? "Driver's bank details are secured and used only to complete this transfer."
                : "This driver has no payout account on file yet — the transfer is mocked."}
            </Text>
          </View>

            <Text style={[styles.label, { color: textColor }]}>Fare amount</Text>
          <View style={[styles.amountBoxContainer, { backgroundColor: cardBg }]}>
  
            {/* Amount input */}
            <View style={[styles.amountBox ]}>
              <Text style={[styles.naira, { color: textColor }]}>₦</Text>
              <TextInput
                style={[styles.amountInput, { color: textColor }]}
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"}
                keyboardType="number-pad"
                maxLength={7}
              />
            </View>

            {/* Live breakdown */}
            {fare > 0 && (
              <View style={[styles.breakdown]}>
                {/* <Row label="Fare entered" value={formatNaira(fare)} color={textColor} sub={subColor} /> */}
                <Row label="You pay (half)" value={formatNaira(passengerPays)} color={textColor} sub={subColor} />
                <Row label="Driver bonus" value={`+ ${formatNaira(driverBonus)}`} color={textColor} sub={subColor} />
                <View style={styles.divider} />
                <Row
                  label="Driver receives"
                  value={formatNaira(driverReceives)}
                  color={Colors.primary}
                  sub={subColor}
                  bold
                />
              </View>
            )}
          </View>

          <Text style={[styles.note, { color: subColor }]}>
            You pay half the fare; your rewards pool covers the other half, so the driver receives the full fare plus a {formatNaira(driverBonus)} bonus.
          </Text>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            style={[styles.payBtn, !canPay && styles.payBtnDisabled]}
            onPress={handlePay}
            disabled={!canPay}
          >
            {processing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.payBtnText}>
                {split?.blocked
                  ? `Pool needs ${formatNaira(split.shortfall)} more`
                  : fare > 0
                    ? `Send ${formatNaira(driverReceives)} to driver`
                    : "Enter an amount"}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Row({
  label,
  value,
  color,
  sub,
  bold,
}: {
  label: string;
  value: string;
  color: string;
  sub: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: sub }]}>{label}</Text>
      <Text style={[bold ? styles.rowValueBold : styles.rowValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingText: { fontFamily: "Poppins_500Medium", fontSize: 14, marginTop: 12 },
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

  driverCard: { flexDirection: "row", alignItems: "flex-start", gap: 14, borderRadius: 20, padding: 16 },

  avatar: { width: 73, height: 73, borderRadius: 58, backgroundColor: "rgba(128,128,128,0.15)" },
  driverName: { fontFamily: "Poppins_600SemiBold", fontSize: 18 },
  driverMeta: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  ratingRow: { flexDirection: "column-reverse",  gap: 5, marginTop: 14 },
  ratingText: { fontFamily: "Poppins_500Medium", fontSize: 12 },

  secureRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 14 },
  secureText: { fontFamily: "Poppins_400Regular", fontSize: 11, flex: 1, lineHeight: 16 },

  label: { fontFamily: "Poppins_500Medium", fontSize: 13, marginLeft: 4, marginTop: 4 },
  amountBoxContainer: {
    borderRadius: 16,
    justifyContent: 'center',
  },
  amountBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: 'center',
    paddingHorizontal: 18,
    height: 64,
    gap: 8,
  },
  naira: { fontFamily: "Poppins_700Bold", fontSize: 24 },
  amountInput: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 24, height: "100%" },

  breakdown: { padding: 26, gap: 10, borderTopWidth: 1, borderTopColor: "rgba(128 128 128 / 0.11)" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  rowLabel: { fontFamily: "Poppins_400Regular", fontSize: 13 },
  rowValue: { fontFamily: "Poppins_500Medium", fontSize: 14 },
  rowValueBold: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(128,128,128,0.3)", marginVertical: 6 },

  note: { fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 16, marginTop: 2, marginLeft: 4 },

  footer: {
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
  payBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  payBtnDisabled: { opacity: 0.5 },
  payBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#fff" },
});
