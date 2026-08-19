// components/chat/ContactCard.tsx
//
// The person you are chatting with, opened from the chat header.
//
// ── The shape ───────────────────────────────────────────────────────────────
// Instagram's profile header: a large avatar, the name and handle under it, a
// row of stat columns, then a row of equal-width actions. That layout is worth
// copying because it answers "who is this?" in one glance and puts every action
// within thumb reach on the same line.
//
// ── What is different here ─────────────────────────────────────────────────
// Instagram's stats are posts / followers / following, because that is what
// tells you whether an account is worth following. None of that tells a
// passenger whether a driver is worth getting into a bus with. So the stat row
// carries RATING, TRIPS and FOLLOWERS instead, the vehicle and park sit
// directly under the handle, and a verified driver gets a badge — the three
// things someone actually checks before a ride.
//
// ── Why the phone is fetched on open, not passed in ────────────────────────
// A number cached on a conversation outlives the consent that produced it. The
// owner can revoke sharing at any moment, and a cached copy would keep working.
// `getContactPhone` asks at open time and returns null the instant sharing is
// off — see src/services/contact.ts.

import React from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Linking } from "react-native";
import * as Haptics from "expo-haptics";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  Call02Icon,
  WhatsappIcon,
  UserBlock01Icon,
  Alert02Icon,
  Copy01Icon,
  CheckmarkBadge01Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import * as Clipboard from "expo-clipboard";

import { Glass, useIOSTheme, IOSAppFont, iosAlert } from "@/components/ios";
import Avatar from "@/components/Avatar";
import FollowButton from "@/components/FollowButton";
import { getContactPhone, formatNgPhone } from "@/src/services/contact";
import { openWhatsApp } from "@/src/services/whatsapp";

export interface ContactCardPerson {
  id: string;
  full_name: string | null;
  username?: string | null;
  profile_photo?: string | null;
  role?: string | null;
  driver_id?: string | null;
  vehicle_details?: string | null;
  park_name?: string | null;
  avg_rating?: number | null;
  trips_completed?: number | null;
  follower_count?: number | null;
  is_verified?: boolean | null;
}

export interface ContactCardProps {
  person: ContactCardPerson;
  onBlock?: () => void;
  onReport?: () => void;
}

function Stat({
  value,
  label,
  colour,
  sub,
}: {
  value: string;
  label: string;
  colour: string;
  sub?: React.ReactNode;
}) {
  const t = useIOSTheme();
  return (
    <View style={styles.stat}>
      <View style={styles.statValueRow}>
        {sub}
        <Text style={[styles.statValue, { color: colour }]}>{value}</Text>
      </View>
      <Text style={[styles.statLabel, { color: t.tertiaryLabel }]}>{label}</Text>
    </View>
  );
}

