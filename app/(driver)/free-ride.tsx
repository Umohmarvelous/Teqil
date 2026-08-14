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
  TextInput,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { useIsPremium } from "@/src/store/useTierStore";
import {
  useFreeRidesStore,
  type FreeRideMode,
  type FreeRideOffer,
} from "@/src/store/useFreeRidesStore";
import { useFuelPoolStore } from "@/src/store/useFuelPoolStore";
import { formatNaira } from "@/src/utils/helpers";
import { iosAlert, IOSScreen } from "@/components/ios";

/**
 * Both of these used to be declared INSIDE the screen component.
 *
 * That meant a new component type on every render, so React unmounted and
 * remounted the subtree on each keystroke — the field lost focus and the
 * keyboard dismissed itself after every character typed. Declared at module
 * scope, the type is stable and the inputs keep focus.
 */
function ModeCard({
  value,
  title,
  desc,
  mode,
  onSelect,
  cardBg,
  borderColor,
  textColor,
  subColor,
}: {
  value: FreeRideMode;
  title: string;
  desc: string;
  mode: FreeRideMode;
  onSelect: (m: FreeRideMode) => void;
  cardBg: string;
  borderColor: string;
  textColor: string;
  subColor: string;
}) {
  const active = mode === value;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onSelect(value);
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
}

function Field({
  label,
  subColor,
  children,
}: {
  label: string;
  subColor: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.label, { color: subColor }]}>{label}</Text>
      {children}
    </View>
  );
}

export default function OfferFreeRideScreen() {
  const user = useAuthStore((s) => s.user);
  const isDark = useSettingsStore((s) => s.theme) === "dark";
  const { createOffer, fetchOpenOffers, closeOffer, openOffers, fetchMyClaims, myClaims } =
    useFreeRidesStore();
  const fuelPool = useFuelPoolStore((s) => s.balance);
  const refreshPool = useFuelPoolStore((s) => s.refresh);

  const [mode, setMode] = useState<FreeRideMode>("reward");
  const [duration, setDuration] = useState("30");
  const [maxPassengers, setMaxPassengers] = useState("1");
  const [requirements, setRequirements] = useState("");
  const [barterTerms, setBarterTerms] = useState("");
  const [publishing, setPublishing] = useState(false);

  const isPremium = useIsPremium();
  const myOffers = useMemo(
    () => openOffers.filter((o) => o.driver_id === user?.id),
    [openOffers, user?.id]
  );

  /**
   * Open the compulsory-GPS tracker for a passenger who has claimed this offer.
   * A claim is what gets tracked (and what the fuel reward hangs off), so the
   * offer alone isn't enough — find the live claim first.
   */
  const trackRide = async (offer: FreeRideOffer) => {
    if (!user?.id) return;
    await fetchMyClaims(user.id);

    const live = useFreeRidesStore
      .getState()
      .myClaims.find(
        (c) =>
          c.offer_id === offer.id &&
          c.driver_id === user.id &&
          (c.status === "accepted" || c.status === "in_progress")
      );

    if (!live) {
      iosAlert(
        "No ride to track yet",
        "Tracking starts once a passenger has claimed this offer and is ready to travel."
      );
      return;
    }

    Haptics.selectionAsync();
    router.push({
      pathname: "/free-ride-track/[claimId]",
      params: {
        claimId: live.id,
        mode: offer.mode,
        origin: offer.origin ?? "",
        destination: offer.destination ?? "",
        role: "driver",
      },
    } as any);
  };

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subColor = isDark ? Colors.textSecondary : Colors.textTertiary;
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
      iosAlert("Set a duration", "How long will this offer stay open (in minutes)?");
      return;
    }
    if (!max || max < 1) {
      iosAlert("Set a limit", "How many passengers can take this offer?");
      return;
    }
    if (mode === "barter" && !barterTerms.trim()) {
      iosAlert("What do you want?", "Describe what you want in exchange (money, goods or services).");
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
      iosAlert(
        "Offer published 🎉",
        mode === "reward"
          ? "Passengers can now accept your free ride. Complete GPS-tracked rides to earn free fuel."
          : "Passengers can now see your offer and bargain with you."
      );
      setRequirements("");
      setBarterTerms("");
    } else {
      iosAlert("Couldn't publish", "Please check your connection and try again.");
    }
  };

  // ── Premium gate ──────────────────────────────────────────────────────────
  if (!isPremium) {
    return (
      <IOSScreen title="Free Rides" back scrollable={false}>
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
      </IOSScreen>
    );
  }

  return (
    <IOSScreen title="Offer a Free Ride" back subtitle="Reward ride or open barter">
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
          mode={mode}
          onSelect={setMode}
          cardBg={cardBg}
          borderColor={borderColor}
          textColor={textColor}
          subColor={subColor}
        />
        <ModeCard
          value="barter"
          title="Open for barter — free-will exchange"
          desc="A ride in exchange for money, goods or services. Both of you can BARGAIN and agree. No free-fuel reward."
          mode={mode}
          onSelect={setMode}
          cardBg={cardBg}
          borderColor={borderColor}
          textColor={textColor}
          subColor={subColor}
        />

        <View style={{ height: 8 }} />
        <Text style={[styles.sectionTitle, { color: textColor }]}>Details</Text>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="Open for (minutes)" subColor={subColor}>
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
            <Field label="Max passengers" subColor={subColor}>
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
          <Field label="What do you want in exchange?" subColor={subColor}>
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

        <Field label="Extra requirements (optional)" subColor={subColor}>
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
                <View style={styles.offerActions}>
                  {o.claimed_count > 0 && (
                    <Pressable style={styles.trackBtn} onPress={() => trackRide(o)} hitSlop={8}>
                      <Ionicons name="navigate" size={13} color={Colors.primary} />
                      <Text style={styles.trackBtnText}>Track</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() =>
                      iosAlert("Close offer?", "Passengers will no longer see this offer.", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Close", style: "destructive", onPress: () => closeOffer(o.id) },
                      ])
                    }
                    hitSlop={10}
                  >
                    <Text style={styles.closeLink}>Close</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
      )}
    </IOSScreen>
  );
}

const styles = StyleSheet.create({
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
  offerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  trackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  trackBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary },
});
