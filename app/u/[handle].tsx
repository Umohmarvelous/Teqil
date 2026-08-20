// app/u/[handle].tsx
//
// Resolves an @handle to a user id and forwards to that person's profile.
//
// ── Why a redirect rather than a second profile screen ──────────────────────
// Mentions in a post body are text, so all a `PostText` link can carry is the
// handle someone typed. The profile screen is keyed by user id, because a
// username can change and a link that rots is worse than no link. This route is
// the join between the two, and it exists once so that every mention, deep link
// and shared URL resolves the same way.
//
// `find_user_for_chat` matches a username (and only a username, since
// migration_user_privacy.sql)
// and is the same lookup the chat composer uses — reusing it means a handle that
// works in one place works in the other.

import React from "react";
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useIOSTheme } from "@/components/ios";
import { IOSAppFont } from "@/components/ios/theme";
import { supabase } from "@/src/services/supabase";

export default function HandleRedirect() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const t = useIOSTheme();
  const router = useRouter();
  const [missing, setMissing] = React.useState(false);

  React.useEffect(() => {
    const clean = (handle ?? "").replace(/^@/, "").trim();
    if (!clean) {
      setMissing(true);
      return;
    }
    let alive = true;
    supabase.rpc("find_user_for_chat", { p_handle: clean }).then(({ data, error }) => {
      if (!alive) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row?.id) {
        if (error) console.warn("[u/handle]", error.message);
        setMissing(true);
        return;
      }
      // `replace`, not `push`: this screen is a redirect, and leaving it in the
      // stack means Back from the profile lands on a spinner.
      router.replace(`/follows/${row.id}` as any);
    });
    return () => {
      alive = false;
    };
  }, [handle, router]);

  return (
    <View style={[styles.root, { backgroundColor: t.systemBackground }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {missing ? (
        <>
          <Text style={[styles.title, { color: t.label }]}>@{handle} not found</Text>
          <Text style={[styles.body, { color: t.tertiaryLabel }]}>
            That account may have been renamed or removed.
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={[styles.back, { color: t.tint }]}>Go back</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator color={t.tint} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 32 },
  title: { ...IOSAppFont.headline, textAlign: "center" },
  body: { ...IOSAppFont.footnote, textAlign: "center" },
  back: { ...IOSAppFont.subheadline, fontFamily: "Poppins_600SemiBold", marginTop: 8 },
});