export function ContactCard({ person, onBlock, onReport }: ContactCardProps) {
  const t = useIOSTheme();
  const [phone, setPhone] = React.useState<string | null>(null);
  const [loadingPhone, setLoadingPhone] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    getContactPhone(person.id)
      .then((p) => alive && setPhone(p))
      .finally(() => alive && setLoadingPhone(false));
    return () => {
      alive = false;
    };
  }, [person.id]);

  const name = person.full_name || person.username || "User";
  const isDriver = person.role === "driver";

  const noNumber = () =>
    iosAlert(
      "No number shared",
      `${name} has not shared a phone number. You can keep chatting here.`,
    );

  const call = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!phone) return noNumber();
    Linking.openURL(`tel:${phone}`);
  };

  const whatsapp = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!phone) return noNumber();
    const res = await openWhatsApp(phone, `Hi ${name}, I'm messaging from EMILGO.`);
    if (!res.ok) {
      iosAlert(
        "Couldn't open WhatsApp",
        res.reason === "no_number"
          ? "That number isn't in a format WhatsApp accepts."
          : "WhatsApp doesn't seem to be installed on this device.",
      );
    }
  };

  const copyHandle = async () => {
    const handle = person.username ? `@${person.username}` : person.driver_id;
    if (!handle) return;
    await Clipboard.setStringAsync(handle);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    iosAlert("Copied", `${handle} copied to the clipboard.`);
  };

  return (
    <View style={styles.root}>
      {/* A soft band behind the top half of the avatar. It gives the card a
          header without a photo to put there, and is what stops it reading as a
          list of fields dropped onto a grey sheet. */}
      <View style={[styles.hero, { backgroundColor: t.tint + "14" }]} />

      {/* ── Identity ──────────────────────────────────────────────────────── */}
      <View style={styles.identity}>
        <View style={[styles.avatarRing, { borderColor: t.systemGroupedBackground }]}>
          <Avatar name={name} photoUri={person.profile_photo} size={92} />
        </View>

        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: t.label }]} numberOfLines={1}>
            {name}
          </Text>
          {person.is_verified ? (
            <HugeiconsIcon icon={CheckmarkBadge01Icon} size={18} color={t.tint} strokeWidth={2} />
          ) : null}
        </View>

        {person.username || person.driver_id ? (
          <Pressable onPress={copyHandle} hitSlop={8} style={styles.handleRow}>
            <Text style={[styles.handle, { color: t.secondaryLabel }]}>
              {person.username ? `@${person.username}` : person.driver_id}
            </Text>
            <HugeiconsIcon icon={Copy01Icon} size={13} color={t.tertiaryLabel} strokeWidth={2} />
          </Pressable>
        ) : null}

        {/* Vehicle and park are what a passenger checks before boarding, so
            they sit with the identity rather than in a details list below. */}
        {isDriver && (person.vehicle_details || person.park_name) ? (
          <Text style={[styles.vehicle, { color: t.tertiaryLabel }]} numberOfLines={2}>
            {[person.vehicle_details, person.park_name].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </View>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.stats,
          { borderColor: t.separator, backgroundColor: t.secondarySystemGroupedBackground },
        ]}
      >
        <Stat
          value={person.avg_rating ? person.avg_rating.toFixed(1) : "—"}
          label="Rating"
          colour={t.label}
          sub={
            person.avg_rating ? (
              <HugeiconsIcon icon={StarIcon} size={13} color="#F5A623" strokeWidth={2} />
            ) : undefined
          }
        />
        <View style={[styles.statDivider, { backgroundColor: t.separator }]} />
        <Stat value={String(person.trips_completed ?? 0)} label="Trips" colour={t.label} />
        <View style={[styles.statDivider, { backgroundColor: t.separator }]} />
        <Stat value={String(person.follower_count ?? 0)} label="Followers" colour={t.label} />
      </View>

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <View style={styles.actions}>
        <FollowButton userId={person.id} size="small" style={styles.action} />

        <Pressable onPress={call} style={styles.actionShadow} accessibilityLabel="Call">
          <Glass
            variant="regular"
            interactive
            radius={12}
            style={styles.actionGlass}
            fallbackIntensity={40}
            fallbackTint={t.tertiarySystemFill}
          >
            {loadingPhone ? (
              <ActivityIndicator size="small" color={t.label} />
            ) : (
              <HugeiconsIcon
                icon={Call02Icon}
                size={17}
                color={phone ? t.label : t.tertiaryLabel}
                strokeWidth={2}
              />
            )}
            <Text
              style={[styles.actionLabel, { color: phone ? t.label : t.tertiaryLabel }]}
              numberOfLines={1}
            >
              Call
            </Text>
          </Glass>
        </Pressable>

        <Pressable onPress={whatsapp} style={styles.actionShadow} accessibilityLabel="WhatsApp">
          <Glass
            variant="regular"
            interactive
            radius={12}
            style={styles.actionGlass}
            fallbackIntensity={40}
            fallbackTint={t.tertiarySystemFill}
          >
            <HugeiconsIcon
              icon={WhatsappIcon}
              size={17}
              color={phone ? "#25D366" : t.tertiaryLabel}
              strokeWidth={2}
            />
            <Text
              style={[styles.actionLabel, { color: phone ? t.label : t.tertiaryLabel }]}
              numberOfLines={1}
            >
              WhatsApp
            </Text>
          </Glass>
        </Pressable>
      </View>

      {/* The phone state is stated rather than left to be inferred from a
          greyed-out button, which reads as a bug. */}
      {!loadingPhone ? (
        <Text style={[styles.phoneNote, { color: t.tertiaryLabel }]}>
          {phone
            ? formatNgPhone(phone)
            : `${name} hasn't shared a phone number — messages still work.`}
        </Text>
      ) : null}

      {/* ── Destructive ───────────────────────────────────────────────────── */}
      {(onBlock || onReport) && (
        <View style={[styles.danger, { borderTopColor: t.separator }]}>
          {onReport ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onReport();
              }}
              style={styles.dangerRow}
            >
              <HugeiconsIcon icon={Alert02Icon} size={18} color={t.systemOrange} strokeWidth={2} />
              <Text style={[styles.dangerText, { color: t.systemOrange }]}>Report {name}</Text>
            </Pressable>
          ) : null}
          {onBlock ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                onBlock();
              }}
              style={styles.dangerRow}
            >
              <HugeiconsIcon icon={UserBlock01Icon} size={18} color={t.systemRed} strokeWidth={2} />
              <Text style={[styles.dangerText, { color: t.systemRed }]}>Block {name}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: 4 },

  hero: { position: "absolute", top: 0, left: 0, right: 0, height: 92 },

  identity: { alignItems: "center", gap: 6, paddingHorizontal: 20, paddingTop: 22 },
  // A ring the colour of the sheet, so the avatar reads as sitting ON the band
  // rather than being clipped by it.
  avatarRing: { borderRadius: 999, borderWidth: 4, overflow: "hidden" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  name: { ...IOSAppFont.title3, fontFamily: "Poppins_700Bold" },
  handleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  handle: { ...IOSAppFont.subheadline },
  vehicle: { ...IOSAppFont.caption1, textAlign: "center", marginTop: 2 },

  stats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  statValue: { ...IOSAppFont.headline, fontFamily: "Poppins_700Bold" },
  statLabel: { ...IOSAppFont.caption2, textTransform: "uppercase", letterSpacing: 0.4 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 26 },

  actions: { flexDirection: "row", gap: 8, paddingHorizontal: 20, marginTop: 14 },
  action: { flex: 1 },
  // Glass clips, so the shadow lives outside it.
  actionShadow: { flex: 1, borderRadius: 12 },
  actionGlass: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 42,
    borderRadius: 14,
    overflow: "hidden",
  },
  actionLabel: { ...IOSAppFont.footnote, fontFamily: "Poppins_600SemiBold" },

  phoneNote: { ...IOSAppFont.caption1, textAlign: "center", marginTop: 10, paddingHorizontal: 24 },

  danger: { marginTop: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  dangerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 24, paddingVertical: 12 },
  dangerText: { ...IOSAppFont.body },
});

export default ContactCard;
