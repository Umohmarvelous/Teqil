import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";

export default function UnifiedDashboard() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [modalVisible, setModalVisible] = useState(false);

  const handleDrivePress = () => setModalVisible(true);

  const selectRole = (role: string) => {
    setModalVisible(false);
    if (role === "driver") router.push("/(driver)");
    else if (role === "passenger") router.push("/(passenger)");
    else if (role === "park_owner") router.push("/(park-owner)");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.welcome}>Welcome, {user?.full_name?.split(" ")[0] || "User"}</Text>
        {/* The drawer open button is automatically added by the drawer navigator */}
      </View>

      {/* Main content */}
      <View style={styles.content}>
        <Text style={styles.title}>Teqil</Text>
        <Text style={styles.subtitle}>Your journey starts here</Text>
        {/* You can add stats, recent trips, etc. */}
      </View>

      {/* Floating Drive Button */}
      <Pressable style={styles.driveButton} onPress={handleDrivePress}>
        <Ionicons name="car-sport" size={24} color="#fff" />
        <Text style={styles.driveButtonText}>Drive</Text>
      </Pressable>

      {/* Role Selection Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Choose your role</Text>
            <Pressable style={styles.roleOption} onPress={() => selectRole("driver")}>
              <Ionicons name="car-sport" size={24} color={Colors.primary} />
              <Text style={styles.roleText}>Driver</Text>
            </Pressable>
            <Pressable style={styles.roleOption} onPress={() => selectRole("passenger")}>
              <Ionicons name="person" size={24} color={Colors.primary} />
              <Text style={styles.roleText}>Passenger</Text>
            </Pressable>
            <Pressable style={styles.roleOption} onPress={() => selectRole("park_owner")}>
              <Ionicons name="business" size={24} color={Colors.primary} />
              <Text style={styles.roleText}>Park Owner</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  welcome: { fontSize: 20, fontFamily: "Poppins_600SemiBold", color: Colors.text },
  content: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 32, fontFamily: "Poppins_700Bold", color: Colors.primary, marginBottom: 8 },
  subtitle: { fontSize: 16, fontFamily: "Poppins_400Regular", color: Colors.textSecondary },
  driveButton: {
    position: "absolute",
    bottom: 30,
    right: 20,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 40,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  driveButtonText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 16, marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContainer: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, width: "80%" },
  modalTitle: { fontSize: 18, fontFamily: "Poppins_600SemiBold", color: Colors.text, marginBottom: 20, textAlign: "center" },
  roleOption: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  roleText: { fontSize: 16, fontFamily: "Poppins_500Medium", color: Colors.text },
});