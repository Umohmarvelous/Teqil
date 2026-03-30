import React, { useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as Haptics from "expo-haptics";
import {
  Ionicons,
  FontAwesome5,
} from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { Colors } from "@/constants/colors";
import { useAuthStore } from "@/src/store/useStore";
import { signUpOfflineAware } from "@/src/services/auth";
import { generateUsername, generateDriverId } from "@/src/utils/helpers";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

// ─── Zod schema ──────────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    fullName: z.string().optional(),
    email: z
      .string()
      .min(1, "Email is required")
      .email("Enter a valid email address"),
    phone: z
      .string()
      .min(7, "Enter a valid Nigerian phone number")
      .regex(/^\+?[\d\s\-]{7,}$/, "Enter a valid phone number"),
    age: z
      .string()
      .min(1, "Age is required")
      .refine((val) => {
        const n = parseInt(val, 10);
        return !isNaN(n) && n >= 18;
      }, "You must be at least 18 years old"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

// ─── Component ────────────────────────────────────────────────────────────────

export default function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { selectedRole, setUser } = useAuthStore();

  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  // ── Animations ──
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 480,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]); // added dependency

  // ── Form ──
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      age: "",
      password: "",
      confirmPassword: "",
    },
  });

  // ── Button press animation ──
  const handlePressIn = useCallback(() => {
    Animated.spring(buttonScale, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  }, [buttonScale]); // added dependency

  const handlePressOut = useCallback(() => {
    Animated.spring(buttonScale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [buttonScale]); // added dependency

  // ── Submit ──
  const onSubmit = useCallback(
    async (data: RegisterFormData) => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setLoading(true);

      try {
        const resolvedName =
          data.fullName?.trim() || generateUsername();

        const driverId =
          selectedRole === "driver" ? generateDriverId() : undefined;

        const metadata: Record<string, unknown> = {
          full_name: resolvedName,
          phone: data.phone.trim(),
          age: parseInt(data.age, 10),
          role: selectedRole ?? "passenger",
          points_balance: 0,
          profile_complete: false,
          ...(driverId ? { driver_id: driverId } : {}),
        };

        const result = await signUpOfflineAware(
          data.email.trim(),
          data.password,
          metadata
        );

        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );

        if (result?.user) {
          setUser(result.user);
        }

        // Redirect by role – note the underscore
        if (selectedRole === "driver") {
          router.replace("/(auth)/driver-profile");
        } else if (selectedRole === "park_owner") {   // ✅ fixed: underscore, not hyphen
          router.replace("/(park-owner)");
        } else {
          router.replace("/(passenger)");
        }
      } catch (err: unknown) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const message =
          err instanceof Error ? err.message : t("common.unknownError");
        Alert.alert(t("common.error"), message);
      } finally {
        setLoading(false);
      }
    },
    [selectedRole, setUser, router, t]  // added all dependencies
  );

  // ── Helpers ──
  const goBack = () => router.back();
  const goToLogin = () => router.replace("/(auth)/login");

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={goBack}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
          <Text>Back</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title block */}
        <Animated.View style={[styles.titleBlock, { opacity: fadeAnim }]}>
          <Text style={styles.title}>{t("auth.register")}</Text>
          <Text style={styles.subtitle}>
            {t("auth.registerSubtitle", {
              defaultValue: "Join thousands of Nigerians on Teqil",
            })}
          </Text>
        </Animated.View>

        {/* Form */}
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Full Name (optional) */}
          <FieldWrapper
            label={t("auth.fullName")}
            hint={t("auth.nameAutoGenerate")}
            error={errors.fullName?.message}
          >
            <Controller
              control={control}
              name="fullName"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  icon={
                    <Ionicons
                      name="person-outline"
                      size={18}
                      color={Colors.textSecondary}
                      
                    />
                  }
                  placeholder={t("auth.fullNamePlaceholder", {
                    defaultValue: "e.g. Emeka Okonkwo",
                  })}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  hasError={!!errors.fullName}
                  autoCapitalize="words"
                />
              )}
            />
          </FieldWrapper>

          {/* Email */}
          <FieldWrapper
            label={t("auth.email")}
            error={errors.email?.message}
          >
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  icon={
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color={Colors.textSecondary}
                    />
                  }
                  placeholder={t("auth.emailPlaceholder", {
                    defaultValue: "you@example.com",
                  })}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  hasError={!!errors.email}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              )}
            />
          </FieldWrapper>

          {/* Phone */}
          <FieldWrapper
            label={t("auth.phone")}
            error={errors.phone?.message}
          >
            <Controller
              control={control}
              name="phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  icon={
                    <Ionicons
                      name="call-outline"
                      size={18}
                      color={Colors.textSecondary}
                    />
                  }
                  placeholder={t("auth.phonePlaceholder", {
                    defaultValue: "+234 812 345 6789",
                  })}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  hasError={!!errors.phone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                />
              )}
            />
          </FieldWrapper>

          {/* Age */}
          <FieldWrapper
            label={t("auth.age")}
            error={errors.age?.message}
          >
            <Controller
              control={control}
              name="age"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  icon={
                    <FontAwesome5
                      name="birthday-cake"
                      size={16}
                      color={Colors.textSecondary}
                    />
                  }
                  placeholder={t("auth.agePlaceholder", {
                    defaultValue: "e.g. 24",
                  })}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  hasError={!!errors.age}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              )}
            />
          </FieldWrapper>

          {/* Password */}
          <FieldWrapper
            label={t("auth.password")}
            error={errors.password?.message}
          >
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  icon={
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={Colors.textSecondary}
                    />
                  }
                  placeholder={t("auth.passwordPlaceholder", {
                    defaultValue: "Min. 8 characters",
                  })}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  hasError={!!errors.password}
                  secureTextEntry={!showPassword}
                  trailingIcon={
                    <TouchableOpacity
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={18}
                        color={Colors.textSecondary}
                      />
                    </TouchableOpacity>
                  }
                />
              )}
            />
          </FieldWrapper>

          {/* Confirm Password */}
          <FieldWrapper
            label={t("auth.confirmPassword")}
            error={errors.confirmPassword?.message}
          >
            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  icon={
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={18}
                      color={Colors.textSecondary}
                    />
                  }
                  placeholder={t("auth.confirmPasswordPlaceholder", {
                    defaultValue: "Repeat your password",
                  })}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  hasError={!!errors.confirmPassword}
                  secureTextEntry={!showConfirm}
                  trailingIcon={
                    <TouchableOpacity
                      onPress={() => setShowConfirm((v) => !v)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={showConfirm ? "eye-off-outline" : "eye-outline"}
                        size={18}
                        color={Colors.textSecondary}
                      />
                    </TouchableOpacity>
                  }
                />
              )}
            />
          </FieldWrapper>

          {/* Submit button */}
          <Animated.View
            style={[
              styles.buttonWrap,
              { transform: [{ scale: buttonScale }] },
            ]}
          >
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit(onSubmit)}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              disabled={loading}
              activeOpacity={0.9}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {t("auth.createAccount", { defaultValue: "Create Account" })}
                </Text>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* Sign in link */}
          <View style={styles.signInRow}>
            <Text style={styles.signInText}>
              {t("auth.alreadyHaveAccount", {
                defaultValue: "Already have an account?",
              })}{" "}
            </Text>
            <TouchableOpacity onPress={goToLogin} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Text style={styles.signInLink}>
                {t("auth.signIn", { defaultValue: "Sign In" })}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface FieldWrapperProps {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

function FieldWrapper({ label, hint, error, children }: FieldWrapperProps) {
  return (
    <View style={fieldStyles.wrapper}>
      <Text style={fieldStyles.label}>{label}</Text>
      {hint && <Text style={fieldStyles.hint}>{hint}</Text>}
      {children}
      {error ? <Text style={fieldStyles.errorText}>{error}</Text> : null}
    </View>
  );
}

interface InputRowProps {
  icon: React.ReactNode;
  trailingIcon?: React.ReactNode;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  onBlur?: () => void;
  hasError?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
  autoCapitalize?: "none" | "words" | "sentences" | "characters";
  autoComplete?: string;
  maxLength?: number;
}

function InputRow({
  icon,
  trailingIcon,
  hasError,
  ...inputProps
}: InputRowProps) {
  const [focused, setFocused] = React.useState(false);

  return (
    <View
      style={[
        inputStyles.row,
        focused && inputStyles.focused,
        hasError && inputStyles.errored,

      ]}
    >
      <View style={inputStyles.iconWrap}>{icon}</View>
      <TextInput
        style={inputStyles.input}
        placeholderTextColor={Colors.overlayLight}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          inputProps.onBlur?.();
        }}
        {...(inputProps as any)}
      />
      {trailingIcon ? (
        <View style={inputStyles.trailingWrap}>{trailingIcon}</View>
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: 'row',
    gap: 5
  },
  scrollContent: {
    paddingHorizontal: 34,
    paddingTop: 4,
  },
  titleBlock: {
    marginBottom: 48,
    alignItems: 'center'
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    color: Colors.text,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  buttonWrap: {
    marginTop: 28,
    marginBottom: 20,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 44,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  submitBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#fff",
    letterSpacing: 0.3,
  },
  signInRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  signInText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  signInLink: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.primary,
  },
});

const fieldStyles = StyleSheet.create({
  wrapper: {
    marginBottom: 18,
  },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.text,
    marginBottom: 4,
  },
  hint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontStyle: "italic",
  },
  errorText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.error,
    marginTop: 4,
    marginLeft: 2,
  },
});

const inputStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 26,
    height: 52,
    paddingHorizontal: 14,
  },
  focused: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
  },
  errored: {
    borderColor: Colors.error ?? "#E53E3E",
  },
  iconWrap: {
    marginRight: 10,
    width: 22,
    alignItems: "center",
  },
  trailingWrap: {
    marginLeft: 8,
  },
  input: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.primary,
    height: "100%",
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
});


