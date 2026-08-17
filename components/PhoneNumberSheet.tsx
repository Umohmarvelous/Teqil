// components/PhoneNumberSheet.tsx
//
// Capture and edit the user's own phone number, plus whether chat contacts may
// see it.
//
// ── Why the number and the switch live together ─────────────────────────────
// Asking for a phone number without saying who will see it is how apps lose
// trust. The consequence of typing it here is stated on the same screen as the
// field, and the switch that revokes it is one tap away — not buried in a
// privacy section three levels down.
//
// The server normalises and validates (see migration_contact_phone.sql), so the
// value this sheet shows after saving is exactly what will be dialled, not what
// was typed.

import React from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";

import { IOSSheet, IOSButton, IOSToggle, useIOSTheme, IOSAppFont } from "@/components/ios";
import { getMyPhone, setMyPhone, formatNgPhone } from "@/src/services/contact";

export interface PhoneNumberSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Fired with the stored E.164 number after a successful save. */
  onSaved?: (phone: string) => void;
}

export default function PhoneNumberSheet({ visible, onClose, onSaved }: PhoneNumberSheetProps) {
  const t = useIOSTheme();

  const [value, setValue] = React.useState("");
  const [share, setShare] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Re-read on every open rather than once on mount: the number can change on
  // another device, and showing a stale one invites the user to "fix" a value
  // that was already correct.
  React.useEffect(() => {
    if (!visible) return;
    let alive = true;
    setLoading(true);
    setError(null);
    getMyPhone().then(({ phone, sharePhone }) => {
      if (!alive) return;
      setValue(formatNgPhone(phone) || "");
      setShare(sharePhone);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [visible]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const stored = await setMyPhone(value, share);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved?.(stored);
      onClose();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e?.message ?? "Could not save that number");
    } finally {
      setSaving(false);
    }
  };

  return (
    <IOSSheet visible={visible} onClose={onClose} detent="medium" title="Phone number">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={t.tint} />
          </View>
        ) : (
          <View style={styles.body}>
            <Text style={[styles.blurb, { color: t.secondaryLabel }]}>
              Drivers and passengers you are already chatting with can tap Call to reach you. Nobody
              else can see this number.
            </Text>

            <View style={[styles.field, { backgroundColor: t.secondarySystemFill }]}>
              <Text style={[styles.prefix, { color: t.tertiaryLabel }]}>+234</Text>
              <TextInput
                value={value}
                onChangeText={(v) => {
                  setValue(v);
                  setError(null);
                }}
                placeholder="0803 123 4567"
                placeholderTextColor={t.tertiaryLabel}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                style={[styles.input, { color: t.label }]}
                maxLength={20}
              />
            </View>

            {error ? (
              <Text style={[styles.error, { color: t.systemRed }]}>{error}</Text>
            ) : (
              <Text style={[styles.hint, { color: t.tertiaryLabel }]}>
                Nigerian numbers in any format — 0803…, 234803… or +234803…
              </Text>
            )}

            <Pressable
              style={styles.shareRow}
              onPress={() => {
                Haptics.selectionAsync();
                setShare((s) => !s);
              }}
            >
              <View style={styles.shareText}>
                <Text style={[styles.shareLabel, { color: t.label }]}>
                  Let chat contacts call me
                </Text>
                <Text style={[styles.shareSub, { color: t.tertiaryLabel }]}>
                  Turn this off and the Call button stops working for everyone, immediately.
                </Text>
              </View>
              <IOSToggle value={share} onValueChange={setShare} />
            </Pressable>

            <IOSButton
              title="Save number"
              variant="filled"
              size="large"
              fullWidth
              loading={saving}
              onPress={save}
              disabled={saving || !value.trim()}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </IOSSheet>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 48, alignItems: "center" },
  body: { padding: 20, gap: 14 },
  blurb: { ...IOSAppFont.footnote, lineHeight: 18 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
  },
  prefix: { ...IOSAppFont.subheadline },
  input: { flex: 1, ...IOSAppFont.subheadline, padding: 0 },
  hint: { ...IOSAppFont.caption1 },
  error: { ...IOSAppFont.caption1 },
  shareRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  shareText: { flex: 1, gap: 2 },
  shareLabel: { ...IOSAppFont.subheadline },
  shareSub: { ...IOSAppFont.caption1, lineHeight: 15 },
});
