// app/coins/index.tsx
//
// The coin hub: what you have, where it came from, and what it buys.
//
// ── Why this is not called a wallet, and does not look like one ────────────
// There is no "Top up", no "Withdraw", no balance in a currency, and no
// "≈ ₦n" anywhere. Read COMPLIANCE.md §0: what makes an in-app balance into
// e-money is that it is a claim redeemable for cash, and the fastest way to
// convince a regulator you have built one is to draw it like a bank account.
//
// So the hub answers three questions instead: how many coins, how they arrived,
// and what they can be exchanged for — where "what" is always a named thing (a
// half-fare ride, a fuel voucher), never an amount.

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  GiftIcon,
  StarIcon,
  PlayIcon,
  Ticket01Icon,
  ArrowUpRight01Icon,
  ArrowDownLeft01Icon,
} from "@hugeicons/core-free-icons";

import {
  IOSScreen,
  IOSButton,
  useIOSTheme,
  IOSAppFont,
  iosAlert,
} from "@/components/ios";
import { useCoinsStore } from "@/src/store/useCoinsStore";
import { useAuthStore } from "@/src/store/useStore";
import {
  formatCs,
  formatCsSigned,
  describeCsKind,
  type CsEntry,
} from "@/src/services/coins";

export default function CoinsHub() {
  const t = useIOSTheme();
  const role = useAuthStore((s) => s.user?.role);

  const {
    balance, history, entitlements, redemptions, loading, syncedAt,
    refresh, redeem,
  } = useCoinsStore();

  const [refreshing, setRefreshing] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  useEffect(() => { refresh(); }, [refresh]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const doRedeem = async (code: string, label: string, price: number) => {
    if (busyCode) return;
    iosAlert(
      `Redeem ${label}?`,
      `This uses ${formatCs(price)} and gives you a voucher code. Coins are not refundable once redeemed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Redeem",
          onPress: async () => {
            setBusyCode(code);
            try {
              const res = await redeem(code);
              if (!res.ok) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                iosAlert(
                  "Not redeemed",
                  res.reason === "insufficient"
                    ? `You have ${formatCs(res.balance ?? 0)} and this costs ${formatCs(res.price ?? price)}.`
                    : res.reason === "wrong_role"
                      ? "This one is not available for your account type."
                      : "That didn't go through. Try again shortly.",
                );
                return;
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              iosAlert(
                "Voucher ready",
                `${res.label}\n\nCode: ${res.voucher}\n\nShow this code to redeem. It is also saved under Vouchers below.`,
              );
            } finally {
              setBusyCode(null);
            }
          },
        },
      ],
    );
  };

  const mine = entitlements.filter((e) => !e.for_role || e.for_role === role);
  const liveVouchers = redemptions.filter(
    (r) => !r.used_at && new Date(r.expires_at).getTime() > Date.now(),
  );

  return (
    <IOSScreen title="Coins" back scrollable={false} tabBarInset={false}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.tint} />
        }
      >
        {/* ── Balance ─────────────────────────────────────────────────────
            One number and what it does. No currency, no equivalent, no
            "available to withdraw". */}
        <View style={[styles.hero, { backgroundColor: t.tint }]}>
          <Text style={styles.heroLabel}>Your coins</Text>
          <Text style={styles.heroValue}>{formatCs(balance)}</Text>
          <Text style={styles.heroSub}>
            Earned by watching ads. Spend them on rides and fuel, or gift them to
            a driver.
          </Text>
        </View>

        <View style={styles.actions}>
          <Action
            icon={PlayIcon}
            label="Earn"
            hint="Watch an ad"
            t={t}
            onPress={() => router.push("/rewards")}
          />
          <Action
            icon={GiftIcon}
            label="Gift"
            hint="Send to a driver"
            t={t}
            onPress={() => router.push("/coins/gift")}
          />
          <Action
            icon={Ticket01Icon}
            label="Vouchers"
            hint={liveVouchers.length ? `${liveVouchers.length} ready` : "None yet"}
            t={t}
            onPress={() => router.push("/coins/vouchers")}
          />
        </View>

        {/* ── What coins buy ──────────────────────────────────────────────
            A named thing at a fixed coin price. This is the hinge the whole
            compliance argument turns on — see COMPLIANCE.md §3. */}
        <Text style={[styles.section, { color: t.tertiaryLabel }]}>WHAT COINS BUY</Text>
        {mine.length === 0 ? (
          <Text style={[styles.empty, { color: t.tertiaryLabel }]}>
            Nothing is available for your account type yet.
          </Text>
        ) : (
          mine.map((e) => {
            const affordable = balance >= e.price_cs;
            return (
              <Pressable
                key={e.code}
                onPress={() => doRedeem(e.code, e.label, e.price_cs)}
                disabled={!affordable || busyCode === e.code}
                style={({ pressed }) => [
                  styles.entRow,
                  { backgroundColor: t.secondarySystemGroupedBackground },
                  pressed && { opacity: 0.85 },
                  !affordable && { opacity: 0.5 },
                ]}
              >
                <View style={[styles.entIcon, { backgroundColor: t.tint + "1A" }]}>
                  <HugeiconsIcon icon={Ticket01Icon} size={20} color={t.tint} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.entLabel, { color: t.label }]}>{e.label}</Text>
                  <Text style={[styles.entDesc, { color: t.tertiaryLabel }]} numberOfLines={2}>
                    {e.description}
                  </Text>
                </View>
                {busyCode === e.code ? (
                  <ActivityIndicator size="small" color={t.tint} />
                ) : (
                  <Text style={[styles.entPrice, { color: affordable ? t.tint : t.tertiaryLabel }]}>
                    {formatCs(e.price_cs)}
                  </Text>
                )}
              </Pressable>
            );
          })
        )}

        {/* ── Statement ───────────────────────────────────────────────────
            Called "Activity", not "Transactions": a transaction is something a
            bank does. */}
        <View style={styles.sectionRow}>
          <Text style={[styles.section, { color: t.tertiaryLabel }]}>ACTIVITY</Text>
          {syncedAt ? (
            <Text style={[styles.synced, { color: t.quaternaryLabel }]}>
              updated {new Date(syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          ) : null}
        </View>

        {loading && history.length === 0 ? (
          <ActivityIndicator color={t.tint} style={{ marginTop: 20 }} />
        ) : history.length === 0 ? (
          <View style={styles.emptyBox}>
            <HugeiconsIcon icon={StarIcon} size={30} color={t.quaternaryLabel} />
            <Text style={[styles.empty, { color: t.tertiaryLabel }]}>
              Nothing yet. Watch an ad and your first coins land here.
            </Text>
            <IOSButton title="Watch an ad" variant="tinted" onPress={() => router.push("/rewards")} />
          </View>
        ) : (
          history.map((h) => <HistoryRow key={h.id} entry={h} t={t} />)
        )}

        {/* The sentence that has to be true, and has to be visible. */}
        <Text style={[styles.legal, { color: t.tertiaryLabel }]}>
          Coins are an EMILGO reward. They have no cash value, cannot be
          withdrawn, cannot be exchanged for money, and are not a deposit.
        </Text>
        <View style={{ height: 30 }} />
      </ScrollView>
    </IOSScreen>
  );
}

function Action({
  icon, label, hint, t, onPress,
}: { icon: any; label: string; hint: string; t: any; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: t.secondarySystemGroupedBackground },
        pressed && { opacity: 0.85 },
      ]}
    >
      <HugeiconsIcon icon={icon} size={22} color={t.tint} />
      <Text style={[styles.actionLabel, { color: t.label }]}>{label}</Text>
      <Text style={[styles.actionHint, { color: t.tertiaryLabel }]} numberOfLines={1}>
        {hint}
      </Text>
    </Pressable>
  );
}

function HistoryRow({ entry, t }: { entry: CsEntry; t: any }) {
  const positive = entry.amount > 0;
  return (
    <View style={[styles.histRow, { borderBottomColor: t.separator }]}>
      <View
        style={[
          styles.histIcon,
          { backgroundColor: (positive ? t.systemGreen : t.systemOrange) + "1A" },
        ]}
      >
        <HugeiconsIcon
          icon={positive ? ArrowDownLeft01Icon : ArrowUpRight01Icon}
          size={16}
          color={positive ? t.systemGreen : t.systemOrange}
          strokeWidth={2.2}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.histTitle, { color: t.label }]} numberOfLines={1}>
          {describeCsKind(entry.kind, entry.counterparty_name)}
        </Text>
        <Text style={[styles.histWhen, { color: t.tertiaryLabel }]} numberOfLines={1}>
          {new Date(entry.created_at).toLocaleString()}
          {entry.note ? ` · ${entry.note}` : ""}
        </Text>
      </View>
      <Text
        style={[
          styles.histAmount,
          { color: positive ? t.systemGreen : t.label },
        ]}
      >
        {formatCsSigned(entry.amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 20 },

  hero: { borderRadius: 20, padding: 20, gap: 4 },
  heroLabel: { ...IOSAppFont.subheadline, color: "rgba(255,255,255,0.85)" },
  heroValue: { fontFamily: "Poppins_700Bold", fontSize: 38, color: "#fff" },
  heroSub: { ...IOSAppFont.caption1, color: "rgba(255,255,255,0.85)", lineHeight: 17, marginTop: 4 },

  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  action: { flex: 1, borderRadius: 16, padding: 14, gap: 4, alignItems: "flex-start" },
  actionLabel: { ...IOSAppFont.subheadline, fontFamily: "Poppins_600SemiBold" },
  actionHint: { ...IOSAppFont.caption2 },

  sectionRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  section: { ...IOSAppFont.caption1, letterSpacing: 0.6, marginTop: 24, marginBottom: 8 },
  synced: { ...IOSAppFont.caption2, marginTop: 24 },

  entRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, padding: 12, marginBottom: 8,
  },
  entIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  entLabel: { ...IOSAppFont.subheadline, fontFamily: "Poppins_600SemiBold" },
  entDesc: { ...IOSAppFont.caption1, marginTop: 1, lineHeight: 16 },
  entPrice: { ...IOSAppFont.subheadline, fontFamily: "Poppins_600SemiBold" },

  histRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  histIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  histTitle: { ...IOSAppFont.subheadline, fontFamily: "Poppins_500Medium" },
  histWhen: { ...IOSAppFont.caption2, marginTop: 1 },
  histAmount: { ...IOSAppFont.subheadline, fontFamily: "Poppins_600SemiBold" },

  emptyBox: { alignItems: "center", gap: 12, paddingVertical: 32, paddingHorizontal: 30 },
  empty: { ...IOSAppFont.subheadline, textAlign: "center", lineHeight: 20 },

  legal: { ...IOSAppFont.caption2, lineHeight: 16, textAlign: "center", marginTop: 26 },
});
