// app/hashtag/[tag].tsx
//
// Every post carrying one hashtag, newest first.
//
// The tag is stored without its leading "#" (see `extract_hashtags` in the
// migration), so the route strips one if a caller passes it — a link built by
// hand is otherwise a silent empty page.

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { Glass, useIOSTheme } from "@/components/ios";
import { IOSAppFont } from "@/components/ios/theme";
import { FeedList } from "@/components/feed";
import HeaderActions from "@/components/HeaderActions";

export default function HashtagScreen() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const t = useIOSTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const clean = (tag ?? "").replace(/^#/, "");
  const topInset = insets.top + 54;

  if (!clean) return null;

  return (
    <View style={[styles.root, { backgroundColor: t.systemBackground }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <FeedList
        timelineKey={`hashtag:${clean}`}
        topInset={topInset}
        bottomInset={insets.bottom}
        emptyTitle={`Nothing tagged #${clean} yet`}
        emptyBody="Be the first to use it — hashtags in a post become links automatically."
      />

      <View style={[styles.bar, { paddingTop: insets.top, height: topInset }]}>
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
          <Text style={[styles.barTitle, { color: t.label }]} numberOfLines={1}>
            #{clean}
          </Text>
          <View style={styles.spacer} />
          <HeaderActions tint={t.label} onSearchPress={() => router.push("/search" as any)} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, overflow: "hidden" },
  barRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14 },
  barTitle: { ...IOSAppFont.headline, flexShrink: 1 },
  spacer: { flex: 1 },
});
