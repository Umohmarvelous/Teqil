// app/ios-kit-demo.tsx
//
// Live reference for the iOS component kit. Route: /ios-kit-demo
//
// Demonstrates the collapsible large-title header driving a FlatList, plus every
// component in components/ios. Copy the patterns here when converting a screen;
// delete this file once the kit is adopted.

import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated from "react-native-reanimated";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";

import {
  CollapsibleHeader,
  useCollapsibleScroll,
  IOSButton,
  IOSSheet,
  IOSAlert,
  IOSMenu,
  IOSListSection,
  IOSListRow,
  IOSTabBar,
  RatingModal,
  FeedbackModal,
  useIOSTheme,
  IOSFont,
  type IOSTab,
} from "@/components/ios";

const TABS: IOSTab[] = [
  { key: "home",     label: "Home",     symbol: "house",              symbolActive: "house.fill" },
  { key: "rides",    label: "Rides",    symbol: "car",                symbolActive: "car.fill" },
  { key: "messages", label: "Messages", symbol: "bubble.left",        symbolActive: "bubble.left.fill", badge: 3 },
  { key: "profile",  label: "Profile",  symbol: "person.crop.circle", symbolActive: "person.crop.circle.fill" },
];

/** Filler rows so there's enough content to scroll the header into collapse. */
const ROWS = Array.from({ length: 24 }, (_, i) => ({
  id: String(i),
  title: `Tracked ride ${i + 1}`,
  detail: `${(2 + i * 0.7).toFixed(1)} km · ${8 + i} min`,
}));

