// components/FollowButton.tsx
//
// The follow / following toggle.
//
// Two states with deliberately different weight: "Follow" is a filled tint pill
// (an action worth taking), "Following" is quiet glass (a state, not a call to
// act). That asymmetry is what stops a screenful of them shouting.
//
// The toggle is optimistic — see `useFollowsStore` — so this only reflects
// store state and never waits on the network itself.

import React, { useEffect } from "react";
import { Text, StyleSheet, Pressable, ActivityIndicator, type ViewStyle, type StyleProp } from "react-native";

import { Glass, useIOSTheme, IOSAppFont } from "@/components/ios";
import { haptics } from "@/src/utils/haptics";
import { useFollowsStore } from "@/src/store/useFollowsStore";
import { useFeedStore } from "@/src/store/useFeedStore";
import { useAuthStore } from "@/src/store/useStore";

export interface FollowButtonProps {
  /** Whose profile this is. */
  userId: string;
  /**
   * Skip the stats fetch when the caller already knows the answer — a follower
   * list gets `is_following` per row, so 30 rows shouldn't mean 30 round trips.
   */
  initialFollowing?: boolean;
  size?: "small" | "regular";
  style?: StyleProp<ViewStyle>;
}

export default function FollowButton({
  userId,
  initialFollowing,
  size = "regular",
  style,
}: FollowButtonProps) {
  const theme = useIOSTheme();
  const me = useAuthStore((s) => s.user);

  const stats = useFollowsStore((s) => s.stats[userId]);
  const pending = useFollowsStore((s) => !!s.pending[userId]);
  const loadStats = useFollowsStore((s) => s.loadStats);
  const toggleFollow = useFollowsStore((s) => s.toggleFollow);

  useEffect(() => {
    // Only ask the server when the caller couldn't tell us and nothing is cached.
    if (initialFollowing === undefined && !stats) void loadStats(userId);
  }, [userId, initialFollowing, stats, loadStats]);

  // Following yourself is blocked in the database too; hiding the control is
  // just the honest version of that.
  if (!me?.id || me.id === userId) return null;

  const following = stats?.isFollowing ?? initialFollowing ?? false;
  const small = size === "small";

  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        // Every post already in memory by this author has to agree with the
        // button that was just tapped. Without this, following someone from
        // their profile leaves their posts in the timeline still offering
        // "Follow" until the next refetch.
        void toggleFollow(userId).then((ok) => {
          if (ok) useFeedStore.getState().applyFollow(userId, !following);
        });
      }}
      disabled={pending}
      style={[
        styles.pill,
        small ? styles.pillSmall : styles.pillRegular,
        following ? null : { backgroundColor: theme.tint },
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: following, busy: pending }}
      accessibilityLabel={following ? "Following. Tap to unfollow" : "Follow"}
    >
      {/* Glass only on the "Following" state. A filled tint pill covered in
          glass reads as neither — the material cancels the fill it sits on. */}
      {following && (
        <Glass
          variant="regular"
          interactive
          radius={30}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          fallbackIntensity={40}
          fallbackTint={theme.tertiarySystemFill}
        />
      )}

      {pending ? (
        <ActivityIndicator size="small" color={following ? theme.label : "#FFFFFF"} />
      ) : (
        <Text
          style={[
            IOSAppFont.button,
            small && styles.labelSmall,
            { color: following ? theme.label : "#FFFFFF" },
          ]}
        >
          {following ? "Following" : "Follow"}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pillRegular: { paddingHorizontal: 22, paddingVertical: 11, minWidth: 116 },
  pillSmall: { paddingHorizontal: 16, paddingVertical: 8, minWidth: 96 },
  labelSmall: { fontSize: 13 },
});
