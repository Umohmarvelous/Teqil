import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  Image,
  Animated,
  KeyboardAvoidingView,
  ActivityIndicator
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { supabase } from "@/src/services/supabase";
import { useTranslation } from "react-i18next";
import { generateDriverId } from "@/src/utils/helpers";

// const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── Field config ────────────────────────────────────────────────────────────
interface Field {
  key: string;
  label: string;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
  keyboardType?: "default" | "numeric" | "phone-pad" | "email-address";
  multiline?: boolean;
  required?: boolean;
}

const FIELDS: Field[] = [
  {
    key: "fullName",
    label: "Full Name",
    placeholder: "e.g. Chukwuemeka Obi",
    icon: "person-outline",
    required: true,
  },
  {
    key: "vehicle",
    label: "Vehicle Details",
    placeholder: "e.g. Toyota Corolla, Blue, ABC-123-XY",
    icon: "car-outline",
    required: true,
  },
  {
    key: "parkName",
    label: "Park Name",
    placeholder: "e.g. Ojuelegba Motor Park",
    icon: "business-outline",
    required: true,
  },
  {
    key: "parkLocation",
    label: "Park Location",
    placeholder: "e.g. Ojuelegba, Lagos",
    icon: "location-outline",
    required: true,
  },
];

// ─── Step indicator dot ───────────────────────────────────────────────────────
function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <View
      style={[
        styles.stepDot,
        active && styles.stepDotActive,
        done && styles.stepDotDone,
      ]}
    >
      {done && <Ionicons name="checkmark" size={10} color={Colors.surface} />}
    </View>
  );
}