export default function IOSKitDemo() {
  const theme = useIOSTheme();
  const scroll = useCollapsibleScroll();

  const [tab, setTab] = useState("home");
  const [sheet, setSheet] = useState(false);
  const [alert, setAlert] = useState(false);
  const [actionSheet, setActionSheet] = useState(false);
  const [rating, setRating] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [notify, setNotify] = useState(true);
  const [sort, setSort] = useState<"recent" | "longest">("recent");

  const renderItem = useCallback(
    ({ item }: { item: (typeof ROWS)[number] }) => (
      <View style={[styles.card, { backgroundColor: theme.secondarySystemGroupedBackground }]}>
        <SymbolView name="map" size={22} tintColor={theme.tint} fallback={null} />
        <View style={{ flex: 1 }}>
          <Text style={[IOSFont.body, { color: theme.label }]}>{item.title}</Text>
          <Text style={[IOSFont.footnote, { color: theme.secondaryLabel }]}>{item.detail}</Text>
        </View>
        <SymbolView name="chevron.right" size={13} tintColor={theme.tertiaryLabel} fallback={null} />
      </View>
    ),
    [theme],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.systemGroupedBackground }]}>
      <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />

      {/* 1 ── Collapsible large title. Left at rest, centred + frosted on scroll. */}
      <CollapsibleHeader
        title="Component Kit"
        subtitle="iOS patterns for Emilgo"
        scrollY={scroll.value}
        left={
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <SymbolView name="chevron.left" size={20} tintColor={theme.tint} fallback={null} />
          </Pressable>
        }
        right={
          // 2 ── Context menu: checkmarks, an inline toggle, a destructive item.
          <IOSMenu
            anchor={
              <Pressable hitSlop={10}>
                <SymbolView name="ellipsis.circle" size={22} tintColor={theme.tint} fallback={null} />
              </Pressable>
            }
            items={[
              { label: "Most recent", selected: sort === "recent",  onPress: () => setSort("recent") },
              { label: "Longest",     selected: sort === "longest", onPress: () => setSort("longest") },
              {
                label: "Notifications",
                startsNewSection: true,
                toggle: { value: notify, onValueChange: setNotify },
              },
              { label: "Share", symbol: "square.and.arrow.up", startsNewSection: true },
              { label: "Delete all", symbol: "trash", destructive: true, onPress: () => setAlert(true) },
            ]}
          />
        }
      />

      <Animated.FlatList
        data={ROWS}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        onScroll={scroll.onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: scroll.contentInset,
          paddingBottom: 140,
        }}
        // Keeps the frosted bar readable while content slides under it.
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.controls}>
            <Text style={[IOSFont.footnote, { color: theme.secondaryLabel, marginBottom: 10 }]}>
              Scroll to watch the title move left → centre and the bar frost over.
            </Text>

            {/* 3 ── Button variants */}
            <View style={styles.buttonRow}>
              <IOSButton title="Filled" variant="filled" onPress={() => setSheet(true)} />
              <IOSButton title="Tinted" variant="tinted" onPress={() => setActionSheet(true)} />
            </View>
            <View style={styles.buttonRow}>
              <IOSButton title="Bordered" variant="bordered" onPress={() => setAlert(true)} />
              <IOSButton title="Borderless" variant="borderless" onPress={() => setRating(true)} />
            </View>
            <IOSButton
              title="Delete everything"
              variant="filled"
              role="destructive"
              symbol="trash.fill"
              fullWidth
              onPress={() => setAlert(true)}
              style={{ marginTop: 8 }}
            />

            {/* 4 ── Inset-grouped list */}
            <IOSListSection
              header="Feedback"
              footer="Low ratings open a private form instead of the public store page."
              style={{ marginTop: 24, marginHorizontal: -16 }}
            >
              <IOSListRow
                label="Rate Us"
                symbol="star.fill"
                symbolColor="#FF9500"
                accessory={{ type: "disclosure" }}
                onPress={() => setRating(true)}
              />
              <IOSListRow
                label="Send Feedback"
                symbol="envelope.fill"
                accessory={{ type: "disclosure" }}
                onPress={() => setFeedback(true)}
              />
              <IOSListRow
                label="Notifications"
                symbol="bell.fill"
                symbolColor="#FF3B30"
                accessory={{ type: "switch", value: notify, onValueChange: setNotify }}
              />
              <IOSListRow
                label="Sort order"
                symbol="arrow.up.arrow.down"
                symbolColor="#8E8E93"
                accessory={{ type: "detail", text: sort === "recent" ? "Recent" : "Longest" }}
              />
            </IOSListSection>
          </View>
        }
      />

      {/* 5 ── Frosted tab bar */}
      <IOSTabBar tabs={TABS} active={tab} onChange={setTab} />

      {/* 6 ── Sheet */}
      <IOSSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Sheet"
        detent="medium"
        headerRight={<IOSButton title="Done" variant="borderless" size="small" onPress={() => setSheet(false)} />}
      >
        <Text style={[IOSFont.body, { color: theme.label }]}>
          Rounded top corners, frosted material, blurred backdrop. Drag the grabber
          down or flick to dismiss.
        </Text>
        <IOSButton
          title="Open the rating prompt"
          variant="tinted"
          fullWidth
          style={{ marginTop: 20 }}
          onPress={() => {
            setSheet(false);
            setTimeout(() => setRating(true), 320);
          }}
        />
      </IOSSheet>

      {/* 7 ── Alert + action sheet */}
      <IOSAlert
        visible={alert}
        onClose={() => setAlert(false)}
        title="Delete everything?"
        message="This can't be undone."
        actions={[
          { label: "Cancel", style: "cancel" },
          { label: "Delete", style: "destructive", onPress: () => {} },
        ]}
      />

      <IOSAlert
        visible={actionSheet}
        onClose={() => setActionSheet(false)}
        variant="actionSheet"
        title="Route options"
        message="Choose what to do with this tracked route."
        actions={[
          { label: "Share route", onPress: () => {} },
          { label: "Save to my routes", onPress: () => {} },
          { label: "Delete route", style: "destructive", onPress: () => {} },
          { label: "Cancel", style: "cancel" },
        ]}
      />

      {/* 8 ── Rating + feedback */}
      <RatingModal visible={rating} onClose={() => setRating(false)} />
      <FeedbackModal visible={feedback} onClose={() => setFeedback(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  controls: { paddingHorizontal: 16, paddingBottom: 8 },
  buttonRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 10,
  },
});
