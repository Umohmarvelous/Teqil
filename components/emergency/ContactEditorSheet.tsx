// components/emergency/ContactEditorSheet.tsx
//
// Everything you can decide about ONE emergency contact.
//
// ── Why the alerts are per-contact and not one global switch ───────────────
// The people you would want woken at 3am are not the people you want told about
// every bus ride. A single "notify my contacts" toggle forces that choice on
// everyone at once, so the useful setting — tell my sister about every trip,
// tell my boss only if something is wrong — becomes impossible and the whole
// feature gets switched off.
//
// ── The one rule that is not a preference ──────────────────────────────────
// SOS ignores mute and quiet hours. That is stated on the screen rather than
// buried, because a user who believes quiet hours silence an emergency will set
// them differently — and a user who believes the opposite is in danger.

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable } from "react-native";
import * as Haptics from "expo-haptics";

import {
  IOSSheet,
  IOSListSection,
  IOSListRow,
  IOSButton,
  iosAlert,
  iosActionSheet,
  useIOSTheme,
  IOSAppFont,
} from "@/components/ios";
import * as EC from "@/src/services/emergencyContacts";

/** Quiet-hours presets. A time picker for this is more precision than anyone wants. */
const QUIET_PRESETS: { label: string; from: string | null; to: string | null }[] = [
  { label: "Off", from: null, to: null },
  { label: "10pm – 7am", from: "22:00", to: "07:00" },
  { label: "11pm – 6am", from: "23:00", to: "06:00" },
  { label: "Midnight – 8am", from: "00:00", to: "08:00" },
];

const CHANNELS: { value: EC.ECChannel; label: string; blurb: string }[] = [
  { value: "auto", label: "Automatic", blurb: "In the app if they have it, otherwise from your phone" },
  { value: "in_app", label: "EMILGO only", blurb: "Only if they have the app" },
  { value: "sms", label: "Text message", blurb: "Always opens your SMS app" },
  { value: "whatsapp", label: "WhatsApp", blurb: "Always opens WhatsApp" },
];

