// components/ScreenSearch.tsx
//
// Screen-wide search, as one component any screen can mount.
//
// ── What this generalises ───────────────────────────────────────────────────
// The Profile screen grew a search that works: a resting bar that is a *button*,
// a full-screen overlay with the only real text field, filter chips, persisted
// recent searches, and ranking that puts prefix matches first. Every one of
// those is a decision that took a bug to discover, and none of them is specific
// to Profile.
//
// Rather than copy that to Notifications and then to Messages and then to
// Bookmarks — three more chances to get the keyboard handling wrong — the
// machinery lives here. What stays per-screen is the only genuinely per-screen
// part: the list of things that screen contains. A screen builds `SearchEntry`
// objects from whatever it is already rendering, and gets working search.
//
// ── Why the resting bar is a button ─────────────────────────────────────────
// Two live TextInputs — one on the page, one in the overlay — fight over focus
// across the modal boundary and the keyboard visibly flickers between them.
// `IOSSearchBar` grew an `asButton` mode for exactly this. `ScreenSearchBar`
// always uses it.
//
// ── Ranking ─────────────────────────────────────────────────────────────────
// A title that STARTS WITH the query beats one that merely contains it, which
// beats a keyword, which beats a match in the subtitle. Predictable beats
// clever: people retype a query when the top hit moves around between
// keystrokes.

import React from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SymbolViewProps } from "expo-symbols";

import {
  IOSSearchBar,
  IOSSearchOverlay,
  type IOSSearchResult,
  type IOSFilterChip,
} from "@/components/ios";

const MAX_RECENTS = 8;

/** One searchable thing on a screen. */
export interface SearchEntry<F extends string = string> {
  id: string;
  title: string;
  subtitle?: string;
  /** SF Symbol for the leading tile. */
  symbol?: SymbolViewProps["name"];
  /** Heading this result is listed under. */
  group: string;
  /** Short trailing hint, e.g. a timestamp. */
  hint?: string;
  /** Extra terms that should match but are not shown. */
  keywords?: string[];
  /**
   * Which filter chips this entry belongs to. Include the "all" key explicitly
   * — inferring it would make an entry that belongs to no chip invisible under
   * "All", which is never what a caller means.
   */
  filters?: F[];
  onPress: () => void;
}

export interface ScreenSearchController<F extends string = string> {
  open: boolean;
  present: () => void;
  dismiss: () => void;
  query: string;
  setQuery: (q: string) => void;
  filter: F;
  setFilter: (f: F) => void;
  results: IOSSearchResult[];
  recents: string[];
  clearRecents: () => void;
  filters: IOSFilterChip<F>[];
  /** Number of entries the current query matches, before filtering. */
  matchCount: number;
}

export interface UseScreenSearchOptions<F extends string> {
  /** Namespaces the recent-search list. Two screens must not share one. */
  scope: string;
  entries: SearchEntry<F>[];
  /** First chip is the default. */
  filters: { key: F; label: string }[];
  /** Things worth searching for that the user may not know exist. */
  suggestions?: string[];
}

