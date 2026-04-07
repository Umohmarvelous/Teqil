import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  TextInput,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { supabase } from "@/src/services/supabase";
import { Colors } from "@/constants/colors";
import Avatar from "@/components/Avatar";
import type { EmergencyContact } from "@/src/models/types";

interface InfoRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  editable?: boolean;
  onEdit?: () => void;
  isDark?: boolean;
  textColor?: string;
  subColor?: string;
  borderColor?: string;
  cardBg?: string;
}

function InfoRow({
  icon,
  label,
  value,
  editable,
  onEdit,
  isDark,
  textColor,
  subColor,
  borderColor,
  cardBg,
}: InfoRowProps) {
  return (
    <View style={[infoStyles.row, { borderBottomColor: borderColor }]}>
      <View style={[infoStyles.iconBox, { backgroundColor: Colors.primaryLight }]}>
        <Ionicons name={icon} size={16} color={Colors.primary} />
      </View>
      <View style={infoStyles.textBlock}>
        <Text style={[infoStyles.label, { color: subColor }]}>{label}</Text>
        <Text style={[infoStyles.value, { color: textColor }]} numberOfLines={1}>
          {value || "—"}
        </Text>
      </View>
      {editable && (
        <Pressable onPress={onEdit} hitSlop={8}>
          <Ionicons name="create-outline" size={18} color={Colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 14,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: { flex: 1 },
  label: { fontFamily: "Poppins_400Regular", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontFamily: "Poppins_500Medium", fontSize: 14, marginTop: 1 },
});

export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuthStore();
  const { theme } = useSettingsStore();
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

  const isDark = theme === "dark";
  const bg = isDark ? "#0D1117" : "#F4F6FA";
  const cardBg = isDark ? "#161B22" : "#FFFFFF";
  const textColor = isDark ? "#F0F0F0" : "#0D1B3E";
  const subColor = isDark ? "#6B7280" : "#9CA3AF";
  const borderColor = isDark ? "rgba(255,255,255,0.06)" : "#E8ECF0";
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const pickPhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      try {
        await supabase.auth.updateUser({ data: { profile_photo: uri } });
        updateUser({ profile_photo: uri });
      } catch {
        Alert.alert("Error", "Could not update photo.");
      }
    }
  };

  const startEdit = (field: string, currentValue: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditField(field);
    setEditValue(currentValue || "");
  };

  const saveEdit = async () => {
    if (!editField) return;
    setSaving(true);
    try {
      const update: Record<string, string> = { [editField]: editValue.trim() };
      await supabase.auth.updateUser({ data: update });
      updateUser(update as any);
      setEditField(null);
    } catch {
      Alert.alert("Error", "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  const addEmergencyContact = () => {
    if (!newContactName.trim() || !newContactPhone.trim()) return;
    const existing: EmergencyContact[] = (user as any)?.emergency_contacts || [];
    const updated = [
      ...existing,
      { name: newContactName.trim(), phone: newContactPhone.trim() },
    ];
    updateUser({ emergency_contacts: updated } as any);
    setNewContactName("");
    setNewContactPhone("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const removeContact = (idx: number) => {
    const existing: EmergencyContact[] = (user as any)?.emergency_contacts || [];
    const updated = existing.filter((_, i) => i !== idx);
    updateUser({ emergency_contacts: updated } as any);
  };

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Hero */}
      <LinearGradient
        colors={isDark ? ["#0D1B3E", "#001440"] : ["#00205B", "#001440"]}
        style={[styles.hero, { paddingTop: topPadding + 16 }]}
      >
        <Text style={styles.heroTitle}>My Profile</Text>

        {/* Avatar */}
        <Pressable onPress={pickPhoto} style={styles.avatarWrap}>
          <Avatar
            name={user?.full_name || "User"}
            photoUri={user?.profile_photo}
            size={88}
          />
          <View style={styles.cameraBtn}>
            <Ionicons name="camera" size={14} color="#fff" />
          </View>
        </Pressable>

        <Text style={styles.heroName}>{user?.full_name || "Teqil User"}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>
            {user?.role === "driver"
              ? "Driver"
              : user?.role === "park_owner"
              ? "Park Owner"
              : "Passenger"}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Common info */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.cardTitle, { color: textColor }]}>
            Personal Information
          </Text>
          <InfoRow
            icon="person-outline"
            label="Full Name"
            value={user?.full_name || ""}
            editable
            onEdit={() => startEdit("full_name", user?.full_name || "")}
            isDark={isDark}
            textColor={textColor}
            subColor={subColor}
            borderColor={borderColor}
          />
          <InfoRow
            icon="mail-outline"
            label="Email"
            value={user?.email || ""}
            textColor={textColor}
            subColor={subColor}
            borderColor={borderColor}
          />
          <InfoRow
            icon="call-outline"
            label="Phone"
            value={user?.phone || ""}
            editable
            onEdit={() => startEdit("phone", user?.phone || "")}
            textColor={textColor}
            subColor={subColor}
            borderColor={borderColor}
          />
          <InfoRow
            icon="calendar-outline"
            label="Age"
            value={user?.age?.toString() || ""}
            textColor={textColor}
            subColor={subColor}
            borderColor="transparent"
          />
        </View>

        {/* Driver-specific */}
        {user?.role === "driver" && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.cardTitle, { color: textColor }]}>
              Driver Details
            </Text>
            <InfoRow
              icon="id-card-outline"
              label="Driver ID"
              value={user?.driver_id || ""}
              textColor={textColor}
              subColor={subColor}
              borderColor={borderColor}
            />
            <InfoRow
              icon="car-outline"
              label="Vehicle"
              value={user?.vehicle_details || ""}
              editable
              onEdit={() => startEdit("vehicle_details", user?.vehicle_details || "")}
              textColor={textColor}
              subColor={subColor}
              borderColor={borderColor}
            />
            <InfoRow
              icon="business-outline"
              label="Park Name"
              value={user?.park_name || ""}
              editable
              onEdit={() => startEdit("park_name", user?.park_name || "")}
              textColor={textColor}
              subColor={subColor}
              borderColor={borderColor}
            />
            <InfoRow
              icon="location-outline"
              label="Park Location"
              value={user?.park_location || ""}
              editable
              onEdit={() => startEdit("park_location", user?.park_location || "")}
              textColor={textColor}
              subColor={subColor}
              borderColor="transparent"
            />
          </View>
        )}

        {/* Park owner */}
        {user?.role === "park_owner" && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.cardTitle, { color: textColor }]}>
              Park Details
            </Text>
            <InfoRow
              icon="business-outline"
              label="Park Name"
              value={user?.park_name || ""}
              editable
              onEdit={() => startEdit("park_name", user?.park_name || "")}
              textColor={textColor}
              subColor={subColor}
              borderColor={borderColor}
            />
            <InfoRow
              icon="location-outline"
              label="Park Location"
              value={user?.park_location || ""}
              editable
              onEdit={() => startEdit("park_location", user?.park_location || "")}
              textColor={textColor}
              subColor={subColor}
              borderColor="transparent"
            />
          </View>
        )}

        {/* Passenger emergency contacts */}
        {user?.role === "passenger" && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.cardTitle, { color: textColor }]}>
              Emergency Contacts
            </Text>
            {((user as any)?.emergency_contacts as EmergencyContact[] || []).map(
              (c, idx) => (
                <View
                  key={idx}
                  style={[styles.contactRow, { borderBottomColor: borderColor }]}
                >
                  <View style={[styles.contactAvatar, { backgroundColor: Colors.primaryLight }]}>
                    <Text style={[styles.contactInitial, { color: Colors.primary }]}>
                      {c.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.contactName, { color: textColor }]}>{c.name}</Text>
                    <Text style={[styles.contactPhone, { color: subColor }]}>{c.phone}</Text>
                  </View>
                  <Pressable onPress={() => removeContact(idx)} hitSlop={8}>
                    <Ionicons name="close-circle-outline" size={20} color={Colors.error} />
                  </Pressable>
                </View>
              )
            )}

            {/* Add contact */}
            <View style={styles.addContactRow}>
              <TextInput
                style={[styles.addInput, { backgroundColor: isDark ? "#0D1117" : "#F4F6FA", color: textColor, borderColor }]}
                placeholder="Name"
                placeholderTextColor={subColor}
                value={newContactName}
                onChangeText={setNewContactName}
              />
              <TextInput
                style={[styles.addInput, { flex: 1.5, backgroundColor: isDark ? "#0D1117" : "#F4F6FA", color: textColor, borderColor }]}
                placeholder="Phone"
                placeholderTextColor={subColor}
                keyboardType="phone-pad"
                value={newContactPhone}
                onChangeText={setNewContactPhone}
              />
              <Pressable
                style={[styles.addBtn, { backgroundColor: Colors.primary }]}
                onPress={addEmergencyContact}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}

        {/* Sign out */}
        <Pressable
          style={[styles.signOutBtn, { borderColor: Colors.error + "40" }]}
          onPress={() => {
            Alert.alert("Sign Out", "Are you sure?", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Sign Out",
                style: "destructive",
                onPress: async () => {
                  const { signOut } = await import("@/src/services/supabase");
                  const { logout } = useAuthStore.getState();
                  await signOut();
                  logout();
                  router.replace("/(auth)/login");
                },
              },
            ]);
          }}
        >
          <Ionicons name="log-out-outline" size={18} color={Colors.error} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>

      {/* Edit modal */}
      {editField && (
        <View style={styles.editOverlay}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setEditField(null)}
          />
          <View style={[styles.editSheet, { backgroundColor: cardBg }]}>
            <Text style={[styles.editTitle, { color: textColor }]}>
              Edit {editField.replace("_", " ")}
            </Text>
            <TextInput
              style={[styles.editInput, { color: textColor, borderColor, backgroundColor: isDark ? "#0D1117" : "#F4F6FA" }]}
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
              onSubmitEditing={saveEdit}
            />
            <View style={styles.editActions}>
              <Pressable
                style={[styles.editCancelBtn, { borderColor }]}
                onPress={() => setEditField(null)}
              >
                <Text style={[styles.editCancelText, { color: subColor }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.editSaveBtn, { backgroundColor: Colors.primary }]}
                onPress={saveEdit}
                disabled={saving}
              >
                <Text style={styles.editSaveText}>
                  {saving ? "Saving..." : "Save"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 8,
  },
  heroTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "rgba(255,255,255,0.7)",
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  avatarWrap: { position: "relative" },
  cameraBtn: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  heroName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: "#fff",
    marginTop: 4,
  },
  roleBadge: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  roleText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
  },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 32 },
  card: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    marginBottom: 4,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  contactAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  contactInitial: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
  },
  contactName: { fontFamily: "Poppins_500Medium", fontSize: 14 },
  contactPhone: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  addContactRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    alignItems: "center",
  },
  addInput: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    borderWidth: 1,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 4,
  },
  signOutText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.error,
  },
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
    zIndex: 200,
  },
  editSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },
  editTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    textTransform: "capitalize",
  },
  editInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
  },
  editActions: { flexDirection: "row", gap: 12 },
  editCancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  editCancelText: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  editSaveBtn: {
    flex: 2,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  editSaveText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
});