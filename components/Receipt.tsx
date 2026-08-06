// components/Receipt.tsx
//
// Reusable payment receipt (modal), styled after the provided design: a rounded
// white card with a receipt icon, "Payment Successful", dashed section dividers,
// a green status pill, and a scalloped bottom edge + "Download PDF Receipt".
//
// Used for BOTH trip payments and premium subscriptions — the caller passes a
// ReceiptData (see src/utils/activity.ts → transactionToReceipt()).

import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, Share, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

export interface ReceiptRow {
  label: string;
  value: string;
  status?: "success" | "failed" | "pending";
  strong?: boolean;
}
export interface ReceiptSection {
  title: string;
  rows: ReceiptRow[];
}
export interface ReceiptData {
  title: string; // e.g. "Payment Successful"
  ok: boolean; // green vs red header accent
  sections: ReceiptSection[];
  shareText: string; // plain-text version for the share sheet
}

const statusColor = (s?: string) =>
  s === "failed" ? Colors.error : s === "pending" ? Colors.gold : Colors.primary;

function DashedDivider() {
  return <View style={styles.dashed} />;
}

export default function Receipt({
  visible,
  data,
  onClose,
}: {
  visible: boolean;
  data: ReceiptData | null;
  onClose: () => void;
}) {
  if (!data) return null;

  // NOTE: shares a formatted text receipt via the OS sheet. Installing
  // `expo-print` + `expo-sharing` would upgrade this to a true downloadable PDF.
  const handleDownload = async () => {
    try {
      await Share.share({ message: data.shareText });
    } catch {
      /* user dismissed */
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable style={styles.close} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color="#111" />
          </Pressable>

          {/* Icon + title */}
          <View style={styles.head}>
            <View style={[styles.iconWrap, { backgroundColor: (data.ok ? Colors.primary : Colors.error) + "18" }]}>
              <Ionicons
                name={data.ok ? "receipt" : "alert-circle"}
                size={30}
                color={data.ok ? Colors.primary : Colors.error}
              />
            </View>
            <Text style={styles.title}>{data.title}</Text>
          </View>

          <DashedDivider />

          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            {data.sections.map((section, si) => (
              <View key={section.title + si}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.rows.map((r, ri) => (
                  <View key={r.label + ri} style={styles.row}>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {r.label}
                    </Text>
                    <Text style={styles.colon}>:</Text>
                    {r.status ? (
                      <View style={[styles.pill, { backgroundColor: statusColor(r.status) + "1F" }]}>
                        <Text style={[styles.pillText, { color: statusColor(r.status) }]}>
                          {r.value}
                        </Text>
                      </View>
                    ) : (
                      <Text style={[styles.rowValue, r.strong && styles.rowValueStrong]}>
                        {r.value}
                      </Text>
                    )}
                  </View>
                ))}
                {si < data.sections.length - 1 && <DashedDivider />}
              </View>
            ))}
          </ScrollView>

          <DashedDivider />

          <Pressable style={styles.downloadBtn} onPress={handleDownload}>
            <Ionicons name="download-outline" size={18} color="#111" />
            <Text style={styles.downloadText}>Download PDF Receipt</Text>
          </Pressable>
        </View>

        {/* Scalloped bottom edge (notches in the backdrop colour). */}
        <View style={styles.scallopRow} pointerEvents="none">
          {Array.from({ length: 14 }).map((_, i) => (
            <View key={i} style={styles.scallop} />
          ))}
        </View>
      </View>
    </Modal>
  );
}

const CARD_W = 340;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: CARD_W,
    maxWidth: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    padding: 24,
    paddingTop: 20,
  },
  close: { position: "absolute", top: 16, right: 16, zIndex: 2 },
  head: { alignItems: "center", gap: 12, marginBottom: 18, marginTop: 6 },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: "Poppins_700Bold", fontSize: 19, color: "#111" },
  dashed: {
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D8DCE3",
    marginVertical: 14,
  },
  sectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: "#111",
    marginBottom: 10,
  },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  rowLabel: { fontFamily: "Poppins_400Regular", fontSize: 12.5, color: "#8A90A0", width: 120 },
  colon: { color: "#8A90A0", marginRight: 8 },
  rowValue: { fontFamily: "Poppins_500Medium", fontSize: 12.5, color: "#111", flex: 1 },
  rowValueStrong: { fontFamily: "Poppins_700Bold" },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  pillText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F1F3F7",
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 2,
  },
  downloadText: { fontFamily: "Poppins_600SemiBold", fontSize: 13.5, color: "#111" },
  scallopRow: {
    position: "absolute",
    flexDirection: "row",
    justifyContent: "space-between",
    width: CARD_W,
    maxWidth: "100%",
    // sit over the card's bottom edge
    bottom: undefined,
  },
  scallop: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(0,0,0,0.45)",
    marginTop: -7,
  },
});
