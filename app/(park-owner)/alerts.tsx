import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  FlatList,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useTranslation } from "react-i18next";

interface Alert {
  id: string;
  type: "sos" | "info";
  message: string;
  driverName: string;
  tripCode: string;
  time: string;
}

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Text style={styles.headerTitle}>{t("parkOwner.emergencyAlerts")}</Text>
        <Text style={styles.headerSubtitle}>SOS and emergency notifications</Text>
      </View>

      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.alertCard, item.type === "sos" && styles.alertCardSos]}>
            <View style={[styles.alertIcon, item.type === "sos" && styles.alertIconSos]}>
              <Ionicons
                name={item.type === "sos" ? "warning" : "information-circle"}
                size={24}
                color={item.type === "sos" ? Colors.error : Colors.info}
              />
            </View>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>{item.driverName}</Text>
              <Text style={styles.alertMessage}>{item.message}</Text>
              <View style={styles.alertMeta}>
                <Text style={styles.alertCode}>{item.tripCode}</Text>
                <Text style={styles.alertTime}>{item.time}</Text>
              </View>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!alerts.length}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="shield-checkmark" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>{t("parkOwner.noAlerts")}</Text>
            <Text style={styles.emptySubtitle}>
              Emergency alerts from drivers will appear here in real time
            </Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 100 + (Platform.OS === "web" ? 34 : 0) }} />}
      />
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
  listContent: { padding: 20, gap: 12 },
  alertCard: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  alertCardSos: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  alertIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  alertIconSos: { backgroundColor: "#FEF2F2" },
  alertContent: { flex: 1, gap: 4 },
  alertTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  alertMessage: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  alertMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  alertCode: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.primary,
    letterSpacing: 1,
  },
  alertTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textTertiary,
  },
  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    gap: 14,
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
});
