import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { supabase } from "@/src/services/supabase";
import { Colors } from "@/constants/colors";
import Avatar from "@/components/Avatar";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { TripsStorage } from "@/src/services/storage";
import {
  UserIcon,
  Mail01Icon,
  CallIcon,
  CarIcon,
  BuildingIcon,
  LocationIcon,
  LogoutIcon,
  AddCircleIcon,
  Close,
  Camera01Icon,
  QrCode01Icon,
  CheckmarkBadge01Icon,
  Trophy,
  Wallet,
  Star,
  ChevronDown,
  Search02Icon,
  ChevronRight,
  Copy01Icon,
  Car01Icon,
  PencilLine,
  Save,
  Tick,
  Tick02FreeIcons,
  Hospital,
} from "@hugeicons/core-free-icons";
import type { EmergencyContact, Trip } from "@/src/models/types";
import { StatusBar } from "expo-status-bar";
import PassengerDashboard from "../(passenger)";
import DriverDashboard from "../(driver)";
import QuickReceiveModal from "@/components/quickrecieveModal";
import StatPill from "@/components/StatPill";

import {
  formatNaira,
  coinsToNaira,
} from "@/src/utils/helpers";
import BalanceCard from "@/components/BalanceCard";

import FindDriverModal from "@/components/FindDriverModal";

// Slide-in "Copied" toast, shared via context so every copy action triggers it.
const CopyToastContext = React.createContext<() => void>(() => {});

function CopyToast({ nonce }: { nonce: number }) {
  const insets = useSafeAreaInsets();
  const ty = useSharedValue(-160);
  const op = useSharedValue(0);

  useEffect(() => {
    if (nonce === 0) return;
    ty.value = withSpring(0, { damping: 18, stiffness: 220 });
    op.value = withTiming(1, { duration: 150 });
    const t = setTimeout(() => {
      ty.value = withTiming(-160, { duration: 260 });
      op.value = withTiming(0, { duration: 260 });
    }, 1600);
    return () => clearTimeout(t);
  }, [nonce, ty, op]);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
    opacity: op.value,
  }));

  return (
    <Animated.View pointerEvents="none" style={[toastStyles.wrap, { top: insets.top + 10 }, aStyle]}>
      <View style={toastStyles.pill}>
        <HugeiconsIcon icon={CheckmarkBadge01Icon as any} size={18} color="#fff" />
        <Text style={toastStyles.text}>Copied successfully ✅</Text>
      </View>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  text: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#fff" },
});

