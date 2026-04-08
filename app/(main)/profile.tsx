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
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { supabase } from "@/src/services/supabase";
import { Colors } from "@/constants/colors";
import Avatar from "@/components/Avatar";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  UserIcon,
  Mail01Icon,
  CallIcon,
  CalendarIcon,
  CarIcon,
  BuildingIcon,
  LocationIcon,
  LogoutIcon,
  CameraIcon,
  AddCircleIcon,
  Edit,
  IdentityCardIcon,
  Close,
  Camera01Icon,
  Camera02Icon,
  Search01Icon,
  QrCode01Icon,
} from "@hugeicons/core-free-icons";
import type { EmergencyContact } from "@/src/models/types";
import { ca } from "zod/v4/locales";

// Reusable InfoRow with Hugeicons
function InfoRow({
  icon,
  label,
  value,
  editable,
  onEdit,
  textColor,
  subColor,
  borderColor,
}: {
  icon: any;
  label: string;
  value: string;
  editable?: boolean;
  onEdit?: () => void;
  textColor: string;
  subColor: string;
  borderColor: string;
}) {
  return (
    <View style={[infoStyles.row, { borderBottomColor: borderColor }]}>
      <View style={[infoStyles.iconBox]}>
        <HugeiconsIcon icon={icon} size={20} color={Colors.primary} />
      </View>
      <View style={infoStyles.textBlock}>
        <Text style={[infoStyles.label, { color: subColor }]}>{label}</Text>
        <Text style={[infoStyles.value, { color: textColor }]} numberOfLines={1}>
          {value || "—"}
        </Text>
      </View>
      {editable && (
        <Pressable onPress={onEdit} hitSlop={8}>
          <HugeiconsIcon icon={ Edit} size={18} color={Colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
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
  const bg = isDark ? "#000" : "#F8F9FC";
  const cardBg = isDark ? "#13131390" : "#FFFFFF";
  const textColor = isDark ? Colors.primary : Colors.primaryDark;
  const subColor = isDark ? "#9CA3AF" : "#6B7280";
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
    <ScrollView style={[styles.root, { backgroundColor: bg }]}>
      {/* Hero Section */}
      <View style={ [styles.profileHeader, { marginTop: topPadding + 16 }]}>
        <Pressable>
          <HugeiconsIcon icon={Search01Icon} size={24} color={ Colors.primary } />
        </Pressable>
        <Pressable>
          <HugeiconsIcon icon={QrCode01Icon} size={24} color={ Colors.primary } />
        </Pressable>
      </View>
      <View style={[styles.hero]}>
        <Pressable onPress={pickPhoto} style={styles.avatarWrap}>
          <Avatar name={user?.full_name || "User"} photoUri={user?.profile_photo} size={98} />
          <View style={styles.cameraBtn}>
            <HugeiconsIcon icon={Camera01Icon} size={14} color="#fff" />
          </View>
        </Pressable>
        <Text style={[styles.heroName, {color: subColor} ]}>{user?.full_name || "Teqil User"}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>
            {user?.role === "driver" ? "Driver" : user?.role === "park_owner" ? "Park Owner" : "Passenger"}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Personal Information */}
        <Text style={[styles.cardTitle, { color: textColor }]}>Personal Information</Text>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <InfoRow
            icon={UserIcon}
            label="Full Name"
            value={user?.full_name || ""}
            editable
            onEdit={() => startEdit("full_name", user?.full_name || "")}
            textColor={textColor}
            subColor={subColor}
            borderColor={borderColor}
          />
          <InfoRow
            icon={Mail01Icon}
            label="Email"
            value={user?.email || ""}
            textColor={textColor}
            subColor={subColor}
            borderColor={borderColor}
          />
          <InfoRow
            icon={CallIcon}
            label="Phone"
            value={user?.phone || ""}
            editable
            onEdit={() => startEdit("phone", user?.phone || "")}
            textColor={textColor}
            subColor={subColor}
            borderColor={borderColor}
          />
          <InfoRow
            icon={CalendarIcon}
            label="Age"
            value={user?.age?.toString() || ""}
            textColor={textColor}
            subColor={subColor}
            borderColor="transparent"
          />
        </View>

        {/* Driver Details */}
        {user?.role === "driver" && (
          <View>
            <Text style={[styles.cardTitle, { color: textColor }]}>Driver Details</Text>
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <InfoRow
                icon={IdentityCardIcon}
                label="Driver ID"
                value={user?.driver_id || ""}
                textColor={textColor}
                subColor={subColor}
                borderColor={borderColor}
              />
              <InfoRow
                icon={CarIcon}
                label="Vehicle"
                value={user?.vehicle_details || ""}
                editable
                onEdit={() => startEdit("vehicle_details", user?.vehicle_details || "")}
                textColor={textColor}
                subColor={subColor}
                borderColor={borderColor}
              />
              <InfoRow
                icon={BuildingIcon}
                label="Park Name"
                value={user?.park_name || ""}
                editable
                onEdit={() => startEdit("park_name", user?.park_name || "")}
                textColor={textColor}
                subColor={subColor}
                borderColor={borderColor}
              />
              <InfoRow
                icon={LocationIcon}
                label="Park Location"
                value={user?.park_location || ""}
                editable
                onEdit={() => startEdit("park_location", user?.park_location || "")}
                textColor={textColor}
                subColor={subColor}
                borderColor="transparent"
              />
            </View>
          </View>
        )}

        {/* Park Owner Details */}
        {user?.role === "park_owner" && (
          <View>
            <Text style={[styles.cardTitle, { color: textColor }]}>Park Details</Text>
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <InfoRow
                icon={BuildingIcon}
                label="Park Name"
                value={user?.park_name || ""}
                editable
                onEdit={() => startEdit("park_name", user?.park_name || "")}
                textColor={textColor}
                subColor={subColor}
                borderColor={borderColor}
              />
              <InfoRow
                icon={LocationIcon}
                label="Park Location"
                value={user?.park_location || ""}
                editable
                onEdit={() => startEdit("park_location", user?.park_location || "")}
                textColor={textColor}
                subColor={subColor}
                borderColor="transparent"
              />
            </View>
          </View>
        )}

        {/* Emergency Contacts (Passenger) */}
        {user?.role === "passenger" && (
          <View>
            <Text style={[styles.cardTitle, { color: textColor }]}>Emergency Contacts</Text>
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              {((user as any)?.emergency_contacts as EmergencyContact[] || []).map((c, idx) => (
                <View key={idx} style={[styles.contactRow, { borderBottomColor: borderColor }]}>
                  <View style={[styles.contactAvatar, { backgroundColor: Colors.primaryLight }]}>
                    <Text style={[styles.contactInitial, { color: Colors.primary }]}>{c.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.contactName, { color: textColor }]}>{c.name}</Text>
                    <Text style={[styles.contactPhone, { color: subColor }]}>{c.phone}</Text>
                  </View>
                  <Pressable onPress={() => removeContact(idx)} hitSlop={8}>
                    <HugeiconsIcon icon={Close} size={20} color={Colors.error} />
                  </Pressable>
                </View>
              ))}
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
                <Pressable style={[styles.addBtn, { backgroundColor: Colors.primary }]} onPress={addEmergencyContact}>
                  <HugeiconsIcon icon={AddCircleIcon} size={20} color="#fff" />
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Sign Out Button */}
        <Pressable
          style={[styles.signOutBtn, { borderColor: "transparent" }]}
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
          <HugeiconsIcon icon={LogoutIcon} size={18} color={Colors.error} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>

      {/* Edit Modal */}
      {editField && (
        <View style={styles.editOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setEditField(null)} />
          <View style={[styles.editSheet, { backgroundColor: cardBg }]}>
            <Text style={[styles.editTitle, { color: textColor }]}>Edit {editField.replace("_", " ")}</Text>
            <TextInput
              style={[styles.editInput, { color: textColor, borderColor, backgroundColor: isDark ? "#0D1117" : "#F4F6FA" }]}
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
              onSubmitEditing={saveEdit}
            />
            <View style={styles.editActions}>
              <Pressable style={[styles.editCancelBtn, { borderColor }]} onPress={() => setEditField(null)}>
                <Text style={[styles.editCancelText, { color: subColor }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.editSaveBtn, { backgroundColor: Colors.primary }]} onPress={saveEdit} disabled={saving}>
                <Text style={styles.editSaveText}>{saving ? "Saving..." : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 10 },
  profileHeader: {
    marginTop: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 50
  },
  hero: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 8,
    // backgroundColor: Colors.primary,
  },
  avatarWrap: {
    position: "relative",
    borderWidth: 2, 
    borderRadius: 100, 
    padding: 2, 
    borderColor: Colors.primary
  },
  cameraBtn: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.overlayColored,
    alignItems: "center",
    justifyContent: "center",
    // borderWidth: .5,
    // borderColor: "#fff",
  },
  heroName: { fontFamily: "Poppins_700Bold", fontSize: 22, marginTop: 4 },
  roleBadge: { backgroundColor: Colors.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  roleText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 32 },
  card: {
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: '#fff'
    // shadowColor: "#000",
    // shadowOffset: { width: 0, height: 2 },
    // shadowOpacity: 0.05,
    // shadowRadius: 8,
    // elevation: 2,
  },
  cardTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, marginBottom: 4 },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  contactAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  contactInitial: { fontFamily: "Poppins_700Bold", fontSize: 15 },
  contactName: { fontFamily: "Poppins_500Medium", fontSize: 14 },
  contactPhone: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  addContactRow: { flexDirection: "row", gap: 8, marginTop: 12, alignItems: "center" },
  addInput: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Poppins_400Regular", fontSize: 13, borderWidth: 1 },
  addBtn: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  signOutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 4, marginTop: 44 },
  signOutText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.error },
  editOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0 0 0 / 0.77)", justifyContent: "flex-end", zIndex: 200 },
  editSheet: { borderTopLeftRadius: 54, borderTopRightRadius: 54, padding: 44, paddingBottom: 40, gap: 16 },
  editTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, textTransform: "capitalize" },
  editInput: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontFamily: "Poppins_400Regular", fontSize: 15 },
  editActions: { flexDirection: "row", gap: 12 },
  editCancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  editCancelText: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  editSaveBtn: { flex: 2, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  editSaveText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },
});