/**
 * app/rating.tsx
 *
 * Dedicated post-trip rating screen.
 * Receives params: tripId, ratedUserId, raterRole, tripCode, origin, destination,
 *                  startTime, endTime
 *
 * Shows trip summary + star rating + tags + optional review.
 * On submit: saves to RatingsStorage, syncs, navigates to role dashboard.
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  Animated,
  Easing,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/src/store/useStore";
import { RatingsStorage } from "@/src/services/storage";
import { syncAll } from "@/src/services/sync";
import { generateId, formatDate, formatTime } from "@/src/utils/helpers";
import { Colors } from "@/constants/colors";

// ─── Constants ────────────────────────────────────────────────────────────────

const DRIVER_TAGS = [
  { key: "tagSafe", label: "Safe driving", icon: "shield-checkmark-outline" },
  { key: "tagClean", label: "Clean vehicle", icon: "sparkles-outline" },
  { key: "tagOnTime", label: "On time", icon: "time-outline" },
  { key: "tagFriendly", label: "Friendly", icon: "happy-outline" },
  { key: "tagProfessional", label: "Professional", icon: "briefcase-outline" },
  { key: "tagComfortable", label: "Comfortable", icon: "bed-outline" },
] as const;

const PASSENGER_TAGS = [
  { key: "tagPolite", label: "Polite", icon: "thumbs-up-outline" },
  { key: "tagOnTime", label: "On time", icon: "time-outline" },
  { key: "tagRespectful", label: "Respectful", icon: "heart-outline" },
  { key: "tagQuiet", label: "Quiet", icon: "volume-mute-outline" },
] as const;

const STAR_LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

// ─── Star Row ─────────────────────────────────────────────────────────────────

function StarRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (s: number) => void;
}) {
  const scales = [1, 2, 3, 4, 5].map(() => useRef(new Animated.Value(1)).current);

  const handlePress = (star: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Bounce the tapped star
    Animated.sequence([
      Animated.spring(scales[star - 1], {
        toValue: 1.4,
        useNativeDriver: true,
        speed: 50,
        bounciness: 12,
      }),
      Animated.spring(scales[star - 1], {
        toValue: 1,
        useNativeDriver: true,
        speed: 30,
      }),
    ]).start();
    onChange(star);
  };

  return (
    <View style={styles.starContainer}>
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Animated.View
            key={star}
            style={{ transform: [{ scale: scales[star - 1] }] }}
          >
            <Pressable
              onPress={() => handlePress(star)}
              hitSlop={10}
              style={styles.starBtn}
            >
              <Ionicons
                name={value >= star ? "star" : "star-outline"}
                size={44}
                color={value >= star ? Colors.gold : "rgba(255,255,255,0.2)"}
              />
            </Pressable>
          </Animated.View>
        ))}
      </View>
      {value > 0 && (
        <Text style={styles.starLabel}>{STAR_LABELS[value]}</Text>
      )}
    </View>
  );
}

// ─── Tag Chip ─────────────────────────────────────────────────────────────────

function TagChip({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: string;
  selected: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.9,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 40,
      }),
    ]).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={handlePress}
        style={[styles.chip, selected && styles.chipSelected]}
      >
        <Ionicons
          name={icon as any}
          size={14}
          color={selected ? "#fff" : "rgba(255,255,255,0.55)"}
        />
        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Trip Summary Card ────────────────────────────────────────────────────────

function TripSummaryCard({
  origin,
  destination,
  startTime,
  endTime,
  tripCode,
}: {
  origin: string;
  destination: string;
  startTime: string;
  endTime: string;
  tripCode: string;
}) {
  const startDate = new Date(startTime);
  const endDate = endTime ? new Date(endTime) : new Date();
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationMin = Math.round(durationMs / 60000);
  const hours = Math.floor(durationMin / 60);
  const mins = durationMin % 60;
  const durationStr =
    hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;

  return (
    <View style={styles.summaryCard}>
      {/* Header */}
      <View style={styles.summaryHeader}>
        <View style={styles.summaryCodePill}>
          <Ionicons name="barcode-outline" size={13} color={Colors.gold} />
          <Text style={styles.summaryCode}>{tripCode}</Text>
        </View>
        <View style={styles.summaryCompletedPill}>
          <Ionicons name="checkmark-circle" size={13} color="#4ADE80" />
          <Text style={styles.summaryCompletedText}>Completed</Text>
        </View>
      </View>

      {/* Route */}
      <View style={styles.summaryRoute}>
        <View style={styles.summaryRouteTrack}>
          <View style={styles.routeDotGreen} />
          <View style={styles.routeLine} />
          <View style={styles.routeDotRed} />
        </View>
        <View style={styles.summaryRouteLabels}>
          <View>
            <Text style={styles.routeDirectionLabel}>FROM</Text>
            <Text style={styles.routeValue} numberOfLines={1}>
              {origin}
            </Text>
          </View>
          <View style={{ marginTop: 14 }}>
            <Text style={styles.routeDirectionLabel}>TO</Text>
            <Text style={styles.routeValue} numberOfLines={1}>
              {destination}
            </Text>
          </View>
        </View>
      </View>

      {/* Meta row */}
      <View style={styles.summaryMeta}>
        <View style={styles.summaryMetaItem}>
          <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.45)" />
          <Text style={styles.summaryMetaText}>{formatDate(startTime)}</Text>
        </View>
        <View style={styles.summaryMetaDot} />
        <View style={styles.summaryMetaItem}>
          <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.45)" />
          <Text style={styles.summaryMetaText}>{formatTime(startTime)}</Text>
        </View>
        <View style={styles.summaryMetaDot} />
        <View style={styles.summaryMetaItem}>
          <Ionicons name="hourglass-outline" size={13} color="rgba(255,255,255,0.45)" />
          <Text style={styles.summaryMetaText}>{durationStr}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RatingScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const params = useLocalSearchParams<{
    tripId: string;
    ratedUserId: string;
    raterRole: "driver" | "passenger";
    tripCode: string;
    origin: string;
    destination: string;
    startTime: string;
    endTime: string;
  }>();

  const {
    tripId,
    ratedUserId,
    raterRole,
    tripCode,
    origin,
    destination,
    startTime,
    endTime,
  } = params;

  const [stars, setStars] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [review, setReview] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const tagList =
    raterRole === "driver" ? DRIVER_TAGS : PASSENGER_TAGS;

  const toggleTag = (key: string) => {
    setSelectedTags((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const navigateHome = useCallback(() => {
    if (raterRole === "driver") {
      router.replace("/(driver)");
    } else {
      router.replace("/(passenger)");
    }
  }, [raterRole]);

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigateHome();
  };

  const handleSubmit = useCallback(async () => {
    if (stars === 0) {
      Alert.alert("Rate your trip", "Please select at least 1 star.");
      return;
    }
    if (!user?.id || !tripId || !ratedUserId) {
      navigateHome();
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSubmitting(true);

    try {
      await RatingsStorage.save({
        id: generateId(),
        trip_id: tripId,
        rater_id: user.id,
        rated_id: ratedUserId,
        stars,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        review: review.trim() || undefined,
        created_at: new Date().toISOString(),
        synced: false,
        updated_at: new Date().toISOString(),
      });

      if (user) {
        syncAll({
          id: user.id,
          role: user.role,
          park_name: user.park_name,
        }).catch(() => {});
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigateHome();
    } catch {
      Alert.alert("Error", "Could not submit rating. Please try again.");
      setIsSubmitting(false);
    }
  }, [
    stars,
    selectedTags,
    review,
    user,
    tripId,
    ratedUserId,
    navigateHome,
  ]);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.root}>
      {/* Background gradient */}
      <LinearGradient
        colors={["#0A1A0E", "#0D2B14", "#0A0A0A"]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <View style={styles.headerBadge}>
          <Ionicons name="star" size={16} color={Colors.gold} />
          <Text style={styles.headerBadgeText}>Rate Your Trip</Text>
        </View>
        <Pressable onPress={handleSkip} style={styles.skipBtn} hitSlop={12}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom:
              Math.max(insets.bottom, 24) + (Platform.OS === "web" ? 34 : 0),
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          {/* Trip summary */}
          {tripCode && origin && destination && startTime ? (
            <TripSummaryCard
              origin={origin}
              destination={destination}
              startTime={startTime}
              endTime={endTime ?? new Date().toISOString()}
              tripCode={tripCode}
            />
          ) : null}

          {/* Question */}
          <View style={styles.questionBlock}>
            <Text style={styles.questionTitle}>
              {raterRole === "passenger"
                ? "How was your driver?"
                : "How was your passenger?"}
            </Text>
            <Text style={styles.questionSub}>
              Your honest feedback helps the Teqil community stay safe
            </Text>
          </View>

          {/* Stars */}
          <StarRow value={stars} onChange={setStars} />

          {/* Tags */}
          {stars > 0 && (
            <>
              <Text style={styles.sectionLabel}>What stood out?</Text>
              <View style={styles.chipGrid}>
                {tagList.map((tag) => (
                  <TagChip
                    key={tag.key}
                    label={tag.label}
                    icon={tag.icon}
                    selected={selectedTags.includes(tag.key)}
                    onPress={() => toggleTag(tag.key)}
                  />
                ))}
              </View>
            </>
          )}

          {/* Review */}
          {stars > 0 && (
            <>
              <Text style={styles.sectionLabel}>
                Leave a review{" "}
                <Text style={styles.sectionLabelOptional}>(optional)</Text>
              </Text>
              <View style={styles.reviewInputWrap}>
                <TextInput
                  style={styles.reviewInput}
                  placeholder="Tell us about your experience..."
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  value={review}
                  onChangeText={setReview}
                  maxLength={300}
                />
                <Text style={styles.charCount}>{review.length}/300</Text>
              </View>
            </>
          )}

          {/* Submit */}
          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              stars === 0 && styles.submitBtnDisabled,
              isSubmitting && styles.submitBtnDisabled,
              pressed && stars > 0 && { opacity: 0.88 },
            ]}
            onPress={handleSubmit}
            disabled={stars === 0 || isSubmitting}
          >
            <LinearGradient
              colors={
                stars === 0
                  ? ["#2A2A2A", "#222"]
                  : [Colors.primary, Colors.primaryDark]
              }
              style={styles.submitBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons
                name={isSubmitting ? "hourglass-outline" : "checkmark-circle"}
                size={20}
                color={stars === 0 ? "rgba(255,255,255,0.3)" : "#fff"}
              />
              <Text
                style={[
                  styles.submitBtnText,
                  stars === 0 && styles.submitBtnTextDisabled,
                ]}
              >
                {isSubmitting ? "Submitting..." : "Submit Rating"}
              </Text>
            </LinearGradient>
          </Pressable>

          {/* Skip link */}
          <Pressable style={styles.skipLinkBtn} onPress={handleSkip}>
            <Text style={styles.skipLinkText}>Skip for now</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245,166,35,0.12)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.2)",
  },
  headerBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.gold,
  },
  skipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  skipText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.4)",
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 20,
  },

  // Trip summary card
  summaryCard: {
    backgroundColor: "#141414",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    gap: 14,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryCodePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(245,166,35,0.1)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.2)",
  },
  summaryCode: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: Colors.gold,
    letterSpacing: 2,
  },
  summaryCompletedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(74,222,128,0.1)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.2)",
  },
  summaryCompletedText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "#4ADE80",
  },
  summaryRoute: {
    flexDirection: "row",
    gap: 14,
  },
  summaryRouteTrack: {
    alignItems: "center",
    paddingTop: 4,
    width: 14,
  },
  routeDotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: "rgba(0,166,81,0.3)",
  },
  routeLine: {
    width: 2,
    flex: 1,
    minHeight: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginVertical: 4,
  },
  routeDotRed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.error,
    borderWidth: 2,
    borderColor: "rgba(239,68,68,0.3)",
  },
  summaryRouteLabels: { flex: 1 },
  routeDirectionLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 9,
    color: "rgba(255,255,255,0.35)",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  routeValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
  },
  summaryMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    flexWrap: "wrap",
  },
  summaryMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  summaryMetaText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
  },
  summaryMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.2)",
  },

  // Question
  questionBlock: {
    alignItems: "center",
    paddingVertical: 4,
  },
  questionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: "#fff",
    textAlign: "center",
    marginBottom: 6,
  },
  questionSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    lineHeight: 20,
  },

  // Stars
  starContainer: {
    alignItems: "center",
    gap: 10,
  },
  starRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  starBtn: {
    padding: 4,
  },
  starLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.gold,
    letterSpacing: 0.5,
  },

  // Tags
  sectionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionLabelOptional: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    textTransform: "none",
    letterSpacing: 0,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "transparent",
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
  },
  chipTextSelected: {
    color: "#fff",
  },

  // Review
  reviewInputWrap: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  reviewInput: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#fff",
    padding: 14,
    minHeight: 100,
  },
  charCount: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.25)",
    textAlign: "right",
    paddingHorizontal: 14,
    paddingBottom: 10,
  },

  // Submit
  submitBtn: {
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
    marginTop: 4,
  },
  submitBtnDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnGradient: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  submitBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  submitBtnTextDisabled: {
    color: "rgba(255,255,255,0.3)",
  },

  // Skip link
  skipLinkBtn: {
    alignItems: "center",
    paddingVertical: 10,
    marginTop: -8,
  },
  skipLinkText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.3)",
    textDecorationLine: "underline",
  },
});