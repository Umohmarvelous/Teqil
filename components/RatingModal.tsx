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

interface RatingModalProps {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  ratedUserId: string;
  raterRole: "driver" | "passenger";
  onSubmit: () => void;
}

const DRIVER_TAGS = ["tagSafe", "tagClean", "tagOnTime", "tagFriendly", "tagProfessional"] as const;
const PASSENGER_TAGS = ["tagPolite", "tagOnTime", "tagRespectful", "tagQuiet"] as const;

function StarRow({ value, onChange }: { value: number; onChange: (s: number) => void }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(star); }}
          hitSlop={8}
          style={styles.starBtn}
        >
          <Ionicons
            name={value >= star ? "star" : "star-outline"}
            size={36}
            color={value >= star ? Colors.gold : "#555"}
          />
        </Pressable>
      ))}
    </View>
  );
}

function TagChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export default function RatingModal({
  visible, onClose, tripId, ratedUserId, raterRole, onSubmit,
}: RatingModalProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const [stars, setStars] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [review, setReview] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tagKeys = raterRole === "driver"
    ? (DRIVER_TAGS as unknown as string[])
    : (PASSENGER_TAGS as unknown as string[]);

  const toggleTag = useCallback((key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTags((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }, []);

  const resetState = useCallback(() => {
    setStars(0);
    setSelectedTags([]);
    setReview("");
    setIsSubmitting(false);
  }, []);

  const handleClose = useCallback(() => { resetState(); onClose(); }, [onClose, resetState]);

  const handleSubmit = useCallback(async () => {
    if (stars === 0) {
      Alert.alert(t("ratings.rateYourTrip"), t("ratings.howWasIt"));
      return;
    }
    if (!user?.id) return;

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
        // Syncable defaults – storage.save() will overwrite these, but
        // TypeScript requires them on the Rating type.
        synced: false,
        updated_at: new Date().toISOString(),
      });

      // Push the rating to Supabase immediately if online.
      syncAll({ id: user.id, role: user.role, park_name: user.park_name }).catch(
        () => {/* offline – connectivity listener will retry */}
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetState();
      onSubmit();
    } catch {
      Alert.alert(t("common.error"), t("common.retry"));
      setIsSubmitting(false);
    }
  }, [stars, user, tripId, ratedUserId, selectedTags, review, t, resetState, onSubmit]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={handleClose} pointerEvents="auto" />

      <View style={[styles.sheet, Platform.OS === "android" && styles.sheetAndroid]}>
        <View style={styles.handle} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={styles.title}>{t("ratings.rateYourTrip")}</Text>
          <Text style={styles.subtitle}>{t("ratings.howWasIt")}</Text>

          <StarRow value={stars} onChange={setStars} />

          <Text style={styles.sectionLabel}>{t("ratings.tags")}</Text>
          <View style={styles.chipRow}>
            {tagKeys.map((key) => (
              <TagChip
                key={key}
                label={t(`ratings.${key}`)}
                selected={selectedTags.includes(key)}
                onPress={() => toggleTag(key)}
              />
            ))}
          </View>

          <Text style={styles.sectionLabel}>{t("ratings.review")}</Text>
          <TextInput
            style={styles.reviewInput}
            placeholder={t("ratings.reviewPlaceholder")}
            placeholderTextColor={Colors.textTertiary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            value={review}
            onChangeText={setReview}
            maxLength={300}
          />
          <Text style={styles.charCount}>{review.length}/300</Text>

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
              <Text style={styles.submitBtnText}>
                {isSubmitting ? t("ratings.submitting") : t("ratings.submit")}
              </Text>
            </Pressable>
          </View>

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

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.65)",
    zIndex: 1, elevation: 1
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
    paddingBottom: Platform.OS === "ios" ? 40 : 24, 
    maxHeight: "88%", 
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: -6 }, 
    shadowOpacity: 0.5, 
    shadowRadius: 20, 
    elevation: 24 
  },
  sheetAndroid: { 
    paddingBottom: 32 
  },
  handle: { 
    width: 40, 
    height: 4, 
    borderRadius: 2, 
    backgroundColor: "rgba(255,255,255,0.25)", 
    alignSelf: "center", 
    marginBottom: 20 
  },
  scrollContent: { 
    paddingBottom: 8 
  },
  title: { 
    fontFamily: "Poppins_700Bold", 
    fontSize: 22, 
    color: "#FFFFFF", 
    textAlign: "center", 
    marginBottom: 6 
  },
  subtitle: { 
    fontFamily: "Poppins_400Regular", 
    fontSize: 14, 
    color: "rgba(255,255,255,0.55)", 
    textAlign: "center", 
    marginBottom: 24 
  },
  starRow: { 
    flexDirection: "row", 
    justifyContent: "center", 
    gap: 10, 
    marginBottom: 28 
  },
  starBtn: { 
    padding: 4 
  },
  sectionLabel: { 
    fontFamily: "Poppins_600SemiBold", 
    fontSize: 13, 
    color: "rgba(255,255,255,0.7)", 
    marginBottom: 10, 
    textTransform: "uppercase", 
    letterSpacing: 0.6 
  },
  chipRow: { 
    flexDirection: "row", 
    flexWrap: "wrap", gap: 8, 
    marginBottom: 24 
  },
  chip: { 
    paddingHorizontal: 14, 
    paddingVertical: 8, 
    borderRadius: 20, 
    borderWidth: 1.5, 
    borderColor: "rgba(255,255,255,0.2)", 
    backgroundColor: "transparent" 
  },
  chipSelected: { 
    backgroundColor: Colors.primary, 
    borderColor: Colors.primary 
  },
  chipText: { 
    fontFamily: "Poppins_500Medium", 
    fontSize: 13, 
    color: "rgba(255,255,255,0.65)" 
  },
  chipTextSelected: { 
    color: "#FFFFFF" 
  },
  reviewInput: { 
    backgroundColor: "#2A2A2A", 
    borderRadius: 14, 
    padding: 14, 
    fontFamily: "Poppins_400Regular", 
    fontSize: 14, 
    color: "#FFFFFF", 
    minHeight: 100, 
    borderWidth: 1, 
    borderColor: "rgba(255,255,255,0.1)", 
    marginBottom: 4 
  },
  charCount: { 
    fontFamily: "Poppins_400Regular", 
    fontSize: 12, 
    color: "rgba(255,255,255,0.3)", 
    textAlign: "right", 
    marginBottom: 28 
  },
  actions: { 
    flexDirection: "row", 
    gap: 12, 
    marginBottom: 12 
  },
  cancelBtn: { 
    flex: 1, 
    height: 52, 
    borderRadius: 14, 
    alignItems: "center", 
    justifyContent: "center", 
    backgroundColor: "#2A2A2A", 
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" 
  },
  cancelBtnText: { 
    fontFamily: "Poppins_600SemiBold", 
    fontSize: 15, 
    color: "rgba(255,255,255,0.7)" 
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
    elevation: 6 
  },
  submitBtnDisabled: { 
    backgroundColor: "#333", 
    shadowOpacity: 0, 
    elevation: 0 
  },
  submitBtnText: { 
    fontFamily: "Poppins_600SemiBold", 
    fontSize: 15, 
    color: "#FFFFFF" 
  },
  skipBtn: { 
    alignItems: "center", 
    paddingVertical: 10 
  },
  skipBtnText: { 
    fontFamily: "Poppins_400Regular", 
    fontSize: 13, 
    color: "rgba(255,255,255,0.35)", 
    textDecorationLine: "underline" 
  },
  pressed: { 
    opacity: 0.72 
  },
});