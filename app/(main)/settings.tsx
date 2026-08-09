// app/(main)/settings.tsx
//
// Settings root. Sections push to their own screens (WhatsApp-style) rather than
// living on one long scroll — with 30+ settings, a single page stops being
// scannable and search becomes the only realistic way to find anything.
//
// Which is why the search bar is here and not optional: it queries a flat index
// (src/data/settingsIndex.ts) covering EVERY setting across every section, and
// each result deep-links to the section that owns it. Modelled on Telegram's
// search — inline results, a Cancel button, and section attribution on each row.

import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Keyboard,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { SymbolView } from "expo-symbols";

import {
  IOSSearchBar,
  IOSListSection,
  IOSListRow,
  useTabBarInset,
  useIOSTheme,
  IOSFont,
  IOSMetrics,
  type IOSPalette,
} from "@/components/ios";
import {
  SETTINGS_SECTIONS,
  searchSettings,
  type SettingsSearchResult,
} from "@/src/data/settingsIndex";
import { useAuthStore } from "@/src/store/useStore";
import { haptics } from "@/src/utils/haptics";

// ─── Search results ──────────────────────────────────────────────────────────

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
      <View style={[styles.resultIcon, { backgroundColor: ios.tertiarySystemFill }]}>
        <SymbolView name={result.symbol as never} size={16} tintColor={ios.tint} fallback={null} />
      </View>

      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[IOSFont.body, { color: ios.label }]}>
          {result.label}
        </Text>
        <Text numberOfLines={1} style={[IOSFont.footnote, { color: ios.secondaryLabel }]}>
          {result.detail ? `${result.section_title} · ${result.detail}` : result.section_title}
        </Text>
      </View>

      <SymbolView name="chevron.right" size={13} tintColor={ios.tertiaryLabel} fallback={null} />
    </Pressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const ios = useIOSTheme();
  const tabInset = useTabBarInset();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const results = useMemo(() => searchSettings(query), [query]);
  const showResults = searching || query.length > 0;

  const topPadding = Platform.OS === "web" ? 20 : insets.top;

  const openSection = useCallback((route: string) => {
    haptics.tap();
    router.push(route as never);
  }, []);

  const openResult = useCallback((result: SettingsSearchResult) => {
    haptics.tap();
    Keyboard.dismiss();
    // Deep-link to the owning section and tell it which row to highlight.
    router.push({ pathname: result.route, params: { highlight: result.id } } as never);
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: ios.systemGroupedBackground }]}>
      <StatusBar style={ios.scheme === "dark" ? "light" : "dark"} />

      {/* Large title — hidden while searching, as iOS does. */}
      {!showResults && (
        <View style={styles.titleWrap}>
          <Text style={[IOSFont.largeTitle, { color: ios.label }]}>
            {t("nav.settings", "Settings")}
          </Text>
        </View>
      )}

      <View style={[styles.searchWrap, { paddingTop: showResults ? topPadding + 10 : 4 }]}>
        <IOSSearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search settings"
          onFocusChange={setSearching}
          onCancel={() => {
            setQuery("");
            setSearching(false);
          }}
          active={showResults}
        />
      </View>

      {showResults ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingTop: 10, paddingBottom: tabInset + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {query.length === 0 ? (
            <Text style={[IOSFont.subheadline, styles.hint, { color: ios.secondaryLabel }]}>
              Search any setting by name — you don&apos;t need to know which section it&apos;s in.
            </Text>
          ) : results.length === 0 ? (
            <View style={styles.emptyWrap}>
              <SymbolView name="magnifyingglass" size={44} tintColor={ios.tertiaryLabel} fallback={null} />
              <Text style={[IOSFont.headline, { color: ios.label }]}>No results</Text>
              <Text style={[IOSFont.subheadline, styles.center, { color: ios.secondaryLabel }]}>
                Nothing matches “{query}”.
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.resultsCard,
                { backgroundColor: ios.secondarySystemGroupedBackground },
              ]}
            >
              {results.map((r, i) => (
                <View key={r.id}>
                  {i > 0 && (
                    <View style={[styles.separator, { backgroundColor: ios.separator }]} />
                  )}
                  <ResultRow result={r} ios={ios} onPress={() => openResult(r)} />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingTop: 14, paddingBottom: tabInset + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Account summary, as every system Settings app opens with. */}
          <IOSListSection>
            <IOSListRow
              symbol="person.crop.circle.fill"
              label={user?.full_name || user?.username || "Your profile"}
              detail={user?.phone || user?.email || "Tap to edit your details"}
              accessory={{ type: "disclosure" }}
              onPress={() => openSection("/(main)/profile")}
            />
          </IOSListSection>

          <IOSListSection>
            {SETTINGS_SECTIONS.map((s) => (
              <IOSListRow
                key={s.id}
                symbol={s.symbol as never}
                symbolColor={ios[s.tint]}
                label={s.title}
                detail={s.summary}
                accessory={{ type: "disclosure" }}
                onPress={() => openSection(s.route)}
              />
            ))}
          </IOSListSection>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  titleWrap: { paddingTop: 8, paddingHorizontal: IOSMetrics.groupedInset, paddingBottom: 6 },
  searchWrap: { paddingBottom: 6 },

  resultsCard: {
    marginHorizontal: IOSMetrics.groupedInset,
    borderRadius: IOSMetrics.groupedRadius,
    overflow: "hidden",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: IOSMetrics.minTouchTarget,
  },
  resultIcon: {
    width: 30,
    height: 30,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  // Inset to align with the label, not the icon — the iOS convention.
  separator: { height: IOSMetrics.hairline, marginLeft: 56 },

  hint: { paddingHorizontal: IOSMetrics.groupedInset + 4, lineHeight: 20 },
  emptyWrap: { alignItems: "center", paddingTop: 70, paddingHorizontal: 44, gap: 8 },
  center: { textAlign: "center" },
});
