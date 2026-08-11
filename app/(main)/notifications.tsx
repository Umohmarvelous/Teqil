// app/(main)/notifications.tsx
//
// The Notification tab — what took the Settings tab's slot.
//
// Scope, per the product decision: app notifications, messages from
// drivers/passengers, and sync alerts. Trip and transaction notices
// deliberately do NOT live here — they belong to History, where a user already
// goes to reconstruct what happened on a journey. Splitting them keeps this
// list about things that need attention now, rather than a receipt archive.
//
// Grouping follows the iOS convention: relative day buckets (Today /
// Yesterday / This Week / Earlier), newest first, unread carrying a leading
// dot rather than a different background — a filled row reads as "selected" on
// iOS, not "unread".

import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, RefreshControl, SectionList } from "react-native";
import { router } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import Animated from "react-native-reanimated";

import {
  Glass,
  IOSScreen,
  useCollapsibleScroll,
  useIOSTheme,
  IOSAppFont,
  type IOSPalette,
} from "@/components/ios";
import { useMessagesStore } from "@/src/store/useMessagesStore";
import { triggerSyncNow } from "@/src/services/sync";
import { haptics } from "@/src/utils/haptics";

// ─── Model ───────────────────────────────────────────────────────────────────

export type NotificationKind = "message" | "sync" | "system" | "social";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  /** Where tapping it goes. */
  route?: string;
}

const KIND_GLYPH: Record<NotificationKind, SymbolViewProps["name"]> = {
  message: "bubble.left.fill",
  sync: "arrow.triangle.2.circlepath",
  system: "bell.fill",
  social: "person.2.fill",
};

// Reanimated re-exports FlatList and ScrollView but not SectionList, so the
// animated variant has to be created here for the scroll handler to drive the
// collapsing header off the UI thread.
const AnimatedSectionList = Animated.createAnimatedComponent(
  SectionList as new () => SectionList<AppNotification, { title: string }>,
);

// ─── Grouping ────────────────────────────────────────────────────────────────

const DAY = 86_400_000;

/** iOS-style relative buckets, newest first. */
function groupByRecency(items: AppNotification[]) {
  const now = Date.now();
  const startOfToday = new Date().setHours(0, 0, 0, 0);

  const buckets: Record<string, AppNotification[]> = {
    Today: [],
    Yesterday: [],
    "This Week": [],
    Earlier: [],
  };

  for (const n of items) {
    const t = new Date(n.createdAt).getTime();
    if (t >= startOfToday) buckets.Today.push(n);
    else if (t >= startOfToday - DAY) buckets.Yesterday.push(n);
    else if (now - t < 7 * DAY) buckets["This Week"].push(n);
    else buckets.Earlier.push(n);
  }

  return Object.entries(buckets)
    .filter(([, data]) => data.length > 0)
    .map(([title, data]) => ({
      title,
      data: data.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }));
}

function relativeTime(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function NotificationRow({
  item,
  ios,
  onPress,
}: {
  item: AppNotification;
  ios: IOSPalette;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? ios.systemFill : "transparent" },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.body}`}
    >
      {/* Unread marker. A dot, not a tinted row — a filled row reads as
          "selected" on iOS, which is a different meaning. */}
      <View style={styles.unreadSlot}>
        {!item.read && <View style={[styles.unreadDot, { backgroundColor: ios.tint }]} />}
      </View>

      <View style={styles.iconTile}>
        <Glass
          variant="clear"
          radius={10}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={25}
          fallbackTint={ios.tertiarySystemFill}
        />
        <SymbolView name={KIND_GLYPH[item.kind]} size={17} tintColor={ios.label} fallback={null} />
      </View>

      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[IOSAppFont.label, { color: ios.label }]}>
          {item.title}
        </Text>
        <Text numberOfLines={2} style={[IOSAppFont.description, { color: ios.secondaryLabel }]}>
          {item.body}
        </Text>
      </View>

      <Text style={[IOSAppFont.description, { color: ios.tertiaryLabel }]}>
        {relativeTime(item.createdAt)}
      </Text>
    </Pressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const ios = useIOSTheme();
  const scroll = useCollapsibleScroll({ tabBar: true });
  const [refreshing, setRefreshing] = useState(false);

  const conversations = useMessagesStore((s) => s.conversations);

  // Unread conversations surface here as notifications. This is the only real
  // source wired so far — sync and system notices land here as the push and
  // sync layers start reporting into a store.
  const notifications = useMemo<AppNotification[]>(() => {
    return (conversations ?? [])
      .filter((c: any) => (c.unread_count ?? 0) > 0)
      .map((c: any) => ({
        id: `msg-${c.id}`,
        kind: "message" as const,
        title: c.participant_name || "New message",
        body: c.last_message || "You have a new message",
        createdAt: c.updated_at || c.created_at || new Date().toISOString(),
        read: false,
        route: `/direct-chat/${c.id}`,
      }));
  }, [conversations]);

  const sections = useMemo(() => groupByRecency(notifications), [notifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await triggerSyncNow();
    setRefreshing(false);
  }, []);

  const open = useCallback((item: AppNotification) => {
    haptics.tap();
    if (item.route) router.push(item.route as never);
  }, []);

  return (
    <IOSScreen title="Notifications" scrollable={false} scroll={scroll}>
      <AnimatedSectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationRow item={item} ios={ios} onPress={() => open(item)} />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Glass
              variant="regular"
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
              fallbackIntensity={70}
              fallbackTint={ios.systemGroupedBackground}
            />
            <Text style={[IOSAppFont.sectionTitle, { color: ios.secondaryLabel }]}>
              {section.title.toUpperCase()}
            </Text>
          </View>
        )}
        stickySectionHeadersEnabled
        showsVerticalScrollIndicator={false}
        {...scroll.scrollProps}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            progressViewOffset={scroll.contentInset}
            tintColor={ios.tint}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <SymbolView name="bell.slash" size={44} tintColor={ios.tertiaryLabel} fallback={null} />
            <Text style={[IOSAppFont.label, { color: ios.label }]}>You&apos;re all caught up</Text>
            <Text style={[IOSAppFont.description, styles.centre, { color: ios.secondaryLabel }]}>
              Messages, sync alerts and app notices appear here. Trips and payments live in History.
            </Text>
          </View>
        }
      />
    </IOSScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingRight: 20,
    paddingVertical: 14,
    minHeight: 44,
  },
  unreadSlot: { width: 22, alignItems: "center" },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, gap: 1 },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 7,
    overflow: "hidden",
  },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 44, gap: 8 },
  centre: { textAlign: "center" },
});
