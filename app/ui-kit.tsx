// app/ui-kit.tsx
//
// The full component gallery. Route: /ui-kit
//
// Every component in components/ios, on one screen, in EMILGO's design language
// — Poppins type, 30pt cards, 16pt gutters — so what you see here is what a
// migrated screen looks like, not an Apple sample app.
//
// Everything with a surface is Liquid Glass: real UIGlassEffect on iOS 26,
// expo-blur everywhere else, flat under Reduce Transparency. The banner at the
// top reports which of those three this device is actually rendering, so it is
// obvious whether you're looking at the effect or the fallback.
//
// This is a reference screen, not product surface — it isn't linked from any
// navigation and exists to be opened directly.

import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";

import {
  Glass,
  GlassGroup,
  IOSButton,
  IOSToggle,
  IOSSheet,
  IOSModalCard,
  IOSAlert,
  IOSMenu,
  IOSSearchBar,
  IOSListSection,
  IOSListRow,
  IOSTabBar,
  RatingModal,
  FeedbackModal,
  iosAlert,
  iosActionSheet,
  useIOSTheme,
  useGlassCapability,
  IOSAppFont,
  IOSFont,
  type IOSTab,
} from "@/components/ios";
import {
  HomeIcon,
  Car01Icon,
  MessageIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react-native";

const TABS: IOSTab[] = [
  { key: "home", label: "Home", icon: HomeIcon },
  { key: "trips", label: "Trips", icon: Car01Icon, badge: 3 },
  { key: "chat", label: "Messages", icon: MessageIcon },
  { key: "you", label: "You", icon: UserIcon },
];

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const ios = useIOSTheme();
  return (
    <View style={styles.group}>
      <Text style={[IOSAppFont.sectionTitle, styles.groupTitle, { color: ios.label }]}>
        {title.toUpperCase()}
      </Text>
      {note ? (
        <Text style={[IOSAppFont.description, styles.groupNote, { color: ios.secondaryLabel }]}>
          {note}
        </Text>
      ) : null}
      <Glass
        variant="regular"
        radius={30}
        style={styles.groupCard}
        fallbackIntensity={40}
        fallbackTint={ios.secondarySystemGroupedBackground}
      >
        {children}
      </Glass>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function UIKitScreen() {
  const ios = useIOSTheme();
  const insets = useSafeAreaInsets();
  const capability = useGlassCapability();

  const [sheet, setSheet] = useState(false);
  const [tallSheet, setTallSheet] = useState(false);
  const [card, setCard] = useState(false);
  const [alert, setAlert] = useState(false);
  const [actionSheet, setActionSheet] = useState(false);
  const [rating, setRating] = useState(false);
  const [feedback, setFeedback] = useState(false);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("home");

  const [wifi, setWifi] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [notify, setNotify] = useState(true);
  const [menuChecked, setMenuChecked] = useState(true);

  const path = capability.glass
    ? "Real UIGlassEffect — iOS 26"
    : capability.flat
      ? "Flat — Reduce Transparency is on"
      : "expo-blur fallback — iOS 25 and below, Expo Go, or Android";

  return (
    <View style={[styles.root, { backgroundColor: ios.systemGroupedBackground }]}>
      <StatusBar style={ios.scheme === "dark" ? "light" : "dark"} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Glass
          variant="regular"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={90}
          fallbackTint={ios.secondarySystemGroupedBackground}
        />
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <SymbolView
              name="chevron.backward"
              size={22}
              tintColor={ios.tint}
              fallback={<Text style={{ color: ios.tint, fontSize: 22 }}>‹</Text>}
            />
          </Pressable>
          <Text style={[IOSAppFont.screenTitle, { color: ios.label }]}>UI Kit</Text>
          <IOSMenu
            anchor={
              <Pressable hitSlop={12} accessibilityRole="button" accessibilityLabel="More">
                <SymbolView
                  name="ellipsis.circle"
                  size={22}
                  tintColor={ios.tint}
                  fallback={<Text style={{ color: ios.tint, fontSize: 22 }}>···</Text>}
                />
              </Pressable>
            }
            items={[
              { label: "Show checkmark", selected: menuChecked, onPress: () => setMenuChecked((v) => !v) },
              { label: "Inline toggle", toggle: { value: notify, onValueChange: setNotify } },
              { label: "With a symbol", symbol: "square.and.arrow.up" },
              { label: "Delete", destructive: true, startsNewSection: true },
            ]}
          />
        </View>
        <View style={[styles.hairline, { backgroundColor: ios.separator }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Which path is live right now */}
        <Glass
          variant="regular"
          radius={20}
          style={styles.banner}
          fallbackIntensity={40}
          fallbackTint={ios.tint + "1F"}
        >
          <SymbolView
            name={capability.glass ? "sparkles" : "circle.dashed"}
            size={18}
            tintColor={ios.tint}
            fallback={null}
          />
          <View style={{ flex: 1 }}>
            <Text style={[IOSAppFont.label, { color: ios.label }]}>Rendering path</Text>
            <Text style={[IOSAppFont.description, { color: ios.secondaryLabel }]}>{path}</Text>
          </View>
        </Glass>

        {/* ── Buttons ── */}
        <Group
          title="Buttons"
          note="Every variant with a surface is glass. Only borderless has none — it's a bare label by definition."
        >
          <View style={styles.stack}>
            <IOSButton title="Filled — primary action" fullWidth onPress={() => {}} />
            <IOSButton title="Tinted — secondary" variant="tinted" fullWidth onPress={() => {}} />
            <IOSButton title="Bordered" variant="bordered" fullWidth onPress={() => {}} />
            <IOSButton title="Borderless" variant="borderless" fullWidth onPress={() => {}} />
            <IOSButton
              title="Destructive"
              variant="tinted"
              role="destructive"
              fullWidth
              onPress={() => {}}
            />
            <IOSButton title="With a symbol" symbol="paperplane.fill" fullWidth onPress={() => {}} />
            <IOSButton title="Loading" loading fullWidth onPress={() => {}} />
            <IOSButton title="Disabled" disabled fullWidth onPress={() => {}} />

            <Text style={[IOSAppFont.description, { color: ios.secondaryLabel, marginTop: 4 }]}>
              Sizes
            </Text>
            <View style={styles.row}>
              <IOSButton title="Small" size="small" onPress={() => {}} />
              <IOSButton title="Medium" size="medium" onPress={() => {}} />
              <IOSButton title="Large" size="large" onPress={() => {}} />
            </View>

            <Text style={[IOSAppFont.description, { color: ios.secondaryLabel, marginTop: 4 }]}>
              Grouped — adjacent glass merges like droplets on iOS 26
            </Text>
            <GlassGroup spacing={14} style={styles.row}>
              <IOSButton title="Cut" variant="tinted" size="small" onPress={() => {}} />
              <IOSButton title="Copy" variant="tinted" size="small" onPress={() => {}} />
              <IOSButton title="Paste" variant="tinted" size="small" onPress={() => {}} />
            </GlassGroup>
          </View>
        </Group>

        {/* ── Toggles ── */}
        <Group
          title="Toggles"
          note="Drawn, not UISwitch — the system switch fills its track with a flat colour and cannot be made translucent."
        >
          <View style={styles.stack}>
            <View style={styles.toggleRow}>
              <Text style={[IOSAppFont.label, { color: ios.label }]}>On</Text>
              <IOSToggle value={wifi} onValueChange={setWifi} />
            </View>
            <View style={styles.toggleRow}>
              <Text style={[IOSAppFont.label, { color: ios.label }]}>Off</Text>
              <IOSToggle value={tracking} onValueChange={setTracking} />
            </View>
            <View style={styles.toggleRow}>
              <Text style={[IOSAppFont.label, { color: ios.label }]}>Disabled</Text>
              <IOSToggle value onValueChange={() => {}} disabled />
            </View>
          </View>
        </Group>

        {/* ── Search field ── */}
        <Group title="Search field" note="Focus it — the glyph shifts left and Cancel slides in.">
          <View style={styles.searchWrap}>
            <IOSSearchBar value={query} onChangeText={setQuery} placeholder="Search anything" />
          </View>
        </Group>

        {/* ── List rows ── */}
        <View style={styles.group}>
          <Text style={[IOSAppFont.sectionTitle, styles.groupTitle, { color: ios.label }]}>
            LIST ROWS
          </Text>
          <Text style={[IOSAppFont.description, styles.groupNote, { color: ios.secondaryLabel }]}>
            Icon tiles are glass with a tinted glyph — never a solid colour block.
          </Text>
          <IOSListSection footer="Sections carry an optional footer for anything that needs explaining.">
            <IOSListRow symbol="wifi" label="Disclosure" detail="Pushes to another screen" accessory={{ type: "disclosure" }} onPress={() => {}} />
            <IOSListRow symbol="bell.fill" label="Switch" accessory={{ type: "switch", value: notify, onValueChange: setNotify }} />
            <IOSListRow symbol="globe" label="Detail value" accessory={{ type: "detail", text: "English" }} onPress={() => {}} />
            <IOSListRow symbol="checkmark.seal" label="Checkmark" accessory={{ type: "checkmark", checked: true }} />
            <IOSListRow icon={<HugeiconsIcon icon={Car01Icon} size={19} color={ios.label} />} label="Custom icon" detail="Any node, not just SF Symbols" accessory={{ type: "disclosure" }} onPress={() => {}} />
            <IOSListRow symbol="trash.fill" label="Destructive" destructive accessory={{ type: "disclosure" }} onPress={() => {}} />
            <IOSListRow symbol="lock.fill" label="Disabled" disabled accessory={{ type: "disclosure" }} />
          </IOSListSection>
        </View>

        {/* ── Presented surfaces ── */}
        <Group title="Sheets, alerts and modals" note="All swipeable, all on glass.">
          <View style={styles.stack}>
            <IOSButton title="Sheet — one detent" variant="tinted" fullWidth onPress={() => setSheet(true)} />
            <IOSButton title="Sheet — drag between detents" variant="tinted" fullWidth onPress={() => setTallSheet(true)} />
            <IOSButton title="Card modal — drag either way" variant="tinted" fullWidth onPress={() => setCard(true)} />
            <IOSButton title="Alert" variant="tinted" fullWidth onPress={() => setAlert(true)} />
            <IOSButton title="Action sheet" variant="tinted" fullWidth onPress={() => setActionSheet(true)} />
            <IOSButton title="Imperative alert (no state)" variant="tinted" fullWidth
              onPress={() =>
                iosAlert("Delete route?", "This can't be undone.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive" },
                ])
              }
            />
            <IOSButton title="Imperative action sheet" variant="tinted" fullWidth
              onPress={() =>
                iosActionSheet("Share trip", "Pick a destination", [
                  { text: "Copy link" },
                  { text: "Share to WhatsApp" },
                  { text: "Cancel", style: "cancel" },
                ])
              }
            />
            <IOSButton title="Rate the app" variant="tinted" fullWidth onPress={() => setRating(true)} />
            <IOSButton title="Send feedback" variant="tinted" fullWidth onPress={() => setFeedback(true)} />
          </View>
        </Group>

        {/* ── Glass surfaces ── */}
        <Group title="Glass variants" note="regular adapts to what's behind it; clear stays maximally transparent.">
          <View style={styles.stack}>
            <Glass variant="regular" radius={16} style={styles.swatch} fallbackIntensity={40}>
              <Text style={[IOSAppFont.label, { color: ios.label }]}>regular</Text>
            </Glass>
            <Glass variant="clear" radius={16} style={styles.swatch} fallbackIntensity={20}>
              <Text style={[IOSAppFont.label, { color: ios.label }]}>clear</Text>
            </Glass>
            <Glass variant="regular" tint={ios.tint} radius={16} style={styles.swatch} fallbackIntensity={40}>
              <Text style={[IOSAppFont.label, { color: "#FFFFFF" }]}>tinted — prominent</Text>
            </Glass>
            <Glass variant="regular" interactive radius={16} style={styles.swatch} fallbackIntensity={40}>
              <Text style={[IOSAppFont.label, { color: ios.label }]}>interactive — press it</Text>
            </Glass>
          </View>
        </Group>

        {/* ── System type ── */}
        <Group title="Type" note="Poppins for app UI; San Francisco for system chrome like alerts and menus.">
          <View style={styles.stack}>
            <Text style={[IOSAppFont.screenTitle, { color: ios.label }]}>Screen title — Poppins Bold 24</Text>
            <Text style={[IOSAppFont.label, { color: ios.label }]}>Row label — Poppins Medium 14</Text>
            <Text style={[IOSAppFont.description, { color: ios.secondaryLabel }]}>Description — Poppins Regular 12</Text>
            <Text style={[IOSFont.headline, { color: ios.label }]}>System headline — SF 17</Text>
            <Text style={[IOSFont.body, { color: ios.label }]}>System body — SF 17</Text>
            <Text style={[IOSFont.footnote, { color: ios.secondaryLabel }]}>System footnote — SF 13</Text>
          </View>
        </Group>

        <Text style={[IOSAppFont.description, styles.footer, { color: ios.tertiaryLabel }]}>
          Tab bar below is live — tap between items.
        </Text>
      </ScrollView>

      <IOSTabBar tabs={TABS} active={tab} onChange={setTab} />

      {/* ── Presented ── */}
      <IOSSheet visible={sheet} onClose={() => setSheet(false)} title="Single detent" detent="medium">
        <Text style={[IOSAppFont.description, { color: ios.secondaryLabel }]}>
          Swipe down to dismiss. The backdrop fades with the drag.
        </Text>
        <IOSButton title="Done" fullWidth style={{ marginTop: 16 }} onPress={() => setSheet(false)} />
      </IOSSheet>

      <IOSSheet
        visible={tallSheet}
        onClose={() => setTallSheet(false)}
        title="Multiple detents"
        detents={["medium", "large"]}
        headerRight={
          <IOSButton title="Done" variant="borderless" size="small" onPress={() => setTallSheet(false)} />
        }
      >
        <Text style={[IOSAppFont.description, { color: ios.secondaryLabel }]}>
          Drag UP to expand, DOWN to collapse, and past the smallest detent to dismiss — the same
          model UISheetPresentationController uses.
        </Text>
        <IOSListSection header="Inside a sheet" opaque>
          <IOSListRow symbol="mappin.circle.fill" label="Pickup" detail="Wuse Market" accessory={{ type: "disclosure" }} onPress={() => {}} />
          <IOSListRow symbol="flag.checkered" label="Drop-off" detail="Berger Junction" accessory={{ type: "disclosure" }} onPress={() => {}} />
        </IOSListSection>
      </IOSSheet>

      <IOSModalCard visible={card} onClose={() => setCard(false)}>
        <Glass variant="regular" radius={30} style={styles.cardModal} fallbackIntensity={70}
          fallbackTint={ios.secondarySystemGroupedBackground}>
          <SymbolView name="qrcode" size={64} tintColor={ios.label} fallback={null} />
          <Text style={[IOSAppFont.screenTitle, { fontSize: 18, color: ios.label }]}>Card modal</Text>
          <Text style={[IOSAppFont.description, styles.centre, { color: ios.secondaryLabel }]}>
            For documents and viewfinders, where turning it into a sheet would throw away the thing
            that makes it recognisable. Drag it up or down.
          </Text>
          <IOSButton title="Close" variant="tinted" fullWidth onPress={() => setCard(false)} />
        </Glass>
      </IOSModalCard>

      <IOSAlert
        visible={alert}
        onClose={() => setAlert(false)}
        title="End this trip?"
        message="Your fare stops counting as soon as you confirm."
        actions={[
          { label: "Cancel", style: "cancel" },
          { label: "End trip", style: "destructive" },
        ]}
      />

      <IOSAlert
        visible={actionSheet}
        onClose={() => setActionSheet(false)}
        variant="actionSheet"
        title="Trip options"
        actions={[
          { label: "Share live location" },
          { label: "Report a problem" },
          { label: "Cancel trip", style: "destructive" },
          { label: "Cancel", style: "cancel" },
        ]}
      />

      <RatingModal visible={rating} onClose={() => setRating(false)} />
      <FeedbackModal visible={feedback} onClose={() => setFeedback(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: { paddingBottom: 12, overflow: "hidden" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  hairline: { position: "absolute", left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },

  scroll: { padding: 16, paddingBottom: 140 },

  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    marginBottom: 24,
  },

  group: { marginBottom: 26 },
  groupTitle: { paddingHorizontal: 4, marginBottom: 6 },
  groupNote: { paddingHorizontal: 4, marginBottom: 10 },
  groupCard: { borderRadius: 30, overflow: "hidden" },

  stack: { padding: 20, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  searchWrap: { paddingVertical: 16 },

  swatch: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },

  cardModal: {
    width: 300,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  centre: { textAlign: "center" },

  footer: { textAlign: "center", marginTop: 4 },
});
