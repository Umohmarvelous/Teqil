// app/barter/[offerId].tsx
//
// Barter bargaining thread for one free-ride offer.
//
// A 'reward' offer is accept-only. A 'barter' offer is a negotiation: the
// passenger opens with what they'll give in exchange, the driver counters or
// accepts, and so on. When either side accepts, the terms are snapshotted into
// an agreement both parties have consented to — and from then on the ride can
// be marked fulfilled, or reported if someone doesn't honour it.
//
// All writes go through RPCs; this screen never assumes an outcome the server
// didn't confirm.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import {
  IOSButton,
  IOSScreen,
  IOSSheet,
  IOSAlert,
  useCollapsibleScroll,
  useIOSTheme,
  IOSFont,
  type IOSAlertAction,
} from "@/components/ios";
import {
  useBarterStore,
  describeBarterResult,
  type Bargain,
  type ViolationReason,
} from "@/src/store/useBarterStore";
import { useAuthStore } from "@/src/store/useStore";
import { formatNaira } from "@/src/utils/helpers";

const VIOLATION_REASONS: { value: ViolationReason; label: string }[] = [
  { value: "not_delivered", label: "Didn't deliver what was agreed" },
  { value: "partial",       label: "Only partly delivered" },
  { value: "no_show",       label: "Didn't show up" },
  { value: "unsafe",        label: "Unsafe or inappropriate behaviour" },
  { value: "other",         label: "Something else" },
];

// ─── One proposal in the thread ──────────────────────────────────────────────

