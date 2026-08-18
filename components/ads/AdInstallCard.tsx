// components/ads/AdInstallCard.tsx
//
// The post-roll: what the user sees once the ad has finished and the reward is
// banked.
//
// ── Structure, from the OKash reference ────────────────────────────────────
// A screenshot carousel filling the frame, the app icon breaking the boundary
// between the carousel and the detail panel, then name, a three-stat row
// (rating / reviews / category), a full-width install button, and the store
// attribution underneath. A small "Ads served by …" badge sits bottom-left.
//
// ── The one thing that must not be copied ──────────────────────────────────
// In the reference the close button is a thin grey X in the corner and the
// install button is enormous and blue. That asymmetry is deliberate on their
// part and hostile: it makes leaving harder than converting.
//
// Here the reward is ALREADY BANKED by the time this renders, so there is no
// reason to trap anyone. "Next ad" and "Done" are given equal weight beside
// Install, and the close control is a real target. The install is still the
// prominent action because it is the one that pays the advertiser — but it does
// not have to be the only visible one.

import React from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
  Linking,
} from "react-native";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  StarIcon,
  UserMultipleIcon,
  Grid02Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";

import { Glass, useIOSTheme, IOSAppFont } from "@/components/ios";
import { recordAdClick, type AdCreative } from "@/src/services/ads";

const { width: SCREEN_W } = Dimensions.get("window");
const SHOT_W = SCREEN_W * 0.56;

export interface AdInstallCardProps {
  ad: AdCreative;
  sessionId: string | null;
  onNext: () => void;
  onDone: () => void;
  /** Whether another ad is available; hides "Next" when there is not. */
  canContinue: boolean;
}

