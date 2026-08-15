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
//
// ── Records, not a projection ────────────────────────────────────────────────
// The list comes from `useNotificationsStore`, which persists real rows. It used
// to be computed on the fly from conversations with unread messages, which made
// swipe-to-delete impossible: deleting recomputed the item straight back on the
// next render. The store folds conversations in through `ingestConversations`
// and remembers dismissals, so a swipe sticks.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, RefreshControl, SectionList } from "react-native";
import { router } from "expo-router";
import Animated from "react-native-reanimated";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

import {
  Glass,
  IOSScreen,
  SwipeableRow,
  iosActionSheet,
  useCollapsibleScroll,
  useIOSTheme,
  IOSAppFont,
  type SwipeableRowHandle,
  type IOSPalette,
} from "@/components/ios";
import Avatar from "@/components/Avatar";
import { useMessagesStore } from "@/src/store/useMessagesStore";
import {
  useNotifications,
  useNotificationsStore,
  type AppNotification,
  type NotificationKind,
} from "@/src/store/useNotificationsStore";
import { triggerSyncNow } from "@/src/services/sync";
import { haptics } from "@/src/utils/haptics";
import { Colors } from "@/constants/colors";

const KIND_GLYPH: Record<NotificationKind, SymbolViewProps["name"]> = {
  message: "bubble.left.fill",
  sync: "arrow.triangle.2.circlepath",
  system: "bell.fill",
  social: "person.2.fill",
  trip: "car.fill",
  payment: "creditcard.fill",
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
  onDelete,
  onToggleRead,
  registerRow,
}: {
  item: AppNotification;
  ios: IOSPalette;
  onPress: () => void;
  onDelete: () => void;
  onToggleRead: () => void;
  registerRow: (id: string, handle: SwipeableRowHandle | null) => void;
}) {
  return (
    <SwipeableRow
      ref={(h) => registerRow(item.id, h)}
      // Destructive last: it sits against the screen edge, which is where the
      // full swipe grows from.
      actions={[
        {
          key: "read",
          label: item.read ? "Unread" : "Read",
          symbol: item.read ? "envelope.badge" : "envelope.open",
          color: ios.systemGray,
          onPress: onToggleRead,
        },
        {
          key: "delete",
          label: "Delete",
          symbol: "trash",
          color: ios.systemRed,
          destructive: true,
          onPress: onDelete,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          // The row slides over the action panel, so it needs its own opaque
          // fill — a transparent row would show the red panel through it.
          { backgroundColor: pressed ? ios.systemFill : ios.systemGroupedBackground },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.body}`}
      >
        {/* Unread marker. A dot, not a tinted row — a filled row reads as
            "selected" on iOS, which is a different meaning. */}
        <View style={styles.unreadSlot}>
          {!item.read && <View style={[styles.unreadDot, { backgroundColor: ios.tint }]} />}
        </View>

        {/* People-shaped notifications show the person, not a glyph. */}
        {item.kind === "message" ? (
          <Avatar name={item.title} photoUri={item.photoUri} size={34} />
        ) : (
          <View style={styles.iconTile}>
            <Glass
              variant="clear"
              radius={10}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
              fallbackIntensity={25}
              fallbackTint={ios.tertiarySystemFill}
            />
            <SymbolView
              name={KIND_GLYPH[item.kind]}
              size={17}
              tintColor={ios.label}
              fallback={null}
            />
          </View>
        )}

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
    </SwipeableRow>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const ios = useIOSTheme();
  const scroll = useCollapsibleScroll({ tabBar: true });
  const [refreshing, setRefreshing] = useState(false);

  const conversations = useMessagesStore((s) => s.conversations);
  const notifications = useNotifications();

  const ingestConversations = useNotificationsStore((s) => s.ingestConversations);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markUnread = useNotificationsStore((s) => s.markUnread);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const remove = useNotificationsStore((s) => s.remove);
  const clearAll = useNotificationsStore((s) => s.clearAll);

  // Fold unread conversations into the inbox whenever they change. Idempotent,
  // and it honours dismissals, so this can run as often as it likes.
  useEffect(() => {
    ingestConversations(conversations ?? []);
  }, [conversations, ingestConversations]);

  const sections = useMemo(() => groupByRecency(notifications), [notifications]);
  const unread = notifications.reduce((n, i) => n + (i.read ? 0 : 1), 0);

  // Only one row stays open at a time, as in Mail: opening a second closes the
  // first, so there is never a hidden action panel off-screen.
  const rows = useRef(new Map<string, SwipeableRowHandle | null>());
  const registerRow = useCallback((id: string, handle: SwipeableRowHandle | null) => {
    if (handle) rows.current.set(id, handle);
    else rows.current.delete(id);
  }, []);
  const closeAllRows = useCallback(() => {
    for (const handle of rows.current.values()) handle?.close();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await triggerSyncNow();
    setRefreshing(false);
  }, []);

  const open = useCallback(
    (item: AppNotification) => {
      haptics.tap();
      closeAllRows();
      markRead(item.id);
      if (item.route) router.push(item.route as never);
    },
    [closeAllRows, markRead],
  );

  const showActions = useCallback(() => {
    haptics.tap();
    iosActionSheet(
      "Notifications",
      undefined,
      [
        {
          text: unread > 0 ? `Mark all as read (${unread})` : "Mark all as read",
          onPress: () => {
            haptics.success();
            markAllRead();
          },
        },
        {
          text: "Clear all",
          style: "destructive",
          onPress: () => {
            haptics.success();
            clearAll();
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
  }, [unread, markAllRead, clearAll]);

  return (
    <IOSScreen
      title="Notifications"
      subtitle={unread > 0 ? `${unread} unread` : undefined}
      scrollable={false}
      scroll={scroll}
      right={
        notifications.length > 0 ? (
          <Pressable onPress={showActions} hitSlop={12} accessibilityRole="button" accessibilityLabel="Notification options">
            <SymbolView
              name="ellipsis.circle"
              size={22}
              tintColor={ios.tint}
              fallback={<Text style={{ color: ios.tint }}>•••</Text>}
            />
          </Pressable>
        ) : undefined
      }
    >
      <AnimatedSectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationRow
            item={item}
            ios={ios}
            registerRow={registerRow}
            onPress={() => open(item)}
            onDelete={() => remove(item.id)}
            onToggleRead={() => (item.read ? markUnread(item.id) : markRead(item.id))}
          />
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
        onScrollBeginDrag={closeAllRows}
        {...scroll.scrollProps}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            progressViewOffset={scroll.contentInset}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <SymbolView name="bell.slash" size={54} tintColor={ios.tertiaryLabel} fallback={null} />
            <Text style={[IOSAppFont.label, { color: ios.secondaryLabel }]}>
              No Recent Notification
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
    paddingLeft: 0,
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
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 44, gap: 15 },
});