function BargainBubble({
  bargain,
  isMine,
  isLatestPending,
  onAccept,
  onDecline,
  onCounter,
  busy,
}: {
  bargain: Bargain;
  isMine: boolean;
  isLatestPending: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCounter: () => void;
  busy: boolean;
}) {
  const t = useIOSTheme();

  const statusLabel: Record<string, string> = {
    pending:   isMine ? "Waiting for a reply" : "Awaiting your response",
    countered: "Countered",
    accepted:  "Accepted",
    declined:  "Declined",
    withdrawn: "Withdrawn",
  };

  const statusColor =
    bargain.status === "accepted"
      ? t.systemGreen
      : bargain.status === "declined"
        ? t.systemRed
        : t.tertiaryLabel;

  return (
    <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isMine ? t.tint : t.secondarySystemGroupedBackground,
            borderColor: t.separator,
          },
        ]}
      >
        <Text
          style={[
            IOSFont.body,
            { color: isMine ? "#FFFFFF" : t.label },
          ]}
        >
          {bargain.terms}
        </Text>

        {bargain.cash_amount > 0 && (
          <View style={styles.cashRow}>
            <Ionicons
              name="cash-outline"
              size={14}
              color={isMine ? "rgba(255,255,255,0.85)" : t.systemGreen}
            />
            <Text
              style={[
                IOSFont.footnote,
                { color: isMine ? "rgba(255,255,255,0.85)" : t.secondaryLabel },
              ]}
            >
              plus {formatNaira(bargain.cash_amount)}
            </Text>
          </View>
        )}

        <Text
          style={[
            IOSFont.caption1,
            { color: isMine ? "rgba(255,255,255,0.75)" : statusColor, marginTop: 6 },
          ]}
        >
          {statusLabel[bargain.status] ?? bargain.status}
        </Text>
      </View>

      {/* Only the side that didn't propose can act, and only on the live turn. */}
      {isLatestPending && !isMine && (
        <View style={styles.actionRow}>
          <IOSButton title="Accept" variant="filled" size="small" onPress={onAccept} disabled={busy} />
          <IOSButton title="Counter" variant="tinted" size="small" onPress={onCounter} disabled={busy} />
          <IOSButton
            title="Decline"
            variant="borderless"
            size="small"
            role="destructive"
            onPress={onDecline}
            disabled={busy}
          />
        </View>
      )}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function BarterThreadScreen() {
  const { offerId, driverId } = useLocalSearchParams<{
    offerId: string;
    driverId?: string;
  }>();

  const t = useIOSTheme();
  const insets = useSafeAreaInsets();
  // The compose button is pinned below the list, so the list has to clear it.
  const scroll = useCollapsibleScroll({ extraBottom: 96 });
  const user = useAuthStore((s) => s.user);

  const { thread, agreement, loading, loadThread, propose, respond, reportViolation, markFulfilled, reset } =
    useBarterStore();

  const [composerOpen, setComposerOpen] = useState(false);
  const [terms, setTerms] = useState("");
  const [cash, setCash] = useState("");
  const [counterOf, setCounterOf] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [alert, setAlert] = useState<{ title: string; message: string; actions: IOSAlertAction[] } | null>(null);

  const isDriver = !!user?.id && user.id === driverId;

  const refresh = useCallback(() => {
    if (offerId && user?.id) loadThread(offerId, user.id);
  }, [offerId, user?.id, loadThread]);

  useEffect(() => {
    refresh();
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerId, user?.id]);

  /** The one proposal that can still be acted on. */
  const latestPending = useMemo(
    () => [...thread].reverse().find((b) => b.status === "pending") ?? null,
    [thread]
  );

  const showResult = useCallback((message: string, title = "Barter") => {
    setAlert({ title, message, actions: [{ label: "OK", onPress: () => setAlert(null) }] });
  }, []);

  const submitProposal = async () => {
    const text = terms.trim();
    if (text.length < 3) {
      showResult("Describe what you're offering in a few more words.", "Add some detail");
      return;
    }
    setBusy(true);
    const result = await propose({
      offerId: offerId!,
      terms: text,
      cashAmount: Number(cash) || 0,
      parentId: counterOf,
    });
    setBusy(false);

    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setComposerOpen(false);
      setTerms("");
      setCash("");
      setCounterOf(null);
      refresh();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    showResult(describeBarterResult(result));
  };

  const handleRespond = async (bargainId: string, accept: boolean) => {
    setBusy(true);
    const result = await respond(bargainId, accept);
    setBusy(false);
    Haptics.notificationAsync(
      result.ok
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning
    );
    refresh();
    showResult(describeBarterResult(result), accept ? "Agreement" : "Declined");
  };

  const submitReport = async (reason: ViolationReason) => {
    if (!agreement) return;
    setReportOpen(false);
    setBusy(true);
    const result = await reportViolation(agreement.id, reason);
    setBusy(false);
    refresh();
    showResult(describeBarterResult(result), "Report");
  };

  const handleFulfil = async () => {
    if (!agreement) return;
    setBusy(true);
    const result = await markFulfilled(agreement.id);
    setBusy(false);
    refresh();
    showResult(describeBarterResult(result), "Agreement");
  };

  return (
    <IOSScreen title="Bargaining" back scrollable={false} scroll={scroll}>
      <Animated.ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        {...scroll.scrollProps}
        contentContainerStyle={[
          { paddingHorizontal: 16, gap: 14 },
          scroll.scrollProps.contentContainerStyle,
        ]}
      >
        {/* Agreement banner — the record both sides consented to */}
        {agreement && (
          <View
            style={[
              styles.agreementCard,
              {
                backgroundColor: t.secondarySystemGroupedBackground,
                borderColor:
                  agreement.status === "violated"
                    ? t.systemRed
                    : agreement.status === "disputed"
                      ? t.systemOrange
                      : t.systemGreen,
              },
            ]}
          >
            <View style={styles.agreementHead}>
              <Ionicons
                name={
                  agreement.status === "violated"
                    ? "close-circle"
                    : agreement.status === "disputed"
                      ? "alert-circle"
                      : agreement.status === "fulfilled"
                        ? "checkmark-done-circle"
                        : "document-text"
                }
                size={18}
                color={
                  agreement.status === "violated"
                    ? t.systemRed
                    : agreement.status === "disputed"
                      ? t.systemOrange
                      : t.systemGreen
                }
              />
              <Text style={[IOSFont.headline, { color: t.label }]}>
                {agreement.status === "fulfilled"
                  ? "Agreement fulfilled"
                  : agreement.status === "violated"
                    ? "Agreement violated"
                    : agreement.status === "disputed"
                      ? "Agreement disputed"
                      : "Agreement in place"}
              </Text>
            </View>

            <Text style={[IOSFont.body, { color: t.label }]}>{agreement.agreed_terms}</Text>
            {agreement.cash_amount > 0 && (
              <Text style={[IOSFont.subheadline, { color: t.secondaryLabel }]}>
                plus {formatNaira(agreement.cash_amount)}
              </Text>
            )}

            <Text style={[IOSFont.caption1, { color: t.tertiaryLabel }]}>
              Both sides consented. Emilgo funds nothing here — this is a free-will
              exchange, and this record is what a dispute is judged against.
            </Text>

            {agreement.status === "active" && (
              <View style={styles.agreementActions}>
                <IOSButton title="Mark fulfilled" variant="tinted" size="small" onPress={handleFulfil} disabled={busy} />
                <IOSButton
                  title="Report a problem"
                  variant="borderless"
                  size="small"
                  role="destructive"
                  onPress={() => setReportOpen(true)}
                  disabled={busy}
                />
              </View>
            )}
          </View>
        )}

        {/* Thread */}
        {loading && thread.length === 0 ? (
          <ActivityIndicator color={t.tint} style={{ marginTop: 40 }} />
        ) : thread.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="swap-horizontal" size={44} color={t.tertiaryLabel} />
            <Text style={[IOSFont.headline, { color: t.label, textAlign: "center" }]}>
              No offers yet
            </Text>
            <Text style={[IOSFont.subheadline, { color: t.secondaryLabel, textAlign: "center" }]}>
              {isDriver
                ? "When a passenger proposes an exchange for this ride, it'll appear here."
                : "Propose what you'll give in exchange for this ride — money, goods or a service."}
            </Text>
          </View>
        ) : (
          thread.map((b) => (
            <BargainBubble
              key={b.id}
              bargain={b}
              isMine={b.proposed_by === user?.id}
              isLatestPending={latestPending?.id === b.id}
              busy={busy}
              onAccept={() => handleRespond(b.id, true)}
              onDecline={() => handleRespond(b.id, false)}
              onCounter={() => {
                setCounterOf(b.id);
                setTerms("");
                setCash("");
                setComposerOpen(true);
              }}
            />
          ))
        )}
      </Animated.ScrollView>

      {/* Compose — hidden once an agreement exists or it isn't your turn */}
      {!agreement && (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + 12,
              backgroundColor: t.systemBackground,
              borderTopColor: t.separator,
            },
          ]}
        >
          <IOSButton
            title={
              latestPending
                ? latestPending.proposed_by === user?.id
                  ? "Waiting for their reply"
                  : "Counter their offer"
                : isDriver
                  ? "Waiting for a proposal"
                  : "Propose an exchange"
            }
            variant="filled"
            disabled={
              busy ||
              (isDriver && !latestPending) ||
              (!!latestPending && latestPending.proposed_by === user?.id)
            }
            onPress={() => {
              setCounterOf(latestPending?.id ?? null);
              setComposerOpen(true);
            }}
          />
        </View>
      )}

      {/* Composer sheet */}
      <IOSSheet
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
        title={counterOf ? "Counter-offer" : "Propose an exchange"}
        detent="medium"
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Text style={[IOSFont.subheadline, { color: t.secondaryLabel, marginBottom: 10 }]}>
            Be specific about what you're offering. This is what you'll be held to
            if the other side reports a problem.
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: t.tertiarySystemFill,
                color: t.label,
                borderColor: t.separator,
              },
            ]}
            placeholder="e.g. I'll fix your phone screen this weekend"
            placeholderTextColor={t.tertiaryLabel}
            value={terms}
            onChangeText={setTerms}
            multiline
            maxLength={500}
          />

          <Text style={[IOSFont.footnote, { color: t.secondaryLabel, marginTop: 14, marginBottom: 6 }]}>
            Cash on top (optional)
          </Text>
          <TextInput
            style={[
              styles.cashInput,
              {
                backgroundColor: t.tertiarySystemFill,
                color: t.label,
                borderColor: t.separator,
              },
            ]}
            placeholder="0"
            placeholderTextColor={t.tertiaryLabel}
            value={cash}
            onChangeText={(v) => setCash(v.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
          />

          <View style={{ marginTop: 18 }}>
            <IOSButton
              title={busy ? "Sending…" : counterOf ? "Send counter-offer" : "Send offer"}
              variant="filled"
              onPress={submitProposal}
              disabled={busy}
            />
          </View>
        </KeyboardAvoidingView>
      </IOSSheet>

      {/* Violation report sheet */}
      <IOSSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report a problem"
        detent="medium"
      >
        <Text style={[IOSFont.subheadline, { color: t.secondaryLabel, marginBottom: 14 }]}>
          This marks the agreement disputed and sends it for review. An upheld
          report blocks any fuel reward for the ride.
        </Text>
        {VIOLATION_REASONS.map((r) => (
          <Pressable
            key={r.value}
            style={[styles.reasonRow, { borderBottomColor: t.separator }]}
            onPress={() => submitReport(r.value)}
          >
            <Text style={[IOSFont.body, { color: t.label }]}>{r.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={t.tertiaryLabel} />
          </Pressable>
        ))}
      </IOSSheet>

      <IOSAlert
        visible={!!alert}
        title={alert?.title ?? ""}
        message={alert?.message}
        actions={alert?.actions ?? []}
        onClose={() => setAlert(null)}
      />
    </IOSScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  bubbleRow: { alignItems: "flex-start", gap: 8 },
  bubbleRowMine: { alignItems: "flex-end" },
  bubble: {
    maxWidth: "88%",
    borderRadius: 18,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cashRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },

  agreementCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    gap: 8,
  },
  agreementHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  agreementActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    flexWrap: "wrap",
  },

  empty: { alignItems: "center", gap: 10, paddingTop: 60, paddingHorizontal: 30 },

  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  input: {
    minHeight: 96,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    fontSize: 17,
    textAlignVertical: "top",
  },
  cashInput: {
    height: 46,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 17,
  },

  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