export function AdInstallCard({
  ad,
  sessionId,
  onNext,
  onDone,
  canContinue,
}: AdInstallCardProps) {
  const t = useIOSTheme();

  // Which store this device would actually open. Falls back to the creative's
  // generic cta_url when the advertiser gave no store link — a "Learn more"
  // web destination is still a valid ad.
  const storeUrl =
    (Platform.OS === "ios" ? ad.app_store_url : ad.play_store_url) ||
    ad.app_store_url ||
    ad.play_store_url ||
    ad.cta_url;

  const isStore = !!(ad.app_store_url || ad.play_store_url);
  const storeName = Platform.OS === "ios" ? "the App Store" : "Google Play";

  const open = async () => {
    if (!storeUrl) return;
    recordAdClick(ad.id, sessionId ?? undefined);
    const ok = await Linking.canOpenURL(storeUrl).catch(() => false);
    if (ok) Linking.openURL(storeUrl);
  };

  const shots = ad.app_screenshots.length
    ? ad.app_screenshots
    : ad.media_url && ad.media_type === "image"
      ? [ad.media_url]
      : [];

  return (
    <View style={[styles.root, { backgroundColor: t.systemBackground }]}>
      {/* ── Screenshots ──────────────────────────────────────────────────── */}
      {shots.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.shots}
          snapToInterval={SHOT_W + 12}
          decelerationRate="fast"
        >
          {shots.map((uri, i) => (
            <Image key={`${uri}-${i}`} source={{ uri }} style={styles.shot} resizeMode="cover" />
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.shotsEmpty, { backgroundColor: t.secondarySystemFill }]} />
      )}

      <Pressable onPress={onDone} hitSlop={14} style={styles.close} accessibilityLabel="Close">
        <Glass
          variant="regular"
          radius={18}
          style={styles.closeGlass}
          fallbackIntensity={40}
          fallbackTint={t.secondarySystemBackground}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={17} color={t.label} strokeWidth={2.4} />
        </Glass>
      </Pressable>

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      <View style={styles.panel}>
        <View style={styles.iconRow}>
          {ad.app_icon ? (
            <Image source={{ uri: ad.app_icon }} style={styles.icon} />
          ) : (
            <View style={[styles.icon, { backgroundColor: t.secondarySystemFill }]} />
          )}
        </View>

        <Text style={[styles.name, { color: t.label }]} numberOfLines={2}>
          {ad.app_name || ad.headline}
        </Text>

        {ad.body ? (
          <Text style={[styles.body, { color: t.secondaryLabel }]} numberOfLines={2}>
            {ad.body}
          </Text>
        ) : null}

        {/* Only render a stat the advertiser actually supplied. An empty
            "— Rating" column is worse than a narrower row. */}
        <View style={styles.stats}>
          {ad.app_rating != null ? (
            <Stat icon={StarIcon} value={ad.app_rating.toFixed(1)} label="Rating" />
          ) : null}
          {ad.app_installs ? (
            <Stat icon={UserMultipleIcon} value={ad.app_installs} label="Installs" />
          ) : null}
          <Stat icon={Grid02Icon} value={titleCase(ad.category)} label="Category" />
        </View>

        <Pressable
          onPress={open}
          style={[styles.install, { backgroundColor: t.tint }]}
          accessibilityRole="button"
        >
          <Text style={styles.installText}>{isStore ? "Install now" : ad.cta_label}</Text>
        </Pressable>

        {isStore ? (
          <Text style={[styles.from, { color: t.tertiaryLabel }]}>From {storeName}</Text>
        ) : null}

        <View style={styles.secondary}>
          {canContinue ? (
            <Pressable onPress={onNext} style={[styles.ghost, { borderColor: t.separator }]}>
              <Text style={[styles.ghostText, { color: t.label }]}>Watch next ad</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onDone} style={[styles.ghost, { borderColor: t.separator }]}>
            <Text style={[styles.ghostText, { color: t.label }]}>Done</Text>
          </Pressable>
        </View>

        {/* Attribution. Required by every ad network's terms, and it is also
            how a user knows this is an advert and who served it. */}
        <View style={[styles.attribution, { backgroundColor: t.secondarySystemFill }]}>
          <Text style={[styles.attributionText, { color: t.tertiaryLabel }]}>
            Ad · {ad.advertiser_name}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Stat({ icon, value, label }: { icon: any; value: string; label: string }) {
  const t = useIOSTheme();
  return (
    <View style={styles.stat}>
      <HugeiconsIcon icon={icon} size={18} color={t.label} strokeWidth={2} />
      <Text style={[styles.statValue, { color: t.label }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: t.tertiaryLabel }]}>{label}</Text>
    </View>
  );
}

function titleCase(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "App";
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  shots: { gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  shot: { width: SHOT_W, height: SHOT_W * 1.9, borderRadius: 18, backgroundColor: "#00000010" },
  shotsEmpty: { height: 220, marginHorizontal: 16, marginTop: 8, borderRadius: 18 },

  close: { position: "absolute", top: 14, right: 14, zIndex: 10 },
  closeGlass: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  panel: { paddingHorizontal: 22, paddingTop: 0, alignItems: "center" },
  iconRow: { marginTop: -34, marginBottom: 10 },
  icon: {
    width: 76,
    height: 76,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.9)",
  },

  name: { ...IOSAppFont.title3, textAlign: "center" },
  body: { ...IOSAppFont.footnote, textAlign: "center", marginTop: 4, lineHeight: 18 },

  stats: { flexDirection: "row", marginTop: 16, marginBottom: 18, width: "100%" },
  stat: { flex: 1, alignItems: "center", gap: 3 },
  statValue: { ...IOSAppFont.headline },
  statLabel: { ...IOSAppFont.caption2 },

  install: {
    width: "100%",
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  installText: { ...IOSAppFont.button, color: "#fff", fontSize: 16 },
  from: { ...IOSAppFont.caption2, marginTop: 8 },

  secondary: { flexDirection: "row", gap: 10, marginTop: 14, width: "100%" },
  ghost: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostText: { ...IOSAppFont.button, fontSize: 14 },

  attribution: {
    marginTop: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "center",
  },
  attributionText: { ...IOSAppFont.caption2 },
});
