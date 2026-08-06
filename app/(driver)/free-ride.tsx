/**
 * app/(driver)/free-ride.tsx
 *
 * Driver screen to publish a free-ride offer. Two explicit modes (users must
 * always know which):
 *   • reward  — driver is "TAKING an offer": sets the terms, passengers can ONLY
 *     accept (no bargaining). Completing GPS-tracked free rides earns free fuel.
 *   • barter  — driver is "OPEN for an offer": a free-will exchange both sides can
 *     bargain on. Emilgo funds nothing here.
 *
 * Premium-only. GPS tracking is compulsory for the ride (enforced when a passenger
 * accepts). Violating the terms can suspend the account.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { Colors } from "@/constants/colors";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useTierStore } from "@/src/store/useTierStore";
import { useFreeRidesStore, type FreeRideMode } from "@/src/store/useFreeRidesStore";
import { useFuelPoolStore } from "@/src/store/useFuelPoolStore";
import { formatNaira } from "@/src/utils/helpers";

export default function OfferFreeRideScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const isDark = useSettingsStore((s) => s.theme) === "dark";
  const tier = useTierStore((s) => s.tier);
  const { createOffer, fetchOpenOffers, closeOffer, openOffers } = useFreeRidesStore();
  const fuelPool = useFuelPoolStore((s) => s.balance);
  const refreshPool = useFuelPoolStore((s) => s.refresh);

  const [mode, setMode] = useState<FreeRideMode>("reward");
  const [duration, setDuration] = useState("30");
  const [maxPassengers, setMaxPassengers] = useState("1");
  const [requirements, setRequirements] = useState("");
  const [barterTerms, setBarterTerms] = useState("");
  const [publishing, setPublishing] = useState(false);

  const isPremium = tier !== "free";
  const myOffers = useMemo(
    () => openOffers.filter((o) => o.driver_id === user?.id),
    [openOffers, user?.id]
  );

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const bg = isDark ? Colors.background : "#F6F7FB";
  const cardBg = isDark ? Colors.overlayLight : "#FFFFFF";
  const inputBg = isDark ? "rgba(255,255,255,0.06)" : "#F1F3F7";
  const borderColor = isDark ? "rgba(255,255,255,0.10)" : "#ECEEF3";

  useEffect(() => {
    refreshPool();
    if (user?.id) fetchOpenOffers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const publish = async () => {
    if (!user?.id) return;
    const dur = parseInt(duration, 10);
    const max = parseInt(maxPassengers, 10);
    if (!dur || dur < 1) {
      Alert.alert("Set a duration", "How long will this offer stay open (in minutes)?");
      return;
    }
    if (!max || max < 1) {
      Alert.alert("Set a limit", "How many passengers can take this offer?");
      return;
    }
    if (mode === "barter" && !barterTerms.trim()) {
      Alert.alert("What do you want?", "Describe what you want in exchange (money, goods or services).");
      return;
    }
    setPublishing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const offer = await createOffer(user.id, {
      mode,
      duration_minutes: dur,
      max_passengers: max,
      requirements: requirements.trim() || null,
      barter_terms: mode === "barter" ? barterTerms.trim() : null,
    });
    setPublishing(false);
    if (offer) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Offer published 🎉",
        mode === "reward"
          ? "Passengers can now accept your free ride. Complete GPS-tracked rides to earn free fuel."
          : "Passengers can now see your offer and bargain with you."
      );
      setRequirements("");
      setBarterTerms("");
    } else {
      Alert.alert("Couldn't publish", "Please check your connection and try again.");
    }
  };

  // ── Premium gate ──────────────────────────────────────────────────────────
  if (!isPremium) {
    return (
      <View style={[styles.root, { backgroundColor: bg, paddingTop: insets.top + 12 }]}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <Pressable style={styles.back} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </Pressable>
        <View style={styles.gate}>
          <Ionicons name="diamond" size={54} color={Colors.gold} />
          <Text style={[styles.gateTitle, { color: textColor }]}>Free rides are a Premium perk</Text>
          <Text style={[styles.gateText, { color: subColor }]}>
            Offering free rides — and earning free fuel for them — is available to Pro and Elite
            drivers. Upgrade to unlock it.
          </Text>
          <Pressable style={styles.gateBtn} onPress={() => router.push("/tiers" as any)}>
            <Text style={styles.gateBtnText}>See Premium plans</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const ModeCard = ({ value, title, desc }: { value: FreeRideMode; title: string; desc: string }) => {
    const active = mode === value;
    return (
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setMode(value);
        }}
        style={[
          styles.modeCard,
          { backgroundColor: cardBg, borderColor: active ? Colors.primary : borderColor },
          active && { borderWidth: 2 },
        ]}
      >
        <View style={styles.modeHead}>
          <Text style={[styles.modeTitle, { color: textColor }]}>{title}</Text>
          <Ionicons
            name={active ? "radio-button-on" : "radio-button-off"}
            size={20}
            color={active ? Colors.primary : subColor}
          />
        </View>
        <Text style={[styles.modeDesc, { color: subColor }]}>{desc}</Text>
      </Pressable>
    );
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.label, { color: subColor }]}>{label}</Text>
      {children}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable style={styles.back} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: textColor }]}>Offer a Free Ride</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Fuel pool banner */}
        <View style={[styles.poolBanner, { backgroundColor: Colors.primary + "14", borderColor }]}>
          <Ionicons name="flame" size={20} color={Colors.primary} />
          <Text style={[styles.poolText, { color: textColor }]}>
            Free-fuel pool: <Text style={{ color: Colors.primary, fontFamily: "Poppins_700Bold" }}>{formatNaira(fuelPool)}</Text> available
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: textColor }]}>Choose how it works</Text>
        <ModeCard
          value="reward"
          title="Reward ride — you set the terms"
          desc="Passengers can only ACCEPT (no bargaining). Complete GPS-tracked free rides to earn free fuel from the pool."
        />
        <ModeCard
          value="barter"
          title="Open for barter — free-will exchange"
          desc="A ride in exchange for money, goods or services. Both of you can BARGAIN and agree. No free-fuel reward."
        />

        <View style={{ height: 8 }} />
        <Text style={[styles.sectionTitle, { color: textColor }]}>Details</Text>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="Open for (minutes)">
              <View style={[styles.inputRow, { backgroundColor: inputBg }]}>
                <TextInput
                  style={[styles.input, { color: textColor }]}
                  value={duration}
                  onChangeText={(v) => setDuration(v.replace(/\D/g, "").slice(0, 4))}
                  keyboardType="number-pad"
                  placeholder="30"
                  placeholderTextColor={subColor}
                />
              </View>
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Max passengers">
              <View style={[styles.inputRow, { backgroundColor: inputBg }]}>
                <TextInput
                  style={[styles.input, { color: textColor }]}
                  value={maxPassengers}
                  onChangeText={(v) => setMaxPassengers(v.replace(/\D/g, "").slice(0, 3))}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor={subColor}
                />
              </View>
            </Field>
          </View>
        </View>

        {mode === "barter" && (
          <Field label="What do you want in exchange?">
            <View style={[styles.inputRow, { backgroundColor: inputBg }]}>
              <TextInput
                style={[styles.input, { color: textColor, minHeight: 44 }]}
                value={barterTerms}
                onChangeText={setBarterTerms}
                placeholder="e.g. ₦500, a phone top-up, help moving items…"
                placeholderTextColor={subColor}
                multiline
              />
            </View>
          </Field>
        )}

        <Field label="Extra requirements (optional)">
          <View style={[styles.inputRow, { backgroundColor: inputBg }]}>
            <TextInput
              style={[styles.input, { color: textColor, minHeight: 44 }]}
              value={requirements}
              onChangeText={setRequirements}
              placeholder="e.g. drop within Yaba only, max 2 bags…"
              placeholderTextColor={subColor}
              multiline
            />
          </View>
        </Field>

        {/* Rules notice */}
        <View style={[styles.notice, { backgroundColor: cardBg, borderColor }]}>
          <Ionicons name="shield-checkmark" size={18} color={Colors.primary} />
          <Text style={[styles.noticeText, { color: subColor }]}>
            Location tracking is <Text style={{ fontFamily: "Poppins_600SemiBold", color: textColor }}>compulsory</Text> and stays on for the whole ride, for both of you. Breaking the agreed terms can suspend your account.
          </Text>
        </View>

        <Pressable style={[styles.publishBtn, publishing && { opacity: 0.6 }]} onPress={publish} disabled={publishing}>
          {publishing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.publishText}>Publish offer</Text>
          )}
        </Pressable>

        {/* My open offers */}
        {myOffers.length > 0 && (
          <View style={{ marginTop: 26 }}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Your open offers</Text>
            {myOffers.map((o) => (
              <View key={o.id} style={[styles.offerRow, { backgroundColor: cardBg, borderColor }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.offerTitle, { color: textColor }]}>
                    {o.mode === "reward" ? "Reward ride" : "Barter"} · {o.duration_minutes} min · {o.claimed_count}/{o.max_passengers} taken
                  </Text>
                  {(o.barter_terms || o.requirements) && (
                    <Text style={[styles.offerSub, { color: subColor }]} numberOfLines={1}>
                      {o.barter_terms || o.requirements}
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={() =>
                    Alert.alert("Close offer?", "Passengers will no longer see this offer.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Close", style: "destructive", onPress: () => closeOffer(o.id) },
                    ])
                  }
                  hitSlop={10}
                >
                  <Text style={styles.closeLink}>Close</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 18 },

  gate: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 30 },
  gateTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, textAlign: "center" },
  gateText: { fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", lineHeight: 21 },
  gateBtn: { backgroundColor: Colors.primary, borderRadius: 30, paddingVertical: 15, paddingHorizontal: 30, marginTop: 6 },
  gateBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },

  poolBanner: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 18 },
  poolText: { fontFamily: "Poppins_500Medium", fontSize: 13.5 },

  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 15, marginBottom: 10, marginTop: 4 },
  modeCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  modeHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  modeTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  modeDesc: { fontFamily: "Poppins_400Regular", fontSize: 12.5, lineHeight: 18 },

  label: { fontFamily: "Poppins_400Regular", fontSize: 12, marginBottom: 6 },
  inputRow: { borderRadius: 12, paddingHorizontal: 14 },
  input: { fontFamily: "Poppins_500Medium", fontSize: 15, paddingVertical: 13 },

  notice: { flexDirection: "row", gap: 10, borderRadius: 16, borderWidth: 1, padding: 14, marginTop: 4, marginBottom: 18 },
  noticeText: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 18 },

  publishBtn: { backgroundColor: Colors.primary, borderRadius: 30, paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  publishText: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#fff" },

  offerRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10 },
  offerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  offerSub: { fontFamily: "Poppins_400Regular", fontSize: 11.5, marginTop: 2 },
  closeLink: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.error },
});
