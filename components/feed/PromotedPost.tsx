// components/feed/PromotedPost.tsx
//
// An ad, rendered as a feed cell.
//
// ── Why it looks like a post and not like a banner ──────────────────────────
// Twitter's promoted units work because they obey the timeline's own layout —
// same gutter, same type ramp, same media treatment — and declare themselves in
// one small line rather than a coloured frame. A banner-shaped ad in a
// vertically scrolling feed reads as an error state, and users learn to flick
// past the whole region it occupies, which costs the advertiser the impression
// they paid for.
//
// The only visual departures are the "Promoted" label and the CTA row, both of
// which are required to be distinguishable.
//
// ── Impressions ─────────────────────────────────────────────────────────────
// An impression fires once per mount, not once per render, and only after the
// cell has actually been on screen — a creative that scrolled past in a fling
// was never seen and billing for it is fraud. The parent list drives `visible`.

import React from "react";
import { View, Text, Image, Pressable, StyleSheet, Linking } from "react-native";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { MoreHorizontalIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import * as Haptics from "expo-haptics";
import Avatar from "@/components/Avatar";
import { useIOSTheme, IOSAppFont } from "@/components/ios/theme";
import { iosActionSheet } from "@/components/ios";
import { recordAdEvent } from "@/src/services/feed";
import type { FeedAd } from "@/src/services/feed";

const AVATAR = 42;
const GUTTER = AVATAR + 10;

export interface PromotedPostProps {
  ad: FeedAd;
  /** True once the cell has been on screen. Gates the impression. */
  visible?: boolean;
  onDismiss?: (adId: string) => void;
}

function PromotedPostInner({ ad, visible, onDismiss }: PromotedPostProps) {
  const t = useIOSTheme();
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (visible && !fired.current) {
      fired.current = true;
      recordAdEvent(ad.id, "impression");
    }
  }, [visible, ad.id]);

  const click = () => {
    recordAdEvent(ad.id, "click");
    Linking.openURL(ad.cta_url).catch(() => {});
  };

  const menu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    iosActionSheet(undefined, `Promoted by ${ad.advertiser_name}`, [
      {
        text: "Hide this ad",
        onPress: () => {
          recordAdEvent(ad.id, "dismiss");
          onDismiss?.(ad.id);
        },
      },
      {
        text: "Why am I seeing this?",
        onPress: () =>
          iosActionSheet(
            "Why this ad",
            `${ad.advertiser_name} is showing this to Emilgo users in your area and role. Emilgo does not share your name, phone number or trip history with advertisers.`,
            [{ text: "OK", style: "cancel" as const }],
          ),
      },
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  return (
    <View style={[styles.card, { borderBottomColor: t.separator }]}>
      <View style={styles.promotedLine}>
        <View style={styles.promotedIconCol} />
        <Text style={[styles.promotedText, { color: t.tertiaryLabel }]}>Promoted</Text>
      </View>

      <View style={styles.row}>
        <View style={styles.gutter}>
          <Avatar name={ad.advertiser_name} photoUri={ad.advertiser_logo} size={AVATAR} />
        </View>

        <View style={styles.body}>
          <View style={styles.head}>
            <Text style={[styles.name, { color: t.label }]} numberOfLines={1}>
              {ad.advertiser_name}
            </Text>
            {ad.advertiser_handle ? (
              <Text style={[styles.handle, { color: t.tertiaryLabel }]} numberOfLines={1}>
                @{ad.advertiser_handle}
              </Text>
            ) : null}
            <View style={styles.spacer} />
            <Pressable onPress={menu} hitSlop={12}>
              <HugeiconsIcon
                icon={MoreHorizontalIcon}
                size={18}
                color={t.tertiaryLabel}
                strokeWidth={2}
              />
            </Pressable>
          </View>

          <Pressable onPress={click}>
            <Text style={[styles.headline, { color: t.label }]} numberOfLines={3}>
              {ad.headline}
            </Text>
            {ad.body ? (
              <Text style={[styles.bodyText, { color: t.secondaryLabel }]} numberOfLines={3}>
                {ad.body}
              </Text>
            ) : null}

            {ad.media_url ? (
              <Image source={{ uri: ad.media_url }} style={styles.media} resizeMode="cover" />
            ) : null}

            {/* The CTA bar is attached to the media with a shared radius so the
                two read as one unit, which is what makes the tap obvious. */}
            <View
              style={[
                styles.cta,
                {
                  backgroundColor: t.secondarySystemBackground,
                  borderColor: t.separator,
                  marginTop: ad.media_url ? -1 : 10,
                  borderTopLeftRadius: ad.media_url ? 0 : 12,
                  borderTopRightRadius: ad.media_url ? 0 : 12,
                },
              ]}
            >
              <Text style={[styles.ctaHost, { color: t.tertiaryLabel }]} numberOfLines={1}>
                {(() => {
                  try {
                    return new URL(ad.cta_url).hostname.replace(/^www\./, "");
                  } catch {
                    return ad.cta_url;
                  }
                })()}
              </Text>
              <View style={styles.ctaAction}>
                <Text style={[styles.ctaLabel, { color: t.tint }]} numberOfLines={1}>
                  {ad.cta_label}
                </Text>
                <HugeiconsIcon icon={ArrowRight01Icon} size={15} color={t.tint} strokeWidth={2} />
              </View>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export const PromotedPost = React.memo(PromotedPostInner);

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  promotedLine: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  promotedIconCol: { width: GUTTER },
  promotedText: { ...IOSAppFont.caption1, fontFamily: "Poppins_500Medium" },

  row: { flexDirection: "row" },
  gutter: { width: GUTTER, alignItems: "center" },
  body: { flex: 1, minWidth: 0 },

  head: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { ...IOSAppFont.subheadline, fontFamily: "Poppins_600SemiBold", flexShrink: 1 },
  handle: { ...IOSAppFont.footnote, flexShrink: 1 },
  spacer: { flex: 1 },

  headline: { ...IOSAppFont.subheadline, fontFamily: "Poppins_600SemiBold", lineHeight: 21, marginTop: 2 },
  bodyText: { ...IOSAppFont.footnote, lineHeight: 19, marginTop: 2 },

  media: {
    width: "100%",
    aspectRatio: 1.91, // The standard social ad ratio; creatives are cut for it.
    marginTop: 10,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: "#E5E7EB",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  ctaHost: { ...IOSAppFont.caption1, flex: 1 },
  ctaAction: { flexDirection: "row", alignItems: "center", gap: 3 },
  ctaLabel: { ...IOSAppFont.footnote, fontFamily: "Poppins_600SemiBold" },
});
