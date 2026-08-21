// app/emergency/history.tsx
//
// What was actually sent — and what was deliberately not.
//
// ── Why the skips are here ─────────────────────────────────────────────────
// "Nobody was notified" and "nobody was due to be notified" look identical
// afterwards. After an incident that difference is the entire question, so
// `ec_dispatch` records a row for every contact it decided to stay quiet about,
// with the reason. A log that only shows successes would let a user believe
// their contacts were told when a mute or an unaccepted invite meant they were
// not.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";

import {
  IOSScreen,
  IOSListSection,
  IOSListRow,
  useIOSTheme,
  IOSAppFont,
} from "@/components/ios";
import * as EC from "@/src/services/emergencyContacts";

const KIND_LABEL: Record<string, string> = {
  trip_start: "Trip started",
  trip_end: "Trip ended",
  sos: "SOS",
  route_deviation: "Route changed",
  no_movement: "Trip stopped",
  test: "Test alert",
};

const OUTCOME: Record<EC.ECEvent["outcome"], { text: string; tone: "ok" | "warn" | "bad" }> = {
  sent: { text: "Sent", tone: "ok" },
  skipped_muted: { text: "Held back — muted", tone: "warn" },
  skipped_unverified: { text: "Held back — not accepted", tone: "warn" },
  skipped_quiet: { text: "Held back — quiet hours", tone: "warn" },
  failed: { text: "Failed", tone: "bad" },
};

function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return time;
  if (days === 1) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

export default function EmergencyHistoryScreen() {
  const t = useIOSTheme();
  const [events, setEvents] = useState<EC.ECEvent[]>([]);
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [rows, list] = await Promise.all([EC.events(200), EC.list()]);
    setEvents(rows);
    // The event stores a contact id; a contact that was later deleted still has
    // a row here, which is correct — the alert did happen.
    setContacts(Object.fromEntries(list.map((c) => [c.id, c.name])));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Grouped by the dispatch that produced them, so one trip start reads as one
  // event with N outcomes rather than N unrelated rows.
  const groups = useMemo(() => {
    const out: { key: string; kind: string; at: string; rows: EC.ECEvent[] }[] = [];
    for (const e of events) {
      const bucket = `${e.kind}:${e.created_at.slice(0, 16)}`;
      const last = out[out.length - 1];
      if (last && last.key === bucket) last.rows.push(e);
      else out.push({ key: bucket, kind: e.kind, at: e.created_at, rows: [e] });
    }
    return out;
  }, [events]);

  if (loading) {
    return (
      <IOSScreen title="Alert history" back>
        <View style={S.centre}><ActivityIndicator color={t.tint} /></View>
      </IOSScreen>
    );
  }

  return (
    <IOSScreen
      title="Alert history"
      back
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.tint} />
      }
    >
      {groups.length === 0 ? (
        <View style={S.empty}>
          <Text style={[S.emptyTitle, { color: t.label }]}>Nothing sent yet</Text>
          <Text style={[S.emptyBody, { color: t.secondaryLabel }]}>
            Alerts appear here as they go out — including the ones held back, and why.
          </Text>
        </View>
      ) : (
        groups.map((g) => (
          <IOSListSection
            key={g.key}
            header={`${KIND_LABEL[g.kind] ?? g.kind} · ${when(g.at)}`}
          >
            {g.rows.map((e) => {
              const o = OUTCOME[e.outcome];
              const colour =
                o.tone === "ok" ? t.systemGreen
                : o.tone === "warn" ? t.systemOrange
                : t.systemRed;
              return (
                <IOSListRow
                  key={e.id}
                  label={e.contact_id ? (contacts[e.contact_id] ?? "A removed contact") : "A removed contact"}
                  detail={e.channel === "in_app" ? "In the app" : e.channel ? `By ${e.channel}` : undefined}
                  accessory={{ type: "none" }}
                  icon={
                    <View style={[S.dot, { backgroundColor: colour }]} />
                  }
                />
              );
            })}
            <IOSListRow
              label={g.rows.every((r) => r.outcome === "sent")
                ? `All ${g.rows.length} notified`
                : `${g.rows.filter((r) => r.outcome === "sent").length} of ${g.rows.length} notified`}
              detail={
                g.rows.find((r) => r.outcome !== "sent")
                  ? OUTCOME[g.rows.find((r) => r.outcome !== "sent")!.outcome].text
                  : undefined
              }
              accessory={{ type: "none" }}
            />
          </IOSListSection>
        ))
      )}
    </IOSScreen>
  );
}

const S = StyleSheet.create({
  centre: { paddingVertical: 60, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  empty: { alignItems: "center", paddingHorizontal: 32, paddingTop: 60, gap: 8 },
  emptyTitle: { ...IOSAppFont.headline },
  emptyBody: { ...IOSAppFont.subheadline, textAlign: "center", lineHeight: 21 },
});