// Reusable InfoRow with Hugeicons
function InfoRow({
  icon,
  label,
  value,
  editable,
  onEdit,
  textColor,
  subTextColor,
  borderColor,
}: {
  icon: any;
  label: string;
  value: string;
  editable?: boolean;
  onEdit?: () => void;
  textColor: string;
  subTextColor: string;
  borderColor: string;
}) {
  const showCopied = React.useContext(CopyToastContext);
  const handleCopy = async () => {
    if (value) {
      await Clipboard.setStringAsync(value);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showCopied();
    }
  };

  return (
    <View style={[infoStyles.row, { borderBottomColor: borderColor }]}>
      <View style={[infoStyles.iconBox]}>
        <HugeiconsIcon icon={icon} size={20} color={textColor} />
      </View>
      <View style={infoStyles.textBlock}>
        <Text style={[infoStyles.label, { color: textColor }]}>{label}</Text>
        <Text style={[infoStyles.value, { color: subTextColor }]} numberOfLines={1}>
          {value || "- -"}
        </Text>
      </View>
      {editable && (
        <View style={{ flexDirection: "row", gap: 20, alignItems: "center" }}>
          <Pressable onPress={handleCopy} hitSlop={12}>
            <HugeiconsIcon icon={Copy01Icon as any} size={20} color={Colors.primary} />
          </Pressable>
          <Pressable onPress={onEdit} hitSlop={12}>
            <HugeiconsIcon icon={PencilLine as any} fill={Colors.primary} size={20} color={Colors.primary} />
          </Pressable>
        </View>
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
  label: { 
    fontFamily: "Poppins_400Regular", 
    fontSize: 11, 
    textTransform: "uppercase", 
    letterSpacing: 0.5
  },
  value: { 
    fontFamily: "Poppins_500Medium", 
    fontSize: 14, 
    marginTop: 1 
  },
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
  const [parkExpanded, setParkExpanded] = useState(false);
  const [showPersonalInfo, setShowPersonalInfo] = useState(true);
  const [showDriverDetails, setShowDriverDetails] = useState(true);

  const [totalEarnedCoins, setTotalEarnedCoins] = useState(0);
  const [finderVisible, setFinderVisible] = useState(false);
  const [copyNonce, setCopyNonce] = useState(0);
  const showCopied = () => setCopyNonce((n) => n + 1);

  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : Colors.border;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? "rgba(255,255,255,0.08)" : "#FFFFFF";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";
  const modalBg = isDark ? Colors.text : Colors.textWhite;

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const [receiveVisible, setReceiveVisible] = useState(false);
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);

  useEffect(() => {
    if (!user?.id || user.role !== "driver") return;
    const loadEarnings = async () => {
      const trips = await TripsStorage.getByDriverId(user.id);
      const completed = trips.filter(t => t.status === "completed");
      const earned = completed.reduce((sum, trip) => {
        const passengerCount = 0; 
        const durationMinutes = trip.end_time
          ? (new Date(trip.end_time).getTime() - new Date(trip.start_time).getTime()) / 60000
          : 0;
        return sum + Math.round(5 + passengerCount * 2 + Math.floor(durationMinutes / 30));
      }, 0);
      setTotalEarnedCoins(earned);
    };
    loadEarnings();
  }, [user]);

  const completedTrips = recentTrips.filter((t) => t.status === "completed").length;

  useEffect(() => {
    if (!user?.id) return;
    TripsStorage.getByDriverId(user.id).then((trips) =>
      setRecentTrips(trips.slice(-5).reverse())
    );
  }, [user?.id]);

  const pickPhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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

  const handleCopy = async () => {
    if (user?.driver_id) {
      await Clipboard.setStringAsync(user?.driver_id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showCopied();
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

  const toggleSearch = () => {
    setFinderVisible(true);
  };

  return (
    <CopyToastContext.Provider value={showCopied}>
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <CopyToast nonce={copyNonce} />
      <ScrollView 
        style={styles.root} 
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <StatusBar style={isDark ? 'light' : 'dark'}  />
        <View style={ styles.mainContainer}>

          {/* Hero Section */}
          <View style={ [styles.profileHeader, { marginTop: topPadding + 25 },  ]}>
            <View style={[styles.hero]}>
              <Pressable onPress={pickPhoto} >
                <View style={styles.avatarWrap}>
                  <Avatar name={user?.full_name || "User"} photoUri={user?.profile_photo} size={58} />
                </View>
                <View style={styles.cameraBtn}>
                  <HugeiconsIcon icon={Camera01Icon} size={14} color="#fff" />
                </View>
              </Pressable>
              <View style={{alignItems: 'flex-start', justifyContent: 'flex-start', gap: 3 }}>
                <Text style={[styles.heroName, {color: textColor} ]}>{user?.full_name || "No user"}</Text>
                <View style={styles.roleBadge}>

                  <Text style={styles.roleText}>
                    {user?.role === "driver" ? (
                      <View>
                        {user?.driver_id && (
                          <View style={styles.driverIdChip}>
                            <Text style={styles.driverIdText}>@ {user.driver_id}</Text>
                          </View>
                        )}
                      </View>
                    ) : user?.role === "park_owner" ? "Park Owner" : (
                      <View style={ styles.roleContainer}>
                          <Text style={ [{color: Colors.gold} ]}>@ username</Text>
                      </View>
                    )}
                  </Text>
                  <Pressable style={styles.copyIcon} onPress={handleCopy} hitSlop={912}>
                      <HugeiconsIcon icon={Copy01Icon as any} size={14} color={Colors.warning} />
                  </Pressable>
                </View>
              </View>
            </View>

            {/*  */}
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 15,  padding: 10, paddingTop:0, alignSelf:'flex-end'}}>
              {/* Sign Out Button */}
              <Pressable
                  style={[
                    styles.menuList,
                    {
                      backgroundColor: isDark
                        ? Colors.overlayLight
                        : Colors.textWhite,
                      borderColor,
                    },
                  ]}
              >
                <Pressable onPress={toggleSearch}>
                  <HugeiconsIcon icon={Search02Icon} size={21} color={textColor} />
                </Pressable>

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
                  }}>
                  <HugeiconsIcon icon={LogoutIcon} size={21} color={textColor} />
                </Pressable>
              </Pressable>

              {user?.role === "driver" && (
                <Pressable onPress={() => setReceiveVisible(true)}>
                  <HugeiconsIcon icon={QrCode01Icon} size={23} color={textColor} />
                </Pressable>
              )}
            </View>
          </View>


          <View style={styles.scrollContent}>






            { user?.role === "driver" ?
              (
                <View style={[styles.coinbalanceSection, { backgroundColor: cardBg }]}>
                    <DriverDashboard />
                </View>
              )
              : user?.role === "passenger" ? (
                  <View style={[styles.coinbalanceSection, { backgroundColor: cardBg }]}>
                    <PassengerDashboard />
                  </View>
              ) : (
                  <View style={[styles.coinbalanceSection, { backgroundColor: cardBg }]}>
                    <BalanceCard
                      coins={totalEarnedCoins}
                      onQuickTransferPress={() => { }}
                    />
                  </View>
            )}

            {/* ── Earnings summary strip ── */}
            {user?.role === "driver" && (
              <View style={styles.statsStrip}>
                <View style={[ styles.statInner ]}>
                  <StatPill
                    iconName={CheckmarkBadge01Icon}
                    label="Trips"
                    value={recentTrips.length.toString()}
                    color={textColor}
                  />
                  <StatPill
                    iconName={Trophy}
                    label="Completed"
                    value={completedTrips.toString()}
                    color={textColor}
                  />
                </View>

                <View style={[ styles.statInner ]}>
                  <StatPill
                    iconName={ Wallet}
                    label="Earned"
                    value={formatNaira(coinsToNaira(totalEarnedCoins))}
                    color={textColor}
                  />
                  <StatPill
                    iconName={Star}
                    label="Rating"
                    value={user?.avg_rating ? user.avg_rating.toFixed(1) : "—"}
                    color={textColor}
                  />
                </View>
              </View>
            )}
          
            {/* Personal Information */}
            <View style={[styles.card, styles.cardSub, { backgroundColor: cardBg }]}>
              <Pressable style={{
                flexDirection: 'row', 
                alignItems:'flex-start', 
                flex: 1, 
                justifyContent: 'space-between'
              }} 
                onPress={() =>  setShowPersonalInfo(v => !v)} hitSlop={8}
              >
                <View style={{flexDirection: 'row', gap: 10, marginHorizontal: 7}}>
                  <HugeiconsIcon icon={UserIcon} size={20} color={textColor} />
                  <Text style={[styles.cardTitle, { color: textColor }]}>Personal Information</Text>
                </View>
                <HugeiconsIcon icon={showPersonalInfo ? ChevronRight : ChevronDown} size={22} color={textColor}/>
              </Pressable>

              {showPersonalInfo && (
                <View>
                  {/* <InfoRow
                    icon={UserIcon}
                    label="Full Name"
                    value={user?.full_name || ""}
                    editable
                    onEdit={() => startEdit("full_name", user?.full_name || "")}
                    textColor={textColor}
                    subTextColor={subTextColor}
                    borderColor={borderColor}
                  /> */}
                  <InfoRow
                    icon={Mail01Icon}
                    label="Email"
                    value={user?.email || ""}
                    textColor={textColor}
                    subTextColor={subTextColor}
                    borderColor={borderColor}
                  />
                  <InfoRow
                    icon={CallIcon}
                    label="Phone"
                    value={user?.phone || ""}
                    editable
                    onEdit={() => startEdit("phone", user?.phone || "")}
                    textColor={textColor}
                    subTextColor={subTextColor}
                    borderColor="transparent"
                  />
                  {/* <InfoRow
                    icon={CalendarIcon}
                    label="Age"
                    value={user?.age?.toString() || ""}
                    textColor={textColor}
                    subTextColor={subTextColor}
                    borderColor="transparent"
                  /> */}
                </View>
              )}
            </View>

            {/* Driver Details */}
            {user?.role === "driver" && (
              <View>
                <View style={[styles.card, styles.cardSub, { backgroundColor: cardBg }]}>
                  <Pressable style={{
                    flexDirection: 'row', 
                    alignItems:'flex-start', 
                    flex: 1, 
                    justifyContent: 'space-between'
                  }} 
                    onPress={() => setShowDriverDetails(v => !v)} hitSlop={8}
                  >
                    <View style={{flexDirection: 'row', gap: 10, marginHorizontal: 7}}>
                      <HugeiconsIcon icon={Car01Icon} size={20} color={textColor} />
                      <Text style={[styles.cardTitle, { color: textColor }]}>Driver Details</Text>
                    </View>
                    <HugeiconsIcon icon={showDriverDetails ? ChevronRight : ChevronDown} size={22} color={textColor}/>
                  </Pressable>

                  {showDriverDetails && (
                    <View>
                      {/* <InfoRow
                        icon={IdentityCardIcon}
                        label="Driver ID"
                        value={user?.driver_id || ""}
                        textColor={textColor}
                        subTextColor={subTextColor}
                        borderColor={borderColor}
                      /> */}
                      <InfoRow
                        icon={CarIcon}
                        label="Vehicle"
                        value={user?.vehicle_details || ""}
                        editable
                        onEdit={() => startEdit("vehicle_details", user?.vehicle_details || "")}
                        textColor={textColor}
                        subTextColor={subTextColor}
                        borderColor={borderColor}
                      />
                      <InfoRow
                        icon={BuildingIcon}
                        label="Park Name"
                        value={user?.park_name || ""}
                        editable
                        onEdit={() => startEdit("park_name", user?.park_name || "")}
                        textColor={textColor}
                        subTextColor={subTextColor}
                        borderColor={borderColor}
                      />
                      <InfoRow
                        icon={LocationIcon}
                        label="Park Location"
                        value={user?.park_location || ""}
                        editable
                        onEdit={() => startEdit("park_location", user?.park_location || "")}
                        textColor={textColor}
                        subTextColor={subTextColor}
                        borderColor="transparent"
                      />
                    </View>
                    )}
                </View>
              </View>
            )}

            {/* Park Owner Details */}
            {user?.role === "park_owner" && (
              <View>
                <View style={[styles.card, styles.cardSub, { backgroundColor: cardBg }]}>
                  <Pressable style={{
                    flexDirection: 'row', 
                    alignItems:'flex-start', 
                    flex: 1, 
                    justifyContent: 'space-between'
                  }} 
                    onPress={() => setParkExpanded((v) => !v)} hitSlop={8}
                  > 
                    <Text style={[styles.cardTitle, { color: textColor }]}>Park Details</Text>
                    <HugeiconsIcon icon={parkExpanded ? ChevronRight : ChevronDown} size={22} color={textColor}/>
                  </Pressable>

                  {parkExpanded ? (
                    <View>
                      <InfoRow
                        icon={BuildingIcon}
                        label="Park Name"
                        value={user?.park_name || ""}
                        editable
                        onEdit={() => startEdit("park_name", user?.park_name || "")}
                        textColor={textColor}
                        subTextColor={subTextColor}
                        borderColor={borderColor}
                      />
                      <InfoRow
                        icon={LocationIcon}
                        label="Park Location"
                        value={user?.park_location || ""}
                        editable
                        onEdit={() => startEdit("park_location", user?.park_location || "")}
                        textColor={textColor}
                        subTextColor={subTextColor}
                        borderColor="transparent"
                      />
                    </View>
                      ) : (
                    <></>
                  )}
                </View>
              </View>
            )}

            {/* Emergency Contacts (Passenger) */}
            {!user?.role && (
              <View>
                <View style={[styles.card, { backgroundColor: cardBg }]}>
                  <View style={{flexDirection: 'row', gap: 10, marginHorizontal: 7}}>
                    <HugeiconsIcon icon={Hospital} size={20} color={ textColor } />
                    <Text style={[styles.cardTitle, { color: textColor }]}>Emergency Contacts</Text>
                  </View>
                  {((user as any)?.emergency_contacts as EmergencyContact[] || []).map((c, idx) => (
                    <View key={idx} style={[styles.contactRow, { borderBottomColor: borderColor }]}>
                      <View style={[styles.contactAvatar, { backgroundColor: Colors.primaryLight }]}>
                        <Text style={[styles.contactInitial, { color: Colors.primary }]}>{c.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.contactName, { color: textColor }]}>{c.name}</Text>
                        <Text style={[styles.contactPhone, { color: subTextColor }]}>{c.phone}</Text>
                      </View>
                      <Pressable onPress={() => removeContact(idx)} hitSlop={8}>
                        <HugeiconsIcon icon={Close} size={20} color={Colors.error} />
                      </Pressable>
                    </View>
                  ))}
                  <View style={styles.addContactRow}>
                    <TextInput
                      style={[styles.addInput, { backgroundColor: cardBg, color: textColor }]}
                      placeholder="Name"
                      placeholderTextColor={subTextColor}
                      value={newContactName}
                      onChangeText={setNewContactName}
                    />
                    <TextInput
                      style={[styles.addInput, { flex: 1.5, backgroundColor: cardBg, color: textColor }]}
                      placeholder="Phone"
                      placeholderTextColor={subTextColor}
                      keyboardType="phone-pad"
                      value={newContactPhone}
                      onChangeText={setNewContactPhone}
                    />
                    <Pressable style={[styles.addBtn, { backgroundColor: Colors.primary }]} onPress={addEmergencyContact}>
                      <HugeiconsIcon icon={AddCircleIcon as any} size={30} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Edit Modal Sheet with Smooth Slide Animation */}
      <Modal visible={!!editField} transparent animationType="slide" onRequestClose={() => setEditField(null)}>
        <KeyboardAvoidingView 
          style={styles.editOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setEditField(null)} />
          <View style={[styles.editSheet, { backgroundColor: modalBg }]}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
              <Text style={[styles.editTitle, { color: textColor }]}>Edit {editField?.replace("_", " ")}</Text>
              <View style={styles.editActions}>
                <Pressable style={[styles.editCancelBtn, { borderColor: Colors.error }]} onPress={() => setEditField(null)}>
                  {/* <Text style={[styles.editCancelText, { color: Colors.error  }]}>Cancel</Text> */}
                      <HugeiconsIcon icon={Close} size={20} color={Colors.error} />
                </Pressable>
                <Pressable style={[styles.editSaveBtn, { backgroundColor: Colors.primary }]} onPress={saveEdit} disabled={saving}>
                  {saving ?
                    (<>
                      <Text style={[styles.editSaveText, { color: '#fff' }]}>{saving ? "Saving..." : "Save"}</Text>
                    </>)
                  :
                    (<>
                      <HugeiconsIcon icon={Tick02FreeIcons} size={20} color={"#fff"} />
                    </>)
                   }
                </Pressable>
              </View>
            </View>
            <TextInput
              style={[styles.editInput, { color: textColor, borderColor, backgroundColor: borderColor }]}
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
              onSubmitEditing={saveEdit}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <FindDriverModal
        visible={finderVisible}
        onClose={() => setFinderVisible(false)}
      />

      <QuickReceiveModal
        visible={receiveVisible}
        onClose={() => setReceiveVisible(false)}
        driverId={user?.driver_id}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    marginHorizontal: 5,
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // marginTop: 50,
  },
  mainContainer: {
    paddingHorizontal: 8,
    justifyContent: 'space-between'
  },
  hero: {
    flexDirection: 'row',
    paddingHorizontal: 0,
    gap: 5,
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
    bottom: 5,
    right: 1,
    width: 23,
    height: 23,
    borderRadius: 13,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  heroName: { 
    fontFamily: "Poppins_700Bold", 
    fontSize: 22,
    alignSelf:'flex-start'
  },
  roleBadge: { 
    alignItems: 'center', 
    // marginTop: 2, 
    flexDirection: 'row',
    gap: 5,
  },
  roleText: {
    fontFamily: "Poppins_600SemiBold", 
    fontSize: 12, 
    color: Colors.gold,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 20, 
    alignItems: 'center',
    backgroundColor: Colors.primaryDarker,
  },
  copyIcon: {
    borderRadius: 50, 
    alignItems: 'center', 
    marginTop: 2, 
    backgroundColor: Colors.primaryDarker, 
    padding: 8
  },
  driverIdChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 10,
    // paddingVertical: 4,
    marginVertical: 2,
    borderColor: Colors.textSecondary,
  },
  driverIdText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.gold,
    letterSpacing: 1.2,
  },
  roleContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4
  },
  scrollContent: {
    paddingBottom: 132,
    paddingHorizontal: 0, marginTop: 50,
    flex: 1, flexDirection:'column'
  },
  coinbalanceSection: {
    padding: 20,
    borderRadius: 30,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 0,
    elevation: 2,
  },
  statsStrip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 30,
    paddingVertical: 14,
    flexWrap: 'wrap',
    shadowColor: "#000",
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 0,
    elevation: 2,
  },
  statInner: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 25,
    borderRadius: 30,
    padding: 20
  },
  statsDivider: { width: 12, height: 32, padding:30, backgroundColor: Colors.primary },
  card: {
    borderRadius: 30,
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 0,
    elevation: 2,
    marginBottom: 10,
    marginTop: 5
  },
  cardTitle: { 
    fontFamily: "Poppins_600SemiBold", 
    fontSize: 14, 
    textAlign:'left' 
  },
  cardSub: {
    gap: 20
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  contactAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  contactInitial: { fontFamily: "Poppins_700Bold", fontSize: 15 },
  contactName: { fontFamily: "Poppins_500Medium", fontSize: 14 },
  contactPhone: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  addContactRow: { flexDirection: "row", gap: 8, marginTop: 12, alignItems: "center" },
  addInput: { flex: 1, borderRadius: 30, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Poppins_400Regular", fontSize: 13 },
  addBtn: { width: 40, height: 40, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  signOutBtn: { flexDirection: "column", alignItems: "center", justifyContent: "space-between",},
  signOutText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.error },
  menuList: {
    borderRadius: 30,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 30,
    borderWidth: 1,
  },
  editOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0 0 0 / 0.77)", justifyContent: "flex-end", zIndex: 200, },
  editSheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 34, paddingBottom: 190, gap: 16, top: 100 },
  editTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, textTransform: "capitalize", alignSelf: 'flex-end' },
  editInput: { borderWidth: .5, borderRadius: 54, paddingHorizontal: 14, paddingVertical: 13, fontFamily: "Poppins_400Regular", fontSize: 15 },
  editActions: { flexDirection: "row", gap: 12, justifyContent: 'center' },
  editCancelBtn: { borderWidth: .5, borderRadius: 54, padding: 13, alignItems: "center" },
  editCancelText: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  editSaveBtn: { borderRadius: 54, padding: 13, alignItems: "center" },
  editSaveText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.primary },
});