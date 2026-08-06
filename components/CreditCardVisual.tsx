// components/CreditCardVisual.tsx
//
// Renders a saved payment method as a real-looking bank card (gradient, chip,
// masked number, holder, expiry, brand). Display-only — it only ever shows the
// tokenized metadata (brand + last4), never a full PAN.

import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { PaymentMethod } from "@/src/store/usePaymentMethodsStore";

const BRAND_COLORS: Record<string, [string, string]> = {
  visa: ["#1A1F71", "#2D3A9E"],
  mastercard: ["#241C3B", "#5A2D82"],
  verve: ["#0A7E3E", "#0C5C2F"],
  amex: ["#0F7C68", "#0A5546"],
  paypal: ["#003087", "#0070E0"],
  card: ["#111827", "#374151"],
};

const BRAND_LABEL: Record<string, string> = {
  visa: "VISA",
  mastercard: "Mastercard",
  verve: "Verve",
  amex: "AMEX",
  paypal: "PayPal",
  card: "CARD",
};

export default function CreditCardVisual({
  method,
  selected,
  onPress,
  onRemove,
}: {
  method: PaymentMethod;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
}) {
  const brand = method.brand ?? "card";
  const colors = BRAND_COLORS[brand] ?? BRAND_COLORS.card;
  const exp =
    method.exp_month && method.exp_year
      ? `${String(method.exp_month).padStart(2, "0")}/${String(method.exp_year).slice(-2)}`
      : "••/••";

  return (
    <Pressable onPress={onPress} style={[styles.wrap, selected && styles.selected]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.chip} />
          {method.is_default && (
            <View style={styles.defaultTag}>
              <Text style={styles.defaultTagText}>Default</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          {onRemove && (
            <Pressable onPress={onRemove} hitSlop={10}>
              <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.85)" />
            </Pressable>
          )}
        </View>

        <Text style={styles.number}>
          {method.type === "paypal" ? method.holder_name ?? "PayPal account" : `•••• •••• •••• ${method.last4 ?? "••••"}`}
        </Text>

        <View style={styles.bottomRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>CARD HOLDER</Text>
            <Text style={styles.value} numberOfLines={1}>
              {(method.holder_name ?? "—").toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.label}>EXPIRES</Text>
            <Text style={styles.value}>{exp}</Text>
          </View>
          <Text style={styles.brand}>{BRAND_LABEL[brand] ?? "CARD"}</Text>
        </View>
      </LinearGradient>
      {selected && (
        <View style={styles.check}>
          <Ionicons name="checkmark-circle" size={22} color="#009A43" />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 18, marginBottom: 4 },
  selected: {},
  card: {
    borderRadius: 18,
    padding: 18,
    height: 190,
    justifyContent: "space-between",
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  chip: {
    width: 38,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(255,215,120,0.9)",
  },
  defaultTag: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  defaultTagText: { fontFamily: "Poppins_500Medium", fontSize: 9, color: "#fff" },
  number: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 19,
    color: "#fff",
    letterSpacing: 2,
  },
  bottomRow: { flexDirection: "row", alignItems: "flex-end", gap: 14 },
  label: { fontFamily: "Poppins_400Regular", fontSize: 8, color: "rgba(255,255,255,0.6)", letterSpacing: 1 },
  value: { fontFamily: "Poppins_600SemiBold", fontSize: 12.5, color: "#fff", marginTop: 2 },
  brand: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#fff", fontStyle: "italic" },
  check: { position: "absolute", top: 10, right: 10, backgroundColor: "#fff", borderRadius: 11 },
});