// ─── Animated form field ──────────────────────────────────────────────────────
function AnimatedField({
  field,
  value,
  onChange,
  error,
  delay,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  delay: number;
}) {
  const [focused, setFocused] = useState(false);
  const slideAnim = useRef(new Animated.Value(30)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.97)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleFocus = () => {
    setFocused(true);
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const handleBlur = () => {
    setFocused(true);
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.fieldWrapper,
        {
          opacity: opacityAnim,
          transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
        },
      ]}
    >
      <Text style={styles.fieldLabel}>
        {field.label}
        {field.required && <Text style={styles.requiredStar}> *</Text>}
      </Text>
      <View
        style={[
          styles.inputRow,
          // focused && styles.inputRowFocused,
          !!error && styles.inputRowError,
        ]}
      >
        <Ionicons
          name={field.icon}
          size={18}
          color={focused ? Colors.primary : Colors.textSecondary}
          style={styles.inputIcon}
        />
        <TextInput
          style={styles.textInput}
          placeholder={field.placeholder}
          placeholderTextColor={Colors.textTertiary}
          value={value}
          onChangeText={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          keyboardType={field.keyboardType || "default"}
          multiline={field.multiline}
        />
        {value.length > 0 && !error && (
          <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
        )}
      </View>
      {!!error && (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={13} color={Colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function DriverProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuthStore();
  const { t } = useTranslation();

  // ── Form state ──────────────────────────────────────────────────────────
  const [values, setValues] = useState<Record<string, string>>({
    fullName: user?.full_name || "",
    vehicle: user?.vehicle_details || "",
    parkName: user?.park_name || "",
    parkLocation: user?.park_location || "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<string | null>(user?.profile_photo || null);
  const [driverId] = useState(user?.driver_id || generateDriverId());
  const [isLoading, setIsLoading] = useState(false);

  // ── Entrance animations ──────────────────────────────────────────────────
  const headerAnim = useRef(new Animated.Value(-60)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const idCardScale = useRef(new Animated.Value(0.88)).current;
  const idCardOpacity = useRef(new Animated.Value(0)).current;
  const photoAnim = useRef(new Animated.Value(0)).current;
  const photoScale = useRef(new Animated.Value(0.9)).current;
  const btnScale = useRef(new Animated.Value(1)).current;
  const navbarAnim = useRef(new Animated.Value(80)).current;
  const navbarOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Staggered entrance: header → ID card → photo picker
    Animated.sequence([
      Animated.parallel([
        Animated.spring(headerAnim, {
          toValue: 0,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(headerOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.spring(idCardScale, {
          toValue: 1,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(idCardOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(photoAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.spring(photoScale, {
          toValue: 1,
          friction: 7,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Navbar floats up after short delay
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(navbarAnim, {
          toValue: 0,
          friction: 10,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(navbarOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }, 600);
  }, []);

  // ── Validation ──────────────────────────────────────────────────────────
  const validate = () => {
    const newErrors: Record<string, string> = {};
    FIELDS.forEach((f) => {
      if (f.required && !values[f.key]?.trim()) {
        newErrors[f.key] = `${f.label} is required`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Photo picker ────────────────────────────────────────────────────────
  const pickPhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      // Pulse feedback on photo change
      Animated.sequence([
        Animated.spring(photoScale, {
          toValue: 0.9,
          useNativeDriver: true,
          friction: 5,
        }),
        Animated.spring(photoScale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 6,
        }),
      ]).start();
      setPhoto(result.assets[0].uri);
    }
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    // Button bounce on press
    Animated.sequence([
      Animated.spring(btnScale, {
        toValue: 0.94,
        useNativeDriver: true,
        friction: 5,
      }),
      Animated.spring(btnScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 6,
      }),
    ]).start();

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsLoading(true);

    const updates = {
      full_name: values.fullName.trim(),
      profile_photo: photo || undefined,
      vehicle_details: values.vehicle.trim(),
      park_location: values.parkLocation.trim(),
      park_name: values.parkName.trim(),
      driver_id: driverId,
      profile_complete: true,
    };

    try {
      await supabase.auth.updateUser({ data: updates });
      updateUser(updates);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(main)");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not save profile";
      Alert.alert("Error", msg);
    } finally {
      setIsLoading(false);
    }
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Math.max(insets.bottom, 20);

  // Completion progress (photo + 4 fields)
  const filledCount =
    FIELDS.filter((f) => values[f.key]?.trim()).length + (photo ? 1 : 0);
  const totalCount = FIELDS.length + 1;
  const progressPct = Math.round((filledCount / totalCount) * 100);

  return (
    <View style={styles.root}>
      {/* ── Floating header ─────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.floatingHeader,
          {
            // paddingTop: topPadding + 8,
            opacity: headerOpacity,
            transform: [{ translateY: headerAnim }],
          },
        ]}
      >
        {/* <View style={styles.backBtnContainer}>
          <Pressable
            style={styles.backBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.replace("/(auth)/welcome");
            }}
          >
            <Ionicons name="arrow-back" size={20} color={Colors.text} />
            <Text>Back</Text>
          </Pressable>
        </View> */}

        <View style={styles.headerCenterContainer}>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{t("driverProfile.title")}</Text>
            {/* Inline progress pill */}
            <View style={styles.progressPill}>
              <View
                style={[styles.progressFill, { width: `${progressPct}%` }]}
              />
              <Text style={styles.progressLabel}>
                {filledCount}/{totalCount} complete
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.headerRight}>
          <StepDot
            active={filledCount < totalCount}
            done={filledCount === totalCount}
          />
        </View>
      </Animated.View>

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: topPadding + 50,
              paddingBottom: bottomPadding + 40,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="never"
        >
          {/* ── Driver ID card ─────────────────────────────────────────── */}
          <Animated.View
            style={[
              styles.idCard,
              {
                opacity: idCardOpacity,
                transform: [{ scale: idCardScale }],
              },
            ]}
          >

            <View style={ styles.idCardHolder }>
              <View style={styles.idCardLeft}>
                <View style={styles.idBadge}>
                  <Ionicons name="id-card" size={14} color={ Colors.primary} />
                </View>
                <View>
                  <Text style={styles.idLabel}>Your Driver ID</Text>
                  <Text style={styles.idValue}>{driverId}</Text>
                </View>
              </View>
              <View style={styles.verifiedBadge}>
                <Ionicons
                  name="shield-checkmark"
                  size={12}
                  color={Colors.primary}
                />
                <Text style={styles.verifiedText}>Pending</Text>
              </View>
            </View>

            {/* ── Photo picker ─────────────────────────────────────────── */}
            <Pressable
            onPress={pickPhoto}
              style={
                styles.photoSection
              }>
              <View style={styles.photoBtn} >
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.photoImg} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons
                      name="person-add-outline"
                      size={30}
                      color={Colors.primary}
                    />
                  </View>
                )}
                <View style={styles.cameraOverlay}>
                  <Ionicons name="camera" size={14} color={Colors.text} />
                </View>
              </View>

              <View style={styles.photoInfo}>
                <Text style={styles.photoTitle}>
                  {photo
                    ? t("driverProfile.changePhoto")
                    : t("driverProfile.addPhoto")}
                </Text>
                <Text style={styles.photoHint}>
                  Clear photo helps passengers trust you
                </Text>
                {photo && (
                  <View style={styles.photoCheck}>
                    <Ionicons
                      name="checkmark-circle"
                      size={13}
                      color={Colors.primary}
                    />
                    <Text style={styles.photoCheckText}>Photo added</Text>
                  </View>
                )}
              </View>
            </Pressable>
          </Animated.View>


          {/* ── Subtitle ─────────────────────────────────────────────── */}
          <Text style={styles.subtitle}>{t("driverProfile.subtitle")}</Text>


          {/* ── Form fields ───────────────────────────────────────────── */}
          <View style={styles.form}>
            {FIELDS.map((field, i) => (
              <AnimatedField
                key={field.key}
                field={field}
                value={values[field.key] || ""}
                onChange={(v) => {
                  setValues((prev) => ({ ...prev, [field.key]: v }));
                  if (errors[field.key]) {
                    setErrors((prev) => ({ ...prev, [field.key]: "" }));
                  }
                }}
                error={errors[field.key]}
                delay={i * 80}
              />
            ))}
          </View>

          {/* ── Info banner ───────────────────────────────────────────── */}
          <View style={styles.infoBanner}>
            <Ionicons
              name="information-circle"
              size={17}
              color={Colors.primary}
            />
            <Text style={styles.infoText}>
              Your Driver ID is permanent and shown to passengers for trust and
              verification.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Floating bottom navbar / CTA ──────────────────────────────────── */}
      <Animated.View
        style={[
          styles.floatingNavbar,
          {
            bottom: bottomPadding + 35,
            opacity: navbarOpacity,
            transform: [{ translateY: navbarAnim }],
          },
        ]}
      >
        {/* Thin progress bar along top edge of navbar */}
        {/* <View style={styles.navProgressTrack}>
          <View
            style={[styles.navProgressFill, { width: `${progressPct}%` }]}
          />
        </View> */}

        <View style={styles.navbarContent}>
          {/* Step dots + label */}
          <View style={styles.navSteps}>
            {Array.from({ length: totalCount }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.navStepDot,
                  i < filledCount && styles.navStepDotDone,
                  i === filledCount && styles.navStepDotActive,
                ]}
              />
            ))}
            <Text style={styles.navStepLabel}>
              {filledCount === totalCount
                ? "You're all Set!"
                : `${totalCount - filledCount} left`}
            </Text>
          </View>

          {/* CTA button */}
          <Animated.View style={{ transform: [{ scale: btnScale }] }}>
            <Pressable
              style={[
                styles.ctaBtn,
                isLoading && styles.ctaBtnLoading,
              ]}
              onPress={handleSave}
              disabled={isLoading}
            >
              {isLoading && (
                <>
                  <ActivityIndicator size="small" color={Colors.surface} />
                </>
              )}
              <Text style={styles.ctaBtnText}>
                {isLoading
                  ? (t("driverProfile.completing"))
                  : t("driverProfile.submitDetails")}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── Floating header ───────────────────────────────────────────────────────
  floatingHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    // justifyContent: 'center',
    paddingHorizontal: 16,
    // paddingBottom: 12,
    paddingVertical: 20,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    // elevation: 4,
    // gap: 90,
  },
  backBtnContainer: {
    alignSelf: 'flex-start',
    justifyContent: 'flex-start'
  },
  backBtn: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
    flexDirection: 'row'
  },
  headerCenterContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    textAlign: 'center'
  },
  headerCenter: {
    alignItems: "center",
    gap: 5,
  },
  headerTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  progressPill: {
    height: 22,
    width: 120,
    backgroundColor: Colors.border,
    borderRadius: 18,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    // paddingVertical: 5
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
  },
  progressLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: Colors.primaryDark,
    zIndex: 1,
  },

  headerRight: {
    alignItems: "center",
    alignSelf: 'center',
    justifyContent: 'flex-end',  
  },
  stepDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  stepDotActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  stepDotDone: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Scroll ────────────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: 10,
    gap: 16,
    // borderWidth: 2, borderColor: 'red',
    backgroundColor: Colors.textInverse
    
  },

  // ── Driver ID card ────────────────────────────────────────────────────────
  idCard: {
    flexDirection: "column",
    // alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 30,
    paddingVertical: 12,
    gap: 10,
    flex: 1
  },
  idCardHolder: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    flex: 1
  },
  idCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  idBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(0,166,81,0.15)",
    borderWidth: 1,
    borderColor: "rgba(0,166,81,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  idLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.55)",
  },
  idValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 19,
    color: Colors.textWhite,
    letterSpacing: 2.5,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(0,166,81,0.15)",
    borderWidth: 1,
    borderColor: "rgba(0,166,81,0.25)",
  },
  verifiedText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: Colors.primary,
  },

  // ── Subtitle ──────────────────────────────────────────────────────────────
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 8,
  },

  // ── Photo section ─────────────────────────────────────────────────────────
  photoSection: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: 'rgba(68 67 67 / 0.33)',
    borderRadius: 30,
    padding: 10,
    gap: 16,
    borderWidth: .5,
    borderColor: Colors.overlayLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    marginHorizontal: 15
  },
  photoBtn: {
    position: "relative",

  },
  photoImg: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.border,
    
  },
  photoPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: Colors.primary,
    
  },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.textWhite,
    alignItems: "center",
    justifyContent: "center",
    // borderWidth: 2,
    // borderColor: Colors.surface,
  },
  photoInfo: {
    flex: 1,
    gap: 3,
  },
  photoTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.textWhite,
  },
  photoHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  photoCheck: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  photoCheckText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.primary,
  },

  // ── Form fields ───────────────────────────────────────────────────────────
  form: {
    gap: 8,
    marginHorizontal: 10
  },
  fieldWrapper: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.text,
    marginBottom: 7,
  },
  requiredStar: {
    color: Colors.error,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 15,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 10,
  },
  inputRowFocused: {
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  inputRowError: {
    borderColor: Colors.error,
  },
  inputIcon: {
    width: 20,
    textAlign: "center",
  },
  textInput: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    padding: 0,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 5,
  },
  errorText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.error,
  },

  // ── Info banner ───────────────────────────────────────────────────────────
  infoBanner: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: Colors.primaryLight,
    borderRadius: 14,
    padding: 14,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.primaryDark,
    lineHeight: 19,
  },

  // ── Floating bottom navbar ────────────────────────────────────────────────

  floatingNavbar: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: Colors.background,
    borderRadius: 26,
    overflow: "hidden",
    shadowColor: "red",
    shadowOffset: { width: 18, height: 18 },
    shadowOpacity: 0,
    shadowRadius: 20,
    elevation: 16,
    // borderWidth: .5,
    // borderColor: Colors.text,
  },
  navProgressTrack: {
    marginTop: 12,
    marginHorizontal: 15,
    borderRadius: 50,
    height: 3,
    width: 'auto',
    backgroundColor: Colors.borderLight,
  },
  navProgressFill: {
    height: 3,
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  navbarContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
  },
  navSteps: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  navStepDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.textSecondary,
  },
  navStepDotActive: {
    width: 9.5,
    height: 9.5,
    backgroundColor: Colors.primary,
    borderWidth: .5,
    borderColor: Colors.primaryLight,
    borderRadius: 5,
  },
  navStepDotDone: {
    backgroundColor: Colors.primary,
  },
  navStepLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.textWhite,
    marginLeft: 4,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  ctaBtnLoading: {
    opacity: 0.72,
  },
  ctaBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.surface,
  },
});