/** See the file header. Returns everything the two components below need. */
export function useScreenSearch<F extends string = string>({
  scope,
  entries,
  filters,
}: UseScreenSearchOptions<F>): ScreenSearchController<F> {
  const storageKey = `emilgo.search.recents.${scope}`;
  const defaultFilter = filters[0]?.key as F;

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<F>(defaultFilter);
  const [recents, setRecents] = React.useState<string[]>([]);

  React.useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) setRecents(JSON.parse(raw));
      } catch {
        // A corrupt recents list degrades to "no history"; search still works
        // and there is nothing here worth interrupting the user about.
      }
    })();
  }, [storageKey]);

  const remember = React.useCallback(
    (q: string) => {
      const term = q.trim();
      if (term.length < 2) return;
      setRecents((prev) => {
        const next = [term, ...prev.filter((r) => r.toLowerCase() !== term.toLowerCase())].slice(
          0,
          MAX_RECENTS,
        );
        AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [storageKey],
  );

  const clearRecents = React.useCallback(() => {
    setRecents([]);
    AsyncStorage.removeItem(storageKey).catch(() => {});
  }, [storageKey]);

  const { results, matchCount } = React.useMemo(() => {
    const q = query.trim().toLowerCase();

    const scored: { entry: SearchEntry<F>; score: number }[] = [];
    for (const e of entries) {
      const score = q ? rank(q, e) : 0;
      if (score < 0) continue;
      scored.push({ entry: e, score });
    }

    const total = scored.length;

    const visible = scored
      .filter(({ entry }) => filter === defaultFilter || entry.filters?.includes(filter))
      // Stable within a score band: `sort` is stable in modern JS, so equal
      // scores keep the caller's order, which is usually already meaningful
      // (newest first, or the order things appear on screen).
      .sort((a, b) => b.score - a.score)
      .slice(0, 60)
      .map(({ entry }) => ({
        id: entry.id,
        title: entry.title,
        subtitle: entry.subtitle,
        symbol: entry.symbol,
        group: entry.group,
        hint: entry.hint,
        onPress: () => {
          remember(query);
          setOpen(false);
          entry.onPress();
        },
      })) as IOSSearchResult[];

    return { results: visible, matchCount: total };
  }, [entries, query, filter, defaultFilter, remember]);

  // Chip counts are what make the filter row worth having: without them a user
  // taps "Unread" to find out whether there are any.
  const chips = React.useMemo<IOSFilterChip<F>[]>(() => {
    const q = query.trim().toLowerCase();
    const matching = entries.filter((e) => (q ? rank(q, e) >= 0 : true));
    return filters.map((f) => ({
      key: f.key,
      label: f.label,
      count:
        f.key === defaultFilter
          ? matching.length
          : matching.filter((e) => e.filters?.includes(f.key)).length,
    }));
  }, [entries, filters, query, defaultFilter]);

  return {
    open,
    present: React.useCallback(() => setOpen(true), []),
    dismiss: React.useCallback(() => {
      remember(query);
      setOpen(false);
      // The query is deliberately kept: reopening search straight after closing
      // it almost always means the close was accidental.
    }, [query, remember]),
    query,
    setQuery,
    filter,
    setFilter,
    results,
    recents,
    clearRecents,
    filters: chips,
    matchCount,
  };
}

function rank<F extends string>(q: string, e: SearchEntry<F>): number {
  const t = e.title.toLowerCase();
  if (t.startsWith(q)) return 100 - Math.min(40, t.length - q.length);
  if (t.includes(q)) return 60;

  if (e.keywords?.some((k) => k.toLowerCase().startsWith(q))) return 45;
  if (e.keywords?.some((k) => k.toLowerCase().includes(q))) return 35;

  const s = e.subtitle?.toLowerCase();
  if (s?.startsWith(q)) return 25;
  if (s?.includes(q)) return 15;

  return -1;
}

// ─── The two mountable pieces ────────────────────────────────────────────────

export interface ScreenSearchBarProps<F extends string = string> {
  search: ScreenSearchController<F>;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}

/** The resting bar. Always a button — see the file header. */
export function ScreenSearchBar<F extends string = string>({
  search,
  placeholder = "Search",
  style,
}: ScreenSearchBarProps<F>) {
  // `style` lands on the bar's outer ROW, never on its field — see the prop's
  // doc comment in IOSSearchBar.
  return (
    <IOSSearchBar
      asButton
      onPress={search.present}
      value={search.query}
      onChangeText={search.setQuery}
      placeholder={placeholder}
      style={style}
    />
  );
}

export interface ScreenSearchProps<F extends string = string> {
  search: ScreenSearchController<F>;
  placeholder?: string;
  emptyHint?: string;
  suggestions?: string[];
}

/** The overlay. Mount it anywhere in the screen; it presents itself as a modal. */
export function ScreenSearch<F extends string = string>({
  search,
  placeholder = "Search",
  emptyHint,
  suggestions,
}: ScreenSearchProps<F>) {
  return (
    <IOSSearchOverlay<F>
      visible={search.open}
      onClose={search.dismiss}
      query={search.query}
      onChangeQuery={search.setQuery}
      placeholder={placeholder}
      filters={search.filters}
      activeFilter={search.filter}
      onChangeFilter={search.setFilter}
      results={search.results}
      recents={search.recents}
      onSelectRecent={search.setQuery}
      onClearRecents={search.clearRecents}
      suggestions={suggestions}
      emptyHint={emptyHint}
    />
  );
}
