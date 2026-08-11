// app/account-settings.tsx
//
// Account Settings — the settings entry point, now reached from Profile rather
// than from a tab of its own.
//
// NOTHING was deleted to make this. The seven section screens under
// app/settings/ are untouched and still own their content; this screen replaces
// only the ROOT that used to live at app/(main)/settings.tsx, whose tab slot the
// Notification tab has taken. Every row here pushes to the same route it always
// did, and search still queries the same flat index covering every setting in
// every section.
//
// Organised WhatsApp-style: identity at the top, then the settings groups, then
// the destructive actions last and visually separated.

import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Keyboard } from "react-native";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";

import {
  Glass,
  IOSScreen,
  IOSSearchBar,
  IOSListSection,
  IOSListRow,
  useCollapsibleScroll,
  useIOSTheme,
  IOSAppFont,
  type IOSPalette,
} from "@/components/ios";
import {
  SETTINGS_SECTIONS,
  searchSettings,
  type SettingsSearchResult,
} from "@/src/data/settingsIndex";
import { useAuthStore } from "@/src/store/useStore";
import { haptics } from "@/src/utils/haptics";

const CARD_RADIUS = 30;

function ResultRow({
  result,
  ios,
  onPress,
}: {
  result: SettingsSearchResult;
  ios: IOSPalette;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.resultRow,
        { backgroundColor: pressed ? ios.systemFill : "transparent" },
      ]}
      accessibilityRole="button"
    >
      <View style={styles.resultIcon}>
        <Glass
          variant="clear"
          radius={10}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={25}
          fallbackTint={ios.tertiarySystemFill}
        />
        <SymbolView name={result.symbol as never} size={17} tintColor={ios.label} fallback={null} />
      </View>

      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[IOSAppFont.label, { color: ios.label }]}>
          {result.label}
        </Text>
        <Text numberOfLines={1} style={[IOSAppFont.description, { color: ios.secondaryLabel }]}>
          {result.detail ? `${result.section_title} · ${result.detail}` : result.section_title}
        </Text>
      </View>

      <SymbolView name="chevron.right" size={13} tintColor={ios.tertiaryLabel} fallback={null} />
    </Pressable>
  );
}

export default function AccountSettingsScreen() {
  const ios = useIOSTheme();
  const scroll = useCollapsibleScroll();
  const user = useAuthStore((s) => s.user);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const results = useMemo(() => searchSettings(query), [query]);
  const showResults = searching || query.length > 0;

  const open = useCallback((route: string) => {
    haptics.tap();
    router.push(route as never);
  }, []);

  const openResult = useCallback((result: SettingsSearchResult) => {
    haptics.tap();
    Keyboard.dismiss();
    router.push({ pathname: result.route, params: { highlight: result.id } } as never);
  }, []);

  // Searching swaps the whole body out, so the collapsing header would have
  // nothing to track. A plain scroll view is the honest thing to show.
  if (showResults) {
    return (
      <IOSScreen title="Account Settings" back scrollable={false}>
        <View style={styles.searchWrap}>
          <IOSSearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search settings"
            onFocusChange={setSearching}
            onCancel={() => {
              setQuery("");
              setSearching(false);
            }}
            active
            autoFocusOnMount
          />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.page}
          showsVerticalScrollIndicator={false}
        >
          {query.length === 0 ? (
            <Text style={[IOSAppFont.description, styles.hint, { color: ios.secondaryLabel }]}>
              Search any setting by name — you don&apos;t need to know which section it&apos;s in.
            </Text>
          ) : results.length === 0 ? (
            <View style={styles.emptyWrap}>
              <SymbolView
                name="magnifyingglass"
                size={44}
                tintColor={ios.tertiaryLabel}
                fallback={null}
              />
              <Text style={[IOSAppFont.label, { color: ios.label }]}>No results</Text>
              <Text style={[IOSAppFont.description, styles.centre, { color: ios.secondaryLabel }]}>
                Nothing matches “{query}”.
              </Text>
            </View>
          ) : (
            <Glass
              variant="regular"
              radius={CARD_RADIUS}
              style={styles.resultsCard}
              fallbackIntensity={40}
              fallbackTint={ios.secondarySystemGroupedBackground}
            >
              {results.map((r, i) => (
                <View key={r.id}>
                  {i > 0 && (
                    <View style={[styles.resultSeparator, { backgroundColor: ios.separator }]} />
                  )}
                  <ResultRow result={r} ios={ios} onPress={() => openResult(r)} />
                </View>
              ))}
            </Glass>
          )}
        </ScrollView>
      </IOSScreen>
    );
  }

  return (
    <IOSScreen
      title="Account Settings"
      back
      scroll={scroll}
      contentContainerStyle={styles.page}
    >
      <View style={styles.searchWrap}>
        <IOSSearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search settings"
          onFocusChange={setSearching}
          onCancel={() => {
            setQuery("");
            setSearching(false);
          }}
        />
      </View>

      {/* Identity first, as WhatsApp does. */}
      <IOSListSection>
        <IOSListRow
          symbol="person.crop.circle.fill"
          label={user?.full_name || user?.username || "Your profile"}
          detail={user?.phone || user?.email || "Tap to edit your details"}
          accessory={{ type: "disclosure" }}
          onPress={() => open("/(main)/profile")}
        />
        {user?.role === "driver" && (
          <IOSListRow
            symbol="car.fill"
            label="Driver details"
            detail="Vehicle, licence and payout account"
            accessory={{ type: "disclosure" }}
            onPress={() => open("/settings/account")}
          />
        )}
      </IOSListSection>

      {/* The same seven sections, at the same routes as before. */}
      <IOSListSection>
        {SETTINGS_SECTIONS.map((s) => (
          <IOSListRow
            key={s.id}
            symbol={s.symbol as never}
            label={s.title}
            detail={s.summary}
            accessory={{ type: "disclosure" }}
            onPress={() => open(s.route)}
          />
        ))}
      </IOSListSection>

      <Text style={[IOSAppFont.description, styles.version, { color: ios.secondaryLabel }]}>
        Emilgo v1.0.0 · Made in Nigeria 🇳🇬
      </Text>
    </IOSScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 24 },
  searchWrap: { paddingBottom: 14 },

  resultsCard: { borderRadius: CARD_RADIUS, overflow: "hidden" },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minHeight: 44,
  },
  resultIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  resultSeparator: { height: StyleSheet.hairlineWidth, marginHorizontal: 20 },

  hint: { paddingHorizontal: 4, lineHeight: 20 },
  emptyWrap: { alignItems: "center", paddingTop: 70, paddingHorizontal: 44, gap: 8 },
  centre: { textAlign: "center" },
  version: { textAlign: "center", marginTop: 8, paddingBottom: 8 },
});
