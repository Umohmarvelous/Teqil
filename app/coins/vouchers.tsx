// app/coins/vouchers.tsx
//
// The codes a redemption produced, and their state.
//
// ── Why a voucher and not a balance ────────────────────────────────────────
// COMPLIANCE.md §3: coins buy a NAMED THING at a fixed coin price, and this
// screen is where that thing lives. A voucher is a service entitlement — "one
// half-fare ride" — with a code, an expiry and a used-or-not state. A balance of
// value is the object that needs a licence; a coupon is not.
//
// Which is also why nothing here shows a currency: a voucher for a half-fare
// ride is worth exactly one half-fare ride, whatever that ride costs.

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, RefreshControl, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Ticket01Icon, Copy01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import { IOSScreen, useIOSTheme, IOSAppFont } from "@/components/ios";
import { useCoinsStore } from "@/src/store/useCoinsStore";
import { formatCs, type CsRedemption } from "@/src/services/coins";

const LABELS: Record<string, string> = {
  half_fare: "Half-fare ride",
  fuel_voucher: "Fuel voucher",
  commission_waiver: "Commission waiver",
};

type State = "ready" | "used" | "expired";

function stateOf(v: CsRedemption): State {
  if (v.used_at) return "used";
  return new Date(v.expires_at).getTime() < Date.now() ? "expired" : "ready";
}

export default function VouchersScreen() {
  const t = useIOSTheme();
  const { redemptions, refresh } = useCoinsStore();
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { refresh(); }, [refresh]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const copy = async (code: string) => {
    await Clipboard.setStringAsync(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(code);
    setTimeout(() => setCopied((c) => (c === code ? null : c)), 1800);
  };

  const ready = redemptions.filter((v) => stateOf(v) === "ready");
  const spent = redemptions.filter((v) => stateOf(v) !== "ready");

  return (
    <IOSScreen title="Vouchers" back scrollable={false} tabBarInset={false}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.tint} />
        }
      >
        {redemptions.length === 0 ? (
          <View style={styles.emptyBox}>
            <HugeiconsIcon icon={Ticket01Icon} size={34} color={t.quaternaryLabel} />
            <Text style={[styles.empty, { color: t.tertiaryLabel }]}>
              No vouchers yet. Redeem coins from the coin hub and they appear here.
            </Text>
          </View>
        ) : null}

        {ready.length ? (
          <Text style={[styles.section, { color: t.tertiaryLabel }]}>READY TO USE</Text>
        ) : null}
        {ready.map((v) => (
          <Voucher key={v.id} v={v} t={t} copied={copied === v.voucher_code} onCopy={copy} />
        ))}

        {spent.length ? (
          <Text style={[styles.section, { color: t.tertiaryLabel }]}>USED AND EXPIRED</Text>
        ) : null}
        {spent.map((v) => (
          <Voucher key={v.id} v={v} t={t} copied={false} onCopy={copy} />
        ))}

        <View style={{ height: 30 }} />
      </ScrollView>
    </IOSScreen>
  );
}

function Voucher({
  v, t, copied, onCopy,
}: { v: CsRedemption; t: any; copied: boolean; onCopy: (c: string) => void }) {
  const state = stateOf(v);
  const dim = state !== "ready";
  const tint =
    state === "ready" ? t.tint : state === "used" ? t.systemGreen : t.tertiaryLabel;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.secondarySystemGroupedBackground, borderColor: tint + "44" },
        dim && { opacity: 0.6 },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.icon, { backgroundColor: tint + "1A" }]}>
          <HugeiconsIcon
            icon={state === "used" ? CheckmarkCircle02Icon : Ticket01Icon}
            size={20}
            color={tint}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.label, { color: t.label }]}>
            {LABELS[v.code] ?? v.code}
          </Text>
          <Text style={[styles.meta, { color: t.tertiaryLabel }]}>
            {formatCs(v.price_cs)} ·{" "}
            {state === "ready"
              ? `expires ${new Date(v.expires_at).toLocaleDateString()}`
              : state === "used"
                ? `used ${new Date(v.used_at!).toLocaleDateString()}`
                : `expired ${new Date(v.expires_at).toLocaleDateString()}`}
          </Text>
        </View>
      </View>

      {/* The code is the whole point of the row, so it is big, monospaced and
          one tap from the clipboard — it gets read aloud at a fuel pump. */}
      <Pressable
        onPress={() => state === "ready" && onCopy(v.voucher_code)}
        disabled={state !== "ready"}
        style={[styles.codeRow, { backgroundColor: t.tertiarySystemFill }]}
      >
        <Text style={[styles.code, { color: t.label }]}>{v.voucher_code}</Text>
        {state === "ready" ? (
          <View style={styles.copyWrap}>
            <HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Copy01Icon} size={16} color={t.tint} />
            <Text style={[styles.copyText, { color: t.tint }]}>{copied ? "Copied" : "Copy"}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 20 },
  section: { ...IOSAppFont.caption1, letterSpacing: 0.6, marginTop: 20, marginBottom: 8 },

  card: { borderRadius: 16, padding: 14, gap: 12, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  label: { ...IOSAppFont.subheadline, fontFamily: "Poppins_600SemiBold" },
  meta: { ...IOSAppFont.caption2, marginTop: 1 },

  codeRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  code: { fontFamily: "Poppins_700Bold", fontSize: 20, letterSpacing: 3 },
  copyWrap: { flexDirection: "row", alignItems: "center", gap: 5 },
  copyText: { ...IOSAppFont.caption1, fontFamily: "Poppins_500Medium" },

  emptyBox: { alignItems: "center", gap: 12, paddingVertical: 60, paddingHorizontal: 34 },
  empty: { ...IOSAppFont.subheadline, textAlign: "center", lineHeight: 20 },
});
