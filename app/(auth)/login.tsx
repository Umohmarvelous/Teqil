import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  Easing,
} from "react-native-reanimated";

import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { signInOfflineAware } from "@/src/services/auth";
import { useTranslation } from "react-i18next";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { StatusBar } from "expo-status-bar";

// ─── Validation schema ────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

// ─── AnimatedPressable helper ─────────────────────────────────────────────────

interface AnimatedPressableProps {
  onPress: () => void;
  disabled?: boolean;
  style: object | object[];
  children: React.ReactNode;
}

function AnimatedPressable({
  onPress,
  disabled,
  style,
  children,
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => {
          if (!disabled) scale.value = withSpring(0.95, { damping: 20 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 15 });
        }}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─── FormField ────────────────────────────────────────────────────────────────

interface FormFieldProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  onBlur: () => void;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: "email-address" | "default";
  autoCapitalize?: "none" | "sentences";
  rightElement?: React.ReactNode;
  inputRef?: React.RefObject<TextInput | null>;
  returnKeyType?: "next" | "done" | "go";
  onSubmitEditing?: () => void;
}

function FormField({
  label,
  icon,
  placeholder,
  value,
  onChangeText,
  onBlur,
  error,
  secureTextEntry,
  keyboardType = "default",
  autoCapitalize = "none",
  rightElement,
  inputRef,
  returnKeyType,
  onSubmitEditing,
}: FormFieldProps) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      <View
        style={[fieldStyles.inputRow, error ? fieldStyles.inputRowError : null]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={error ? Colors.error : Colors.textSecondary}
          style={fieldStyles.icon}
        />
        <TextInput
          ref={inputRef}
          style={fieldStyles.input}
          placeholder={placeholder}
          placeholderTextColor={Colors.overlayLight}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={returnKeyType === "done"}
        />
        {rightElement}
      </View>
      {error ? <Text style={fieldStyles.errorText}>{error}</Text> : null}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.text,
    marginTop: 6,
    marginBottom: 9,
    paddingLeft: 5
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  inputRowError: {
    borderColor: Colors.error,
    backgroundColor: "#9E080800",
  },
  icon: { marginRight: 12 },
  input: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: Colors.text,
  },
  errorText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.error,
    marginTop: 4,
  },
});

// ─── Login Screen ─────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { setUser, setIsAuthenticated, selectedRole } = useAuthStore();
  const { t } = useTranslation();

  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const passwordRef = useRef<TextInput>(null);

  // ── Entrance animation ────────────────────────────────────────────────────
  const formOpacity = useSharedValue(0);
  const formY = useSharedValue(20);

  useEffect(() => {
    formOpacity.value = withDelay(
      150,
      withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) })
    );
    formY.value = withDelay(
      150,
      withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  const formAnimStyle = useAnimatedStyle(() => ({
    opacity: formOpacity.value,
    transform: [{ translateY: formY.value }],
  }));

  // ── Form ──────────────────────────────────────────────────────────────────
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  // ── Submit ────────────────────────────────────────────────────────────────
  const onSubmit = async (data: LoginFormData) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    try {
      const { user, offlineMode } = await signInOfflineAware(
        data.email,
        data.password
      );

      setUser(user);
      setIsAuthenticated(true);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (offlineMode) {
        Alert.alert(
          "Offline Mode",
          "You're signed in from cache. Some features may be unavailable until you reconnect.",
          [{ text: "OK" }]
        );
      }

      // Navigate based on role + profile completion
      if (user.role === "driver" && !user.profile_complete) {
        router.replace("/(auth)/driver-profile");
      } else if (user.role === "driver") {
        router.replace("/(driver)");
      } else if (user.role === "passenger") {
        router.replace("/(passenger)");
      } else {
        router.replace("/(park-owner)");
      }
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg =
        err instanceof Error ? err.message : t("common.error");
      Alert.alert(t("auth.login") + " Failed", msg);
    } finally {
      setIsLoading(false);
    }
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="red" animated/>

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
          <Text>Back</Text>
        </Pressable>
        {/* <Text style={styles.headerTitle}>{t("auth.login")}</Text> */}
        {/* Spacer to centre the title */}
        <View style={styles.backBtn} />
      </View>

      {/* ── Scrollable form ── */}
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom:
              Math.max(insets.bottom, 24) + (Platform.OS === "web" ? 34 : 0),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Page title */}
        <View style={styles.pageHeaderContainer}>
          <Text style={styles.pageTitle}>Welcome back</Text>
          <Text style={styles.pageSubtitle}>
            Sign in to continue your journey
          </Text>
        </View>

        {/* Animated form */}
        <Animated.View style={formAnimStyle}>
          {/* Email */}
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label={t("auth.email")}
                icon="mail-outline"
                placeholder={t("auth.emailPlaceholder")}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.email?.message}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            )}
          />

          {/* Password */}
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <FormField
                label={t("auth.password")}
                icon="lock-closed-outline"
                placeholder={t("auth.passwordPlaceholder")}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
                secureTextEntry={!showPassword}
                inputRef={passwordRef}
                returnKeyType="done"
                onSubmitEditing={handleSubmit(onSubmit)}
                rightElement={
                  <Pressable
                    onPress={() => setShowPassword((s) => !s)}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={Colors.textSecondary}
                    />
                  </Pressable>
                }
              />
            )}
          />

          {/* Forgot password */}
          <Pressable
            style={styles.forgotBtn}
            onPress={() =>
              Alert.alert(
                "Reset Password",
                "Password reset is coming soon. Please contact support for now."
              )
            }
            hitSlop={8}
          >
            <Text style={styles.forgotText}>{t("auth.forgotPassword")}</Text>
          </Pressable>

          {/* Submit */}
          <AnimatedPressable
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading}
            style={[styles.submitBtn, isLoading && styles.submitBtnLoading]}
          >
            <Text style={styles.submitBtnText}>

              {isLoading ? (
                
                <ActivityIndicator size="small" color={Colors.borderLight} />
                // t("auth.loggingIn")
                
              ) : t("auth.login")}
            </Text>
            {!isLoading && (
              <Ionicons name="arrow-forward" size={18} color={Colors.surface} />
              
            )}
          </AnimatedPressable>

          {/* Switch to register */}
          <Pressable
            style={styles.switchBtn}
            onPress={() => router.replace("/(auth)/register")}
          >
            <Text style={styles.switchText}>
              {t("auth.noAccount")}{" "}
              <Text style={styles.switchLink}>{t("auth.signUp")}</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: 'row',
    gap: 5,
  },
  headerTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 44,
    paddingTop: 28,
  },

  // Page heading
  pageHeaderContainer: {
    flex: 1,
    alignItems: 'center',
    marginBottom: 40
  },
  pageTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    color: Colors.text,
    marginBottom: 6,
  },
  pageSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 32,
  },

  // Forgot
  forgotBtn: {
    alignSelf: "flex-end",
    marginBottom: 24,
    marginTop: -8,
  },
  forgotText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.primary,
  },

  // Submit button
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 26,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  submitBtnLoading: {
    opacity: 0.7,
  },
  submitBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.surface,
  },

  // Switch
  switchBtn: {
    alignItems: "center",
    marginTop: 24,
    paddingVertical: 8,
  },
  switchText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  switchLink: {
    fontFamily: "Poppins_600SemiBold",
    color: Colors.primary,
  },
});