export interface ContactEditorSheetProps {
  contact: EC.EmergencyContact | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ContactEditorSheet({ contact, onClose, onSaved }: ContactEditorSheetProps) {
  const t = useIOSTheme();

  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [c, setC] = useState<EC.EmergencyContact | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setC(contact);
    setName(contact?.name ?? "");
    setRelationship(contact?.relationship ?? "");
    setCustomMessage(contact?.custom_message ?? "");
  }, [contact]);

  /**
   * Toggles write straight through.
   *
   * Local state moves first so the switch does not lag, and the row is the only
   * thing that changes — a failed write reloads the true value on close rather
   * than leaving a switch showing something the server never accepted.
   */
  const patch = useCallback(async (p: EC.ECPatch) => {
    if (!c) return;
    Haptics.selectionAsync();
    setC((prev) => (prev ? { ...prev, ...localFor(p) } : prev));
    const res = await EC.update(c.id, p);
    if (!res.ok) iosAlert("Couldn't save", res.message);
  }, [c]);

  const saveText = useCallback(async () => {
    if (!c || saving) return;
    setSaving(true);
    try {
      const res = await EC.update(c.id, {
        name: name.trim(),
        relationship: relationship.trim() || null,
        customMessage: customMessage.trim() || null,
      });
      if (!res.ok) { iosAlert("Couldn't save", res.message); return; }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [c, saving, name, relationship, customMessage, onSaved]);

  const changeNumber = useCallback(() => {
    if (!c) return;
    iosAlert(
      "Change the number?",
      "Changing the number means this is a different person, so they'll have to accept again before they get routine trip updates.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Change",
          onPress: () =>
            iosActionSheet("New number", "Type it on the next screen.", [
              { text: "OK", onPress: () => setEditingNumber(true) },
              { text: "Cancel", style: "cancel" },
            ]),
        },
      ],
    );
  }, [c]);

  const [editingNumber, setEditingNumber] = useState(false);
  const [newNumber, setNewNumber] = useState("");

  const commitNumber = useCallback(async () => {
    if (!c) return;
    const res = await EC.update(c.id, { phone: newNumber.trim() });
    if (!res.ok) { iosAlert("Couldn't change the number", res.message); return; }
    setEditingNumber(false);
    setNewNumber("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved();
  }, [c, newNumber, onSaved]);

  if (!c) return null;

  const quiet =
    c.silent_from && c.silent_to
      ? QUIET_PRESETS.find((q) => q.from === c.silent_from?.slice(0, 5))?.label ??
        `${c.silent_from.slice(0, 5)} – ${c.silent_to.slice(0, 5)}`
      : "Off";

  const muted = !!c.muted_until && new Date(c.muted_until) > new Date();
  const unverified = c.status !== "verified";

  return (
    <IOSSheet
      visible={!!contact}
      onClose={onClose}
      detents={[0.9, "large"]}
      title={c.name}
      showGrabber
      dismissible
    >
      {/* Consent state, said once and plainly. Every alert switch below is
          conditional on it, so hiding it would make them look like lies. */}
      {unverified && (
        <View style={[S.notice, { backgroundColor: `${t.systemOrange}14`, borderColor: `${t.systemOrange}44` }]}>
          <Text style={[S.noticeTitle, { color: t.systemOrange }]}>
            {c.contact_user_id ? "Waiting for them to accept" : "Not on EMILGO"}
          </Text>
          <Text style={[S.noticeBody, { color: t.secondaryLabel }]}>
            {c.contact_user_id
              ? "Until they accept, they'll only receive an SOS — not routine trip updates."
              : "Alerts to this contact go from your own phone, and you'll be asked to press send. An SOS always includes them."}
          </Text>
        </View>
      )}

      {editingNumber ? (
        <View style={S.numberEdit}>
          <Text style={[S.label, { color: t.secondaryLabel }]}>NEW NUMBER</Text>
          <TextInput
            style={[S.input, { backgroundColor: t.tertiarySystemFill, color: t.label }]}
            value={newNumber}
            onChangeText={setNewNumber}
            keyboardType="phone-pad"
            placeholder="0803 123 4567"
            placeholderTextColor={t.tertiaryLabel}
            autoFocus
          />
          <View style={S.row2}>
            <IOSButton title="Cancel" variant="borderless" onPress={() => setEditingNumber(false)} />
            <IOSButton title="Save number" onPress={commitNumber} disabled={newNumber.replace(/\D/g, "").length < 10} />
          </View>
        </View>
      ) : null}

      <IOSListSection header="Who they are">
        <IOSListRow label="Name" accessory={{ type: "none" }} />
        <IOSListRow label="Relationship" accessory={{ type: "none" }} />
      </IOSListSection>

      {/* The two free-text fields sit outside the list because IOSListRow has no
          editable variant, and faking one with an absolutely-positioned input
          breaks the row's own press target. */}
      <View style={S.fields}>
        <Text style={[S.label, { color: t.secondaryLabel }]}>NAME</Text>
        <TextInput
          style={[S.input, { backgroundColor: t.tertiarySystemFill, color: t.label }]}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />

        <Text style={[S.label, { color: t.secondaryLabel }]}>RELATIONSHIP</Text>
        <TextInput
          style={[S.input, { backgroundColor: t.tertiarySystemFill, color: t.label }]}
          value={relationship}
          onChangeText={setRelationship}
          placeholder="e.g. Sister"
          placeholderTextColor={t.tertiaryLabel}
          autoCapitalize="words"
        />

        <Text style={[S.label, { color: t.secondaryLabel }]}>PHONE</Text>
        <Pressable
          style={[S.input, S.readonly, { backgroundColor: t.tertiarySystemFill }]}
          onPress={changeNumber}
        >
          <Text style={[IOSAppFont.body, { color: t.label }]}>{c.phone}</Text>
          <Text style={[IOSAppFont.footnote, { color: t.tint }]}>Change</Text>
        </Pressable>

        <Text style={[S.label, { color: t.secondaryLabel }]}>MESSAGE THEY SEE FIRST</Text>
        <TextInput
          style={[S.input, S.multiline, { backgroundColor: t.tertiarySystemFill, color: t.label }]}
          value={customMessage}
          onChangeText={setCustomMessage}
          placeholder="e.g. This is Chidi, your son"
          placeholderTextColor={t.tertiaryLabel}
          multiline
          maxLength={120}
        />
        <Text style={[S.hint, { color: t.tertiaryLabel }]}>
          Added to the front of every alert. Useful when they might not have your number saved.
        </Text>
      </View>

      <IOSListSection
        header="What they're told"
        footer={
          unverified
            ? "These take effect once they accept. An SOS is sent either way."
            : "An SOS is always sent, whatever else is off here."
        }
      >
        <IOSListRow
          label="Trip starts"
          accessory={{ type: "switch", value: c.notify_trip_start,
            onValueChange: (v) => patch({ notifyTripStart: v }) }}
        />
        <IOSListRow
          label="Trip ends safely"
          accessory={{ type: "switch", value: c.notify_trip_end,
            onValueChange: (v) => patch({ notifyTripEnd: v }) }}
        />
        <IOSListRow
          label="Route changes unexpectedly"
          detail="If the trip leaves the expected route"
          accessory={{ type: "switch", value: c.notify_route_deviation,
            onValueChange: (v) => patch({ notifyRouteDeviation: v }) }}
        />
        <IOSListRow
          label="Trip stops for a long time"
          accessory={{ type: "switch", value: c.notify_no_movement,
            onValueChange: (v) => patch({ notifyNoMovement: v }) }}
        />
        <IOSListRow
          label="SOS"
          detail="Cannot be muted or silenced by quiet hours"
          accessory={{ type: "switch", value: c.notify_sos,
            onValueChange: (v) => patch({ notifySos: v }) }}
        />
      </IOSListSection>

      <IOSListSection
        header="How much they see"
        footer="Live location is always included in an SOS, whatever this is set to."
      >
        <IOSListRow
          label="Share live location"
          detail="Include where you are in routine updates"
          accessory={{ type: "switch", value: c.share_live_location,
            onValueChange: (v) => patch({ shareLiveLocation: v }) }}
        />
      </IOSListSection>

      <IOSListSection header="When and how">
        <IOSListRow
          label="Quiet hours"
          detail="Hold routine alerts overnight"
          accessory={{ type: "detail", text: quiet }}
          onPress={() =>
            iosActionSheet("Quiet hours", "An SOS ignores this.", [
              ...QUIET_PRESETS.map((q) => ({
                text: q.label,
                onPress: () =>
                  patch(q.from == null
                    ? { clearSilent: true }
                    : { silentFrom: q.from, silentTo: q.to }),
              })),
              { text: "Cancel", style: "cancel" as const },
            ])
          }
        />
        <IOSListRow
          label="Mute"
          detail={muted ? `Muted until ${new Date(c.muted_until!).toLocaleString()}` : "Not muted"}
          accessory={{ type: "detail", text: muted ? "On" : "Off" }}
          onPress={() =>
            iosActionSheet("Mute this contact", "Routine alerts only — an SOS still goes through.", [
              { text: "For 1 hour", onPress: () => patch({ mutedUntil: new Date(Date.now() + 3600_000).toISOString() }) },
              { text: "For 8 hours", onPress: () => patch({ mutedUntil: new Date(Date.now() + 8 * 3600_000).toISOString() }) },
              { text: "For a week", onPress: () => patch({ mutedUntil: new Date(Date.now() + 7 * 86400_000).toISOString() }) },
              { text: "Unmute", onPress: () => patch({ clearMute: true }) },
              { text: "Cancel", style: "cancel" as const },
            ])
          }
        />
        <IOSListRow
          label="Reach them by"
          accessory={{ type: "detail", text: CHANNELS.find((x) => x.value === c.channel)?.label ?? "Automatic" }}
          onPress={() =>
            iosActionSheet("Reach them by", undefined, [
              ...CHANNELS.map((ch) => ({
                text: `${ch.label} — ${ch.blurb}`,
                onPress: () => patch({ channel: ch.value }),
              })),
              { text: "Cancel", style: "cancel" as const },
            ])
          }
        />
      </IOSListSection>

      <View style={S.footer}>
        <IOSButton
          title={saving ? "Saving…" : "Save"}
          onPress={saveText}
          disabled={saving || name.trim().length < 2}
        />
      </View>
    </IOSSheet>
  );
}

