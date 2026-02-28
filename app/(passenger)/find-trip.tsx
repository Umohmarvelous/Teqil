import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { useTripStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { TripsStorage, PassengersStorage } from "@/src/services/storage";
import { generateId } from "@/src/utils/helpers";
import type { Trip, Passenger, EmergencyContact } from "@/src/models/types";
import { useTranslation } from "react-i18next";

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

  const handleSearch = async () => {
    if (!code.trim() || code.trim().length !== 6) {
      Alert.alert("Invalid Code", "Please enter a valid 6-character trip code.");
      return;
    }
    setIsSearching(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const trip = await TripsStorage.getByCode(code.trim().toUpperCase());
      if (!trip) {
        Alert.alert("Trip Not Found", t("passenger.tripNotFound"));
        return;
      }
      if (trip.status !== "active") {
        Alert.alert("Trip Ended", "This trip has already been completed.");
        return;
      }
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
  };

  const removeContact = (idx: number) => {
    setContacts((prev) => prev.filter((_, i) => i !== idx));
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
    };

    try {
      await PassengersStorage.save(passenger);
      setActiveTrip(foundTrip);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push(`/live-trip/${foundTrip.trip_code}`);
    } catch {
      Alert.alert("Error", "Could not join trip. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        {step === "details" ? (
          <Pressable style={styles.backBtn} onPress={() => { setStep("search"); setFoundTrip(null); }}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </Pressable>
        ) : <View style={{ width: 40 }} />}
        <Text style={styles.headerTitle}>
          {step === "search" ? t("passenger.enterCode") : "Join Trip"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === "search" && (
          <>
            <View style={styles.searchIllustration}>
              <View style={styles.searchIcon}>
                <Ionicons name="search" size={40} color={Colors.primary} />
              </View>
              <Text style={styles.searchTitle}>Find Your Trip</Text>
              <Text style={styles.searchSubtitle}>
                Ask your driver for the 6-character trip code
              </Text>
            </View>

            <View style={styles.codeInputContainer}>
              <TextInput
                style={styles.codeInput}
                placeholder="e.g. ABC123"
                placeholderTextColor={Colors.textTertiary}
                value={code}
                onChangeText={(v) => setCode(v.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                textAlign="center"
              />
              <Text style={styles.codeHint}>6 characters, uppercase letters and numbers</Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.searchBtn,
                pressed && styles.searchBtnPressed,
                isSearching && styles.searchBtnLoading,
              ]}
              onPress={handleSearch}
              disabled={isSearching}
            >
              <Ionicons name="search" size={20} color={Colors.surface} />
              <Text style={styles.searchBtnText}>
                {isSearching ? "Searching..." : t("trip.startTrip")}
              </Text>
            </Pressable>
          </>
        )}

        {step === "details" && foundTrip && (
          <>
            <View style={styles.tripFoundCard}>
              <View style={styles.tripFoundHeader}>
                <View style={styles.tripCodeBadge}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                  <Text style={styles.tripCodeText}>{foundTrip.trip_code}</Text>
                </View>
                <Text style={styles.tripFoundLabel}>Trip Found!</Text>
              </View>

              <View style={styles.tripRouteDisplay}>
                <View style={styles.routeItem}>
                  <View style={styles.routeDotGreen} />
                  <View>
                    <Text style={styles.routeLabel}>From</Text>
                    <Text style={styles.routeValue}>{foundTrip.origin}</Text>
                  </View>
                </View>
                <View style={styles.routeItemLine} />
                <View style={styles.routeItem}>
                  <View style={styles.routeDotRed} />
                  <View>
                    <Text style={styles.routeLabel}>To</Text>
                    <Text style={styles.routeValue}>{foundTrip.destination}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.tripMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="people-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.metaText}>{foundTrip.capacity} max seats</Text>
                </View>
              </View>
            </View>

            <View style={styles.detailsForm}>
              <Text style={styles.sectionTitle}>{t("passenger.yourDestination")}</Text>
              <View style={styles.inputRow}>
                <Ionicons name="location-outline" size={20} color={Colors.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder={t("passenger.yourDestinationPlaceholder")}
                  placeholderTextColor={Colors.textTertiary}
                  value={destination}
                  onChangeText={setDestination}
                />
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>{t("passenger.emergencyContacts")}</Text>
              <Text style={styles.contactsHint}>
                They'll be notified when your trip starts and when you arrive safely.
              </Text>

              {contacts.map((c, idx) => (
                <View key={idx} style={styles.contactChip}>
                  <Ionicons name="person" size={14} color={Colors.primary} />
                  <Text style={styles.contactChipText}>{c.name} — {c.phone}</Text>
                  <Pressable onPress={() => removeContact(idx)}>
                    <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
                  </Pressable>
                </View>
              ))}

              <View style={styles.addContactRow}>
                <TextInput
                  style={[styles.contactInput, { flex: 1 }]}
                  placeholder="Name"
                  placeholderTextColor={Colors.textTertiary}
                  value={contactName}
                  onChangeText={setContactName}
                />
                <TextInput
                  style={[styles.contactInput, { flex: 1.4 }]}
                  placeholder="+234 ..."
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="phone-pad"
                  value={contactPhone}
                  onChangeText={setContactPhone}
                />
                <Pressable style={styles.addContactBtn} onPress={addContact}>
                  <Ionicons name="add" size={22} color={Colors.surface} />
                </Pressable>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.joinBtn,
                pressed && styles.joinBtnPressed,
                isJoining && styles.joinBtnLoading,
              ]}
              onPress={handleJoin}
              disabled={isJoining}
            >
              <Ionicons name="car" size={22} color={Colors.surface} />
              <Text style={styles.joinBtnText}>
                {isJoining ? t("passenger.joining") : t("passenger.joinTrip")}
              </Text>
            </Pressable>
          </>
        )}

        <View style={{ height: 100 + (Platform.OS === "web" ? 34 : 0) }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 24 },
  searchIllustration: { alignItems: "center", paddingVertical: 32, gap: 12 },
  searchIcon: {
    width: 90,
    height: 90,
    borderRadius: 28,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  searchTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 26,
    color: Colors.text,
  },
  searchSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
  codeInputContainer: { gap: 10, marginBottom: 24 },
  codeInput: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    height: 70,
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    color: Colors.text,
    textAlign: "center",
    letterSpacing: 8,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  codeHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: "center",
  },
  searchBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  searchBtnPressed: { opacity: 0.9 },
  searchBtnLoading: { opacity: 0.7 },
  searchBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.surface,
  },
  tripFoundCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    gap: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: Colors.primaryLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  tripFoundHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tripCodeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tripCodeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: Colors.primaryDark,
    letterSpacing: 2,
  },
  tripFoundLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.primary,
  },
  tripRouteDisplay: { gap: 8 },
  routeItem: { flexDirection: "row", alignItems: "center", gap: 12 },
  routeItemLine: {
    width: 2,
    height: 14,
    backgroundColor: Colors.border,
    marginLeft: 5,
  },
  routeDotGreen: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  routeDotRed: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.error,
  },
  routeLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  routeValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  tripMeta: {
    flexDirection: "row",
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  detailsForm: { gap: 8 },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    marginBottom: 6,
  },
  contactsHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  input: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: Colors.text,
  },
  contactChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  contactChipText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.primaryDark,
  },
  addContactRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  contactInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  addContactBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  joinBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 24,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  joinBtnPressed: { opacity: 0.9 },
  joinBtnLoading: { opacity: 0.7 },
  joinBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.surface,
  },
});
