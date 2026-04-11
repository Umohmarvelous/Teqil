import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  Platform, Alert, Animated, Easing, KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuthStore, useTripStore } from "@/src/store/useStore";
import { TripsStorage, PassengersStorage } from "@/src/services/storage";
import { syncAll } from "@/src/services/sync";
import { generateId } from "@/src/utils/helpers";
import type { Trip, Passenger, EmergencyContact } from "@/src/models/types";
import { useTranslation } from "react-i18next";
import { Colors } from "@/constants/colors";


// ─── Entrance animation hook ───────────────────────────────────────────────────
function useEntrance(delay = 0) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 480, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 480, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);
  return { opacity, transform: [{ translateY }] };
}

// ─── Join button ───────────────────────────────────────────────────────────────
function JoinButton({ onPress, label, loading }: { onPress: () => void; label: string; loading: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50 }).start();
  const handlePressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}
        disabled={loading} style={[styles.joinBtn, loading && styles.joinBtnDisabled]}>
        <View style={styles.joinBtnGlow} />
        <Ionicons name="car" size={20} color={Colors.textWhite} />
        <Text style={styles.joinBtnText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Contact chip ──────────────────────────────────────────────────────────────
function ContactChip({ contact, onRemove }: { contact: EmergencyContact; onRemove: () => void }) {
  return (
    <View style={styles.chip}>
      <View style={styles.chipAvatar}>
        <Text style={styles.chipAvatarText}>{contact.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.chipInfo}>
        <Text style={styles.chipName} numberOfLines={1}>{contact.name}</Text>
        <Text style={styles.chipPhone} numberOfLines={1}>{contact.phone}</Text>
      </View>
      <Pressable onPress={onRemove} hitSlop={8} style={styles.chipRemove}>
        <Ionicons name="close" size={14} color={Colors.textSecondary} />
      </Pressable>
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function FindTripScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { setActiveTrip } = useTripStore();
  const { t } = useTranslation();

  const [code, setCode] = useState("");
  const [foundTrip, setFoundTrip] = useState<Trip | null>(null);
  const [destination, setDestination] = useState("");
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [step, setStep] = useState<"search" | "details">("search");

  const searchAnim = useEntrance(80);
  const detailsAnim = useEntrance(0);

  const handleSearch = async () => {
    if (!code.trim() || code.trim().length !== 6) {
      Alert.alert("Invalid Code", "Please enter a valid 6-character trip code.");
      return;
    }
    setIsSearching(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const trip = await TripsStorage.getByCode(code.trim().toUpperCase());
      if (!trip) { Alert.alert("Trip Not Found", t("passenger.tripNotFound")); return; }
      if (trip.status !== "active") { Alert.alert("Trip Ended", "This trip has already been completed."); return; }
      setFoundTrip(trip);
      setStep("details");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not search for trip.");
    } finally {
      setIsSearching(false);
    }
  };

  const addContact = () => {
    if (!contactName.trim() || !contactPhone.trim()) return;
    setContacts((prev) => [...prev, { name: contactName.trim(), phone: contactPhone.trim() }]);
    setContactName("");
    setContactPhone("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const removeContact = (idx: number) => {
    setContacts((prev) => prev.filter((_, i) => i !== idx));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleJoin = async () => {
    if (!foundTrip || !user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsJoining(true);

    const passenger: Passenger = {
      id: generateId(),
      trip_id: foundTrip.id,
      user_id: user.id,
      destination: destination.trim() || foundTrip.destination,
      status: "active",
      emergency_contacts: contacts,
      created_at: new Date().toISOString(),
      // Syncable defaults – storage.save() stamps these but TypeScript requires them.
      synced: false,
      updated_at: new Date().toISOString(),
    };

    try {
      await PassengersStorage.save(passenger);
      setActiveTrip(foundTrip);

      // Fire-and-forget sync; doesn't block navigation.
      syncAll({ id: user.id, role: user.role, park_name: user.park_name }).catch(
        () => {/* offline – will retry when back online */}
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push(`/live-trip-code/${foundTrip.trip_code}`);
    } catch {
      Alert.alert("Error", "Could not join trip. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 32 }]}>
        {step === "details" ? (
          <Pressable style={styles.backBtn} onPress={() => { setStep("search"); setFoundTrip(null); }}>
            <Ionicons name="arrow-back" size={20} color={Colors.primary} />
          </Pressable>
        ) : (
            <View style={{ width: 40 }} />
          // <Pressable style={styles.backBtn} onPress={() => { setStep("search"); setFoundTrip(null); }}>
          //   <Ionicons name="arrow-back" size={20} color={Colors.primary} />
          // </Pressable>
        )}
        <Text style={styles.headerTitle}>
          {step === "search" ? t("passenger.enterCode") : "Join Trip"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 24) + 80 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── STEP 1: Search ── */}
          {step === "search" && (
            <Animated.View style={searchAnim}>
              <View style={styles.heroRow}>
                {/* <View style={styles.heroIcon}>
                  <Ionicons name="search" size={28} color={Colors.primary} />
                </View> */}
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle}>Find Your Trip</Text>
                  <Text style={styles.heroSub}>Ask your driver for the 6-character code</Text>
                </View>
              </View>

              <View style={styles.codeCard}>
                <Text style={styles.codeLabel}>TRIP CODE</Text>
                <TextInput
                  style={styles.codeInput}
                  placeholder="A B C 1 2 3"
                  placeholderTextColor={Colors.textSecondary}
                  value={code}
                  onChangeText={(v) => setCode(v.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={6}
                  textAlign="center"
                />
                <View style={styles.codeDots}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <View key={i} style={[styles.codeDot, i < code.length && styles.codeDotFilled]} />
                  ))}
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [styles.searchBtn, pressed && { opacity: 0.85 }, isSearching && styles.searchBtnDisabled]}
                onPress={handleSearch}
                disabled={isSearching}
              >
                {isSearching ? (
                  <Text style={styles.searchBtnText}>Searching...</Text>
                ) : (
                  <>
                    <Ionicons name="search" size={18} color={Colors.textWhite} />
                    <Text style={styles.searchBtnText}>Find Trip</Text>
                  </>
                )}
              </Pressable>
              <Text style={styles.hint}>Codes are 6 characters — letters & numbers</Text>
            </Animated.View>
          )}

          {/* ── STEP 2: Details ── */}
          {step === "details" && foundTrip && (
            <Animated.View style={detailsAnim}>
              <View style={styles.tripCard}>
                <View style={styles.tripCardTop}>
                  <View style={styles.codePill}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
                    <Text style={styles.codePillText}>{foundTrip.trip_code}</Text>
                  </View>
                  <View style={styles.livePill}>
                    <View style={styles.liveDot} />
                    <Text style={styles.livePillText}>LIVE</Text>
                  </View>
                </View>

                <View style={styles.routeContainer}>
                  <View style={styles.routeLine}>
                    <View style={styles.routeDotGreen} />
                    <View style={styles.routeConnector} />
                    <View style={styles.routeDotRed} />
                  </View>
                  <View style={styles.routeLabels}>
                    <View style={styles.routeStop}>
                      <Text style={styles.routeStopLabel}>FROM</Text>
                      <Text style={styles.routeStopValue} numberOfLines={1}>{foundTrip.origin}</Text>
                    </View>
                    <View style={[styles.routeStop, { marginTop: 16 }]}>
                      <Text style={styles.routeStopLabel}>TO</Text>
                      <Text style={styles.routeStopValue} numberOfLines={1}>{foundTrip.destination}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.tripMeta}>
                  <View style={styles.tripMetaItem}>
                    <Ionicons name="people-outline" size={14} color={Colors.textSecondary} />
                    <Text style={styles.tripMetaText}>{foundTrip.capacity} seats</Text>
                  </View>
                </View>
              </View>

              {/* Your destination */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t("passenger.yourDestination")}</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="location-outline" size={18} color={Colors.textSecondary} />
                  <TextInput
                    style={styles.input}
                    placeholder={t("passenger.yourDestinationPlaceholder")}
                    placeholderTextColor={Colors.textSecondary}
                    value={destination}
                    onChangeText={setDestination}
                  />
                </View>
              </View>

              {/* Emergency contacts */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t("passenger.emergencyContacts")}</Text>
                <Text style={styles.sectionSub}>{`They'll be notified when your trip starts and ends`}</Text>

                {contacts.length > 0 && (
                  <View style={styles.chipList}>
                    {contacts.map((c, idx) => (
                      <ContactChip key={idx} contact={c} onRemove={() => removeContact(idx)} />
                    ))}
                  </View>
                )}

                <View style={styles.addContactCard}>
                  <TextInput
                    style={styles.addInput}
                    placeholder={t("passenger.contactName")}
                    placeholderTextColor={Colors.textSecondary}
                    value={contactName}
                    onChangeText={setContactName}
                  />
                  <View style={styles.addDivider} />
                  <TextInput
                    style={[styles.addInput, { flex: 1.4 }]}
                    placeholder="+234 ..."
                    placeholderTextColor={Colors.textSecondary}
                    keyboardType="phone-pad"
                    value={contactPhone}
                    onChangeText={setContactPhone}
                  />
                  <Pressable style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.75 }]} onPress={addContact}>
                    <Ionicons name="add" size={20} color={Colors.textWhite} />
                  </Pressable>
                </View>
              </View>

              {/* Join button */}
              <View style={styles.joinSection}>
                <JoinButton
                  onPress={handleJoin}
                  label={isJoining ? t("passenger.joining") : t("passenger.joinTrip")}
                  loading={isJoining}
                />
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text, letterSpacing: 0.2 },
  scroll: { flex: 1, },
  scrollContent: { padding: 20, gap: 0, flex:1, alignItems: 'center', justifyContent: 'center' },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 28 },
  heroIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: Colors.primaryDark, borderWidth: 1, borderColor: "rgba(0,166,81,0.25)", alignItems: "center", justifyContent: "center" },
  heroTitle: { fontFamily: "Poppins_700Bold", fontSize: 22, color: Colors.text, textAlign: 'center' },
  heroSub: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2, lineHeight: 20, textAlign: 'center' },
  codeCard: { backgroundColor: Colors.text, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, padding: 28, alignItems: "center", marginBottom: 16 },
  codeLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: Colors.textSecondary, letterSpacing: 3, marginBottom: 16 },
  codeInput: { fontFamily: "Poppins_700Bold", fontSize: 36, color: Colors.primary, letterSpacing: 16, textAlign: "center", paddingHorizontal: 8, minWidth: 200 },
  codeDots: { flexDirection: "row", gap: 8, marginTop: 16 },
  codeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  codeDotFilled: { backgroundColor: Colors.primary },
  searchBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: Colors.primary, borderRadius: 16, height: 56, marginBottom: 14, },
  searchBtnDisabled: { opacity: 0.6 },
  searchBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.textWhite },
  hint: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "center", lineHeight: 18 },
  tripCard: { backgroundColor: Colors.text, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, padding: 20, marginBottom: 16, overflow: "hidden" },
  tripCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  codePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,166,81,0.1)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(0,166,81,0.2)" },
  codePillText: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.primary, letterSpacing: 2 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.error },
  livePillText: { fontFamily: "Poppins_700Bold", fontSize: 10, color: Colors.error, letterSpacing: 1.5 },
  routeContainer: { flexDirection: "row", gap: 14, marginBottom: 18 },
  routeLine: { alignItems: "center", paddingTop: 20, gap: 0 },
  routeDotGreen: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary, borderWidth: 2, borderColor: "rgba(0,166,81,0.3)" },
  routeConnector: { width: 2, height: 32, backgroundColor: Colors.border, marginVertical: 3 },
  routeDotRed: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.error, borderWidth: 2, borderColor: "rgba(239,68,68,0.3)" },
  routeLabels: { flex: 1 },
  routeStop: {},
  routeStopLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 9, color: Colors.textSecondary, letterSpacing: 2, marginBottom: 2 },
  routeStopValue: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text, lineHeight: 22 },
  tripMeta: { flexDirection: "row", gap: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  tripMetaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  tripMetaText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary },
  section: { marginBottom: 20 },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text, marginBottom: 4, letterSpacing: 0.2 },
  sectionSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 12 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.text, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16, paddingVertical: 14 },
  input: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text },
  chipList: { gap: 8, marginBottom: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.text, borderRadius: 12, borderWidth: 1, borderColor: Colors.text, paddingHorizontal: 12, paddingVertical: 10 },
  chipAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,166,81,0.15)", borderWidth: 1, borderColor: "rgba(0,166,81,0.25)", alignItems: "center", justifyContent: "center" },
  chipAvatarText: { fontFamily: "Poppins_700Bold", fontSize: 13, color: Colors.primary },
  chipInfo: { flex: 1 },
  chipName: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  chipPhone: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  chipRemove: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.border, alignItems: "center", justifyContent: "center" },
  addContactCard: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.text, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: "hidden", paddingLeft: 14 },
  addInput: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.text, paddingVertical: 13, minWidth: 0 },
  addDivider: { width: 1, height: 28, backgroundColor: Colors.border, marginHorizontal: 10 },
  addBtn: { width: 46, height: 46, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", margin: 4, borderRadius: 10 },
  joinSection: { marginTop: 8 },
  joinBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: Colors.primary, borderRadius: 18, height: 60, overflow: "hidden", shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10 },
  joinBtnDisabled: { opacity: 0.55 },
  joinBtnGlow: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.06)" },
  joinBtnText: { fontFamily: "Poppins_700Bold", fontSize: 17, color: Colors.textWhite, letterSpacing: 0.5 },
});