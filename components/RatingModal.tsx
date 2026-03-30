/**
 * components/RatingModal.tsx
 *
 * Passengers rate their driver after every trip ends.
 * Drivers never rate passengers.
 */

import React, { useState, useCallback } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/src/store/useStore";
import { RatingsStorage } from "@/src/services/storage";
import { syncAll } from "@/src/services/sync";
import { generateId } from "@/src/utils/helpers";
import { Colors } from "@/constants/colors";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RatingModalProps {
  visible: boolean;
  onClose: () => void;
  /** ID of the trip just completed */
  tripId: string;
  /** ID of the driver being rated */
  driverUserId: string;
  /** Driver's display name – shown in the modal title */
  driverName?: string;
  /** Called after submit OR skip so the caller can navigate away */
  onDone: () => void;
}

// ─── Driver tag keys ──────────────────────────────────────────────────────────

const DRIVER_TAGS = [
  "tagSafe",
  "tagClean",
  "tagOnTime",
  "tagFriendly",
  "tagProfessional",
] as const;

const STAR_LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

// ─── Star row ─────────────────────────────────────────────────────────────────

function StarRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onChange(star);
          }}
          hitSlop={10}
          style={styles.starBtn}
        >
          <Ionicons
            name={value >= star ? "star" : "star-outline"}
            size={40}
            color={value >= star ? Colors.gold : "#3A3A3A"}
          />
        </Pressable>
      ))}
    </View>
  );
}

// ─── Tag chip ─────────────────────────────────────────────────────────────────

function TagChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function RatingModal({
  visible,
  onClose,
  tripId,
  driverUserId,
  driverName,
  onDone,
}: RatingModalProps) {
  const { t } = useTranslation();
  const { user, updateUser } = useAuthStore();

  const [stars, setStars] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [review, setReview] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = useCallback(() => {
    setStars(0);
    setSelectedTags([]);
    setReview("");
    setIsSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const toggleTag = useCallback((key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTags((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (stars === 0) {
      Alert.alert("Select a rating", "Please tap a star before submitting.");
      return;
    }
    if (!user?.id) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSubmitting(true);

    try {
      // 1. Save rating locally (synced = false until online)
      await RatingsStorage.save({
        id: generateId(),
        trip_id: tripId,
        rater_id: user.id,
        rated_id: driverUserId,
        stars,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        review: review.trim() || undefined,
        created_at: new Date().toISOString(),
        synced: false,
        updated_at: new Date().toISOString(),
      });

      // 2. Recalculate and persist avg_rating for the driver in local store.
      //    If the logged-in user IS the driver (they're viewing their own data),
      //    update the store so the dashboard reflects the new average immediately.
      const newAvg = await RatingsStorage.calcAvgRating(driverUserId);
      if (newAvg !== null && user.id === driverUserId) {
        updateUser({ avg_rating: newAvg });
      }

      // 3. Fire-and-forget cloud sync
      syncAll({ id: user.id, role: user.role, park_name: user.park_name }).catch(
        () => { /* offline – connectivity listener will retry */ }
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset();
      onDone();
    } catch {
      Alert.alert(t("common.error"), t("common.retry"));
      setIsSubmitting(false);
    }
  }, [stars, user, tripId, driverUserId, selectedTags, review, t, reset, onDone, updateUser]);

  const title = driverName ? `How was ${driverName}?` : t("ratings.rateYourTrip");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop – tap to skip */}
      <Pressable style={styles.overlay} onPress={handleClose} />

      {/* Sheet */}
      <View style={[styles.sheet, Platform.OS === "android" && styles.sheetAndroid]}>
        <View style={styles.handle} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {/* Driver icon */}
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Ionicons name="car-sport" size={32} color={Colors.primary} />
            </View>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{t("ratings.howWasIt")}</Text>

          {/* Stars */}
          <StarRow value={stars} onChange={setStars} />
          {stars > 0 && (
            <Text style={styles.starLabel}>{STAR_LABELS[stars]}</Text>
          )}

          {/* Tags */}
          <Text style={styles.sectionLabel}>{t("ratings.tags")}</Text>
          <View style={styles.chipRow}>
            {DRIVER_TAGS.map((key) => (
              <TagChip
                key={key}
                label={t(`ratings.${key}`)}
                selected={selectedTags.includes(key)}
                onPress={() => toggleTag(key)}
              />
            ))}
          </View>

          {/* Optional review */}
          <Text style={styles.sectionLabel}>{t("ratings.review")}</Text>
          <TextInput
            style={styles.reviewInput}
            placeholder={t("ratings.reviewPlaceholder")}
            placeholderTextColor="#555"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            value={review}
            onChangeText={setReview}
            maxLength={300}
          />
          <Text style={styles.charCount}>{review.length}/300</Text>

          {/* Action buttons */}
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
              onPress={handleClose}
            >
              <Text style={styles.cancelBtnText}>{t("common.cancel")}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                (stars === 0 || isSubmitting) && styles.submitBtnDisabled,
                pressed && styles.pressed,
              ]}
              onPress={handleSubmit}
              disabled={stars === 0 || isSubmitting}
            >
              <Ionicons name="star" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.submitBtnText}>
                {isSubmitting ? t("ratings.submitting") : t("ratings.submit")}
              </Text>
            </Pressable>
          </View>

          {/* Skip */}
          <Pressable
            style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}
            onPress={handleClose}
          >
            <Text style={styles.skipBtnText}>{t("ratings.skip")}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#161616",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "ios" ? 44 : 28,
    maxHeight: "88%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 26,
  },
  sheetAndroid: { paddingBottom: 32 },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 20,
  },
  scrollContent: {
    paddingBottom: 8,
    alignItems: "center",
  },
  avatarWrap: { marginBottom: 16 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.primary + "40",
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    marginBottom: 24,
  },
  starRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginBottom: 8,
  },
  starBtn: { padding: 4 },
  starLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.gold,
    textAlign: "center",
    marginBottom: 24,
    letterSpacing: 0.3,
  },
  sectionLabel: {
    alignSelf: "flex-start",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
    alignSelf: "stretch",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
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
  chipTextSelected: { color: "#FFFFFF" },
  reviewInput: {
    alignSelf: "stretch",
    backgroundColor: "#1E1E1E",
    borderRadius: 14,
    padding: 14,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#FFFFFF",
    minHeight: 90,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 4,
  },
  charCount: {
    alignSelf: "flex-end",
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.2)",
    marginBottom: 28,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
    alignSelf: "stretch",
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#242424",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cancelBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "rgba(255,255,255,0.55)",
  },
  submitBtn: {
    flex: 2,
    height: 52,
    borderRadius: 14,
    flexDirection: "row",
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
    backgroundColor: "#252525",
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  skipBtn: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  skipBtnText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.25)",
    textDecorationLine: "underline",
  },
  pressed: { opacity: 0.7 },
});