/** Map a patch back onto the row shape, so the switch moves before the network does. */
function localFor(p: EC.ECPatch): Partial<EC.EmergencyContact> {
  const out: Partial<EC.EmergencyContact> = {};
  if (p.notifyTripStart !== undefined) out.notify_trip_start = p.notifyTripStart;
  if (p.notifyTripEnd !== undefined) out.notify_trip_end = p.notifyTripEnd;
  if (p.notifySos !== undefined) out.notify_sos = p.notifySos;
  if (p.notifyRouteDeviation !== undefined) out.notify_route_deviation = p.notifyRouteDeviation;
  if (p.notifyNoMovement !== undefined) out.notify_no_movement = p.notifyNoMovement;
  if (p.shareLiveLocation !== undefined) out.share_live_location = p.shareLiveLocation;
  if (p.channel !== undefined) out.channel = p.channel;
  if (p.clearSilent) { out.silent_from = null; out.silent_to = null; }
  if (p.silentFrom !== undefined && p.silentFrom !== null) out.silent_from = p.silentFrom;
  if (p.silentTo !== undefined && p.silentTo !== null) out.silent_to = p.silentTo;
  if (p.clearMute) out.muted_until = null;
  else if (p.mutedUntil !== undefined) out.muted_until = p.mutedUntil;
  return out;
}

const S = StyleSheet.create({
  notice: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 4, marginBottom: 8 },
  noticeTitle: { ...IOSAppFont.footnote, fontFamily: "Poppins_600SemiBold" },
  noticeBody: { ...IOSAppFont.caption1, lineHeight: 17 },

  fields: { gap: 2, marginTop: -8 },
  label: { ...IOSAppFont.caption2, letterSpacing: 0.5, marginTop: 14, marginBottom: 6, paddingLeft: 4 },
  input: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, ...IOSAppFont.body },
  multiline: { minHeight: 70, textAlignVertical: "top" },
  readonly: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hint: { ...IOSAppFont.caption1, marginTop: 6, paddingLeft: 4, lineHeight: 16 },

  numberEdit: { gap: 4, marginBottom: 12 },
  row2: { flexDirection: "row", gap: 10, marginTop: 10 },

  footer: { marginTop: 20, marginBottom: 30 },
});
