/**
 * components/RatingModal.tsx
 *
 * Post-trip rating modal. Works for both driver-rates-passenger and
 * passenger-rates-driver directions.
 *
 * After saving:
 *  - Persists to RatingsStorage (offline-first)
 *  - Recalculates avg_rating for the rated user from all stored ratings
 *  - Pushes to Supabase via syncAll (fire-and-forget)
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  Animated,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/src/store/useStore";
import { RatingsStorage } from "@/src/services/storage";
import { syncAll } from "@/src/services/sync";
import { generateId } from "@/src/utils/helpers";
import { Colors } from "@/constants/colors";

// ─── Tag config ────────────────────────────────────────────────────────────────

const DRIVER_TAGS = [
  { key: "tagSafe", icon: "shield-checkmark-outline" },
  { key: "tagClean", icon: "sparkles-outline" },
  { key: "tagOnTime", icon: "time-outline" },
  { key: "tagFriendly", icon: "happy-outline" },
  { key: "tagProfessional", icon: "briefcase-outline" },
  { key: "tagComfortable", icon: "bed-outline" },
] as const;

const PASSENGER_TAGS = [
  { key: "tagPolite", icon: "thumbs-up-outline" },
  { key: "tagOnTime", icon: "time-outline" },
  { key: "tagRespectful", icon: "heart-outline" },
  { key: "tagQuiet", icon: "volume-mute-outline" },
] as const;

type TagKey =
  | (typeof DRIVER_TAGS)[number]["key"]
  | (typeof PASSENGER_TAGS)[number]["key"];

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RatingModalProps {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  ratedUserId: string;
  /** "driver" means the current user IS the driver and is rating a passenger */
  raterRole: "driver" | "passenger";
  onSubmit: () => void;
}

// ─── Star Row ─────────────────────────────────────────────────────────────────
// Each star keeps its own Animated.Value so hooks are never called in a loop.

const STAR_COUNT = 5;

function StarRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (s: number) => void;
}) {
  // Fixed-size array of refs — never changes length, so no Rules-of-Hooks issue
  const scales = useRef(
    Array.from({ length: STAR_COUNT }, () => new Animated.Value(1))
  ).current;

  const handlePress = (star: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const idx = star - 1;
    Animated.sequence([
      Animated.spring(scales[idx], {
        toValue: 1.45,
        useNativeDriver: true,
        speed: 60,
        bounciness: 14,
      }),
      Animated.spring(scales[idx], {
        toValue: 1,
        useNativeDriver: true,
        speed: 30,
      }),
    ]).start();
    onChange(star);
  };

  const STAR_LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

  return (
    <View style={rStyles.starContainer}>
      <View style={rStyles.starRow}>
        {Array.from({ length: STAR_COUNT }, (_, i) => {
          const star = i + 1;
          return (
            <Animated.View
              key={star}
              style={{ transform: [{ scale: scales[i] }] }}
            >
              <Pressable
                onPress={() => handlePress(star)}
                hitSlop={10}
                style={rStyles.starBtn}
              >
                <Ionicons
                  name={value >= star ? "star" : "star-outline"}
                  size={42}
                  color={value >= star ? Colors.gold : "rgba(255,255,255,0.18)"}
                />
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
      {value > 0 && (
        <Text style={rStyles.starLabel}>{STAR_LABELS[value]}</Text>
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
        toValue: 0.88,
        duration: 75,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
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
        style={[rStyles.chip, selected && rStyles.chipSelected]}
      >
        <Ionicons
          name={icon as any}
          size={13}
          color={selected ? "#fff" : "rgba(255,255,255,0.5)"}
        />
        <Text
          style={[rStyles.chipText, selected && rStyles.chipTextSelected]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RatingModal({
  visible,
  onClose,
  tripId,
  ratedUserId,
  raterRole,
  onSubmit,
}: RatingModalProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const [stars, setStars] = useState(0);
  const [selectedTags, setSelectedTags] = useState<TagKey[]>([]);
  const [review, setReview] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sheet entrance animation
  const slideAnim = useRef(new Animated.Value(500)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 22,
          stiffness: 160,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 500,
          duration: 250,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]); // slideAnim/backdropAnim are stable refs

  const tagList =
    raterRole === "driver"
      ? (DRIVER_TAGS as unknown as readonly { key: TagKey; icon: string }[])
      : (PASSENGER_TAGS as unknown as readonly { key: TagKey; icon: string }[]);

  const toggleTag = useCallback((key: TagKey) => {
    setSelectedTags((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const resetState = useCallback(() => {
    setStars(0);
    setSelectedTags([]);
    setReview("");
    setIsSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleSubmit = useCallback(async () => {
    if (stars === 0) {
      Alert.alert(
        t("ratings.rateYourTrip"),
        t("ratings.howWasIt")
      );
      return;
    }
    if (!user?.id) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSubmitting(true);

    try {
      const now = new Date().toISOString();

      // 1. Persist rating locally
      await RatingsStorage.save({
        id: generateId(),
        trip_id: tripId,
        rater_id: user.id,
        rated_id: ratedUserId,
        stars,
        tags: selectedTags.length > 0 ? (selectedTags as string[]) : undefined,
        review: review.trim() || undefined,
        created_at: now,
        synced: false,
        updated_at: now,
      });

      // 2. Recalculate avg_rating for the rated user from all stored ratings
      const allRatings = await RatingsStorage.getByRatedUser(ratedUserId);
      if (allRatings.length > 0) {
        const avg =
          allRatings.reduce((sum, r) => sum + r.stars, 0) /
          allRatings.length;
        // Only update our own avg_rating if we rated ourselves (shouldn't happen
        // in normal flow, but guard anyway)
        if (ratedUserId === user.id) {
          const { updateUser } = useAuthStore.getState();
          updateUser({ avg_rating: parseFloat(avg.toFixed(1)) });
        }
      }

      // 3. Sync to Supabase (fire-and-forget)
      syncAll({
        id: user.id,
        role: user.role,
        park_name: user.park_name,
      }).catch(() => {});

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetState();
      onSubmit();
    } catch {
      Alert.alert(t("common.error"), t("common.retry"));
      setIsSubmitting(false);
    }
  }, [
    stars,
    selectedTags,
    review,
    user,
    tripId,
    ratedUserId,
    t,
    resetState,
    onSubmit,
  ]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View
        style={[
          rStyles.backdrop,
          { opacity: backdropAnim },
        ]}
        pointerEvents="auto"
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          rStyles.sheet,
          Platform.OS === "android" && rStyles.sheetAndroid,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={rStyles.handle} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={rStyles.scrollContent}
        >
          {/* Title */}
          <Text style={rStyles.title}>{t("ratings.rateYourTrip")}</Text>
          <Text style={rStyles.subtitle}>
            {raterRole === "passenger"
              ? t("ratings.howWasIt")
              : "How was your passenger?"}
          </Text>

          {/* Stars */}
          <StarRow value={stars} onChange={setStars} />

          {/* Tags — only appear after a star is picked */}
          {stars > 0 && (
            <>
              <Text style={rStyles.sectionLabel}>{t("ratings.tags")}</Text>
              <View style={rStyles.chipGrid}>
                {tagList.map(({ key, icon }) => (
                  <TagChip
                    key={key}
                    label={t(`ratings.${key}`)}
                    icon={icon}
                    selected={selectedTags.includes(key)}
                    onPress={() => toggleTag(key)}
                  />
                ))}
              </View>

              {/* Review */}
              <Text style={rStyles.sectionLabel}>
                {t("ratings.review")}{" "}
                <Text style={rStyles.optionalLabel}>(optional)</Text>
              </Text>
              <TextInput
                style={rStyles.reviewInput}
                placeholder={t("ratings.reviewPlaceholder")}
                placeholderTextColor="rgba(255,255,255,0.22)"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                value={review}
                onChangeText={setReview}
                maxLength={300}
              />
              <Text style={rStyles.charCount}>{review.length}/300</Text>
            </>
          )}

          {/* Actions */}
          <View style={rStyles.actions}>
            <Pressable
              style={({ pressed }) => [
                rStyles.cancelBtn,
                pressed && { opacity: 0.7 },
              ]}
              onPress={handleClose}
            >
              <Text style={rStyles.cancelBtnText}>{t("common.cancel")}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                rStyles.submitBtn,
                (stars === 0 || isSubmitting) && rStyles.submitBtnDisabled,
                pressed && stars > 0 && { opacity: 0.88 },
              ]}
              onPress={handleSubmit}
              disabled={stars === 0 || isSubmitting}
            >
              <Text style={rStyles.submitBtnText}>
                {isSubmitting
                  ? t("ratings.submitting")
                  : t("ratings.submit")}
              </Text>
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [
              rStyles.skipBtn,
              pressed && { opacity: 0.6 },
            ]}
            onPress={handleClose}
          >
            <Text style={rStyles.skipBtnText}>{t("ratings.skip")}</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const rStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.68)",
    zIndex: 1,
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    backgroundColor: "#1A1A1A",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "ios" ? 44 : 28,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 24,
  },
  sheetAndroid: {
    paddingBottom: 32,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignSelf: "center",
    marginBottom: 20,
  },
  scrollContent: {
    paddingBottom: 8,
    gap: 16,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: "#FFFFFF",
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: 21,
    marginTop: -8,
  },

  // Stars
  starContainer: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  starRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  starBtn: { padding: 4 },
  starLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.gold,
    letterSpacing: 0.4,
  },

  // Tags
  sectionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  optionalLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    textTransform: "none",
    letterSpacing: 0,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "transparent",
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
  },
  chipTextSelected: { color: "#FFFFFF" },

  // Review
  reviewInput: {
    backgroundColor: "#2A2A2A",
    borderRadius: 14,
    padding: 14,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#FFFFFF",
    minHeight: 90,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  charCount: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.28)",
    textAlign: "right",
    marginTop: -8,
  },

  // Buttons
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2A2A2A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  cancelBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "rgba(255,255,255,0.65)",
  },
  submitBtn: {
    flex: 2,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  submitBtnDisabled: {
    backgroundColor: "#333",
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  skipBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  skipBtnText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.32)",
    textDecorationLine: "underline",
  },
});