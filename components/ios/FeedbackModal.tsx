// components/ios/FeedbackModal.tsx
//
// The plain "Send Feedback" sheet: one text field, a send button, honest result
// states. Built on IOSSheet, so it inherits the blurred backdrop, rounded top
// corners and swipe-to-dismiss.
//
// Deliberately does NOT claim success unless the transport confirmed it — see
// src/services/feedback.ts.

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";

import { IOSSheet } from "./IOSSheet";
import { IOSButton } from "./IOSButton";
import { useIOSTheme, IOSFont, IOSMetrics } from "./theme";
import { submitFeedback, type FeedbackKind } from "@/src/services/feedback";

const MAX_LENGTH = 1000;

export interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
  kind?: FeedbackKind;
  title?: string;
  prompt?: string;
  placeholder?: string;
  /** Sent alongside the message, e.g. { rating: 2, screen: "free-rides" }. */
  context?: Record<string, unknown>;
  onSubmitted?: (ok: boolean) => void;
}

export function FeedbackModal({
  visible,
  onClose,
  kind = "general",
  title = "Send Feedback",
  prompt = "Tell us what's working, what isn't, or what you'd like to see.",
  placeholder = "Your feedback…",
  context,
  onSubmitted,
}: FeedbackModalProps) {
  const theme = useIOSTheme();

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Reset each time the sheet opens so a previous result doesn't linger.
  useEffect(() => {
    if (visible) {
      setText("");
      setSending(false);
      setResult(null);
    }
  }, [visible]);

  const send = useCallback(async () => {
    if (!text.trim() || sending) return;
    setSending(true);

    const res = await submitFeedback({ kind, message: text, context });
    setSending(false);

    Haptics.notificationAsync(
      res.ok
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );

    setResult({
      ok: res.ok,
      msg: res.ok
        ? res.via === "email"
          ? "Your mail app is open — send the message to finish."
          : "Thanks — your feedback is on its way."
        : res.error ?? "Couldn't send. Please try again.",
    });

    onSubmitted?.(res.ok);
    if (res.ok) setTimeout(onClose, 1400);
  }, [text, sending, kind, context, onSubmitted, onClose]);

  return (
    <IOSSheet visible={visible} onClose={onClose} detent={0.62} title={title}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        {result ? (
          <View style={styles.resultWrap}>
            <SymbolView
              name={result.ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"}
              size={48}
              tintColor={result.ok ? theme.systemGreen : theme.systemOrange}
              fallback={null}
            />
            <Text style={[IOSFont.headline, { color: theme.label, textAlign: "center" }]}>
              {result.ok ? "Sent" : "Not sent"}
            </Text>
            <Text
              style={[IOSFont.subheadline, { color: theme.secondaryLabel, textAlign: "center" }]}
            >
              {result.msg}
            </Text>
            {!result.ok && (
              <IOSButton
                title="Try again"
                variant="tinted"
                onPress={() => setResult(null)}
                style={{ marginTop: 8 }}
              />
            )}
          </View>
        ) : (
          <>
            <Text style={[IOSFont.subheadline, { color: theme.secondaryLabel, marginBottom: 12 }]}>
              {prompt}
            </Text>

            <View
              style={[
                styles.field,
                {
                  backgroundColor: theme.tertiarySystemFill,
                  borderColor: theme.separator,
                },
              ]}
            >
              <TextInput
                value={text}
                onChangeText={(t) => setText(t.slice(0, MAX_LENGTH))}
                placeholder={placeholder}
                placeholderTextColor={theme.tertiaryLabel}
                multiline
                autoFocus
                textAlignVertical="top"
                style={[IOSFont.body, styles.input, { color: theme.label }]}
                accessibilityLabel="Feedback message"
              />
            </View>

            <Text style={[IOSFont.caption1, { color: theme.tertiaryLabel, alignSelf: "flex-end", marginTop: 6 }]}>
              {text.length}/{MAX_LENGTH}
            </Text>

            <View style={styles.actions}>
              <IOSButton
                title={sending ? "Sending…" : "Send"}
                symbol="paperplane.fill"
                variant="filled"
                size="large"
                fullWidth
                loading={sending}
                disabled={!text.trim()}
                onPress={send}
              />
              <IOSButton title="Cancel" variant="borderless" fullWidth onPress={onClose} />
            </View>
          </>
        )}

        {sending && Platform.OS === "web" && <ActivityIndicator color={theme.tint} />}
      </KeyboardAvoidingView>
    </IOSSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: {
    borderRadius: IOSMetrics.groupedRadius,
    borderWidth: IOSMetrics.hairline,
    minHeight: 130,
    padding: 12,
  },
  input: { flex: 1, minHeight: 106 },
  actions: { marginTop: "auto", gap: 4, paddingTop: 12 },
  resultWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 20 },
});

export default FeedbackModal;
