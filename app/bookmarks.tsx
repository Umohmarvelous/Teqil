// app/bookmarks.tsx
//
// Saved posts, optionally split into collections.
//
// ── Why collections are discovered, not configured ──────────────────────────
// There is no "create a collection" screen. A collection comes into existence
// the first time a post is saved into one, and disappears when the last post
// leaves it. Folder management is a chore users do not want; the DB just groups
// by the `collection` column, and `list_bookmark_collections` returns whatever
// is actually in use. Most users will only ever see "All".

import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { Glass, useIOSTheme } from "@/components/ios";
import { IOSAppFont } from "@/components/ios/theme";
import { FeedList } from "@/components/feed";
import HeaderActions from "@/components/HeaderActions";
import { fetchBookmarkCollections, type BookmarkCollection } from "@/src/services/feed";

export default function BookmarksScreen() {
  const t = useIOSTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [collections, setCollections] = React.useState<BookmarkCollection[]>([]);
  const [active, setActive] = React.useState<string>("");

  React.useEffect(() => {
    fetchBookmarkCollections().then(setCollections);
  }, []);

  const topInset = insets.top + 54;
  // An empty collection name means "everything", which is also the DB's
  // representation of an uncategorised bookmark.
  const named = collections.filter((c) => c.collection);

  return (
    <View style={[styles.root, { backgroundColor: t.systemBackground }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <FeedList
        key={active}
        timelineKey={`bookmarks:${active}`}
        topInset={topInset + (named.length ? 46 : 0)}
        bottomInset={insets.bottom}
        emptyTitle="No saved posts"
        emptyBody="Tap the bookmark icon on any post and it will wait for you here."
      />

      <View
        style={[
          styles.bar,
          { paddingTop: insets.top, height: topInset + (named.length ? 46 : 0) },
        ]}
      >
        <Glass
          variant="regular"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={60}
          fallbackTint={t.systemBackground}
        />
        <View style={styles.barRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={24} color={t.label} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.barTitle, { color: t.label }]}>Bookmarks</Text>
          <View style={styles.spacer} />
          <HeaderActions tint={t.label} onSearchPress={() => router.push("/search" as any)} />
        </View>

        {named.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {[{ collection: "", n: collections.reduce((s, c) => s + Number(c.n), 0) }, ...named].map(
              (c) => {
                const on = active === c.collection;
                return (
                  <Pressable
                    key={c.collection || "__all"}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setActive(c.collection);
                    }}
                    style={[
                      styles.chip,
                      on
                        ? { backgroundColor: t.tint, borderColor: t.tint }
                        : { backgroundColor: "transparent", borderColor: t.separator },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: on ? "#fff" : t.label }]}>
                      {c.collection || "All"} · {Number(c.n)}
                    </Text>
                  </Pressable>
                );
              },
            )}
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, overflow: "hidden" },
  barRow: { height: 54, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14 },
  barTitle: { ...IOSAppFont.headline },
  spacer: { flex: 1 },
  chips: { paddingHorizontal: 14, gap: 8, paddingBottom: 10 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  chipText: { ...IOSAppFont.caption1, fontFamily: "Poppins_500Medium" },
});
