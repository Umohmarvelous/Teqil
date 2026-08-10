// app/(main)/settings.tsx
//
// Settings root, on EMILGO's original design rather than a system-style list:
// a Poppins header bar, 30pt-cornered cards, 16pt page padding and the version
// footer the screen has always ended with.
//
// What's kept from the newer build is the STRUCTURE, not the styling. Sections
// push to their own screens rather than living on one long scroll — with 30+
// settings, a single page stops being scannable and search becomes the only
// realistic way to find anything. Which is why the search bar isn't optional:
// it queries a flat index (src/data/settingsIndex.ts) covering EVERY setting in
// every section, and each result deep-links to the section that owns it.
//
// The chrome is Liquid Glass throughout — header, search field, cards, icon
// tiles and toggles. There are no solid-colour blocks on this screen.

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
  Glass,
  IOSSearchBar,
  IOSListSection,
  IOSListRow,
  useTabBarInset,
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

/** The app's card radius. Deliberately much rounder than a system list. */
const CARD_RADIUS = 30;
/** Page gutter, matching the original screen. */
const PAGE_INSET = 16;

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
      <View style={styles.resultIcon}>
        <Glass
          variant="regular"
          radius={10}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={30}
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

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

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

      {/* Header bar — the original geometry, now on glass rather than a solid
          card. The title hides while searching, as iOS does, so the field gets
          the full width. */}
      <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
        <Glass
          variant="regular"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={90}
          fallbackTint={ios.secondarySystemGroupedBackground}
        />

        {!showResults && (
          <Text style={[IOSAppFont.screenTitle, styles.headerTitle, { color: ios.label }]}>
            {t("nav.settings", "Settings")}
          </Text>
        )}

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

        <View style={[styles.hairline, { backgroundColor: ios.separator }]} />
      </View>

      {showResults ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tabInset + 40 }]}
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
              <Text style={[IOSAppFont.screenTitle, { fontSize: 18, color: ios.label }]}>
                No results
              </Text>
              <Text style={[IOSAppFont.description, styles.center, { color: ios.secondaryLabel }]}>
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
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tabInset + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Account summary, as every settings screen opens with. */}
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
                label={s.title}
                detail={s.summary}
                accessory={{ type: "disclosure" }}
                onPress={() => openSection(s.route)}
              />
            ))}
          </IOSListSection>

          <Text style={[IOSAppFont.description, styles.version, { color: ios.secondaryLabel }]}>
            Emilgo v1.0.0 · Made in Nigeria 🇳🇬
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: { paddingBottom: 10, overflow: "hidden" },
  headerTitle: { paddingHorizontal: 20, paddingBottom: 12 },
  hairline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },

  scrollContent: { padding: PAGE_INSET, paddingTop: 14 },

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
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  resultSeparator: { height: StyleSheet.hairlineWidth, marginHorizontal: 20 },

  hint: { paddingHorizontal: 4, lineHeight: 20 },
  emptyWrap: { alignItems: "center", paddingTop: 70, paddingHorizontal: 44, gap: 8 },
  center: { textAlign: "center" },
  version: { textAlign: "center", marginTop: 8, paddingBottom: 8 },
});
