import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useTranslation } from "react-i18next";

export default function DriversScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Text style={styles.headerTitle}>{t("parkOwner.drivers")}</Text>
        <Text style={styles.headerSubtitle}>Manage and verify drivers</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="people-outline" size={48} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>{t("parkOwner.noDrivers")}</Text>
          <Text style={styles.emptySubtitle}>
            Drivers who register with your park name and location will appear here.
            You can verify and monitor them.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={Colors.info} />
          <Text style={styles.infoText}>
            Drivers complete their profile by entering your park name and location. Once verified, you can see all their trips and stats.
          </Text>
        </View>

        <View style={{ height: 100 + (Platform.OS === "web" ? 34 : 0) }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
    color: Colors.text,
  },
  headerSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  content: { padding: 24, gap: 20 },
  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    color: Colors.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  infoCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 16,
    padding: 16,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#1E40AF",
    lineHeight: 22,
  },
});
